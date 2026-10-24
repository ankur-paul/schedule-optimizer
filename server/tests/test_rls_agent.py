"""Assistant coupons, access, question limits and usage on the Supabase dev project (T36).

Runs against the hosted project in server/.env and skips without it, like test_rls.py. Throwaway users (emails
start with `agent-<run>-`) are deleted afterwards, with their institutes and so their access, questions and usage.
Coupons made here carry the note `test T36 <run>` and are deleted too. Rules: tickets/T36-agent-access.md.
"""

import secrets
import uuid
from datetime import datetime, timedelta, timezone
from decimal import Decimal

import pytest

from coupons import code_hash, issue
from tests.supabase_api import Supabase, User, load_config
from tests.test_coupons import VECTOR_CODE, VECTOR_HASH

CONFIG = load_config()

pytestmark = [
    pytest.mark.supabase,
    pytest.mark.skipif(CONFIG is None, reason="SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set (server/.env)"),
]

TABLES = ("agent_coupons", "agent_access", "agent_redeem_failures", "agent_questions", "agent_usage")
MEMBERS = ("admin", "editor", "viewer", "lapsed")
BIG = 10**9  # a monthly budget no test reaches
RUN = secrets.token_hex(4)
NOTE = f"test T36 {RUN}"


@pytest.fixture(scope="module")
def sb():
    client = Supabase(CONFIG)
    yield client
    client.http.delete(f"{client.url}/rest/v1/agent_coupons", headers=client.service(), params={"note": f"eq.{NOTE}"})
    client.http.close()


@pytest.fixture(scope="module")
def current_version(sb) -> int:
    return max(p["version"] for p in sb.rows("policy_versions", sb.anon()))


class Users:
    """Signed-in throwaway users who accepted the current policy (`consent=False`: only the one before it)."""

    def __init__(self, sb: Supabase, version: int):
        self.sb, self.version, self.made = sb, version, []

    def make(self, who: str, consent: bool = True) -> User:
        user = self.sb.create_user(f"agent-{RUN}-{who}-{secrets.token_hex(2)}@example.com")
        self.made.append(user)
        version = self.version if consent else self.version - 1
        if version > 0:
            self.sb.rpc("record_consent", self.sb.as_user(user), version=version).raise_for_status()
        return user

    def delete_all(self):
        """Their institutes go first, since created_by is set null when a user goes."""
        sb = self.sb
        if self.made:
            sb.delete("institutes", sb.service(), created_by=f"in.({','.join(u.id for u in self.made)})")
        for user in self.made:
            res = sb.http.delete(f"{sb.url}/auth/v1/admin/users/{user.id}", headers=sb.service())
            assert res.status_code in (200, 404), res.text


@pytest.fixture(scope="module")
def users(sb, current_version) -> dict[str, User]:
    """admin, editor, viewer and outsider with consent; lapsed, a viewer without it."""
    made = Users(sb, current_version)
    try:
        yield {who: made.make(who, consent=who != "lapsed") for who in (*MEMBERS, "outsider")}
    finally:
        made.delete_all()


@pytest.fixture
def make_user(sb, current_version):
    """More users for one test, deleted after it."""
    made = Users(sb, current_version)
    yield made.make
    made.delete_all()


def new_institute(sb, admin: User, others: dict[str, tuple[User, str]] | None = None) -> str:
    """An institute made by `admin` (create_institute needs no consent), with `others` added by the service role."""
    res = sb.rpc("create_institute", sb.as_user(admin), name="Agent College")
    assert res.status_code == 200, res.text
    institute = res.json()
    for user, role in (others or {}).values():
        row = {"institute_id": institute, "user_id": user.id, "role": role}
        assert sb.insert("memberships", sb.service(), row).status_code == 201
    return institute


@pytest.fixture
def inst(sb, users) -> str:
    """An institute with admin, editor, viewer and lapsed (a viewer). Deleted afterwards, with the shared users'
    wrong coupon tries, so each test starts with none."""
    others = {who: (users[who], "viewer" if who == "lapsed" else who) for who in ("editor", "viewer", "lapsed")}
    institute = new_institute(sb, users["admin"], others)
    yield institute
    sb.delete("institutes", sb.service(), id=f"eq.{institute}")
    sb.delete("agent_redeem_failures", sb.service(), user_id=f"in.({','.join(u.id for u in users.values())})")


def ok(res):
    assert res.status_code in (200, 204), f"{res.status_code}: {res.text}"
    return res.json() if res.content else None


def refused(res, hint: str | None = None, status=403) -> dict:
    assert res.status_code == status, f"expected {status}, got {res.status_code}: {res.text}"
    body = res.json()
    if hint:
        assert body["hint"] == hint, body
    return body


def no_reads(res):
    """Refused, or answered with nothing."""
    assert res.status_code in (401, 403) or res.json() == [], f"{res.status_code}: {res.text}"


def coupon(sb, questions=200, days=30) -> str:
    return issue(CONFIG, questions, days, NOTE, sb.http)


def redeem(sb, user, inst, code):
    return sb.rpc("redeem_coupon", sb.as_user(user), institute_id=inst, code=code)


def access_of(sb, inst) -> dict | None:
    rows = sb.rows("agent_access", sb.service(), institute_id=f"eq.{inst}")
    return rows[0] if rows else None


def grant(sb, inst, questions=10, expires_in=timedelta(days=30)):
    row = {"institute_id": inst, "questions_left": questions, "expires_at": iso(now() + expires_in)}
    res = sb.http.post(
        f"{sb.url}/rest/v1/agent_access",
        headers={**sb.service(), "Prefer": "resolution=merge-duplicates,return=minimal"},
        json=row,
    )
    assert res.status_code == 201, res.text


def begin(sb, user, inst, question=None, kind="turn", budget=BIG, headers=None):
    return sb.rpc(
        "agent_begin",
        headers or sb.service(),
        user_id=user.id,
        institute_id=inst,
        question_id=question,
        kind=kind,
        budget_cents=budget,
    )


def record(sb, question, cost="1.2345", kind="turn", headers=None):
    return sb.rpc(
        "agent_record",
        headers or sb.service(),
        question_id=question,
        kind=kind,
        model="claude-opus-5-5",
        input_tokens=1200,
        output_tokens=300,
        cache_read_tokens=9000,
        cache_write_tokens=0,
        cost_cents=cost,
    )


def now() -> datetime:
    return datetime.now(timezone.utc)


def iso(at: datetime) -> str:
    return at.isoformat()


def when(text: str) -> datetime:
    return datetime.fromisoformat(text)


def near(at: datetime, expected: datetime) -> bool:
    return abs(at - expected) < timedelta(minutes=5)


# ── Guards ──────────────────────────────────────────────────────────────────────────────────────────────


def test_new_tables_exist_with_rls(sb):
    for table in TABLES:
        assert sb.select(table, sb.service(), limit="1").status_code == 200, table
    assert ok(sb.rpc("tables_without_rls", sb.service())) == []


# ── redeem_coupon ───────────────────────────────────────────────────────────────────────────────────────


def test_admin_redeems_a_coupon(sb, users, inst):
    code = coupon(sb, questions=50, days=7)
    [row] = ok(redeem(sb, users["admin"], inst, code))
    assert row["questions_left"] == 50
    assert near(when(row["expires_at"]), now() + timedelta(days=7))

    [stored] = sb.rows("agent_coupons", sb.service(), code_hash=f"eq.{code_hash(code)}")
    assert stored["redeemed_by"] == users["admin"].id
    assert stored["institute_id"] == inst
    assert near(when(stored["redeemed_at"]), now())
    assert access_of(sb, inst)["questions_left"] == 50


@pytest.mark.parametrize("who", ("editor", "viewer", "outsider"))
def test_only_the_admin_redeems(sb, users, inst, who):
    code = coupon(sb)
    body = refused(redeem(sb, users[who], inst, code), "not_admin")
    assert body["message"] == "Only the admin can redeem a coupon."
    assert access_of(sb, inst) is None
    [stored] = sb.rows("agent_coupons", sb.service(), code_hash=f"eq.{code_hash(code)}")
    assert stored["redeemed_at"] is None


def test_an_admin_without_consent_is_refused(sb, users):
    lapsed_inst = new_institute(sb, users["lapsed"])
    refused(redeem(sb, users["lapsed"], lapsed_inst, coupon(sb)), "consent_required")
    assert access_of(sb, lapsed_inst) is None


def test_anon_cannot_redeem(sb, inst):
    refused(sb.rpc("redeem_coupon", sb.anon(), institute_id=inst, code=coupon(sb)), status=401)


def test_the_shared_vector_works_lower_case_and_without_dashes(sb, users, inst):
    """The database's private.coupon_hash agrees with coupons.code_hash on test_coupons' vector."""
    sb.delete("agent_coupons", sb.service(), code_hash=f"eq.{VECTOR_HASH}")
    row = {"code_hash": VECTOR_HASH, "questions": 3, "days": 1, "note": NOTE}
    assert sb.insert("agent_coupons", sb.service(), row).status_code == 201
    typed = VECTOR_CODE.lower().replace("-", "")
    [granted] = ok(redeem(sb, users["admin"], inst, typed))
    assert granted["questions_left"] == 3


def test_an_issued_code_works_typed_loosely(sb, users, inst):
    code = coupon(sb, questions=4)
    typed = " " + code.lower().replace("-", " ") + " "
    assert ok(redeem(sb, users["admin"], inst, typed))[0]["questions_left"] == 4


def test_a_used_or_unknown_code_is_not_valid(sb, users, inst, make_user):
    code = coupon(sb, questions=5)
    ok(redeem(sb, users["admin"], inst, code))
    other_admin = make_user("other")
    other = new_institute(sb, other_admin)
    # Not valid = no rows (raising would roll back the counted failure); the UI says "That coupon isn't valid".
    assert ok(redeem(sb, other_admin, other, code)) == []
    assert ok(redeem(sb, other_admin, other, "LTC-AAAA-AAAA-AAAA-AAAA")) == []
    assert access_of(sb, other) is None
    assert access_of(sb, inst)["questions_left"] == 5
    assert len(sb.rows("agent_redeem_failures", sb.service(), user_id=f"eq.{other_admin.id}")) == 2


def test_the_11th_wrong_try_in_an_hour_is_refused_even_with_a_valid_code(sb, users, inst):
    admin = users["admin"]
    for _ in range(10):
        assert ok(redeem(sb, admin, inst, "LTC-WRNG-WRNG-WRNG-WRNG")) == []
    code = coupon(sb)
    body = refused(redeem(sb, admin, inst, code), "too_many_tries")
    assert body["message"] == "Too many tries, wait an hour."
    assert access_of(sb, inst) is None
    [stored] = sb.rows("agent_coupons", sb.service(), code_hash=f"eq.{code_hash(code)}")
    assert stored["redeemed_at"] is None


def test_tries_older_than_an_hour_dont_count(sb, users, inst):
    admin = users["admin"]
    old = iso(now() - timedelta(minutes=61))
    for _ in range(10):
        assert sb.insert("agent_redeem_failures", sb.service(), {"user_id": admin.id, "at": old}).status_code == 201
    assert ok(redeem(sb, admin, inst, coupon(sb, questions=2)))[0]["questions_left"] == 2
    assert sb.rows("agent_redeem_failures", sb.service(), user_id=f"eq.{admin.id}") == []


def test_a_second_coupon_adds_questions_and_keeps_the_later_expiry(sb, users, inst):
    admin = users["admin"]
    [first] = ok(redeem(sb, admin, inst, coupon(sb, questions=200, days=30)))
    [second] = ok(redeem(sb, admin, inst, coupon(sb, questions=50, days=7)))
    assert second["questions_left"] == 250
    assert when(second["expires_at"]) == when(first["expires_at"])
    [third] = ok(redeem(sb, admin, inst, coupon(sb, questions=10, days=60)))
    assert third["questions_left"] == 260
    assert near(when(third["expires_at"]), now() + timedelta(days=60))


def test_after_expiry_a_coupon_starts_fresh(sb, users, inst):
    grant(sb, inst, questions=99, expires_in=-timedelta(hours=1))
    [row] = ok(redeem(sb, users["admin"], inst, coupon(sb, questions=5, days=3)))
    assert row["questions_left"] == 5
    assert near(when(row["expires_at"]), now() + timedelta(days=3))


# ── Reads and writes ────────────────────────────────────────────────────────────────────────────────────


@pytest.mark.parametrize("who", (*MEMBERS, "outsider"))
def test_members_read_their_access(sb, users, inst, who):
    grant(sb, inst, questions=7)
    rows = sb.rows("agent_access", sb.as_user(users[who]), institute_id=f"eq.{inst}")
    if who == "outsider":
        assert rows == []
    else:
        assert [r["questions_left"] for r in rows] == [7]


def test_anon_reads_no_access(sb, inst):
    grant(sb, inst)
    no_reads(sb.select("agent_access", sb.anon()))


@pytest.mark.parametrize("table", ("agent_coupons", "agent_redeem_failures", "agent_questions", "agent_usage"))
def test_only_the_service_role_reads_the_rest(sb, users, inst, table):
    coupon(sb)
    grant(sb, inst)
    ok(record(sb, ok(begin(sb, users["admin"], inst))["question_id"]))
    redeem(sb, users["admin"], inst, "LTC-WRNG-WRNG-WRNG-WRNG")
    assert sb.rows(table, sb.service(), limit="1") != []
    for who in ("admin", "outsider"):
        no_reads(sb.select(table, sb.as_user(users[who])))
    no_reads(sb.select(table, sb.anon()))


def test_no_direct_writes(sb, users, inst):
    admin = sb.as_user(users["admin"])
    row = {"institute_id": inst, "questions_left": 1000, "expires_at": iso(now() + timedelta(days=365))}
    refused(sb.insert("agent_access", admin, row))
    grant(sb, inst, questions=3)
    sb.update("agent_access", admin, {"questions_left": 1000}, institute_id=f"eq.{inst}")
    sb.delete("agent_access", admin, institute_id=f"eq.{inst}")
    assert access_of(sb, inst)["questions_left"] == 3
    refused(sb.insert("agent_coupons", admin, {"code_hash": "0" * 64, "questions": 1, "days": 1}))
    refused(sb.insert("agent_usage", admin, {"institute_id": inst, "kind": "turn", "model": "x", "input_tokens": 0,
                                             "output_tokens": 0, "cache_read_tokens": 0, "cache_write_tokens": 0,
                                             "cost_cents": 999999}))


def test_signed_in_users_cannot_run_begin_or_record(sb, users, inst):
    grant(sb, inst)
    admin = sb.as_user(users["admin"])
    refused(begin(sb, users["admin"], inst, headers=admin))
    refused(begin(sb, users["admin"], inst, headers=sb.anon()), status=401)
    question = ok(begin(sb, users["admin"], inst))["question_id"]
    refused(record(sb, question, headers=admin))
    refused(record(sb, question, headers=sb.anon()), status=401)
    assert sb.rows("agent_usage", sb.service(), question_id=f"eq.{question}") == []
    assert access_of(sb, inst)["questions_left"] == 9


# ── agent_begin ─────────────────────────────────────────────────────────────────────────────────────────


def test_a_new_question_uses_one_and_continuing_doesnt(sb, users, inst):
    grant(sb, inst, questions=2)
    first = ok(begin(sb, users["editor"], inst))
    assert first["call_number"] == 1
    assert first["questions_left"] == 1
    again = ok(begin(sb, users["editor"], inst, first["question_id"]))
    assert again == {**first, "call_number": 2}
    [q] = sb.rows("agent_questions", sb.service(), id=f"eq.{first['question_id']}")
    assert (q["user_id"], q["institute_id"], q["calls"], q["compactions"]) == (users["editor"].id, inst, 2, 0)


def test_viewers_may_ask(sb, users, inst):
    grant(sb, inst)
    assert ok(begin(sb, users["viewer"], inst))["call_number"] == 1


def test_not_a_member(sb, users, inst):
    grant(sb, inst)
    body = refused(begin(sb, users["outsider"], inst), "not_member")
    assert body["message"] == "You're not a member of this institute."


def test_consent_is_checked_before_access(sb, users, inst):
    refused(begin(sb, users["lapsed"], inst), "consent_required")


def test_no_access(sb, users, inst):
    refused(begin(sb, users["admin"], inst), "no_access")


def test_expired(sb, users, inst):
    grant(sb, inst, expires_in=-timedelta(seconds=1))
    refused(begin(sb, users["admin"], inst), "expired")


def test_paused_at_the_budget(sb, users, inst):
    grant(sb, inst)
    refused(begin(sb, users["admin"], inst, budget=0), "paused")
    assert access_of(sb, inst)["questions_left"] == 10


def test_used_up(sb, users, inst):
    grant(sb, inst, questions=1)
    question = ok(begin(sb, users["admin"], inst))["question_id"]
    refused(begin(sb, users["admin"], inst), "used_up")
    assert ok(begin(sb, users["admin"], inst, question))["call_number"] == 2


def test_the_10th_call_of_a_question_is_refused(sb, users, inst):
    grant(sb, inst)
    question = ok(begin(sb, users["admin"], inst))["question_id"]
    for n in range(2, 10):
        assert ok(begin(sb, users["admin"], inst, question))["call_number"] == n
    refused(begin(sb, users["admin"], inst, question), "too_many_calls")


def test_one_compaction_per_question(sb, users, inst):
    grant(sb, inst)
    question = ok(begin(sb, users["admin"], inst))["question_id"]
    compact = ok(begin(sb, users["admin"], inst, question, kind="compact"))
    assert compact["call_number"] == 1
    assert compact["questions_left"] == 9
    refused(begin(sb, users["admin"], inst, question, kind="compact"), "too_many_compactions")
    [q] = sb.rows("agent_questions", sb.service(), id=f"eq.{question}")
    assert (q["calls"], q["compactions"]) == (1, 1)


def test_a_compaction_continues_a_question(sb, users, inst):
    grant(sb, inst)
    body = refused(begin(sb, users["admin"], inst, kind="compact"), status=400)
    assert body["message"] == "A compaction continues a question."
    refused(begin(sb, users["admin"], inst, kind="chat"), status=400)
    assert access_of(sb, inst)["questions_left"] == 10


def test_closed_after_15_minutes(sb, users, inst):
    grant(sb, inst)
    question = ok(begin(sb, users["admin"], inst))["question_id"]
    started = iso(now() - timedelta(minutes=15, seconds=5))
    ok(sb.update("agent_questions", sb.service(), {"started_at": started}, id=f"eq.{question}"))
    refused(begin(sb, users["admin"], inst, question), "question_closed")


def test_another_users_question_is_refused(sb, users, inst, make_user):
    grant(sb, inst)
    question = ok(begin(sb, users["editor"], inst))["question_id"]
    refused(begin(sb, users["viewer"], inst, question), "unknown_question")
    refused(begin(sb, users["editor"], inst, str(uuid.uuid4())), "unknown_question")
    # Same user, but the question belongs to another institute.
    other = new_institute(sb, make_user("other"), {"editor": (users["editor"], "editor")})
    grant(sb, other)
    refused(begin(sb, users["editor"], other, question), "unknown_question")


def month_spend(sb) -> Decimal:
    start = now().replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    rows = sb.rows("agent_usage", sb.service(), select="cost_cents", at=f"gte.{iso(start)}")
    return sum((Decimal(str(r["cost_cents"])) for r in rows), Decimal(0))


def test_the_budget_counts_only_this_month(sb, users, inst):
    grant(sb, inst)
    question = ok(begin(sb, users["admin"], inst))["question_id"]
    ok(record(sb, question, cost="999999"))
    last_month = now().replace(day=1, hour=12, minute=0, second=0, microsecond=0) - timedelta(days=1)
    ok(sb.update("agent_usage", sb.service(), {"at": iso(last_month)}, question_id=f"eq.{question}"))
    ok(record(sb, question, cost="0.5"))

    spent = month_spend(sb)
    assert spent >= Decimal("0.5")
    assert ok(begin(sb, users["admin"], inst, budget=str(spent + Decimal("0.0001"))))
    refused(begin(sb, users["admin"], inst, budget=str(spent)), "paused")


# ── agent_record and deletion ───────────────────────────────────────────────────────────────────────────


def test_record_writes_one_row_of_numbers(sb, users, inst):
    grant(sb, inst)
    question = ok(begin(sb, users["editor"], inst))["question_id"]
    ok(record(sb, question))
    ok(record(sb, question, cost="0.2", kind="compact"))
    rows = sb.rows("agent_usage", sb.service(), question_id=f"eq.{question}", order="id")
    assert [(r["kind"], r["cost_cents"]) for r in rows] == [("turn", 1.2345), ("compact", 0.2)]
    row = rows[0]
    assert (row["institute_id"], row["user_id"], row["model"]) == (inst, users["editor"].id, "claude-opus-5-5")
    assert (row["input_tokens"], row["output_tokens"], row["cache_read_tokens"], row["cache_write_tokens"]) == (
        1200, 300, 9000, 0,
    )
    assert near(when(row["at"]), now())


def test_record_refuses_an_unknown_question_or_bad_numbers(sb, users, inst):
    refused(record(sb, str(uuid.uuid4())), status=400)
    grant(sb, inst)
    question = ok(begin(sb, users["admin"], inst))["question_id"]
    refused(record(sb, question, cost="-1"), status=400)
    refused(record(sb, question, kind="chat"), status=400)
    assert sb.rows("agent_usage", sb.service(), question_id=f"eq.{question}") == []


def test_deleting_the_institute_takes_its_assistant_rows(sb, users, inst):
    code = coupon(sb)
    ok(redeem(sb, users["admin"], inst, code))
    question = ok(begin(sb, users["admin"], inst))["question_id"]
    ok(record(sb, question))

    ok(sb.delete("institutes", sb.service(), id=f"eq.{inst}"))
    assert access_of(sb, inst) is None
    assert sb.rows("agent_questions", sb.service(), institute_id=f"eq.{inst}") == []
    assert sb.rows("agent_usage", sb.service(), institute_id=f"eq.{inst}") == []
    [stored] = sb.rows("agent_coupons", sb.service(), code_hash=f"eq.{code_hash(code)}")
    assert stored["institute_id"] is None
    assert stored["redeemed_at"] is not None


def test_deleting_a_user_keeps_their_usage_without_them(sb, users, inst, make_user):
    leaver = make_user("leaver")
    row = {"institute_id": inst, "user_id": leaver.id, "role": "editor"}
    assert sb.insert("memberships", sb.service(), row).status_code == 201
    grant(sb, inst)
    question = ok(begin(sb, leaver, inst))["question_id"]
    ok(record(sb, question))
    assert sb.insert("agent_redeem_failures", sb.service(), {"user_id": leaver.id}).status_code == 201

    sb.delete_user(leaver.id)
    [row] = sb.rows("agent_usage", sb.service(), question_id=f"eq.{question}")
    assert row["user_id"] is None
    assert row["institute_id"] == inst
    [q] = sb.rows("agent_questions", sb.service(), id=f"eq.{question}")
    assert q["user_id"] is None
    assert sb.rows("agent_redeem_failures", sb.service(), user_id=f"eq.{leaver.id}") == []
