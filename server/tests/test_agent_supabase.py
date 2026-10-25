"""POST /agent (T38) against the Supabase dev project's T36 functions, with the fake Claude client from test_agent.

Skips without server/.env, like test_rls_agent.py, whose throwaway users and institutes it reuses (and deletes).
"""

import secrets
from decimal import Decimal

import httpx
import pytest
from fastapi.testclient import TestClient

import agent
from main import app, get_agent
from tests.supabase_api import Supabase, load_config
from tests.test_agent import USER_TEXT, FakeClaude, reply
from tests.test_rls_agent import Users, access_of, grant, new_institute

CONFIG = load_config()

pytestmark = [
    pytest.mark.supabase,
    pytest.mark.skipif(CONFIG is None, reason="SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set (server/.env)"),
]


@pytest.fixture
def sb():
    client = Supabase(CONFIG)
    yield client
    client.http.close()


@pytest.fixture
def member(sb):
    version = max(p["version"] for p in sb.rows("policy_versions", sb.anon()))
    users = Users(sb, version)
    try:
        user = users.make(f"t38-{secrets.token_hex(2)}")
        yield user, new_institute(sb, user)
    finally:
        users.delete_all()


def test_full_turn_records_usage_and_uses_one_question(sb, member):
    user, inst = member
    grant(sb, inst, questions=3)
    claude = FakeClaude(reply())
    backend = agent.SupabaseBackend(CONFIG, httpx.Client(timeout=30))
    app.dependency_overrides[get_agent] = lambda: agent.Agent(
        claude, backend, agent.HELP_DIR, agent.load_tools(), Decimal(10**9)
    )
    try:
        client = TestClient(app)
        headers = {"Authorization": f"Bearer {user.token}"}
        body = {"institute_id": inst, "question_id": None, "kind": "turn", "messages": [USER_TEXT]}
        res = client.post("/agent", json=body, headers=headers)
        assert res.status_code == 200, res.text
        data = res.json()
        assert data["questions_left"] == 2
        assert access_of(sb, inst)["questions_left"] == 2

        rows = sb.rows("agent_usage", sb.service(), question_id=f"eq.{data['question_id']}")
        assert len(rows) == 1
        row = rows[0]
        assert (row["user_id"], row["institute_id"], row["kind"], row["model"]) == (
            user.id, inst, "turn", "claude-opus-5-5"
        )
        assert (row["input_tokens"], row["output_tokens"], row["cache_read_tokens"], row["cache_write_tokens"]) == (
            1000, 200, 12000, 500
        )
        assert Decimal(str(row["cost_cents"])) == Decimal("1.29")

        # The next turn continues the question: no new question is used.
        body["question_id"] = data["question_id"]
        res = client.post("/agent", json=body, headers=headers)
        assert res.status_code == 200, res.text
        assert access_of(sb, inst)["questions_left"] == 2
        assert len(sb.rows("agent_usage", sb.service(), question_id=f"eq.{data['question_id']}")) == 2

        # A token Supabase Auth doesn't accept.
        res = client.post("/agent", json={**body, "question_id": None}, headers={"Authorization": "Bearer nope"})
        assert res.status_code == 401
    finally:
        app.dependency_overrides.clear()
        backend.http.close()


def test_outsider_gets_not_member(sb, member):
    _, inst = member
    version = max(p["version"] for p in sb.rows("policy_versions", sb.anon()))
    users = Users(sb, version)
    try:
        outsider = users.make("t38-outsider")
        grant(sb, inst)
        backend = agent.SupabaseBackend(CONFIG, httpx.Client(timeout=30))
        app.dependency_overrides[get_agent] = lambda: agent.Agent(
            FakeClaude(), backend, agent.HELP_DIR, agent.load_tools(), Decimal(10**9)
        )
        res = TestClient(app).post(
            "/agent",
            json={"institute_id": inst, "question_id": None, "kind": "turn", "messages": [USER_TEXT]},
            headers={"Authorization": f"Bearer {outsider.token}"},
        )
        assert res.status_code == 403
        assert res.json() == {"reason": "not_member"}
    finally:
        app.dependency_overrides.clear()
        users.delete_all()
