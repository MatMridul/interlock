"""Public access to the live model: no code = allowed but counted in the public daily pool;
a valid judge code skips that pool; a wrong code is refused. No Bedrock: the model is the canned StubModel."""
import json
import threading

import pytest
from fastapi.testclient import TestClient

from server import modelcap
from server.app import create_app
from server.limits import Limiter
from server.store import MemoryStore, daily_key

JC = "judge-test-code-1"
H = {"X-Judge-Code": JC}


@pytest.fixture(autouse=True)
def _env(monkeypatch):
    monkeypatch.setenv("STUB", "1")
    monkeypatch.setenv("INTERLOCK_MODEL", "bedrock")
    monkeypatch.setenv("INTERLOCK_TRUST_PROXY", "lambda")
    monkeypatch.setenv("JUDGE_ACCESS_CODE", JC)
    monkeypatch.delenv("INTERLOCK_PUBLIC_DAILY_MODEL_CAP", raising=False)


def relaxed():
    return Limiter(rate_session=(10**6, 60), rate_chat=(10**6, 60), rate_mfa=(10**6, 60), client_max_wrong=10**6)


def ip(addr):
    return {"x-amzn-request-context": json.dumps({"http": {"sourceIp": addr}})}


def make(store=None):
    store = store or MemoryStore()
    return TestClient(create_app(limiter=relaxed(), store=store)), store


def chat(c, sid, headers, msg="hello"):
    return c.post(f"/session/{sid}/chat", json={"message": msg}, headers=headers)


def new(c):
    return c.post("/session").json()["session_id"]


def pub_used(store):
    return store.count(f"cappub#{daily_key()}")


def test_default_public_cap_is_60():
    assert modelcap.public_cap() == 60


def test_no_code_is_allowed_and_counts_the_public_pool():
    c, store = make()
    r = chat(c, new(c), ip("1.1.1.1"))
    assert r.status_code == 200
    assert "event: error" not in r.text
    assert pub_used(store) >= 1


def test_valid_code_skips_the_public_pool_but_counts_the_rest():
    c, store = make()
    assert chat(c, new(c), {**H, **ip("2.2.2.2")}).status_code == 200
    assert pub_used(store) == 0
    assert store.count(daily_key()) >= 1


def test_public_pool_full_refuses_public_but_not_a_judge(monkeypatch):
    monkeypatch.setenv("INTERLOCK_PUBLIC_DAILY_MODEL_CAP", "1")
    c, store = make()
    assert chat(c, new(c), ip("3.3.3.3")).status_code == 200  # uses the one public call (the stub turn makes more; the pool is now full)
    r = chat(c, new(c), ip("4.4.4.4"))
    assert r.status_code == 429
    d = r.json()["detail"]
    assert "00:00 UTC" in d and "Judges" in d and JC not in d
    assert chat(c, new(c), {**H, **ip("5.5.5.5")}).status_code == 200  # the reserved share still works


def test_wrong_code_is_403_and_counts_toward_the_lockout():
    c, store = make()
    sid = new(c)
    bad = {"X-Judge-Code": "nope", **ip("6.6.6.6")}
    for _ in range(5):
        assert chat(c, sid, bad).status_code == 403
    assert chat(c, sid, bad).status_code == 429  # locked out; never silently public
    assert chat(c, sid, {**H, **ip("6.6.6.6")}).status_code == 429  # even the right code, during the lockout
    assert chat(c, sid, ip("6.6.6.6")).status_code == 200  # no code: public, the lockout is about codes
    assert pub_used(store) >= 1


def test_public_cap_zero_is_the_old_locked_behaviour(monkeypatch):
    monkeypatch.setenv("INTERLOCK_PUBLIC_DAILY_MODEL_CAP", "0")
    c, store = make()
    sid = new(c)
    assert chat(c, sid, ip("7.7.7.7")).status_code == 403
    assert chat(c, sid, {**H, **ip("7.7.7.7")}).status_code == 200
    assert "public_model" not in c.get("/config").json()
    assert pub_used(store) == 0


def test_config_tells_the_ui_the_public_model_is_open():
    c, _ = make()
    cfg = c.get("/config").json()
    assert cfg["public_model"] is True and cfg["judge_code"] is True


def test_unlock_endpoint_still_needs_a_code():
    c, _ = make()
    assert c.post("/judge/unlock").status_code == 403
    assert c.post("/judge/unlock", headers=H).status_code == 200


def test_race_live_public_uses_the_pool(monkeypatch):
    monkeypatch.setenv("INTERLOCK_PUBLIC_DAILY_MODEL_CAP", "3")  # below the 6 calls a race needs to start
    c, store = make()
    r = c.post("/race/live", json={"attack_id": "pre-01"}, headers=ip("8.8.8.8"))
    assert r.status_code == 429 and "budget" in r.json()["detail"]


def test_public_pool_cannot_overshoot_under_concurrency():
    store = MemoryStore()
    cap = modelcap.ModelCap(store, limit=1000, monthly=1000, per_ip=1000, per_session=1000, public=10)
    ok = []

    def go():
        try:
            cap.take(ip="9.9.9.9", sid=None, public=True)
            ok.append(1)
        except modelcap.CapReached as e:
            assert e.kind == "public"

    ts = [threading.Thread(target=go) for _ in range(40)]
    [t.start() for t in ts]
    [t.join() for t in ts]
    assert len(ok) == 10 and pub_used(store) == 10


def test_judge_calls_do_not_touch_a_full_public_pool():
    store = MemoryStore()
    cap = modelcap.ModelCap(store, limit=1000, monthly=1000, per_ip=1000, per_session=1000, public=1)
    cap.take(ip="a", public=True)
    with pytest.raises(modelcap.CapReached):
        cap.take(ip="b", public=True)
    cap.take(ip="b", public=False)
    assert cap.remaining(public=True) == 0 and cap.remaining() > 0
