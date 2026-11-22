"""Engine-level tests: Safe Ship runs on the SAME Gate class as the finance policy (one engine, two policies)."""
import itertools

from hypothesis import given, settings, strategies as st

import sm_safe_ship as x
from bank import gate as gate_mod
from safeship import hook
from safeship.executor_table import INITIAL, SYMBOLS, TABLE

NAME = {"E": "EDIT", "T": "TEST", "C": "COMMIT", "P": "PUSH", "D": "DEPLOY"}
DELTA, START, ACCEPTING = x.load_table()


def new_gate():
    return gate_mod.Gate(table=TABLE, tools=hook.NOOP_TOOLS, guard=False, initial=INITIAL, symbols=SYMBOLS)


def engine_verdict(s):
    """Accept iff the Gate accepts every step. A REJECT leaves state unchanged, so stop at the first one."""
    g = new_gate()
    for ch in s:
        if g.run(NAME[ch])["verdict"] != "ACCEPT":
            return False
    return True


def test_hook_uses_the_shared_gate_class(monkeypatch):
    assert hook.Gate is gate_mod.Gate
    seen = []
    real = gate_mod.Gate

    class Spy(real):
        def run(self, *a, **k):
            seen.append(a)
            return super().run(*a, **k)

    monkeypatch.setattr(hook, "Gate", Spy)
    verdict, state = hook.step("TESTED", "PUSH")
    assert seen == [("PUSH",)] and verdict["verdict"] == "ACCEPT" and state == "TESTED"


def test_gate_rejects_with_state_unchanged_and_expected_symbols():
    g = new_gate()
    r = g.run("PUSH")
    assert r["verdict"] == "REJECT" and r["state"] == "CLEAN" and r["reason"] == "PUSH not allowed in CLEAN"
    assert r["expected_symbols"] == ["EDIT", "TEST", "COMMIT"]
    assert g.run("TEST")["verdict"] == "ACCEPT" and g.state == "TESTED"
    assert g.run("EDIT")["state"] == "EDITED"
    assert g.run("DEPLOY")["verdict"] == "REJECT" and g.state == "EDITED"


def test_unknown_symbol_and_mfa_are_refused_on_this_policy():
    g = new_gate()
    assert g.run("TRANSFER")["reason"] == "unknown symbol"     # a finance symbol is not part of this policy
    assert g.run("MFA", source="human")["reason"] == "unknown symbol"
    assert g.state == "CLEAN"


def test_finance_defaults_are_untouched():
    g = gate_mod.Gate()
    assert g.state == "START" and g.run("PUSH")["reason"] == "unknown symbol"


def test_engine_equals_rule_scan_exhaustively_to_length_6():
    for n in range(7):
        for tup in itertools.product(x.LETTERS, repeat=n):
            s = "".join(tup)
            assert engine_verdict(s) == x.rules_verdict(s) == x.table_verdict(DELTA, START, ACCEPTING, s), s


@settings(max_examples=300, deadline=None)
@given(st.text(alphabet=x.LETTERS, max_size=30))
def test_property_engine_equals_rule_scan_on_long_strings(s):
    assert engine_verdict(s) == x.rules_verdict(s)


@settings(max_examples=200, deadline=None)
@given(st.text(alphabet=x.LETTERS, max_size=30))
def test_property_edit_always_revokes_push(s):
    """After any accepted prefix, an EDIT makes the next PUSH and DEPLOY refused."""
    g = new_gate()
    for ch in s:
        g.run(NAME[ch])
    g.run("EDIT")
    assert g.run("PUSH")["verdict"] == "REJECT" and g.run("DEPLOY")["verdict"] == "REJECT"


def test_symbols_for_closed_mapping_and_observed_names():
    assert hook.TOOL_ROLES["str_replace"] == ("EDIT", "observed")
    assert hook.TOOL_ROLES["execute_pwsh"] == ("SHELL", "observed")
    assert hook.TOOL_ROLES["read_file"] == (None, "observed")
    assert hook.TOOL_ROLES["fs_write"][1] == "guessed"
    assert hook.symbols_for("read_file", {"path": "a"}) == []
    assert hook.symbols_for("mcp_x_y", {}) == []
    assert hook.symbols_for("str_replace", {}) == ["EDIT"]
    assert hook.symbols_for("execute_pwsh", {"command": "git commit -m x && git push"}) == ["COMMIT", "PUSH"]
