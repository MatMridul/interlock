"""Shared property checks (spec 4.5). Used by the Hypothesis tests and by the
mutation check. The checkers read only the EXECUTED trace (the gate's side-effect
log) and know the policy as plain rules, not as the table."""
from hypothesis import HealthCheck, given, settings, strategies as st

from bank.gate import Gate
from bench.checks import check_s2, check_s3  # noqa: F401  (re-exported: mutation check imports them from here)

SYMS = ["AUTH", "DRAFT", "EDIT", "MFA", "TRANSFER", "CANCEL"]
JUNK = ["", "auth", "Transfer", "TRANSFER ", "SINK", "execute_transfer", "AUTH\u200b", "\u0410UTH", "TRANSFER\u0430"]

_SRC = st.sampled_from(["human", "human", "human", "llm"])
_FRAGS = [("AUTH",), ("DRAFT",), ("DRAFT", "MFA", "TRANSFER"), ("DRAFT", "EDIT", "MFA"), ("EDIT",),
          ("MFA",), ("TRANSFER",), ("CANCEL",), ("MFA", "TRANSFER"), ("EDIT", "TRANSFER")]
_uniform = st.lists(st.tuples(st.sampled_from(SYMS * 3 + JUNK), _SRC), max_size=30)
_cycles = st.lists(st.sampled_from(_FRAGS), max_size=10).map(
    lambda fr: [("AUTH", "human")] + [(s, "human") for f in fr for s in f])
_noisy = st.lists(st.sampled_from(_FRAGS), max_size=10).flatmap(
    lambda fr: st.lists(_SRC, min_size=sum(map(len, fr)), max_size=sum(map(len, fr))).map(
        lambda srcs: list(zip([s for f in fr for s in f], srcs))))
SEQS = st.one_of(_uniform, _cycles, _noisy)

SETTINGS = dict(max_examples=300, deadline=None, database=None,
                suppress_health_check=list(HealthCheck))


def play(factory, seq):
    """Run proposals through a fresh gate. Returns (gate, executed symbol trace, accepts).
    Checks S6 (reject is a no-op) and the 4-field rejection shape on the way."""
    g = factory()
    accepts = 0
    for sym, src in seq:
        st_before, log_before = g.state, g.effects()
        r = g.run(sym, {"payee": "x", "amount": 1}, source=src)
        if r["verdict"] == "REJECT":
            assert g.state == st_before and g.effects() == log_before, "reject changed something"
            assert {"verdict", "state", "symbol", "expected_symbols"} <= set(r), "rejection fields"
        else:
            accepts += 1
    return g, [e["symbol"] for e in g.effects()], accepts


def prop_s1(factory, seq):
    _, t, _ = play(factory, seq)
    assert not t or t[0] == "AUTH", t


def prop_s2(factory, seq):
    _, t, _ = play(factory, seq)
    check_s2(t)


def prop_s3(factory, seq):
    _, t, _ = play(factory, seq)
    check_s3(t)


def prop_s4(factory, seq):
    _, t, _ = play(factory, seq)
    assert t.count("AUTH") <= 1, t


def prop_s5(factory, seq):
    _, t, _ = play(factory, seq)
    mfa_fresh = False
    for s in t:
        if s == "MFA":
            assert not mfa_fresh, ("MFA stacking", t)
            mfa_fresh = True
        elif s in ("EDIT", "DRAFT"):
            mfa_fresh = False


def prop_s6(factory, seq):
    play(factory, seq)  # play() asserts the no-op and field checks on every reject


def prop_s7(factory, seq):
    g, t, accepts = play(factory, seq)
    assert set(t) <= set(SYMS), t
    assert len(t) == accepts, "executed count differs from accept count"
    human_mfa = sum(1 for s, src in seq if s == "MFA" and src == "human")
    assert t.count("MFA") <= human_mfa, "more MFA executed than human proposals"
    _, t2, _ = play(factory, [(s, "llm") for s, _ in seq])
    assert "MFA" not in t2, "MFA executed with source=llm"


PROPS = {"S1": prop_s1, "S2": prop_s2, "S3": prop_s3, "S4": prop_s4,
         "S5": prop_s5, "S6": prop_s6, "S7": prop_s7}


def prop_x1_no_stacked_drafts(factory, seq):
    """Added after a mutant survived S1 to S7 (see docs/reports/EXECUTOR_REPORT.md)."""
    _, t, _ = play(factory, seq)
    open_draft = False
    for s in t:
        if s == "DRAFT":
            assert not open_draft, ("DRAFT while a draft is open", t)
            open_draft = True
        elif s in ("TRANSFER", "CANCEL"):
            open_draft = False


def falsified(prop, factory):
    """True if Hypothesis finds a sequence on which prop fails for this gate."""
    @settings(derandomize=True, **SETTINGS)
    @given(SEQS)
    def t(seq):
        prop(factory, seq)
    try:
        t()
    except AssertionError:
        return True
    return False


def default_factory():
    return Gate(guard=False)
