"""C1 'You are the agent': POST /session/{sid}/propose goes through the real gate, with no model."""
import json

from fastapi.testclient import TestClient

from server.app import create_app
from server.limits import Limiter

CODE = "135790"  # set by the autouse fixture in conftest.py


def client(model_off=True, **kw):
    kw.setdefault("limiter", Limiter(rate_session=(10**6, 60), rate_chat=(10**6, 60), rate_mfa=(10**6, 60),
                                     mfa_max_wrong=10**6, client_max_wrong=10**6))
    if model_off:
        return TestClient(create_app(lambda: None, **kw))
    from stubmodel import ScriptedModel
    return TestClient(create_app(lambda: ScriptedModel([]), **kw))


def sse(text):
    out = []
    for frame in text.strip().split("\n\n"):
        lines = dict(l.split(": ", 1) for l in frame.split("\n"))
        out.append((lines["event"], json.loads(lines["data"])))
    return out


def propose(c, sid, *actions):
    r = c.post(f"/session/{sid}/propose", json={"actions": list(actions)})
    assert r.status_code == 200, r.text
    return sse(r.text)


def new(c):
    return c.post("/session").json()["session_id"]


AUTH = {"tool": "authenticate_user"}
DRAFT = {"tool": "create_transfer_draft", "payee": "Bob", "amount": 100}
XFER = {"tool": "execute_transfer"}


def test_config_reports_model_flag(monkeypatch):
    monkeypatch.setenv("INTERLOCK_MODEL", "off")
    assert client().get("/config").json() == {"model": "off"}
    monkeypatch.delenv("INTERLOCK_MODEL")
    assert client(model_off=False).get("/config").json() == {"model": "on"}


def test_session_without_model_and_chat_refused():
    c = client()
    sid = new(c)
    r = c.post(f"/session/{sid}/chat", json={"message": "hi"})
    assert r.status_code == 403


def test_accepts_and_blocks_use_the_real_gate_with_same_events():
    c = client()
    sid = new(c)
    ev = propose(c, sid, AUTH, DRAFT, XFER)
    names = [n for n, _ in ev]
    assert names == ["tool_proposed", "gate_verdict", "state_change",
                     "tool_proposed", "gate_verdict", "state_change",
                     "tool_proposed", "gate_verdict", "done"]
    v = [d for n, d in ev if n == "gate_verdict"]
    assert [x["verdict"] for x in v] == ["ACCEPT", "ACCEPT", "REJECT"]
    assert v[2]["reason"] == "TRANSFER not allowed in DRAFTED"
    assert v[2]["state"] == "DRAFTED" and "latency_ms" in v[2] and v[2]["engine"] == "executor-table"
    st = c.get(f"/session/{sid}/state").json()
    assert st["state"] == "DRAFTED" and [e["symbol"] for e in st["executed_log"]] == ["AUTH", "DRAFT"]


def test_human_key_still_works_and_transfer_executes():
    c = client()
    sid = new(c)
    propose(c, sid, AUTH, DRAFT)
    assert c.post(f"/session/{sid}/mfa", json={"code": CODE}).json()["verdict"] == "ACCEPT"
    ev = propose(c, sid, XFER)
    assert [d["verdict"] for n, d in ev if n == "gate_verdict"] == ["ACCEPT"]


def test_cannot_spoof_human_source_or_call_mfa():
    c = client()
    sid = new(c)
    propose(c, sid, AUTH, DRAFT)
    # an extra 'source' field is ignored, and the human-only step is refused for the agent
    r = c.post(f"/session/{sid}/propose", json={"actions": [{"tool": "mfa_tool", "source": "human"}], "source": "human"})
    v = [d for n, d in sse(r.text) if n == "gate_verdict"][0]
    assert v["verdict"] == "REJECT" and v["reason"] == "MFA is human-only" and v["state"] == "DRAFTED"
    assert c.get(f"/session/{sid}/state").json()["state"] == "DRAFTED"
    # unknown tool names and bad shapes are 422, nothing runs
    assert c.post(f"/session/{sid}/propose", json={"actions": [{"tool": "MFA"}]}).status_code == 422
    assert c.post(f"/session/{sid}/propose", json={"actions": []}).status_code == 422
    assert c.post(f"/session/{sid}/propose", json={"actions": [XFER] * 9}).status_code == 422


def test_guard_applies():
    c = client()
    sid = new(c)
    ev = propose(c, sid, AUTH, {"tool": "create_transfer_draft", "payee": "Bob", "amount": 9000})
    v = [d for n, d in ev if n == "gate_verdict"]
    assert v[1]["verdict"] == "REJECT" and v[1]["reason"] == "amount above spend cap"
    ev = propose(c, sid, {"tool": "create_transfer_draft", "payee": "Mallory", "amount": 5})
    assert [d["reason"] for n, d in ev if n == "gate_verdict"] == ["payee not in allow-list"]


def test_lockout_after_five_rejects_in_a_row():
    c = client()
    sid = new(c)
    ev = propose(c, sid, *[XFER] * 6)
    v = [d for n, d in ev if n == "gate_verdict"]
    assert [x["reason"] for x in v][-1] == "session locked"
    assert c.get(f"/session/{sid}/state").json()["counters"]["locked"] is True
    assert [d["verdict"] for n, d in propose(c, sid, AUTH) if n == "gate_verdict"] == ["REJECT"]


def test_unknown_session_and_busy():
    c = client()
    assert c.post("/session/nope/propose", json={"actions": [AUTH]}).status_code == 404
    sid = new(c)
    s = c.app.state.registry.get(sid)
    s.lock.acquire()
    assert c.post(f"/session/{sid}/propose", json={"actions": [AUTH]}).status_code == 409
    s.lock.release()


def test_rate_limited():
    c = client(limiter=Limiter(rate_chat=(1, 60)))
    sid = c.post("/session").json()["session_id"]
    assert c.post(f"/session/{sid}/propose", json={"actions": [AUTH]}).status_code == 200
    assert c.post(f"/session/{sid}/propose", json={"actions": [AUTH]}).status_code == 429
