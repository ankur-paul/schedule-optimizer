"""Row-level security on the Supabase dev project: each role can do exactly what it should (T20).

Runs against the hosted project in server/.env and skips without it. Each run creates throwaway users through the
admin API (emails start with `rls-<run>-`) and deletes them and their institutes afterwards.
Rules: tickets/T20-schema-rls.md.
"""

import secrets

import pytest

from tests.supabase_api import Supabase, User, load_config

CONFIG = load_config()

pytestmark = [
    pytest.mark.supabase,
    pytest.mark.skipif(CONFIG is None, reason="SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set (server/.env)"),
]

TABLES = ("institutes", "memberships", "invites", "profiles")
ROLES = ("admin", "editor", "viewer", "outsider")


@pytest.fixture(scope="module")
def sb():
    client = Supabase(CONFIG)
    yield client
    client.http.close()


@pytest.fixture(scope="module")
def users(sb):
    """admin, editor, viewer, outsider and invitee (for accept_invites), signed in."""
    run = secrets.token_hex(4)
    made: dict[str, User] = {}
    try:
        for who in (*ROLES, "invitee"):
            made[who] = sb.create_user(f"rls-{run}-{who}@example.com", name=f"RLS {who.title()}")
        yield made
    finally:
        ids = [u.id for u in made.values()]
        if ids:
            # created_by is set null when a user goes, so delete their institutes first.
            sb.delete("institutes", sb.service(), created_by=f"in.({','.join(ids)})")
        for user in made.values():
            sb.delete_user(user.id)


def create_institute(sb, user, name="RLS College") -> str:
    res = sb.rpc("create_institute", sb.as_user(user), name=name)
    assert res.status_code == 200, res.text
    return res.json()


def invite(sb, admin, institute, email, role):
    res = sb.insert("invites", sb.as_user(admin), {"institute_id": institute, "email": email, "role": role})
    assert res.status_code == 201, res.text


def accept(sb, user) -> list[dict]:
    res = sb.rpc("accept_invites", sb.as_user(user))
    assert res.status_code == 200, res.text
    return res.json()


def roles_of(sb, institute) -> dict[str, str]:
    return {m["user_id"]: m["role"] for m in sb.rows("memberships", sb.service(), institute_id=f"eq.{institute}")}


def refused(res, status=403):
    assert res.status_code == status, f"expected {status}, got {res.status_code}: {res.text}"


@pytest.fixture
def inst(sb, users):
    """An institute with admin, editor and viewer members, and one pending invite. Deleted afterwards."""
    institute = create_institute(sb, users["admin"])
    invite(sb, users["admin"], institute, users["editor"].email, "editor")
    invite(sb, users["admin"], institute, users["viewer"].email, "viewer")
    invite(sb, users["admin"], institute, "someone-else@example.com", "viewer")
    accept(sb, users["editor"])
    accept(sb, users["viewer"])
    yield institute
    sb.delete("institutes", sb.service(), id=f"eq.{institute}")


# ── Guards ──────────────────────────────────────────────────────────────────────────────────────────────


def test_every_public_table_has_rls(sb):
    res = sb.rpc("tables_without_rls", sb.service())
    assert res.status_code == 200, res.text
    assert res.json() == []


def test_tables_without_rls_is_service_only(sb, users):
    refused(sb.rpc("tables_without_rls", sb.anon()), 401)
    refused(sb.rpc("tables_without_rls", sb.as_user(users["admin"])))


@pytest.mark.parametrize("table", TABLES)
def test_anon_reads_nothing(sb, inst, table):
    res = sb.select(table, sb.anon())
    assert res.status_code == 401 or res.json() == [], res.text


def test_anon_cannot_create_an_institute(sb):
    refused(sb.rpc("create_institute", sb.anon(), name="Nope"), 401)


# ── What each role sees ─────────────────────────────────────────────────────────────────────────────────

# Who appears in memberships / profiles for each viewer, given admin, editor and viewer members.
SEES_MEMBERS = {
    "admin": {"admin", "editor", "viewer"},
    "editor": {"admin", "editor"},
    "viewer": {"admin", "viewer"},
    "outsider": set(),
}
SEES_PROFILES = {**SEES_MEMBERS, "outsider": {"outsider"}}


@pytest.mark.parametrize("who", ROLES)
def test_each_role_sees_what_it_should(sb, users, inst, who):
    headers = sb.as_user(users[who])
    name_of = {u.id: k for k, u in users.items()}
    our_ids = f"in.({','.join(u.id for u in users.values())})"

    institutes = sb.rows("institutes", headers, id=f"eq.{inst}")
    assert len(institutes) == (0 if who == "outsider" else 1)

    members = sb.rows("memberships", headers, institute_id=f"eq.{inst}")
    assert {name_of[m["user_id"]] for m in members} == SEES_MEMBERS[who]

    invites = sb.rows("invites", headers, institute_id=f"eq.{inst}")
    assert len(invites) == (1 if who == "admin" else 0)

    profiles = sb.rows("profiles", headers, user_id=our_ids)
    assert {name_of[p["user_id"]] for p in profiles} == SEES_PROFILES[who]


def test_profile_has_name_and_email(sb, users, inst):
    [profile] = sb.rows("profiles", sb.as_user(users["admin"]), user_id=f"eq.{users['editor'].id}")
    assert profile["email"] == users["editor"].email
    assert profile["name"] == "RLS Editor"


# ── Direct writes ───────────────────────────────────────────────────────────────────────────────────────


def test_only_the_admin_renames(sb, users, inst):
    for who in ("editor", "viewer", "outsider"):
        res = sb.update("institutes", sb.as_user(users[who]), {"name": "Hacked"}, id=f"eq.{inst}")
        assert res.status_code == 200 and res.json() == [], f"{who}: {res.text}"
    res = sb.update("institutes", sb.as_user(users["admin"]), {"name": "Renamed"}, id=f"eq.{inst}")
    assert res.status_code == 200 and res.json()[0]["name"] == "Renamed", res.text


def test_admin_cannot_change_created_by(sb, users, inst):
    admin = sb.as_user(users["admin"])
    refused(sb.update("institutes", admin, {"created_by": users["outsider"].id}, id=f"eq.{inst}"))


def test_only_the_admin_adds_and_removes_invites(sb, users, inst):
    for who in ("editor", "viewer", "outsider"):
        row = {"institute_id": inst, "email": "x@example.com", "role": "viewer"}
        refused(sb.insert("invites", sb.as_user(users[who]), row))
        res = sb.delete("invites", sb.as_user(users[who]), institute_id=f"eq.{inst}")
        assert res.json() == [], f"{who} deleted invites"
    res = sb.delete("invites", sb.as_user(users["admin"]), institute_id=f"eq.{inst}")
    assert len(res.json()) == 1


def test_invite_email_is_lower_cased(sb, users, inst):
    invite(sb, users["admin"], inst, "  Mixed.Case@Example.COM ", "editor")
    emails = {i["email"] for i in sb.rows("invites", sb.as_user(users["admin"]), institute_id=f"eq.{inst}")}
    assert "mixed.case@example.com" in emails


def test_invite_cannot_carry_admin(sb, users, inst):
    row = {"institute_id": inst, "email": "a@example.com", "role": "admin"}
    refused(sb.insert("invites", sb.as_user(users["admin"]), row), 400)


def test_memberships_have_no_direct_writes(sb, users, inst):
    admin = sb.as_user(users["admin"])
    refused(sb.insert("memberships", admin, {"institute_id": inst, "user_id": users["outsider"].id, "role": "editor"}))
    refused(sb.update("memberships", admin, {"role": "viewer"}, institute_id=f"eq.{inst}"))
    refused(sb.delete("memberships", admin, institute_id=f"eq.{inst}"))


def test_second_admin_cannot_be_inserted_even_by_service(sb, users, inst):
    res = sb.insert("memberships", sb.service(), {"institute_id": inst, "user_id": users["outsider"].id, "role": "admin"})
    refused(res, 409)


def test_profiles_have_no_direct_writes(sb, users):
    res = sb.update("profiles", sb.as_user(users["editor"]), {"name": "Changed"}, user_id=f"eq.{users['editor'].id}")
    refused(res)


# ── Functions ───────────────────────────────────────────────────────────────────────────────────────────


def test_create_institute_makes_the_caller_admin(sb, users):
    institute = create_institute(sb, users["outsider"], name="  Trimmed College  ")
    try:
        assert roles_of(sb, institute) == {users["outsider"].id: "admin"}
        [row] = sb.rows("institutes", sb.service(), id=f"eq.{institute}")
        assert row["name"] == "Trimmed College"
        assert row["created_by"] == users["outsider"].id
    finally:
        sb.delete("institutes", sb.service(), id=f"eq.{institute}")


def test_create_institute_rejects_a_blank_name(sb, users):
    refused(sb.rpc("create_institute", sb.as_user(users["outsider"]), name="   "), 400)


def test_set_member_role(sb, users, inst):
    args = {"institute_id": inst, "user_id": users["viewer"].id, "role": "editor"}
    for who in ("editor", "viewer", "outsider"):
        refused(sb.rpc("set_member_role", sb.as_user(users[who]), **args))
    admin = sb.as_user(users["admin"])
    assert sb.rpc("set_member_role", admin, **args).status_code in (200, 204)
    assert roles_of(sb, inst)[users["viewer"].id] == "editor"
    # Not on the admin, and never to admin.
    refused(sb.rpc("set_member_role", admin, institute_id=inst, user_id=users["admin"].id, role="viewer"))
    refused(sb.rpc("set_member_role", admin, institute_id=inst, user_id=users["editor"].id, role="admin"))
    refused(sb.rpc("set_member_role", admin, institute_id=inst, user_id=users["outsider"].id, role="viewer"))


def test_make_admin_swaps_roles(sb, users, inst):
    args = {"institute_id": inst, "user_id": users["editor"].id}
    for who in ("editor", "viewer", "outsider"):
        refused(sb.rpc("make_admin", sb.as_user(users[who]), **args))
    admin = sb.as_user(users["admin"])
    refused(sb.rpc("make_admin", admin, institute_id=inst, user_id=users["outsider"].id))
    refused(sb.rpc("make_admin", admin, institute_id=inst, user_id=users["admin"].id))
    assert sb.rpc("make_admin", admin, **args).status_code in (200, 204)
    roles = roles_of(sb, inst)
    assert roles[users["editor"].id] == "admin"
    assert roles[users["admin"].id] == "editor"
    # The old admin lost admin rights at once.
    refused(sb.rpc("make_admin", admin, **args))


def test_remove_member(sb, users, inst):
    args = {"institute_id": inst, "user_id": users["viewer"].id}
    for who in ("editor", "viewer", "outsider"):
        refused(sb.rpc("remove_member", sb.as_user(users[who]), **args))
    admin = sb.as_user(users["admin"])
    refused(sb.rpc("remove_member", admin, institute_id=inst, user_id=users["admin"].id))
    assert sb.rpc("remove_member", admin, **args).status_code in (200, 204)
    assert users["viewer"].id not in roles_of(sb, inst)


def test_leave_institute(sb, users, inst):
    refused(sb.rpc("leave_institute", sb.as_user(users["admin"]), institute_id=inst))
    refused(sb.rpc("leave_institute", sb.as_user(users["outsider"]), institute_id=inst))
    assert sb.rpc("leave_institute", sb.as_user(users["editor"]), institute_id=inst).status_code in (200, 204)
    assert set(roles_of(sb, inst)) == {users["admin"].id, users["viewer"].id}


def test_delete_institute(sb, users, inst):
    for who in ("editor", "viewer", "outsider"):
        refused(sb.rpc("delete_institute", sb.as_user(users[who]), institute_id=inst))
    assert sb.rpc("delete_institute", sb.as_user(users["admin"]), institute_id=inst).status_code in (200, 204)
    service = sb.service()
    assert sb.rows("institutes", service, id=f"eq.{inst}") == []
    assert sb.rows("memberships", service, institute_id=f"eq.{inst}") == []
    assert sb.rows("invites", service, institute_id=f"eq.{inst}") == []


# ── accept_invites ──────────────────────────────────────────────────────────────────────────────────────


def test_accept_invites_case_insensitive_and_once(sb, users):
    invitee = users["invitee"]
    first = create_institute(sb, users["admin"], name="A College")
    second = create_institute(sb, users["outsider"], name="B College")
    try:
        invite(sb, users["admin"], first, invitee.email.upper(), "editor")
        invite(sb, users["outsider"], second, invitee.email, "viewer")
        invite(sb, users["admin"], first, "not-" + invitee.email, "viewer")
        assert accept(sb, invitee) == [
            {"institute_id": first, "institute_name": "A College", "role": "editor"},
            {"institute_id": second, "institute_name": "B College", "role": "viewer"},
        ]
        assert accept(sb, invitee) == []
        # The other email's invite is untouched.
        assert [i["email"] for i in sb.rows("invites", sb.service(), institute_id=f"eq.{first}")] == [
            "not-" + invitee.email
        ]
    finally:
        sb.delete("institutes", sb.service(), id=f"in.({first},{second})")


def test_accept_invites_for_an_existing_member_just_deletes_it(sb, users, inst):
    invite(sb, users["admin"], inst, users["editor"].email, "viewer")
    assert accept(sb, users["editor"]) == []
    assert roles_of(sb, inst)[users["editor"].id] == "editor"
    emails = {i["email"] for i in sb.rows("invites", sb.service(), institute_id=f"eq.{inst}")}
    assert users["editor"].email not in emails
