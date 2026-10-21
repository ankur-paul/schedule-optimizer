from fastapi.testclient import TestClient

from main import app


def test_health():
    res = TestClient(app).get("/health")
    assert res.status_code == 200
    assert res.json() == {"ok": True}
