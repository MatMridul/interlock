"""Judge access code, small model caps, per-turn limit, history trimming, shared counters.
No Bedrock: the model is the canned StubModel. The code below is a test value, not a real one."""
import json

import pytest
from fastapi.testclient import TestClient

from bank.gate import Gate
from agent.factory import build_agent
from server import config, judge, modelcap
from server.app import create_app
from server.limits import Limiter
from server.stub_model import StubModel
from test_store import store  # noqa: F401  (fixture: memory and DynamoDB-on-moto)

JC = "judge-test-code-1"
H = {"X-Judge-Code": JC}


def relaxed():
    return Limiter(rate_session=(10**6, 60), rate_chat=(10**6, 60), rate_mfa=(10**6, 60), client_max_wrong=10**6)


@pytest.fixture(autouse=True)
def _env(monkeypatch):
    monkeypatch.setenv("STUB", "1")
    monkeypatch.setenv("INTERLOCK_MODEL", "bedrock")
    monkeypatch.setenv("INTERLOCK_TRUST_PROXY", "lambda")
    monkeypatch.setenv("JUDGE_ACCESS_CODE", JC)
    monkeypatch.setenv("INTERLOCK_PUBLIC_DAILY_MODEL_CAP", "0")  # these tests cover the code-only lock; test_public_access.py covers the public pool


def ip(addr):
    return {"x-amzn-request-context": json.dumps({"http": {"sourceIp": addr}})}


def app(store=None, **kw):
    return TestClient(create_app(limiter=relaxed(), store=store, **kw))


def chat(c, sid, headers=H, msg="hello"):
    return c.post(f"/session/{sid}/chat", json={"message": msg}, headers=headers)


def new(c, headers=None):
    return c.post("/session", headers=headers).json()["session_id"]


# ---- unlock flow ---------------------------------------------------------------------------

def test_missing_env_fails_closed(monkeypatch):
    monkeypatch.delenv("JUDGE_ACCESS_CODE")
    c = app()
    sid = new(c)
    assert chat(c, sid).status_code == 403
    assert c.post("/judge/unlock", headers=H).status_code == 403
    assert c.post("/race/live", json={"attack_id": "pre-01"}, headers=H).status_code == 403


def test_empty_env_fails_closed(monkeypatch):
    monkeypatch.setenv("JUDGE_ACCESS_CODE", "")
    c = app()
    assert c.post("/judge/unlock", headers={"X-Judge-Code": ""}).status_code == 403


def test_locked_without_a_code_and_open_features_need_none():
    c = app()
    sid = new(c)
    assert chat(c, sid, headers={}).status_code == 403
    assert c.post(f"/session/{sid}/propose", json={"actions": [{"tool": "authenticate_user"}]}).status_code == 200
    assert c.get("/race/replay").status_code == 200
    assert c.get("/config").json()["judge_code"] is True


def test_right_code_unlocks_and_is_never_echoed():
    c = app()
    sid = new(c)
    r = c.post("/judge/unlock", headers=H)
    assert r.status_code == 200 and JC not in r.text
    r = chat(c, sid)
    assert r.status_code == 200 and JC not in r.text
    w = c.post("/judge/unlock", headers={"X-Judge-Code": "wrong-code"})
    assert w.status_code == 403 and JC not in w.text and "wrong-code" not in w.text


def test_wrong_codes_lock_out_that_ip_only():
    c = app()
    for _ in range(judge.MAX_WRONG):
        assert c.post("/judge/unlock", headers={**ip("203.0.113.5"), "X-Judge-Code": "nope"}).status_code == 403
    r = c.post("/judge/unlock", headers={**ip("203.0.113.5"), **H})  # right code, but the address is locked
    assert r.status_code == 429 and int(r.headers["Retry-After"]) > 0 and JC not in r.text
    assert c.post("/judge/unlock", headers={**ip("203.0.113.6"), **H}).status_code == 200


def test_lockout_ends_with_the_window():
    now = [1_000_000.0]
    st = pytest.importorskip("server.store").MemoryStore()
    j = judge.Judge(st, now=lambda: now[0])
    for _ in range(judge.MAX_WRONG):
        with pytest.raises(judge.Denied):
            j.check("nope", "1.1.1.1")
    with pytest.raises(judge.Denied) as e:
        j.check(JC, "1.1.1.1")
    assert e.value.status == 429
    now[0] += judge.WINDOW_S
    j.check(JC, "1.1.1.1")


def test_wrong_code_counts_are_shared_across_instances(store):  # noqa: F811
    a, b = app(store), app(store)
    for _ in range(judge.MAX_WRONG):
        a.post("/judge/unlock", headers={**ip("203.0.113.7"), "X-Judge-Code": "nope"})
    assert b.post("/judge/unlock", headers={**ip("203.0.113.7"), **H}).status_code == 429


def test_wrong_mfa_codes_per_address_are_shared_across_instances(store):  # noqa: F811
    a, b = app(store), app(store)
    for _ in range(config.MFA_CLIENT_MAX_WRONG):
        sid = new(a)
        a.post(f"/session/{sid}/mfa", json={"code": "000000"}, headers=ip("203.0.113.8"))
    sid = new(b)
    r = b.post(f"/session/{sid}/mfa", json={"code": config.demo_mfa_code()}, headers=ip("203.0.113.8"))
    assert r.status_code == 429


# ---- caps and their messages ---------------------------------------------------------------

def test_defaults_are_judge_sized(monkeypatch):
    for n in ("INTERLOCK_DAILY_MODEL_CAP", "INTERLOCK_MONTHLY_MODEL_CAP", "INTERLOCK_IP_DAILY_MODEL_CAP",
              "INTERLOCK_SESSION_MODEL_CAP", "INTERLOCK_TURN_MODEL_CALLS", "RACE_IP_DAILY_RUNS", "INTERLOCK_HISTORY_MESSAGES"):
        monkeypatch.delenv(n, raising=False)
    cap = modelcap.ModelCap(pytest.importorskip("server.store").MemoryStore())
    assert (cap.limit, cap.monthly, cap.per_ip, cap.per_session, cap.per_turn) == (100, 1500, 40, 25, 4)
    assert modelcap.race_runs_cap() == 5 and config.history_messages() == 8 and config.MAX_MESSAGE_CHARS == 2000


@pytest.mark.parametrize("env,words", [
    ("INTERLOCK_DAILY_MODEL_CAP", ("daily limit", "00:00 UTC")),
    ("INTERLOCK_MONTHLY_MODEL_CAP", ("monthly limit", "1st")),
    ("INTERLOCK_IP_DAILY_MODEL_CAP", ("Your address", "00:00 UTC")),
    ("INTERLOCK_SESSION_MODEL_CAP", ("This session", "Reset the session")),
])
def test_each_cap_refuses_with_its_own_message(monkeypatch, env, words):
    monkeypatch.setenv(env, "2")  # the canned model makes 2 calls per turn
    c = app()
    sid = new(c)
    assert chat(c, sid).status_code == 200
    r = chat(c, sid)
    assert r.status_code == 429
    d = r.json()["detail"]
    assert all(w in d for w in words) and "you" in d


def test_cap_reached_inside_a_turn_is_a_clean_error_event(monkeypatch):
    monkeypatch.setenv("INTERLOCK_DAILY_MODEL_CAP", "1")
    c = app()
    sid = new(c)
    body = chat(c, sid).text
    assert "event: error" in body and "daily limit" in body and "event: done" in body


def test_turn_limit_stops_the_turn_cleanly(monkeypatch):
    monkeypatch.setenv("INTERLOCK_TURN_MODEL_CALLS", "1")
    c = app()
    sid = new(c)
    body = chat(c, sid).text
    assert "at most 1 model calls" in body and "event: done" in body
    assert chat(c, sid).status_code == 200  # the next message starts a fresh turn


def test_caps_hold_across_instances(store, monkeypatch):  # noqa: F811
    monkeypatch.setenv("INTERLOCK_DAILY_MODEL_CAP", "2")
    a, b = app(store), app(store)
    sa, sb = new(a), new(b)
    assert chat(a, sa).status_code == 200  # uses both calls
    assert chat(b, sb).status_code == 429 and "daily limit" in chat(b, sb).json()["detail"]


def test_month_counter_is_separate_and_survives_the_day(store):  # noqa: F811
    day = [1_700_000_000.0]
    cap = modelcap.ModelCap(store, limit=2, monthly=3, per_ip=10, per_session=10, now=lambda: day[0])
    cap.take("1.1.1.1", "s1")
    cap.take("1.1.1.1", "s1")
    with pytest.raises(modelcap.CapReached) as e:
        cap.take("1.1.1.1", "s1")
    assert e.value.kind == "day"
    day[0] += 86400  # next UTC day: the day counter resets, the month counter does not
    cap.take("1.1.1.1", "s1")
    day[0] += 86400
    with pytest.raises(modelcap.CapReached) as e:
        cap.take("1.1.1.1", "s1")
    assert e.value.kind == "month" and "monthly" in str(e.value)


def test_race_live_runs_are_limited_per_address(monkeypatch):
    monkeypatch.setenv("RACE_IP_DAILY_RUNS", "1")
    c = app()
    assert c.post("/race/live", json={"attack_id": "pre-01"}, headers={**ip("203.0.113.9"), **H}).status_code == 200
    r = c.post("/race/live", json={"attack_id": "pre-01"}, headers={**ip("203.0.113.9"), **H})
    assert r.status_code == 429 and "Live race limit" in r.json()["detail"] and "00:00 UTC" in r.json()["detail"]
    assert c.post("/race/live", json={"attack_id": "pre-01"}, headers={**ip("203.0.113.10"), **H}).status_code == 200


# ---- history ---------------------------------------------------------------------------------

def test_history_sent_to_the_model_is_trimmed_to_8():
    agent = build_agent(Gate(), StubModel(), history=8)
    for i in range(7):
        agent(f"message {i}")
        assert len(agent.messages) <= 8
    assert len(agent.messages) > 0
    assert config.history_messages() == 8
