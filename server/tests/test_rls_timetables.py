"""Online timetables, versions, publishing and the institute handle on the Supabase dev project (T27).

Runs against the hosted project in server/.env and skips without it, like test_rls.py. Throwaway users (emails
start with `tt-<run>-`) are deleted afterwards, with their institutes and so their timetables.
Rules: tickets/T27-online-schema.md.
"""

import json
import secrets

import pytest

from tests.supabase_api import Supabase, User, load_config

CONFIG = load_config()

pytestmark = [
    pytest.mark.supabase,
    pytest.mark.skipif(CONFIG is None, reason="SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set (server/.env)"),
]

ROLES = ("admin", "editor", "viewer", "outsider")
# A version document: the working copy with a result, so it can be published.
DOC = {"settings": {"days": 5}, "teachers": [{"id": "t1"}], "locks": [{"sessionId": "s1"}], "result": {"placements": []}}
NO_RESULT = {**DOC, "result": None}


@pytest.fixture(scope="module")
def sb():
    client = Supabase(CONFIG)
    yield client
    client.http.close()


@pytest.fixture(scope="module")
def users(sb):
    """admin, editor, viewer and outsider, who accepted the current policy, and `lapsed`, who accepted only the
    one before it (none while there is one version)."""
    run = secrets.token_hex(4)
    made: dict[str, User] = {}
    current = max(p["version"] for p in sb.rows("policy_versions", sb.anon()))
    try:
        for who in (*ROLES, "lapsed"):
            made[who] = sb.create_user(f"tt-{run}-{who}@example.com", name=f"TT {who.title()}")
            version = current if who != "lapsed" else current - 1
            if version > 0:
                sb.rpc("record_consent", sb.as_user(made[who]), version=version).raise_for_status()
        yield made
    finally:
        ids = [u.id for u in made.values()]
        if ids:
            sb.delete("institutes", sb.service(), created_by=f"in.({','.join(ids)})")
        for user in made.values():
            sb.delete_user(user.id)


@pytest.fixture
def inst(sb, users):
    """An institute with admin, editor, viewer and lapsed (an editor without consent). Deleted afterwards."""
    res = sb.rpc("create_institute", sb.as_user(users["admin"]), name="TT College")
    assert res.status_code == 200, res.text
    institute = res.json()
    for who, role in (("editor", "editor"), ("viewer", "viewer"), ("lapsed", "editor")):
        row = {"institute_id": institute, "user_id": users[who].id, "role": role}
        assert sb.insert("memberships", sb.service(), row).status_code == 201
    yield institute
    sb.delete("institutes", sb.service(), id=f"eq.{institute}")


def ok(res):
    assert res.status_code in (200, 204), f"{res.status_code}: {res.text}"
    return res.json() if res.content else None


def refused(res, status=403):
    assert res.status_code == status, f"expected {status}, got {res.status_code}: {res.text}"
    return res.json()


def create(sb, user, inst, name="CSE odd sem", data=DOC) -> tuple[str, int]:
    [row] = ok(sb.rpc("create_timetable", sb.as_user(user), institute_id=inst, name=name, data=data))
    return row["timetable_id"], row["version"]


def save(sb, user, tt, base, data=DOC):
    return sb.rpc("save_timetable", sb.as_user(user), timetable_id=tt, data=data, base_version=base)


def set_handle(sb, user, inst, handle):
    return sb.rpc("set_institute_handle", sb.as_user(user), institute_id=inst, handle=handle)


def timetable(sb, tt) -> dict:
    [row] = sb.rows("timetables", sb.service(), id=f"eq.{tt}")
    return row


def kept_versions(sb, tt) -> list[int]:
    rows = sb.rows("timetable_versions", sb.service(), timetable_id=f"eq.{tt}", order="version")
    return [r["version"] for r in rows]


def published(sb, public_id) -> list[dict]:
    return ok(sb.rpc("get_published", sb.anon(), public_id=public_id))


@pytest.fixture
def tt(sb, users, inst):
    """A timetable in `inst` with version 1, made by the editor."""
    return create(sb, users["editor"], inst)[0]


@pytest.fixture
def live(sb, users, inst, tt):
    """`tt` published, with the institute's handle set. Returns its public id."""
    ok(set_handle(sb, users["admin"], inst, f"tt-{secrets.token_hex(4)}"))
    ok(sb.rpc("publish_timetable", sb.as_user(users["editor"]), timetable_id=tt, version=1))
    return timetable(sb, tt)["public_id"]


# ── Guards and reads ────────────────────────────────────────────────────────────────────────────────────


def test_new_tables_exist_with_rls(sb):
    for table in ("timetables", "timetable_versions"):
        assert sb.select(table, sb.service(), limit="1").status_code == 200
    assert ok(sb.rpc("tables_without_rls", sb.service())) == []


@pytest.mark.parametrize("who", ROLES)
def test_members_read_timetables_and_versions(sb, users, inst, tt, who):
    headers = sb.as_user(users[who])
    timetables = sb.rows("timetables", headers, id=f"eq.{tt}")
    versions = sb.rows("timetable_versions", headers, timetable_id=f"eq.{tt}")
    if who == "outsider":
        assert timetables == [] and versions == []
    else:
        assert [t["name"] for t in timetables] == ["CSE odd sem"]
        assert [(v["version"], v["data"]) for v in versions] == [(1, DOC)]


@pytest.mark.parametrize("table", ("timetables", "timetable_versions"))
def test_anon_reads_nothing(sb, tt, table):
    res = sb.select(table, sb.anon())
    assert res.status_code == 401 or res.json() == [], res.text


def test_no_direct_writes(sb, users, inst, tt):
    admin = sb.as_user(users["admin"])
    refused(sb.insert("timetables", admin, {"institute_id": inst, "name": "Direct"}))
    refused(sb.update("timetables", admin, {"live_version": 1}, id=f"eq.{tt}"))
    refused(sb.delete("timetables", admin, id=f"eq.{tt}"))
    refused(sb.insert("timetable_versions", admin, {"timetable_id": tt, "version": 2, "data": {}}))
    refused(sb.update("timetable_versions", admin, {"data": {}}, timetable_id=f"eq.{tt}"))
    refused(sb.delete("timetable_versions", admin, timetable_id=f"eq.{tt}"))
    refused(sb.insert("timetables", sb.anon(), {"institute_id": inst, "name": "Anon"}), 401)
    assert kept_versions(sb, tt) == [1]


def test_rename_grant_does_not_cover_the_handle(sb, users, inst):
    admin = sb.as_user(users["admin"])
    refused(sb.update("institutes", admin, {"handle": "direct"}, id=f"eq.{inst}"))
    [row] = ok(sb.update("institutes", admin, {"name": "Renamed"}, id=f"eq.{inst}"))
    assert row["name"] == "Renamed" and row["handle"] is None


# ── create, save, rename, delete ────────────────────────────────────────────────────────────────────────


def test_create_timetable(sb, users, inst):
    tt, version = create(sb, users["admin"], inst, name="  ECE even sem  ")
    row = timetable(sb, tt)
    assert version == 1
    assert row["name"] == "ECE even sem"
    assert row["latest_version"] == 1 and row["live_version"] is None
    assert row["created_by"] == users["admin"].id
    assert len(row["public_id"]) == 10 and row["public_id"].isalnum() and row["public_id"] == row["public_id"].lower()
    [v] = sb.rows("timetable_versions", sb.service(), timetable_id=f"eq.{tt}")
    assert v["saved_by"] == users["admin"].id and v["data"] == DOC


def test_public_ids_differ(sb, users, inst):
    ids = {timetable(sb, create(sb, users["editor"], inst, name=f"T{i}")[0])["public_id"] for i in range(5)}
    assert len(ids) == 5


def test_create_refused_for_viewers_outsiders_and_anon(sb, users, inst):
    for who in ("viewer", "outsider"):
        body = refused(sb.rpc("create_timetable", sb.as_user(users[who]), institute_id=inst, name="X", data=DOC))
        assert "Only editors and the admin" in body["message"]
    refused(sb.rpc("create_timetable", sb.anon(), institute_id=inst, name="X", data=DOC), 401)
    assert sb.rows("timetables", sb.service(), institute_id=f"eq.{inst}") == []


def test_names_are_unique_per_institute_ignoring_case_and_spaces(sb, users, inst):
    create(sb, users["editor"], inst, name="CSE")
    res = sb.rpc("create_timetable", sb.as_user(users["admin"]), institute_id=inst, name="  cse ", data=DOC)
    assert refused(res, 409)["message"] == "This institute already has a timetable with that name."
    # Another institute may use the same name.
    other = ok(sb.rpc("create_institute", sb.as_user(users["outsider"]), name="Other College"))
    create(sb, users["outsider"], other, name="CSE")


def test_name_length(sb, users, inst):
    for name in ("   ", "x" * 121):
        refused(sb.rpc("create_timetable", sb.as_user(users["editor"]), institute_id=inst, name=name, data=DOC), 400)
    create(sb, users["editor"], inst, name="x" * 120)


def test_save_adds_a_version(sb, users, inst, tt):
    assert ok(save(sb, users["admin"], tt, 1)) == 2
    assert ok(save(sb, users["editor"], tt, 2, data=NO_RESULT)) == 3
    assert timetable(sb, tt)["latest_version"] == 3
    rows = sb.rows("timetable_versions", sb.service(), timetable_id=f"eq.{tt}", order="version")
    assert [(r["version"], r["saved_by"]) for r in rows] == [
        (1, users["editor"].id),
        (2, users["admin"].id),
        (3, users["editor"].id),
    ]
    assert rows[2]["data"] == NO_RESULT


def test_save_refused_for_viewers_and_outsiders(sb, users, tt):
    for who in ("viewer", "outsider"):
        assert "Only editors and the admin" in refused(save(sb, users[who], tt, 1))["message"]
    refused(sb.rpc("save_timetable", sb.anon(), timetable_id=tt, data=DOC, base_version=1), 401)
    assert kept_versions(sb, tt) == [1]


def test_stale_base_reports_who_saved_and_overwrite_retries(sb, users, tt):
    ok(save(sb, users["admin"], tt, 1))  # the admin saves while the editor still has version 1 open
    res = save(sb, users["editor"], tt, 1)
    assert res.status_code == 400, res.text
    body = res.json()
    assert body["code"] == "LT409"
    detail = json.loads(body["details"])
    assert detail["latest_version"] == 2
    assert detail["saved_by"] == users["admin"].id
    assert detail["saved_by_name"] == "TT Admin"
    assert detail["saved_at"]
    assert kept_versions(sb, tt) == [1, 2]
    # Overwrite: retry with the reported version as the base.
    assert ok(save(sb, users["editor"], tt, detail["latest_version"])) == 3


def test_a_missing_base_is_stale(sb, users, tt):
    assert save(sb, users["editor"], tt, None).json()["code"] == "LT409"


def test_pruning_keeps_20_and_an_older_live_version(sb, users, inst, tt, live):
    for base in range(1, 24):
        assert ok(save(sb, users["editor"], tt, base)) == base + 1
    assert kept_versions(sb, tt) == [1, *range(5, 25)]
    # Once it isn't live, the next save prunes it.
    ok(sb.rpc("unpublish_timetable", sb.as_user(users["editor"]), timetable_id=tt))
    ok(save(sb, users["editor"], tt, 24))
    assert kept_versions(sb, tt) == list(range(6, 26))


def test_a_version_over_2_mb_is_refused(sb, users, inst, tt):
    big = {**DOC, "padding": "x" * (2 * 1024 * 1024)}
    res = save(sb, users["editor"], tt, 1, data=big)
    assert res.status_code in (400, 413), res.text
    res = sb.rpc("create_timetable", sb.as_user(users["editor"]), institute_id=inst, name="Big", data=big)
    assert res.status_code in (400, 413), res.text
    assert kept_versions(sb, tt) == [1]
    assert [t["name"] for t in sb.rows("timetables", sb.service(), institute_id=f"eq.{inst}")] == ["CSE odd sem"]


def test_rename(sb, users, inst, tt):
    for who in ("viewer", "outsider"):
        refused(sb.rpc("rename_timetable", sb.as_user(users[who]), timetable_id=tt, name="Hacked"))
    ok(sb.rpc("rename_timetable", sb.as_user(users["editor"]), timetable_id=tt, name=" Renamed "))
    assert timetable(sb, tt)["name"] == "Renamed"
    create(sb, users["editor"], inst, name="Taken")
    res = sb.rpc("rename_timetable", sb.as_user(users["admin"]), timetable_id=tt, name="TAKEN")
    refused(res, 409)
    # Changing only the case of its own name is fine.
    ok(sb.rpc("rename_timetable", sb.as_user(users["admin"]), timetable_id=tt, name="RENAMED"))


def test_delete_is_admin_only_and_takes_versions_and_link(sb, users, tt, live):
    for who in ("editor", "viewer", "outsider"):
        body = refused(sb.rpc("delete_timetable", sb.as_user(users[who]), timetable_id=tt))
        assert body["message"] == "Only the admin can delete a timetable."
    ok(sb.rpc("delete_timetable", sb.as_user(users["admin"]), timetable_id=tt))
    assert sb.rows("timetables", sb.service(), id=f"eq.{tt}") == []
    assert kept_versions(sb, tt) == []
    assert published(sb, live) == []


def test_deleting_the_institute_takes_its_timetables(sb, users, inst, tt):
    ok(save(sb, users["editor"], tt, 1))
    ok(sb.rpc("delete_institute", sb.as_user(users["admin"]), institute_id=inst))
    assert sb.rows("timetables", sb.service(), id=f"eq.{tt}") == []
    assert kept_versions(sb, tt) == []


# ── Publishing ──────────────────────────────────────────────────────────────────────────────────────────


def test_get_published_shows_the_live_version_without_locks(sb, users, inst, tt, live):
    [page] = published(sb, live)
    handle = sb.rows("institutes", sb.service(), id=f"eq.{inst}")[0]["handle"]
    assert page["institute_name"] == "TT College"
    assert page["handle"] == handle
    assert page["timetable_name"] == "CSE odd sem"
    assert page["saved_at"]
    assert "locks" not in page["data"]
    assert page["data"] == {k: v for k, v in DOC.items() if k != "locks"}
    # Signed-in callers get the same.
    assert ok(sb.rpc("get_published", sb.as_user(users["outsider"]), public_id=live)) == [page]


def test_get_published_finds_nothing_for_unknown_or_unpublished(sb, users, tt):
    assert published(sb, "zzzzzzzzzz") == []
    assert published(sb, timetable(sb, tt)["public_id"]) == []


def test_publish_is_for_editors_and_the_admin(sb, users, inst, tt):
    ok(set_handle(sb, users["admin"], inst, f"tt-{secrets.token_hex(4)}"))
    for who in ("viewer", "outsider"):
        refused(sb.rpc("publish_timetable", sb.as_user(users[who]), timetable_id=tt, version=1))
        refused(sb.rpc("unpublish_timetable", sb.as_user(users[who]), timetable_id=tt))
    refused(sb.rpc("publish_timetable", sb.anon(), timetable_id=tt, version=1), 401)
    assert timetable(sb, tt)["live_version"] is None
    ok(sb.rpc("publish_timetable", sb.as_user(users["admin"]), timetable_id=tt, version=1))
    assert timetable(sb, tt)["live_version"] == 1


def test_publish_needs_a_result(sb, users, inst, tt):
    ok(set_handle(sb, users["admin"], inst, f"tt-{secrets.token_hex(4)}"))
    ok(save(sb, users["editor"], tt, 1, data=NO_RESULT))
    res = sb.rpc("publish_timetable", sb.as_user(users["editor"]), timetable_id=tt, version=2)
    assert refused(res, 400)["message"] == "Generate the timetable before publishing it."
    ok(save(sb, users["editor"], tt, 2, data={k: v for k, v in DOC.items() if k != "result"}))
    refused(sb.rpc("publish_timetable", sb.as_user(users["editor"]), timetable_id=tt, version=3), 400)
    assert timetable(sb, tt)["live_version"] is None


def test_publish_needs_a_handle(sb, users, tt):
    res = sb.rpc("publish_timetable", sb.as_user(users["editor"]), timetable_id=tt, version=1)
    body = refused(res)
    assert body["hint"] == "handle_required"
    assert "handle" in body["message"]
    assert timetable(sb, tt)["live_version"] is None


def test_publish_needs_a_kept_version(sb, users, tt, live):
    res = sb.rpc("publish_timetable", sb.as_user(users["editor"]), timetable_id=tt, version=7)
    assert refused(res, 400)["message"] == "That version is no longer kept."


def test_make_live_switches_versions_and_unpublish_hides_it(sb, users, tt, live):
    newer = {**DOC, "settings": {"days": 6}}
    ok(save(sb, users["editor"], tt, 1, data=newer))
    ok(sb.rpc("publish_timetable", sb.as_user(users["editor"]), timetable_id=tt, version=2))
    assert published(sb, live)[0]["data"]["settings"] == {"days": 6}
    # Make live an older version: the link switches back at once.
    ok(sb.rpc("publish_timetable", sb.as_user(users["admin"]), timetable_id=tt, version=1))
    assert published(sb, live)[0]["data"]["settings"] == {"days": 5}
    ok(sb.rpc("unpublish_timetable", sb.as_user(users["editor"]), timetable_id=tt))
    assert timetable(sb, tt)["live_version"] is None
    assert published(sb, live) == []


def test_a_handle_change_keeps_the_link_working(sb, users, inst, live):
    new = f"tt-{secrets.token_hex(4)}"
    ok(set_handle(sb, users["admin"], inst, new))
    assert published(sb, live)[0]["handle"] == new


# ── Handle ──────────────────────────────────────────────────────────────────────────────────────────────


def handle_of(sb, inst):
    return sb.rows("institutes", sb.service(), id=f"eq.{inst}")[0]["handle"]


def test_handle_is_admin_only_and_cleaned(sb, users, inst):
    for who in ("editor", "viewer", "outsider"):
        body = refused(set_handle(sb, users[who], inst, "nope"))
        assert body["message"] == "Only the admin can set the institute's handle."
    refused(sb.rpc("set_institute_handle", sb.anon(), institute_id=inst, handle="nope"), 401)
    assert handle_of(sb, inst) is None
    handle = f"TT-{secrets.token_hex(3)}".upper()
    ok(set_handle(sb, users["admin"], inst, f"  {handle} "))
    assert handle_of(sb, inst) == handle.lower()


@pytest.mark.parametrize(
    "handle",
    ["ab", "x" * 31, "-abc", "abc-", "a_b", "a.b", "ab c", "ábc", "", None, "admin", "WWW", "published", "privacy", "help"],
)
def test_handle_format_and_reserved_words(sb, users, inst, handle):
    res = set_handle(sb, users["admin"], inst, handle)
    refused(res, 400)
    assert handle_of(sb, inst) is None


@pytest.mark.parametrize("shape", ["3 chars", "inner hyphens", "digits at the ends", "30 chars"])
def test_handle_edges_allowed(sb, users, inst, shape):
    # Handles are unique across Lattice, so each is random within its shape.
    tag = secrets.token_hex(14)
    handle = {
        "3 chars": "t" + tag[:2],
        "inner hyphens": f"t-{tag[:4]}--x",
        "digits at the ends": f"1{tag[:6]}9",
        "30 chars": "t" + tag + "x",
    }[shape]
    ok(set_handle(sb, users["admin"], inst, handle))
    assert handle_of(sb, inst) == handle


def test_handle_is_unique(sb, users, inst):
    handle = f"tt-{secrets.token_hex(4)}"
    ok(set_handle(sb, users["admin"], inst, handle))
    other = ok(sb.rpc("create_institute", sb.as_user(users["outsider"]), name="Other College"))
    body = refused(set_handle(sb, users["outsider"], other, handle.upper()), 409)
    assert body["message"] == "That handle is taken."
    # Setting your own handle again is fine.
    ok(set_handle(sb, users["admin"], inst, handle))


# ── Consent ─────────────────────────────────────────────────────────────────────────────────────────────


def test_writes_need_consent_to_the_current_policy(sb, users, inst, tt):
    lapsed = sb.as_user(users["lapsed"])
    calls = [
        ("create_timetable", {"institute_id": inst, "name": "Lapsed", "data": DOC}),
        ("save_timetable", {"timetable_id": tt, "data": DOC, "base_version": 1}),
        ("rename_timetable", {"timetable_id": tt, "name": "Lapsed"}),
        ("publish_timetable", {"timetable_id": tt, "version": 1}),
        ("unpublish_timetable", {"timetable_id": tt}),
    ]
    for fn, args in calls:
        body = refused(sb.rpc(fn, lapsed, **args))
        assert body["message"] == "Accept the current Terms first.", fn
        assert body["hint"] == "consent_required", fn
    assert kept_versions(sb, tt) == [1]
    assert timetable(sb, tt)["name"] == "CSE odd sem"


def test_admin_only_writes_need_consent_too(sb, users, inst, tt):
    # Make the lapsed user the admin (service role), then try delete and handle.
    service = sb.service()
    sb.update("memberships", service, {"role": "editor"}, institute_id=f"eq.{inst}", user_id=f"eq.{users['admin'].id}")
    sb.update("memberships", service, {"role": "admin"}, institute_id=f"eq.{inst}", user_id=f"eq.{users['lapsed'].id}")
    lapsed = sb.as_user(users["lapsed"])
    assert refused(sb.rpc("delete_timetable", lapsed, timetable_id=tt))["hint"] == "consent_required"
    assert refused(set_handle(sb, users["lapsed"], inst, "lapsed-handle"))["hint"] == "consent_required"
    assert timetable(sb, tt)["id"] == tt
