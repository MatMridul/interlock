"""Security headers on every kind of response. No Bedrock."""
import pytest
from fastapi.testclient import TestClient

from server import app as appmod
from server.app import create_app
from server.headers import HEADERS

NEEDED = ("content-security-policy", "x-content-type-options", "referrer-policy", "strict-transport-security",
          "permissions-policy", "cross-origin-opener-policy")


@pytest.fixture
def client(monkeypatch):
    monkeypatch.setenv("STUB", "1")
    monkeypatch.setenv("INTERLOCK_MODEL", "bedrock")
    return TestClient(create_app(), raise_server_exceptions=False)


def has_all(r):
    for h in NEEDED:
        assert h in r.headers, (h, r.status_code)
    assert r.headers["x-content-type-options"] == "nosniff"
    assert r.headers["referrer-policy"] == "no-referrer"
    assert "frame-ancestors 'none'" in r.headers["content-security-policy"]


def test_csp_is_strict():
    csp = HEADERS["content-security-policy"]
    for part in ("default-src 'self'", "script-src 'self'", "connect-src 'self'", "img-src 'self' data:",
                 "frame-ancestors 'none'", "base-uri 'none'", "form-action 'self'"):
        assert part in csp
    assert "unsafe-eval" not in csp and "script-src 'self' 'unsafe-inline'" not in csp


def test_api_success_error_404_and_422_carry_the_headers(client):
    has_all(client.get("/policy"))
    has_all(client.get("/session/nope/state"))  # 404
    has_all(client.post("/session/x/chat", json={}))  # 422
    has_all(client.get("/no-such-route"))
    has_all(client.options("/policy", headers={"Origin": "http://evil.example", "Access-Control-Request-Method": "GET"}))


def test_a_500_carries_the_headers_and_leaks_nothing(client, monkeypatch, tmp_path):
    monkeypatch.setattr(appmod, "POLICY_PATH", tmp_path / "missing.json")
    r = client.get("/policy")
    assert r.status_code == 500 and r.json() == {"detail": "internal error"}
    assert "missing.json" not in r.text and "Traceback" not in r.text
    has_all(r)


def test_streaming_response_carries_the_headers(client):
    sid = client.post("/session").json()["session_id"]
    r = client.post(f"/session/{sid}/propose", json={"actions": [{"tool": "authenticate_user"}]})
    assert r.status_code == 200 and "text/event-stream" in r.headers["content-type"]
    has_all(r)
