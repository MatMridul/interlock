"""M4: single-cell mutation testing. Every mutant of the table must be killed by the M1 cross-check."""
import copy

import pytest

import sm_crosscheck as x

DELTA, START, ACCEPTING = x.load_table()
LIVE = [s for s in DELTA if s != "SINK"]
MUTANTS = [
    (s, ch, tgt)
    for s in LIVE
    for ch in x.LETTERS
    for tgt in DELTA
    if tgt != DELTA[s][ch]
]


def test_mutant_count():
    assert len(MUTANTS) == 96   # 24 live cells x 4 other targets


@pytest.mark.parametrize("state,ch,target", MUTANTS, ids=[f"{s}-{c}->{t}" for s, c, t in MUTANTS])
def test_mutant_killed(state, ch, target):
    mutant = copy.deepcopy(DELTA)
    mutant[state][ch] = target
    witness = x.shortest_distinguishing(mutant, START, ACCEPTING, max_len=8)
    assert witness is not None, f"SURVIVOR: {state} -{ch}-> {target} (original {DELTA[state][ch]})"
