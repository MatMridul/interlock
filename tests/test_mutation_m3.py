"""M3 mutation check: hand-picked table mutants injected into a Gate; the property
suite S1 to S7 must fail for each. Mutants that S1-S7 miss must be caught by an
added test (X1 or the liveness check) and are listed in docs/reports/EXECUTOR_REPORT.md."""
import copy

import pytest

import props
from bank.executor_table import TABLE
from bank.gate import Gate

# (name, state, symbol, new target)
MUTANTS = [
    ("APPROVED -EDIT-> APPROVED", "APPROVED", "EDIT", "APPROVED"),
    ("DRAFTED -TRANSFER-> AUTHED", "DRAFTED", "TRANSFER", "AUTHED"),
    ("START -DRAFT-> DRAFTED", "START", "DRAFT", "DRAFTED"),
    ("AUTHED -MFA-> APPROVED", "AUTHED", "MFA", "APPROVED"),
    ("APPROVED -MFA-> APPROVED (stacking)", "APPROVED", "MFA", "APPROVED"),
    ("AUTHED -AUTH-> AUTHED (re-auth)", "AUTHED", "AUTH", "AUTHED"),
    ("APPROVED -TRANSFER-> APPROVED (draft not spent)", "APPROVED", "TRANSFER", "APPROVED"),
    ("DRAFTED -EDIT-> APPROVED (edit approves)", "DRAFTED", "EDIT", "APPROVED"),
    ("APPROVED -CANCEL-> APPROVED (cancel keeps approval)", "APPROVED", "CANCEL", "APPROVED"),
    ("AUTHED -TRANSFER-> AUTHED (no draft)", "AUTHED", "TRANSFER", "AUTHED"),
    ("DRAFTED -DRAFT-> DRAFTED (stacked drafts)", "DRAFTED", "DRAFT", "DRAFTED"),
    ("DRAFTED -MFA-> DRAFTED (approval impossible)", "DRAFTED", "MFA", "DRAFTED"),
]


def mutant_factory(state, symbol, target):
    t = copy.deepcopy(TABLE)
    t[state][symbol] = target
    return lambda: Gate(table=t, guard=False)


def test_unmutated_gate_survives_nothing_fails():
    for name, p in {**props.PROPS, "X1": props.prop_x1_no_stacked_drafts}.items():
        assert not props.falsified(p, props.default_factory), name


@pytest.mark.parametrize("name,state,symbol,target", MUTANTS, ids=[m[0] for m in MUTANTS])
def test_mutant_is_killed(name, state, symbol, target):
    f = mutant_factory(state, symbol, target)
    killers = [k for k, p in props.PROPS.items() if props.falsified(p, f)]
    x1 = props.falsified(props.prop_x1_no_stacked_drafts, f)
    live = _liveness_fails(f)
    print(f"MUTANT {name}: killed by S-props {killers}; X1={x1}; liveness={live}")
    assert killers or x1 or live, f"SURVIVOR: {name}"


def _liveness_fails(factory):
    g = factory()
    for s in ["AUTH", "DRAFT", "MFA", "TRANSFER"]:
        if g.run(s, {}, source="human")["verdict"] != "ACCEPT":
            return True
    return g.state != "AUTHED"


def test_s1_to_s7_alone_kill_every_safety_mutant_except_known_gaps():
    """Which mutants survive S1-S7 alone is a fact, pinned here so it cannot change silently."""
    survivors = []
    for name, state, symbol, target in MUTANTS:
        f = mutant_factory(state, symbol, target)
        if not any(props.falsified(p, f) for p in props.PROPS.values()):
            survivors.append(name)
    print("SURVIVORS OF S1-S7:", survivors)
    assert survivors == ["DRAFTED -DRAFT-> DRAFTED (stacked drafts)"]
