import json

from fastapi.testclient import TestClient

from main import CONTRACT_FILE, app


def test_health_returns_the_contract_version():
    res = TestClient(app).get("/health")
    assert res.status_code == 200
    assert res.json() == {"ok": True, "contract": json.loads(CONTRACT_FILE.read_text())["version"]}
