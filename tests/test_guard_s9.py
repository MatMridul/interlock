"""S9 / INV-9: the argument guard inside the gate. Plus 3 guard mutants these tests must kill."""
import math

import pytest
from hypothesis import HealthCheck, given, settings, strategies as st

from bank.gate import Gate
from bank.guard import DEFAULT_CONFIG, Guard

CAP = DEFAULT_CONFIG.spend_cap
PAYEE = DEFAULT_CONFIG.allowed_payees[0]
FOUR = {"verdict", "state", "symbol", "expected_symbols"}


def new_gate():
    return Gate(guard=True)


def to_drafted(g, amount=100, payee=PAYEE):
    for sym, a in (("AUTH", {}), ("DRAFT", {"payee": payee, "amount": amount})):
        assert g.run(sym, a)["verdict"] == "ACCEPT", sym


def one_transfer(g, amount):
    """Run DRAFT(amount) -> MFA(human) -> TRANSFER from AUTHED. Returns the DRAFT and TRANSFER results."""
    d = g.run("DRAFT", {"payee": PAYEE, "amount": amount})
    if d["verdict"] != "ACCEPT":
        return d, None
    assert g.run("MFA", {}, source="human")["verdict"] == "ACCEPT"
    return d, g.run("TRANSFER", {})


def executed(g):
    return [e for e in g.effects() if e["symbol"] == "TRANSFER"]


def s9_checks(factory):
    """All S9 boundary assertions, parameterised by the gate factory so mutants can be run through it."""
    # cap boundary
    for amount, ok in ((CAP - 0.01, True), (CAP, True), (CAP + 0.01, False)):
        g = factory()
        g.run("AUTH", {})
        d = g.run("DRAFT", {"payee": PAYEE, "amount": amount})
        assert (d["verdict"] == "ACCEPT") == ok, (amount, d)
        if not ok:
            assert d["state"] == "AUTHED" and FOUR <= set(d) and "cap" in d["reason"]
    # transfers 3 and 4
    g = factory()
    g.run("AUTH", {})
    for n in (1, 2, 3):
        d, t = one_transfer(g, 10)
        assert t["verdict"] == "ACCEPT", n
    d, t = one_transfer(g, 10)
    assert d["verdict"] == "ACCEPT"  # the draft itself is fine ...
    assert t["verdict"] == "REJECT" and t["reason"] == "transfer limit reached"  # ... the 4th TRANSFER is not
    assert len(executed(g)) == 3
    # bad payee
    g = factory()
    g.run("AUTH", {})
    assert g.run("DRAFT", {"payee": "Mallory", "amount": 10})["verdict"] == "REJECT"
    # retry exhaustion and lock
    g = factory()
    for _ in range(5):
        assert g.run("TRANSFER", {})["verdict"] == "REJECT"
    r = g.run("AUTH", {})
    assert r["verdict"] == "REJECT" and r["reason"] == "session locked" and g.state == "START"
    assert g.run("AUTH", {}, source="human")["reason"] == "session locked"
    assert g.effects() == ()


def test_s9_argument_caps():
    s9_checks(new_gate)


def test_cap_boundaries_in_detail():
    g = new_gate()
    g.run("AUTH", {})
    r = g.run("DRAFT", {"payee": PAYEE, "amount": CAP + 0.01})
    assert r["verdict"] == "REJECT" and r["symbol"] == "DRAFT" and r["state"] == "AUTHED"
    assert "expected_symbols" in r and r["reason"] == "amount above spend cap"
    assert g.effects() == ({"symbol": "AUTH", "args": {}},)
    assert g.run("DRAFT", {"payee": PAYEE, "amount": CAP})["verdict"] == "ACCEPT"
    # EDIT is guarded too, and a rejected EDIT leaves the draft and the machine alone
    g.run("MFA", {}, source="human")
    assert g.state == "APPROVED"
    assert g.run("EDIT", {"payee": PAYEE, "amount": CAP + 1})["verdict"] == "REJECT"
    assert g.state == "APPROVED"
    assert g.run("TRANSFER", {})["verdict"] == "ACCEPT"
    assert executed(g)[0]["args"] == {"payee": PAYEE, "amount": CAP}


@pytest.mark.parametrize("payee", [None, "", " ", "alice", "Alice ", "Mallory", 5, ["Alice"], {"a": 1}, b"Alice"])
def test_bad_payee(payee):
    g = new_gate()
    g.run("AUTH", {})
    r = g.run("DRAFT", {"payee": payee, "amount": 10})
    assert r["verdict"] == "REJECT" and r["state"] == "AUTHED"


@pytest.mark.parametrize("amount", [None, True, False, "10", "10.5", "1e3", 0, -1, -0.01, 0.0, 10.001, 1.005,
                                    float("nan"), float("inf"), -float("inf"), 5000.01, 10**9, [10], {}])
def test_bad_amount(amount):
    g = new_gate()
    g.run("AUTH", {})
    assert g.run("DRAFT", {"payee": PAYEE, "amount": amount})["verdict"] == "REJECT"
    assert g.run("DRAFT", {"payee": PAYEE})["verdict"] == "REJECT"  # missing amount
    assert g.run("DRAFT", {"amount": 10})["verdict"] == "REJECT"  # missing payee
    assert g.state == "AUTHED" and len(g.effects()) == 1


@pytest.mark.parametrize("amount", [1, 0.01, 0.1, 99.99, 100, 2500.5, 5000, 4999.99])
def test_good_amounts(amount):
    g = new_gate()
    g.run("AUTH", {})
    assert g.run("DRAFT", {"payee": PAYEE, "amount": amount})["verdict"] == "ACCEPT"


def test_transfer_limit_counted_only_on_execution():
    g = new_gate()
    g.run("AUTH", {})
    for _ in range(4):  # rejected TRANSFER attempts (no MFA) do not consume the budget
        g.run("DRAFT", {"payee": PAYEE, "amount": 1}) if g.state == "AUTHED" else None
        assert g.run("TRANSFER", {})["verdict"] == "REJECT"
        g.run("CANCEL", {})
    assert g.guard_state()["transfers"] == 0
    for _ in range(3):
        assert one_transfer(g, 5)[1]["verdict"] == "ACCEPT"
    assert g.guard_state()["transfers"] == 3


def test_transfer_uses_stored_draft_not_model_args():
    g = new_gate()
    g.run("AUTH", {})
    g.run("DRAFT", {"payee": "Bob", "amount": 50})
    g.run("EDIT", {"payee": "Carol", "amount": 75.5})  # edit voided nothing (no MFA yet), still DRAFTED
    g.run("MFA", {}, source="human")
    r = g.run("TRANSFER", {"payee": "Mallory", "amount": 4999})  # model-supplied values are ignored
    assert r["verdict"] == "ACCEPT"
    assert executed(g)[0]["args"] == {"payee": "Carol", "amount": 75.5}


def test_edit_after_mfa_voids_approval_still():
    g = new_gate()
    g.run("AUTH", {})
    g.run("DRAFT", {"payee": PAYEE, "amount": 10})
    g.run("MFA", {}, source="human")
    assert g.run("EDIT", {"payee": PAYEE, "amount": 20})["verdict"] == "ACCEPT"
    assert g.state == "DRAFTED"
    assert g.run("TRANSFER", {})["verdict"] == "REJECT"


def test_retry_counter_resets_on_accept_and_locks_after_five():
    g = new_gate()
    for _ in range(4):
        g.run("TRANSFER", {})
    assert g.run("AUTH", {})["verdict"] == "ACCEPT"  # 4 rejects then an accept: counter resets
    for _ in range(4):
        g.run("AUTH", {})
    assert g.run("DRAFT", {"payee": PAYEE, "amount": 1})["verdict"] == "ACCEPT"
    for i in range(5):
        assert g.run("AUTH", {})["reason"] == "AUTH not allowed in DRAFTED"
    r = g.run("MFA", {}, source="human")
    assert r["reason"] == "session locked" and g.state == "DRAFTED"
    assert g.guard_state()["locked"] is True
    assert Gate(guard=True).guard_state()["locked"] is False  # a new Gate is a new session


def test_peek_knows_guard_checks_and_changes_nothing():
    g = new_gate()
    g.run("AUTH", {})
    ok, info = g.peek("DRAFT", args={"payee": "Mallory", "amount": 10})
    assert not ok and info["reason"] == "payee not in allow-list"
    ok, _ = g.peek("DRAFT", args={"payee": PAYEE, "amount": 10})
    assert ok and g.state == "AUTHED" and g.guard_state()["consecutive_rejects"] == 0


def test_legacy_gate_without_guard_unchanged():
    g = Gate(guard=False)
    assert g.guard_state() is None
    g.run("AUTH", {})
    assert g.run("DRAFT", {})["verdict"] == "ACCEPT"


# ---- Hypothesis: random arguments never break the limits -----------------------------------

_amounts = st.one_of(st.floats(allow_nan=True, allow_infinity=True), st.integers(-10**6, 10**6),
                     st.sampled_from([CAP, CAP - 0.01, CAP + 0.01, 0.01, True, "100", None]),
                     st.decimals(allow_nan=False, allow_infinity=False).map(float))
_payees = st.one_of(st.sampled_from(list(DEFAULT_CONFIG.allowed_payees) + ["Mallory", "", "alice"]),
                    st.text(max_size=8), st.none(), st.integers())
_ops = st.one_of(
    st.tuples(st.just("DRAFT"), _payees, _amounts), st.tuples(st.just("EDIT"), _payees, _amounts),
    st.tuples(st.sampled_from(["AUTH", "TRANSFER", "CANCEL"]), st.none(), st.none()),
    st.tuples(st.just("MFA"), st.none(), st.none()))
SETTINGS = dict(max_examples=400, deadline=None, database=None, suppress_health_check=list(HealthCheck))


def play_random(factory, ops):
    g = factory()
    g.run("AUTH", {})
    for sym, payee, amount in ops:
        args = {"payee": payee, "amount": amount} if sym in ("DRAFT", "EDIT") else {}
        g.run(sym, args, source="human" if sym == "MFA" else "llm")
    return g


def prop_guard_limits(factory, ops):
    g = play_random(factory, ops)
    ts = executed(g)
    assert len(ts) <= DEFAULT_CONFIG.max_transfers
    for t in ts:
        a = t["args"]
        assert a["payee"] in DEFAULT_CONFIG.allowed_payees
        assert type(a["amount"]) in (int, float) and math.isfinite(a["amount"]) and 0 < a["amount"] <= CAP
    for e in g.effects():
        if e["symbol"] in ("DRAFT", "EDIT"):
            assert e["args"]["amount"] <= CAP and e["args"]["payee"] in DEFAULT_CONFIG.allowed_payees


def prop_with_many_transfers(factory, ops):
    """Drives lots of valid transfers so the transfer-count limit is actually hit."""
    g = factory()
    g.run("AUTH", {})
    for sym, payee, amount in ops:
        if sym == "TRANSFER":
            g.run("DRAFT", {"payee": PAYEE, "amount": 1})
            g.run("MFA", {}, source="human")
        g.run(sym, {"payee": payee, "amount": amount} if sym in ("DRAFT", "EDIT") else {},
              source="human" if sym == "MFA" else "llm")
    assert len(executed(g)) <= DEFAULT_CONFIG.max_transfers


@settings(**SETTINGS)
@given(st.lists(_ops, max_size=40))
def test_hypothesis_random_arguments_respect_limits(ops):
    prop_guard_limits(new_gate, ops)


@settings(**SETTINGS)
@given(st.lists(st.tuples(st.just("TRANSFER"), st.none(), st.none()), min_size=1, max_size=12))
def test_hypothesis_never_a_fourth_transfer(ops):
    prop_with_many_transfers(new_gate, ops)


# ---- guard mutants: each must be killed by the checks above -----------------------------------

class NoCapGuard(Guard):
    def check(self, symbol, args):
        if symbol in ("DRAFT", "EDIT") and args is not None and args.get("amount") == CAP + 0.01:
            return None  # M-G1: cap check removed
        return super().check(symbol, args)


class OffByOneGuard(Guard):
    def check(self, symbol, args):
        if symbol == "TRANSFER" and self.transfers == self.cfg.max_transfers and not self.locked:
            return None  # M-G2: allows one transfer too many (>= became >)
        return super().check(symbol, args)


class NoPayeeGuard(Guard):
    def check(self, symbol, args):
        if symbol in ("DRAFT", "EDIT") and args is not None and args.get("payee") == "Mallory":
            return None  # M-G3: payee check removed
        return super().check(symbol, args)


def mutant_gate(cls):
    def f():
        g = Gate(guard=True)
        g._guard = cls()
        return g
    return f


@pytest.mark.parametrize("cls", [NoCapGuard, OffByOneGuard, NoPayeeGuard])
def test_guard_mutants_are_killed(cls):
    s9_checks(new_gate)  # baseline passes
    with pytest.raises(AssertionError):
        s9_checks(mutant_gate(cls))


def test_guard_mutants_killed_by_hypothesis_too():
    """The property tests alone (no hand-written boundary cases) also kill the cap and transfer-count mutants."""
    # cap: a random draft above the cap that the mutant lets through is found
    cap_seq = [("DRAFT", PAYEE, CAP + 0.01), ("MFA", None, None), ("TRANSFER", None, None)]
    with pytest.raises(AssertionError):
        prop_guard_limits(mutant_gate(NoCapGuard), cap_seq)
    with pytest.raises(AssertionError):
        prop_with_many_transfers(mutant_gate(OffByOneGuard), [("TRANSFER", None, None)] * 6)
    prop_guard_limits(new_gate, cap_seq)


def test_plain_gate_is_guarded_by_default():
    g = Gate()  # no guard argument: the guard must be on
    assert g.guard_state() is not None
    g.run("AUTH", {})
    r = g.run("DRAFT", {"payee": PAYEE, "amount": 5000.01})
    assert r["verdict"] == "REJECT" and g.state == "AUTHED"
    assert g.run("DRAFT", {"payee": PAYEE, "amount": 100})["verdict"] == "ACCEPT"
    r = g.run("EDIT", {"payee": PAYEE, "amount": 9000})
    assert r["verdict"] == "REJECT" and g.state == "DRAFTED"
