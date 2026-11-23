"""The server-built 'gate says' line and the early stop after a repeated REJECT. Scripted stub model, no network."""
import pytest

from bank.executor_table import SYMBOLS, TABLE
from server.explain import explain, shortest_path
from test_server_api import AUTH, DRAFT, END, EXEC, Step, chat, make_client, names, new_session

# every undefined live cell (16) of the finance table and its shortest allowed path (same table as ui/src/test/depth.test.ts)
EXPECT = {
    "START": {"DRAFT": ["AUTH"], "EDIT": ["AUTH", "DRAFT"], "MFA": ["AUTH", "DRAFT"], "TRANSFER": ["AUTH", "DRAFT", "MFA"], "CANCEL": ["AUTH", "DRAFT"]},
    "AUTHED": {"AUTH": None, "EDIT": ["DRAFT"], "MFA": ["DRAFT"], "TRANSFER": ["DRAFT", "MFA"], "CANCEL": ["DRAFT"]},
    "DRAFTED": {"AUTH": None, "DRAFT": ["CANCEL"], "TRANSFER": ["MFA"]},
    "APPROVED": {"AUTH": None, "DRAFT": ["TRANSFER"], "MFA": ["EDIT"]},
}
CELLS = [(s, y, p) for s, row in EXPECT.items() for y, p in row.items()]


def test_the_16_cells_are_exactly_the_undefined_ones():
    assert len(CELLS) == 16
    undefined = [(s, y) for s in TABLE for y in SYMBOLS if y not in TABLE[s]]
    assert sorted(undefined) == sorted((s, y) for s, y, _ in CELLS)


@pytest.mark.parametrize("state,symbol,path", CELLS)
def test_explain_all_undefined_cells(state, symbol, path):
    assert shortest_path(TABLE, SYMBOLS, state, symbol) == path
    info = {"verdict": "REJECT", "state": state, "symbol": symbol, "expected_symbols": list(TABLE[state]), "reason": f"{symbol} not allowed in {state}"}
    line = explain(info)
    assert line.startswith("Gate: ")
    if path is None:
        assert f"{symbol} is never allowed from {state}" in line
    else:
        assert f"{symbol} is not allowed in {state}" in line
        for step in path:
            assert ("a human approval (MFA)" if step == "MFA" else step) in line
        assert ("human key" in line) == ("MFA" in path)
    assert "Allowed now: " + ", ".join(TABLE[state]) in line


def test_explain_the_prompt_example():
    info = {"verdict": "REJECT", "state": "DRAFTED", "symbol": "TRANSFER", "expected_symbols": ["EDIT", "CANCEL"], "reason": "x"}
    assert explain(info) == ("Gate: TRANSFER is not allowed in DRAFTED. It needs a human approval (MFA) first. "
                             "The human gives the approval with the human key; the agent cannot. Allowed now: EDIT, CANCEL.")


def test_explain_other_rejections_and_non_rejections():
    assert "locked" in explain({"verdict": "REJECT", "state": "AUTHED", "symbol": "DRAFT", "reason": "session locked"})
    assert "not a symbol" in explain({"verdict": "REJECT", "state": "AUTHED", "symbol": "WIRE", "reason": "unknown symbol"})
    # table allows it, the argument guard refused: the server's own reason is quoted
    assert explain({"verdict": "REJECT", "state": "AUTHED", "symbol": "DRAFT", "reason": "amount above spend cap"}).endswith("refused: amount above spend cap.")
    assert explain({"verdict": "REJECT", "reason": "rejected by hook"}) == "Gate: the proposal was refused: rejected by hook."
    assert explain({"verdict": "ACCEPT", "state": "START", "symbol": "AUTH"}) is None
    assert explain("junk") is None


def _explains(events):
    return [d["text"] for n, d in events if n == "gate_explain"]


def test_a_reject_streams_one_gate_line_after_the_model_text():
    c = make_client([Step([AUTH]), Step([EXEC]), END])
    sid = new_session(c)
    ev = chat(c, sid)
    lines = _explains(ev)
    assert len(lines) == 1 and "TRANSFER is not allowed in AUTHED" in lines[0] and "DRAFT, then a human approval (MFA)" in lines[0]
    assert names(ev).index("gate_explain") > names(ev).index("assistant_text") and names(ev)[-1] == "done"


def test_no_gate_line_when_nothing_was_rejected():
    c = make_client([Step([AUTH]), END])
    assert _explains(chat(c, new_session(c))) == []


def test_same_symbol_rejected_twice_stops_the_turn_with_the_gate_line_last():
    model_steps = [Step([AUTH]), Step([EXEC]), Step([EXEC]), Step([DRAFT]), END]
    c = make_client(model_steps)
    sid = new_session(c)
    ev = chat(c, sid)
    assert sum(1 for d in (d for n, d in ev if n == "gate_verdict") if d["verdict"] == "REJECT") == 2
    assert "assistant_text" not in names(ev) and "error" not in names(ev)  # stopped before any further model call
    assert names(ev)[-2:] == ["gate_explain", "done"]
    assert len(_explains(ev)) == 1  # the two identical lines are shown once
    assert c.get(f"/session/{sid}/state").json()["state"] == "AUTHED"  # the DRAFT in the script never ran


def test_two_different_rejected_symbols_do_not_stop_the_turn():
    c = make_client([Step([AUTH]), Step([EXEC]), Step([("cancel_transfer_draft", {})]), END])
    ev = chat(c, new_session(c))
    assert "assistant_text" in names(ev) and len(_explains(ev)) == 2


def test_the_count_resets_on_the_next_turn():
    c = make_client([Step([AUTH]), Step([EXEC]), END, Step([EXEC]), END])
    sid = new_session(c)
    chat(c, sid)
    assert "assistant_text" in names(chat(c, sid))  # one reject in each turn: no stop
