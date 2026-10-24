"""Consents and policy versions on the Supabase dev project (T24).

Runs against the hosted project in server/.env and skips without it, like test_rls.py. Throwaway users (emails
start with `consent-<run>-`) are deleted afterwards, and their consents with them. That every public table has RLS
on is test_rls.py's guard. Rules: tickets/T24-consent.md.
"""

import secrets
from datetime import datetime, timedelta, timezone

import pytest

from tests.supabase_api import Supabase, load_config

CONFIG = load_config()

pytestmark = [
    pytest.mark.supabase,
    pytest.mark.skipif(CONFIG is None, reason="SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set (server/.env)"),
]


@pytest.fixture(scope="module")
def sb():
    client = Supabase(CONFIG)
    yield client
    client.http.close()


@pytest.fixture
def make_user(sb):
    """Creates signed-in throwaway users; deletes whichever are still there afterwards."""
    run = secrets.token_hex(4)
    made = []

    def make(who: str):
        user = sb.create_user(f"consent-{run}-{who}@example.com")
        made.append(user)
        return user

    yield make
    for user in made:
        res = sb.http.delete(f"{sb.url}/auth/v1/admin/users/{user.id}", headers=sb.service())
        assert res.status_code in (200, 404), res.text


def record(sb, headers, version=1):
    return sb.rpc("record_consent", headers, version=version)


def consents_of(sb, user) -> list[dict]:
    return sb.rows("consents", sb.service(), user_id=f"eq.{user.id}")


def refused(res, status=403):
    assert res.status_code == status, f"expected {status}, got {res.status_code}: {res.text}"


def test_every_version_is_published_and_readable_by_anyone(sb, make_user):
    for headers in (sb.anon(), sb.as_user(make_user("reader"))):
        versions = [r["version"] for r in sb.rows("policy_versions", headers)]
        assert {1, 2} <= set(versions)


def test_policy_versions_have_no_writes_but_migrations(sb, make_user):
    user = sb.as_user(make_user("writer"))
    refused(sb.insert("policy_versions", user, {"version": 999}))
    refused(sb.insert("policy_versions", sb.anon(), {"version": 999}), 401)
    refused(sb.update("policy_versions", user, {"published_at": "2020-01-01T00:00:00Z"}, version="eq.1"))
    refused(sb.delete("policy_versions", user, version="eq.1"))


def test_record_consent_stores_the_caller_and_the_time(sb, make_user):
    user = make_user("accepts")
    res = record(sb, sb.as_user(user))
    assert res.status_code in (200, 204), res.text

    [row] = consents_of(sb, user)
    assert row["version"] == 1
    accepted = datetime.fromisoformat(row["accepted_at"])
    # The server's clock, not ours: allow for skew, but it must be now-ish rather than a caller-chosen time.
    assert abs(accepted - datetime.now(timezone.utc)) < timedelta(minutes=5)


def test_record_consent_twice_keeps_one_row_and_the_first_time(sb, make_user):
    user = make_user("twice")
    headers = sb.as_user(user)
    assert record(sb, headers).status_code in (200, 204)
    [first] = consents_of(sb, user)
    res = record(sb, headers)
    assert res.status_code in (200, 204), res.text
    assert consents_of(sb, user) == [first]


def test_record_consent_refuses_an_unknown_version(sb, make_user):
    user = make_user("unknown")
    res = record(sb, sb.as_user(user), version=999)
    refused(res, 400)
    assert res.json()["message"] == "That policy version does not exist."
    assert consents_of(sb, user) == []


def test_record_consent_refuses_anon(sb):
    refused(record(sb, sb.anon()), 401)


def test_users_see_only_their_own_consents(sb, make_user):
    alice, bela = make_user("alice"), make_user("bela")
    record(sb, sb.as_user(alice)).raise_for_status()
    record(sb, sb.as_user(bela)).raise_for_status()

    for me, other in ((alice, bela), (bela, alice)):
        rows = sb.rows("consents", sb.as_user(me), user_id=f"in.({alice.id},{bela.id})")
        assert [r["user_id"] for r in rows] == [me.id]
        assert sb.rows("consents", sb.as_user(me), user_id=f"eq.{other.id}") == []


def test_anon_reads_no_consents(sb, make_user):
    record(sb, sb.as_user(make_user("seen"))).raise_for_status()
    res = sb.select("consents", sb.anon())
    assert res.status_code == 401 or res.json() == [], res.text


def test_consents_have_no_direct_writes(sb, make_user):
    user = make_user("direct")
    headers = sb.as_user(user)
    refused(sb.insert("consents", headers, {"user_id": user.id, "version": 1}))
    assert consents_of(sb, user) == []

    record(sb, headers).raise_for_status()
    refused(sb.update("consents", headers, {"accepted_at": "2020-01-01T00:00:00Z"}, user_id=f"eq.{user.id}"))
    refused(sb.delete("consents", headers, user_id=f"eq.{user.id}"))
    assert len(consents_of(sb, user)) == 1


def test_consents_go_when_the_user_is_deleted(sb, make_user):
    user = make_user("leaves")
    record(sb, sb.as_user(user)).raise_for_status()
    assert len(consents_of(sb, user)) == 1

    sb.delete_user(user.id)
    assert consents_of(sb, user) == []
