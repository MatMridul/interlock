"""M3: Hypothesis property tests S1 to S7 (spec 4.5) on executed traces."""
from hypothesis import given, settings

import props
from props import SEQS, SETTINGS, default_factory

S = settings(**SETTINGS)


@S
@given(SEQS)
def test_s1_nothing_before_auth(seq):
    props.prop_s1(default_factory, seq)


@S
@given(SEQS)
def test_s2_transfer_requires_fresh_mfa(seq):
    props.prop_s2(default_factory, seq)


@S
@given(SEQS)
def test_s3_draft_spent_once(seq):
    props.prop_s3(default_factory, seq)


@S
@given(SEQS)
def test_s4_auth_once(seq):
    props.prop_s4(default_factory, seq)


@S
@given(SEQS)
def test_s5_no_mfa_stacking(seq):
    props.prop_s5(default_factory, seq)


@S
@given(SEQS)
def test_s6_reject_is_noop(seq):
    props.prop_s6(default_factory, seq)


@S
@given(SEQS)
def test_s7_closed_alphabet_and_human_mfa(seq):
    props.prop_s7(default_factory, seq)


@S
@given(SEQS)
def test_x1_no_stacked_drafts(seq):
    props.prop_x1_no_stacked_drafts(default_factory, seq)


def test_sequences_reach_deep_states():
    """The generators are not vacuous: executed traces include TRANSFER after MFA."""
    import random
    from hypothesis import find
    t = find(SEQS, lambda q: "TRANSFER" in props.play(default_factory, q)[1], settings=settings(max_examples=2000, database=None, deadline=None, suppress_health_check=list(props.HealthCheck)))
    assert t
