"""Cross-check helpers for the Safe Ship machine (same method as sm_crosscheck.py for finance).

Two independent verdict functions over one-letter strings (E T C P D):
  table_verdict : steps policy/safe_ship_table.json
  rules_verdict : the rule by backward scan at each position, no running state variable
Rule: PUSH or DEPLOY at position i is allowed only if the latest EDIT-or-TEST before i exists and is a TEST.
"""
import itertools
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
TABLE_PATH = ROOT / "policy" / "safe_ship_table.json"
LETTERS = "ETCPD"


def load_table(path=TABLE_PATH):
    """Return (delta, start, accepting) with delta[state][letter] = state."""
    t = json.loads(Path(path).read_text(encoding="utf-8"))
    letters = t["letters"]
    delta = {s: {letters[sym]: tgt for sym, tgt in row.items()} for s, row in t["transitions"].items()}
    return delta, t["initial"], set(t["accepting"])


def table_verdict(delta, start, accepting, s):
    q = start
    for ch in s:
        q = delta[q][ch]
    return q in accepting


def rules_verdict(s):
    for i, c in enumerate(s):
        if c in "PD":
            p = s[:i]
            last = max(p.rfind("E"), p.rfind("T"))
            if last < 0 or p[last] != "T":
                return False
    return True


def equivalent(d1, d2, start, accepting):
    """Exact language equivalence by product-automaton search (all lengths, not only the tested ones)."""
    seen, todo = {(start, start)}, [(start, start)]
    while todo:
        p, q = todo.pop()
        if (p in accepting) != (q in accepting):
            return False
        for ch in LETTERS:
            nxt = (d1[p][ch], d2[q][ch])
            if nxt not in seen:
                seen.add(nxt)
                todo.append(nxt)
    return True


def check_all(delta, start, accepting, max_len=8, stop_at_first=False):
    """Every string up to max_len (incl. empty). Returns (total, mismatches, accepted, first_mismatch)."""
    n = mism = acc = 0
    first = None
    for length in range(max_len + 1):
        for tup in itertools.product(LETTERS, repeat=length):
            s = "".join(tup)
            n += 1
            a = table_verdict(delta, start, accepting, s)
            if a != rules_verdict(s):
                mism += 1
                first = first or s
                if stop_at_first:
                    return n, mism, acc, first
            elif a:
                acc += 1
    return n, mism, acc, first
