import json
import logging
import re

from fastapi.testclient import TestClient

from main import MAX_SOLVE_BYTES, app
from tests.helpers import course, tiny
from tests.test_sessions import FIXTURES

client = TestClient(app)


def test_solve_sample_returns_camelcase_result():
    body = json.loads((FIXTURES / "sample-college.json").read_text())
    body["options"]["timeLimitSec"] = 20  # 5 s ran out under load and on 4-vCPU CI runners (T48)
    res = client.post("/solve", json=body)
    assert res.status_code == 200
    data = res.json()
    assert data["engine"] == "cpsat"
    assert data["status"] in ("optimal", "feasible")
    assert len(data["placements"]) == 210
    assert set(data["placements"][0]) == {"sessionId", "day", "period", "roomId"}
    assert set(data["score"]["breakdown"]) == {"subjectRepeat", "teacherOverload", "sectionGaps", "batchIdle", "lateFinish"}
    assert "timeMs" in data


def test_solve_infeasible_is_200():
    body = tiny(periods="T", courses=[course("c1", lectures=2)]).model_dump()
    res = client.post("/solve", json=body)
    assert res.status_code == 200
    assert res.json()["status"] == "infeasible"


def test_infeasible_response_has_camelcase_diagnosis():
    lock = {"sessionId": "c1:L1", "day": 0, "period": 0, "roomId": "nowhere"}
    body = tiny(rooms=[], courses=[course("c1", lectures=1), course("c2", lectures=1)], locks=[lock]).model_dump()
    data = client.post("/solve", json=body).json()
    assert data["status"] == "infeasible"
    assert data["diagnosis"] == [
        {"kind": "noSlot", "ids": ["c1:L1", "c2:L1"], "detail": "noRoom"},
        {"kind": "badLock", "ids": ["c1:L1"]},  # no detail key: None fields are dropped
    ]


def test_infeasible_with_no_cause_found_sends_an_empty_diagnosis():
    body = tiny(periods="T", courses=[course("c1", lectures=2)]).model_dump()
    data = client.post("/solve", json=body).json()
    assert data["status"] == "infeasible" and data["diagnosis"] == []


def test_solve_rejects_malformed_body():
    assert client.post("/solve", json={"settings": {}}).status_code == 422


def test_cors_allows_dev_frontend():
    res = client.options(
        "/solve",
        headers={"Origin": "http://localhost:5173", "Access-Control-Request-Method": "POST"},
    )
    assert res.headers.get("access-control-allow-origin") == "http://localhost:5173"


def test_cors_allows_other_local_ports_only():
    def allowed(origin: str):
        res = client.options("/solve", headers={"Origin": origin, "Access-Control-Request-Method": "POST"})
        return res.headers.get("access-control-allow-origin") == origin

    assert allowed("http://localhost:5174")
    assert allowed("http://127.0.0.1:5173")
    assert not allowed("http://evil.example")
    assert not allowed("http://localhost.evil.example")


def test_solve_omits_unset_optional_fields():
    body = tiny(periods="T", courses=[course("c1", lectures=1)]).model_dump()
    data = client.post("/solve", json=body).json()
    assert data["status"] in ("optimal", "feasible")
    assert "diagnosis" not in data and "message" not in data


# ── Caps ────────────────────────────────────────────────────────────────────────────────────────────────


def padded_body(size: int) -> bytes:
    """A valid, quickly infeasible SolveInput padded with JSON whitespace to exactly `size` bytes."""
    body = tiny(periods="T", courses=[course("c1", lectures=2)]).model_dump_json().encode()
    return body + b" " * (size - len(body))


def test_sample_college_is_far_below_the_body_cap():
    assert len((FIXTURES / "sample-college.json").read_bytes()) < MAX_SOLVE_BYTES // 50  # ~22 KB vs 2 MB


def test_solve_body_just_under_the_cap_is_solved():
    res = client.post("/solve", content=padded_body(MAX_SOLVE_BYTES), headers={"Content-Type": "application/json"})
    assert res.status_code == 200
    assert res.json()["status"] == "infeasible"


def test_solve_body_over_the_cap_is_413():
    res = client.post("/solve", content=padded_body(MAX_SOLVE_BYTES + 1), headers={"Content-Type": "application/json"})
    assert res.status_code == 413
    assert res.json() == {"reason": "too_large"}


def test_solve_body_over_the_cap_without_content_length_is_413():
    body = padded_body(MAX_SOLVE_BYTES + 1)
    chunks = (body[i : i + 65536] for i in range(0, len(body), 65536))  # streamed: no Content-Length
    res = client.post("/solve", content=chunks, headers={"Content-Type": "application/json"})
    assert res.status_code == 413
    assert res.json() == {"reason": "too_large"}


def test_solve_time_limit_over_120_is_422():
    body = tiny().model_dump()
    body["options"]["timeLimitSec"] = 121
    res = client.post("/solve", json=body)
    assert res.status_code == 422
    assert res.json()["detail"][0]["loc"] == ["options", "timeLimitSec"]


def test_solve_invalid_json_is_422():
    assert client.post("/solve", content=b"{not json", headers={"Content-Type": "application/json"}).status_code == 422


def test_solve_422_does_not_echo_the_input():
    res = client.post("/solve", json={"settings": {"days": "SECRET-NAME"}})
    assert res.status_code == 422
    assert "SECRET-NAME" not in res.text


# ── Request logs ────────────────────────────────────────────────────────────────────────────────────────


def test_a_request_logs_one_line_without_its_body(capsys):
    body = tiny(periods="T", courses=[course("c1", lectures=2)]).model_dump()
    body["teachers"][0]["name"] = "SECRET-TEACHER"
    capsys.readouterr()
    client.post("/solve?probe=SECRET-QUERY", json=body, headers={"X-Note": "SECRET-HEADER"})
    lines = capsys.readouterr().out.splitlines()
    assert len(lines) == 1
    assert re.fullmatch(r"POST /solve 200 \d+ms", lines[0])
    assert "SECRET" not in lines[0] and "testclient" not in lines[0]


def test_a_refused_request_logs_its_status(capsys):
    capsys.readouterr()
    client.post("/solve", json={"settings": {}})
    client.get("/health")
    lines = capsys.readouterr().out.splitlines()
    assert [line.rsplit(" ", 1)[0] for line in lines] == ["POST /solve 422", "GET /health 200"]


def test_uvicorn_access_log_is_off():
    assert logging.getLogger("uvicorn.access").disabled


def test_solve_accepts_partial_soft_rules_and_sends_off_rules_as_null():
    body = tiny(periods="T", courses=[course("c1", lectures=1)]).model_dump()
    body["softRules"] = {"s1": False}
    data = client.post("/solve", json=body).json()
    assert data["score"]["breakdown"] == {
        "subjectRepeat": None, "teacherOverload": 0, "sectionGaps": 0, "batchIdle": 0, "lateFinish": None}
    del body["softRules"]
    assert client.post("/solve", json=body).json()["score"]["breakdown"]["subjectRepeat"] == 0
