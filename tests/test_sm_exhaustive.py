"""M1: exhaustive and randomized cross-check of table vs ordering rules vs regex (SPEC_GATE_v2.md 4.6)."""
import random
from multiprocessing import Pool

import pytest

import sm_crosscheck as x

MAX_LEN = 8
EXPECTED_TOTAL = 2_015_539     # sum of 6^k, k=0..8, including the empty string
EXPECTED_ACCEPTED = 321        # per spec; asserted below, so a wrong number fails loudly


@pytest.fixture(scope="module")
def table():
    return x.load_table()


def test_table_shape(table):
    delta, start, accepting = table
    assert start == "START"
    assert set(delta) == {"START", "AUTHED", "DRAFTED", "APPROVED", "SINK"}
    assert accepting == {"START", "AUTHED", "DRAFTED", "APPROVED"}
    assert sum(len(r) for r in delta.values()) == 30
    for row in delta.values():
        assert set(row) == set(x.LETTERS) and set(row.values()) <= set(delta)


def test_exhaustive_up_to_length_8(table):
    delta, start, accepting = table
    total = 1
    accepted = 1 if x.table_verdict(delta, start, accepting, "") else 0
    assert x.check_string(delta, start, accepting, "") is None
    mismatches, firsts = 0, []
    with Pool() as pool:
        for n, m, a, first in pool.imap_unordered(x._chunk, x.exhaustive_chunks(delta, start, accepting, MAX_LEN), chunksize=4):
            total += n
            accepted += a
            mismatches += m
            if first:
                firsts.append(first)
    print(f"\nEXHAUSTIVE total={total} accepted={accepted} mismatches={mismatches}")
    assert mismatches == 0, firsts[:5]
    assert total == EXPECTED_TOTAL
    assert accepted == EXPECTED_ACCEPTED


def test_random_strings_len_9_to_30(table):
    delta, start, accepting = table
    rng = random.Random(20261119)
    bad = []
    for _ in range(100_000):
        s = "".join(rng.choice(x.LETTERS) for _ in range(rng.randint(9, 30)))
        if x.check_string(delta, start, accepting, s) is not None:
            bad.append(s)
    assert not bad, bad[:5]


def test_table_guided_random_walks(table):
    delta, start, accepting = table
    rng = random.Random(20261120)
    bad, long_accepted, rejected_tail = [], 0, 0
    for _ in range(20_000):
        q, out = start, []
        for _ in range(rng.randint(9, 30)):
            live = [c for c in x.LETTERS if delta[q][c] != "SINK"]
            c = rng.choice(live) if live and rng.random() < 0.95 else rng.choice(x.LETTERS)
            out.append(c)
            q = delta[q][c]
        s = "".join(out)
        if x.check_string(delta, start, accepting, s) is not None:
            bad.append(s)
        if x.table_verdict(delta, start, accepting, s):
            long_accepted += 1
        else:
            rejected_tail += 1
    print(f"\nWALKS accepted={long_accepted} rejected={rejected_tail}")
    assert not bad, bad[:5]
    assert long_accepted > 1000   # walks must actually reach long accepted strings

