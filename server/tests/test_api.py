import json

from fastapi.testclient import TestClient

from main import app
from tests.helpers import course, tiny
from tests.test_sessions import FIXTURES

client = TestClient(app)


def test_solve_sample_returns_camelcase_result():
    body = json.loads((FIXTURES / "sample-college.json").read_text())
    body["options"]["timeLimitSec"] = 5
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


def test_solve_accepts_partial_soft_rules_and_sends_off_rules_as_null():
    body = tiny(periods="T", courses=[course("c1", lectures=1)]).model_dump()
    body["softRules"] = {"s1": False}
    data = client.post("/solve", json=body).json()
    assert data["score"]["breakdown"] == {
        "subjectRepeat": None, "teacherOverload": 0, "sectionGaps": 0, "batchIdle": 0, "lateFinish": 0}
    del body["softRules"]
    assert client.post("/solve", json=body).json()["score"]["breakdown"]["subjectRepeat"] == 0
