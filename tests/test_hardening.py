"""Edge cases from the security review: body size, read rate limit, AWS throttling, friendly model errors,
lock release when the client never reads the stream, kill switch mid-turn. No Bedrock."""
import threading
import time

import pytest
from fastapi.testclient import TestClient

from server import app as appmod, modelcap
from server.app import create_app
from server.limits import Limiter
from server.session import Session, _friendly, stream_events
from server.store import MemoryStore


@pytest.fixture(autouse=True)
def _env(monkeypatch):
    monkeypatch.setenv("STUB", "1")
    monkeypatch.setenv("INTERLOCK_MODEL", "bedrock")
    monkeypatch.setenv("JUDGE_ACCESS_CODE", "j")


def client(**kw):
    return TestClient(create_app(**kw), raise_server_exceptions=False)


def test_oversized_body_is_413_by_content_length():
    c = client()
    sid = c.post("/session").json()["session_id"]
    r = c.post(f"/session/{sid}/chat", content=b"x" * 20000, headers={"content-type": "application/json"})
    assert r.status_code == 413 and "content-security-policy" in r.headers


def test_chat_message_over_2000_chars_is_422_and_unicode_is_counted_as_characters():
    c = client()
    sid = c.post("/session").json()["session_id"]
    h = {"X-Judge-Code": "j"}
    assert c.post(f"/session/{sid}/chat", json={"message": "a" * 2001}, headers=h).status_code == 422
    assert c.post(f"/session/{sid}/chat", json={"message": "\u200b" * 2001}, headers=h).status_code == 422
    assert c.post(f"/session/{sid}/chat", json={"message": ""}, headers=h).status_code == 422


def test_bad_fields_are_422_or_404_never_500():
    c = client()
    sid = c.post("/session").json()["session_id"]
    assert c.post(f"/session/{sid}/mfa", json={"code": "9" * 65}).status_code == 422
    assert c.post(f"/session/{sid}/propose", json={"actions": [{"tool": "rm_rf"}]}).status_code == 422
    assert c.post(f"/session/{sid}/propose", json={"actions": [{"tool": "execute_transfer", "amount": "NaN"}]}).status_code in (200, 422)
    assert c.get("/policies/..%2f..%2fetc").status_code == 404
    assert c.get("/policies/nope").status_code == 404
    assert c.get("/session/" + "a" * 5000 + "/state").status_code == 404
    assert c.post("/race/live", json={"attack_id": "x" * 33}, headers={"X-Judge-Code": "j"}).status_code == 422
    assert c.get("/session/%00/state").status_code == 404


def test_read_rate_limit_on_cheap_gets():
    c = client(limiter=Limiter(rate_read=(3, 60)))
    codes = [c.get("/session/abc/state").status_code for _ in range(5)]
    assert codes[:3] == [404] * 3 and codes[3:] == [429, 429]
    assert c.get("/policies/finance").status_code == 429  # same per-address budget
    r = c.get("/race/replay")
    assert r.status_code == 429 and "retry-after" in r.headers


def test_unlock_is_rate_limited():
    c = client(limiter=Limiter(rate_chat=(2, 60)))
    codes = [c.post("/judge/unlock", headers={"X-Judge-Code": "bad"}).status_code for _ in range(3)]
    assert codes == [403, 403, 429]


def test_dynamodb_throttling_is_503_with_retry_after(monkeypatch):
    class Throttled(Exception):
        response = {"Error": {"Code": "ProvisionedThroughputExceededException"}}

    class Boom(MemoryStore):
        def get(self, pk):
            raise Throttled()

    c = client(store=Boom())
    r = c.get("/session/abc/state")
    assert r.status_code == 503 and r.headers["retry-after"] == "5" and "Provisioned" not in r.text


def test_other_errors_are_a_plain_500(monkeypatch):
    class Boom(MemoryStore):
        def get(self, pk):
            raise RuntimeError("secret internal detail")

    r = client(store=Boom()).get("/session/abc/state")
    assert r.status_code == 500 and r.json() == {"detail": "internal error"} and "secret" not in r.text


def test_friendly_model_errors():
    class ThrottlingException(Exception):
        pass

    class AccessDeniedException(Exception):
        pass

    class ReadTimeoutError(Exception):
        pass

    def wrapped(inner):
        try:
            try:
                raise inner
            except Exception as e:
                raise RuntimeError("agent loop") from e
        except RuntimeError as outer:
            return outer

    assert "busy" in _friendly(wrapped(ThrottlingException("rate")))
    assert "not available" in _friendly(wrapped(AccessDeniedException("arn:aws:secret")))
    assert "too long" in _friendly(wrapped(ReadTimeoutError("t")))
    assert "arn" not in _friendly(wrapped(AccessDeniedException("arn:aws:secret")))
    assert _friendly(ValueError("x")) is None


def test_lock_is_released_even_if_the_stream_is_never_read():
    s = Session("sid", None)
    s.agent = lambda msg: "ok"  # stands in for the agent
    assert s.lock.acquire(blocking=False)
    stream_events(s, "hi")  # returned, never iterated: a client that disconnected before reading
    for _ in range(100):
        if s.lock.acquire(blocking=False):
            break
        time.sleep(0.05)
    else:
        pytest.fail("session lock was never released")


def test_concurrent_chat_on_one_session_gives_409():
    c = client()
    sid = c.post("/session").json()["session_id"]
    s = c.app.state.registry.get(sid)
    assert s.lock.acquire(blocking=False)  # a turn is "running"
    r = c.post(f"/session/{sid}/chat", json={"message": "hi"}, headers={"X-Judge-Code": "j"})
    assert r.status_code == 409
    s.lock.release()


def test_kill_switch_thrown_mid_turn_stops_the_next_model_call(monkeypatch):
    store = MemoryStore()
    cap = modelcap.ModelCap(store, limit=100, monthly=100, per_ip=100, per_session=100, public=100)

    class Sess:
        id, client, public, turn_calls = "s", "ip", False, 0

        class agent:
            hooks = []

            @classmethod
            def add_hook(cls, fn, ev):
                cls.hooks.append(fn)

    cap.attach(Sess)
    hook = Sess.agent.hooks[0]
    hook(None)  # first call is fine
    monkeypatch.setenv("INTERLOCK_MODEL", "off")
    with pytest.raises(modelcap.CapReached):
        hook(None)


def test_stub_cannot_run_in_production(monkeypatch):
    monkeypatch.setenv("INTERLOCK_ENV", "production")
    monkeypatch.setenv("DEMO_MFA_CODE", "123456")
    monkeypatch.setenv("STUB", "1")
    with pytest.raises(RuntimeError, match="STUB"):
        create_app()
