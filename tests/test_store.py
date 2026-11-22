"""Session store (memory + DynamoDB via moto), shared-state registry, model cap, client address.
No AWS account is touched: DynamoDB is moto's in-process fake; the model is the scripted stub."""
import json
import threading

import pytest
from fastapi.testclient import TestClient

from bank.gate import Gate
from server import config, modelcap
from server.app import create_app
from server.limits import Limiter
from server.store import (Busy, daily_key, Conflict, DynamoStore, MemoryStore, begin_turn, end_turn, restore_gate,
                          snapshot_gate)
from stubmodel import ScriptedModel, Step

CODE = "135790"
AUTH = ("authenticate_user", {})
DRAFT = ("create_transfer_draft", {"payee": "Bob", "amount": 100.0})
EXEC = ("execute_transfer", {})


def dynamo_store():
    moto = pytest.importorskip("moto")
    import boto3
    mock = moto.mock_aws()
    mock.start()
    c = boto3.client("dynamodb", region_name="ap-south-1")
    c.create_table(TableName="t", KeySchema=[{"AttributeName": "pk", "KeyType": "HASH"}],
                   AttributeDefinitions=[{"AttributeName": "pk", "AttributeType": "S"}], BillingMode="PAY_PER_REQUEST")
    return mock, DynamoStore(c, "t")


@pytest.fixture(params=["memory", "dynamodb"])
def store(request, monkeypatch):
    monkeypatch.setenv("AWS_ACCESS_KEY_ID", "x")
    monkeypatch.setenv("AWS_SECRET_ACCESS_KEY", "x")
    monkeypatch.setenv("AWS_DEFAULT_REGION", "ap-south-1")
    if request.param == "memory":
        yield MemoryStore()
        return
    mock, s = dynamo_store()
    yield s
    mock.stop()


def relaxed():
    return Limiter(rate_session=(10**6, 60), rate_chat=(10**6, 60), rate_mfa=(10**6, 60), client_max_wrong=10**6)


def instance(store, steps=(), **kw):
    """One 'Lambda instance': its own app, registry and limiter, sharing only the store."""
    return TestClient(create_app(lambda: ScriptedModel(list(steps)), store=store, limiter=kw.pop("limiter", relaxed()), **kw))


# ---- store contract (both backends) ----------------------------------------------------------

def test_roundtrip_is_exact(store):
    data = {"gate": {"state": "S3", "log": [{"symbol": "DRAFT", "args": {"payee": "Bob", "amount": 100.5}}],
                     "guard": {"draft": {"payee": "Bob", "amount": 100.5}, "transfers": 2, "rejects": 4}},
            "mfa": {"wrong": 3, "locked_until": 1.5}}
    v = store.put("k", data)
    it = store.get("k")
    assert it.data == data and it.version == v == 1


def test_create_twice_and_stale_update_conflict(store):
    store.put("k", {"a": 1})
    with pytest.raises(Conflict):
        store.put("k", {"a": 2})
    v2 = store.put("k", {"a": 2}, 1)
    with pytest.raises(Conflict):
        store.put("k", {"a": 3}, 1)  # stale version
    assert store.get("k").data == {"a": 2} and v2 == 2


def test_two_writers_same_version_only_one_wins(store):
    store.put("k", {"n": 0})
    results = []

    def w(i):
        try:
            store.put("k", {"n": i}, 1)
            results.append("ok")
        except Conflict:
            results.append("conflict")

    ts = [threading.Thread(target=w, args=(i,)) for i in range(8)]
    [t.start() for t in ts]
    [t.join() for t in ts]
    assert results.count("ok") == 1 and results.count("conflict") == 7


def test_lease_blocks_second_turn_and_releases(store):
    store.put("k", {"x": 1})
    it = begin_turn(store, "k")
    with pytest.raises(Busy):
        begin_turn(store, "k")
    end_turn(store, "k", it, {"x": 2})
    assert begin_turn(store, "k").data == {"x": 2}


def test_expired_item_is_gone(store):
    store.put("k", {"x": 1})
    store._now = lambda: __import__("time").time() + 100 * 3600  # jump 100 h ahead
    assert store.get("k") is None
    assert store.put("k", {"x": 9}) == 1  # an expired key can be created again


def test_counter_is_atomic_and_stops_at_limit(store):
    got = []

    def w():
        got.append(store.incr_if_below("cap#d", 5))

    ts = [threading.Thread(target=w) for _ in range(20)]
    [t.start() for t in ts]
    [t.join() for t in ts]
    assert got.count(True) == 5 and store.count("cap#d") == 5


def test_gate_snapshot_roundtrip_exact():
    g = Gate()
    for sym, args, src in [("AUTH", {}, "llm"), ("DRAFT", {"payee": "Bob", "amount": 12.5}, "llm"),
                           ("TRANSFER", {}, "llm"), ("MFA", {}, "human"), ("TRANSFER", {}, "llm")]:
        g.run(sym, args, src)
    g.run("DRAFT", {"payee": "Mallory", "amount": 1}, "llm")  # rejected: bumps the reject counter
    snap = json.loads(json.dumps(snapshot_gate(g)))
    h = Gate()
    restore_gate(h, snap)
    assert (h.state, h.effects(), h.guard_state()) == (g.state, g.effects(), g.guard_state())
    assert h._guard.draft == g._guard.draft
    assert h.run("CANCEL", {})["verdict"] == g.run("CANCEL", {})["verdict"]  # behaves the same afterwards


# ---- state shared between instances ----------------------------------------------------------

def test_state_follows_the_session_across_instances(store):
    a = instance(store, [Step([AUTH]), Step([DRAFT]), Step([EXEC])])
    sid = a.post("/session").json()["session_id"]
    a.post(f"/session/{sid}/chat", json={"message": "go"})
    b = instance(store)  # a cold instance that never saw the session
    st = b.get(f"/session/{sid}/state").json()
    assert st["state"] != "S0" and [e["symbol"] for e in st["executed_log"]][:1] == ["AUTH"]
    r = b.post(f"/session/{sid}/mfa", json={"code": CODE})
    assert r.status_code == 200
    st2 = a.get(f"/session/{sid}/state").json()
    assert st2["executed_log"][-1]["symbol"] == "MFA" and st2["state"] == r.json()["state"]


def test_mfa_lockout_counts_across_instances(store):
    inst = [instance(store, limiter=Limiter(rate_session=(10**6, 60), rate_chat=(10**6, 60),
                                            rate_mfa=(10**6, 60), mfa_max_wrong=3, client_max_wrong=10**6))
            for _ in range(3)]
    sid = inst[0].post("/session").json()["session_id"]
    for c in inst:  # one wrong code on each instance
        assert c.post(f"/session/{sid}/mfa", json={"code": "000000"}).status_code == 403
    fresh = instance(store, limiter=Limiter(rate_session=(10**6, 60), rate_chat=(10**6, 60),
                                            rate_mfa=(10**6, 60), mfa_max_wrong=3, client_max_wrong=10**6))
    assert fresh.post(f"/session/{sid}/mfa", json={"code": CODE}).status_code == 429  # locked, even for the right code


def test_two_mfa_requests_cannot_both_advance(store):
    a = instance(store, [Step([AUTH]), Step([DRAFT]), Step([EXEC])])
    sid = a.post("/session").json()["session_id"]
    a.post(f"/session/{sid}/chat", json={"message": "go"})
    outs = []

    def go():
        outs.append(instance(store).post(f"/session/{sid}/mfa", json={"code": CODE}).json())

    ts = [threading.Thread(target=go) for _ in range(4)]
    [t.start() for t in ts]
    [t.join() for t in ts]
    log = a.get(f"/session/{sid}/state").json()["executed_log"]
    assert sum(1 for e in log if e["symbol"] == "MFA") == 1  # the others were rejected by the gate, not run twice


def test_chat_turn_is_exclusive_across_instances(store):
    a = instance(store)
    sid = a.post("/session").json()["session_id"]
    held = begin_turn(store, "s#" + sid)  # another instance is mid-turn
    assert instance(store).post(f"/session/{sid}/chat", json={"message": "x"}).status_code == 409
    assert instance(store).post(f"/session/{sid}/mfa", json={"code": CODE}).status_code == 409
    end_turn(store, "s#" + sid, held, held.data)
    assert instance(store).post(f"/session/{sid}/chat", json={"message": "x"}).status_code == 200


def test_unknown_session_is_404(store):
    assert instance(store).get("/session/" + "f" * 32 + "/state").status_code == 404
    assert instance(store).get("/session/" + "f" * 200 + "/state").status_code == 404


# ---- model mode, daily cap, client address ---------------------------------------------------

def test_cap_stops_model_calls_and_says_so():
    st = MemoryStore()
    c = instance(st, [Step([AUTH]), Step([DRAFT])], cap=modelcap.ModelCap(st, limit=2))
    sid = c.post("/session").json()["session_id"]
    body = c.post(f"/session/{sid}/chat", json={"message": "go"}).text
    assert st.count(daily_key()) == 2 and "daily limit" in body  # calls 1 and 2 ran, call 3 was refused
    r = c.post(f"/session/{sid}/chat", json={"message": "again"})
    assert r.status_code == 429 and "daily limit" in r.json()["detail"]


def test_cap_error_inside_a_turn_is_clear():
    st = MemoryStore()
    c = instance(st, [Step([AUTH]), Step([DRAFT])], cap=modelcap.ModelCap(st, limit=1))
    sid = c.post("/session").json()["session_id"]
    body = c.post(f"/session/{sid}/chat", json={"message": "go"}).text
    assert "daily limit of real-model calls" in body


def test_model_off_blocks_chat_without_touching_a_model(monkeypatch):
    monkeypatch.setenv("INTERLOCK_MODEL", "off")
    monkeypatch.delenv("STUB", raising=False)
    monkeypatch.setattr("agent.bedrock.make_bedrock_model", lambda: ScriptedModel([]))
    c = TestClient(create_app(limiter=relaxed()))
    sid = c.post("/session").json()["session_id"]
    r = c.post(f"/session/{sid}/chat", json={"message": "hi"})
    assert r.status_code == 403 and "switched off" in r.json()["detail"]


def test_mode_defaults(monkeypatch):
    monkeypatch.delenv("INTERLOCK_MODEL", raising=False)
    monkeypatch.delenv("INTERLOCK_ENV", raising=False)
    assert modelcap.model_mode() == "bedrock"
    monkeypatch.setenv("INTERLOCK_ENV", "production")
    assert modelcap.model_mode() == "off"


def test_client_ip_from_function_url_header(monkeypatch):
    ctx = json.dumps({"http": {"sourceIp": "203.0.113.9"}})
    req = type("R", (), {"headers": {"x-amzn-request-context": ctx}, "client": type("C", (), {"host": "127.0.0.1"})()})()
    assert config.client_ip(req) == "127.0.0.1"  # header ignored unless the deployment says to trust it
    monkeypatch.setenv("INTERLOCK_TRUST_PROXY", "lambda")
    assert config.client_ip(req) == "203.0.113.9"
    req.headers = {"x-amzn-request-context": "not json"}
    assert config.client_ip(req) == "127.0.0.1"
