"""C2 race endpoints: the recorded replay, and the live race with an isolated unprotected arm and a daily cap.
All with the canned StubModel; no Bedrock call."""
import pytest
from fastapi.testclient import TestClient

from server.app import create_app
from server.limits import Limiter
from server.stub_model import StubModel


def client(model="stub", **kw):
    lim = Limiter(rate_session=(10**6, 60), rate_chat=(10**6, 60), rate_mfa=(10**6, 60))
    return TestClient(create_app((lambda: StubModel()) if model == "stub" else (lambda: None), limiter=lim, **kw))


def test_replay_is_the_recorded_run_and_calls_no_model():
    c = client(model=None)  # model factory returns None: nothing could be called
    d = c.get("/race/replay").json()
    assert d["label"].startswith("recorded run, ") and "nova" in d["model"]
    assert len(d["attacks"]) == 20 and {r["arm"] for r in d["runs"]} == {"prompt-only", "interlock"}
    assert d["summary"]["arms"]["interlock"]["violations"] == 0


def test_live_needs_the_model_on(monkeypatch):
    monkeypatch.setenv("INTERLOCK_MODEL", "off")
    assert client().post("/race/live", json={"attack_id": "pre-01"}).status_code == 403


def test_live_rejects_free_text_and_unknown_ids():
    c = client()
    assert c.post("/race/live", json={"attack_id": "x" * 500}).status_code == 422
    assert c.post("/race/live", json={"attack_id": "no-such"}).status_code == 404


def test_live_prompt_only_arm_never_touches_a_real_session():
    c = client()
    sid = c.post("/session").json()["session_id"]
    before = c.get(f"/session/{sid}/state").json()
    r = c.post("/race/live", json={"attack_id": "pre-01"})
    assert r.status_code == 200
    d = r.json()
    a = next(x for x in d["runs"] if x["arm"] == "prompt-only")
    b = next(x for x in d["runs"] if x["arm"] == "interlock")
    assert a["violation"] is True and "TRANSFER" in [e["symbol"] for e in a["executed_log"]]
    assert b["violation"] is False and "TRANSFER" not in [e["symbol"] for e in b["executed_log"]]
    assert c.get(f"/session/{sid}/state").json() == before  # real session untouched
    assert len(c.app.state.registry) == 1  # no session was created for either arm
    assert d["label"].startswith("live run, ")


def test_live_respects_the_daily_cap(monkeypatch):
    monkeypatch.setenv("RACE_DAILY_CALLS", "0")
    c = client()
    r = c.post("/race/live", json={"attack_id": "pre-01"})
    assert r.status_code == 429 and c.app.state.race_cap.used == 0
    monkeypatch.setenv("RACE_DAILY_CALLS", "7")
    c = client()
    assert c.post("/race/live", json={"attack_id": "pre-01"}).status_code == 200
    assert c.app.state.race_cap.used <= 7
    assert c.post("/race/live", json={"attack_id": "pre-01"}).status_code == 429  # fewer than 6 left
