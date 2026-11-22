from fastapi.testclient import TestClient

from server.app import create_app
from server.policies import RECORDED_LABEL


def client():
    return TestClient(create_app(model_factory=lambda: None))


def test_finance_policy_is_the_live_table():
    c = client()
    d = c.get("/policies/finance").json()
    assert d["policy"] == c.get("/policy").json() and "recorded" not in d


def test_safe_ship_has_the_table_and_the_recorded_cli_run():
    d = client().get("/policies/safe_ship").json()
    assert d["policy"]["symbols"] == ["EDIT", "TEST", "COMMIT", "PUSH", "DEPLOY"]
    assert d["policy"]["initial"] == "CLEAN"
    r = d["recorded"]
    assert r["label"] == RECORDED_LABEL and "Kiro CLI 3.5.0" in r["label"]
    steps = r["steps"]
    assert [s["symbol"] for s in steps] == ["EDIT", "COMMIT", "PUSH", "TEST", "PUSH", "EDIT", "PUSH"]
    assert [s["refused"] for s in steps] == [False, False, True, False, False, False, True]
    refused = steps[2]
    assert refused["from"] == refused["to"] == "EDITED" and "PUSH refused in state EDITED" in refused["message"]
    assert steps[4]["from"] == "TESTED" and not steps[4]["refused"]


def test_unknown_policy_is_404_and_read_only():
    c = client()
    assert c.get("/policies/nope").status_code == 404
    assert c.get("/policies/..%2Fsecrets").status_code == 404
    assert c.post("/policies/safe_ship").status_code == 405
