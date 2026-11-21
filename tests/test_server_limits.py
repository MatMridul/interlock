"""E4 abuse limits and F1 production mode. No network, no Bedrock."""
import pytest
from fastapi.testclient import TestClient

from server import config
from server.app import create_app
from server.limits import Limiter
from stubmodel import ScriptedModel

CODE = "135790"  # set by the autouse fixture in conftest.py


class Clock:
    def __init__(self):
        self.t = 1000.0

    def __call__(self):
        return self.t


def client(limiter):
    return TestClient(create_app(lambda: ScriptedModel([]), limiter=limiter))


def mfa(c, sid, code):
    return c.post(f"/session/{sid}/mfa", json={"code": code})


def test_mfa_brute_force_is_locked_out():
    clock = Clock()
    c = client(Limiter(clock=clock))
    sid = c.post("/session").json()["session_id"]
    statuses = [mfa(c, sid, f"{i:06d}").status_code for i in range(20)]
    assert statuses[:config.MFA_MAX_WRONG] == [403] * config.MFA_MAX_WRONG
    assert set(statuses[config.MFA_MAX_WRONG:]) == {429}      # no guess after the fifth is evaluated
    r = mfa(c, sid, CODE)                                      # even the right code is refused while locked
    assert r.status_code == 429 and int(r.headers["Retry-After"]) > 0
    assert c.get(f"/session/{sid}/state").json()["state"] == "START"
    clock.t += config.MFA_LOCKOUT_S + 1                        # lockout ends
    assert mfa(c, sid, CODE).status_code == 200


def test_correct_code_resets_the_wrong_count():
    c = client(Limiter(clock=Clock()))
    sid = c.post("/session").json()["session_id"]
    for _ in range(config.MFA_MAX_WRONG - 1):
        assert mfa(c, sid, "000000").status_code == 403
    assert mfa(c, sid, CODE).status_code == 200
    for _ in range(config.MFA_MAX_WRONG - 1):
        assert mfa(c, sid, "000000").status_code == 403


def test_lockout_is_per_session_but_client_limit_covers_new_sessions():
    c = client(Limiter(clock=Clock(), rate_session=(1000, 60), rate_mfa=(1000, 60)))
    codes = []
    for _ in range(config.MFA_CLIENT_MAX_WRONG // config.MFA_MAX_WRONG):  # 4 sessions x 5 wrong = 20 wrong
        sid = c.post("/session").json()["session_id"]
        codes += [mfa(c, sid, "000000").status_code for _ in range(config.MFA_MAX_WRONG)]
    assert set(codes) == {403}
    fresh = c.post("/session").json()["session_id"]            # a fresh session does not reset the client's count
    assert mfa(c, fresh, CODE).status_code == 429


def test_generic_rate_limits_on_session_chat_and_mfa():
    clock = Clock()
    c = client(Limiter(clock=clock, rate_session=(3, 60), rate_chat=(2, 60), rate_mfa=(2, 60)))
    sids = [c.post("/session") for _ in range(3)]
    assert [r.status_code for r in sids] == [200] * 3
    r = c.post("/session")
    assert r.status_code == 429 and r.json() == {"detail": "too many requests"} and "Retry-After" in r.headers
    sid = sids[0].json()["session_id"]
    codes = [c.post(f"/session/{sid}/chat", json={"message": "hi"}).status_code for _ in range(3)]
    assert codes[2] == 429 and codes[0] == 200
    assert [mfa(c, sid, "000000").status_code for _ in range(3)] == [403, 403, 429]
    clock.t += 61                                              # window passes
    assert c.post("/session").status_code == 200


# ---- F1 -------------------------------------------------------------------------------------

def test_production_refuses_to_start_without_code(monkeypatch):
    monkeypatch.setenv("INTERLOCK_ENV", "production")
    monkeypatch.delenv("DEMO_MFA_CODE")
    with pytest.raises(RuntimeError, match="DEMO_MFA_CODE"):
        create_app(lambda: ScriptedModel([]))
    monkeypatch.setenv("DEMO_MFA_CODE", "")
    with pytest.raises(RuntimeError):
        create_app(lambda: ScriptedModel([]))


def test_production_with_code_starts_and_never_prints_it(monkeypatch, capsys):
    monkeypatch.setenv("INTERLOCK_ENV", "Production")
    monkeypatch.setenv("DEMO_MFA_CODE", "987654")
    c = TestClient(create_app(lambda: ScriptedModel([])))
    out = capsys.readouterr()
    assert "987654" not in out.out + out.err
    sid = c.post("/session").json()["session_id"]
    r = mfa(c, sid, "987654")
    assert r.status_code == 200 and "987654" not in r.text


def test_local_default_prints_a_random_code(monkeypatch, capsys):
    monkeypatch.delenv("INTERLOCK_ENV", raising=False)
    monkeypatch.delenv("DEMO_MFA_CODE")
    monkeypatch.setattr(config, "_generated_code", None)
    create_app(lambda: ScriptedModel([]))
    err = capsys.readouterr().err
    assert config.demo_mfa_code() in err and len(config.demo_mfa_code()) == 6
