"""Small-scale verification of the safe_ship machine, same method as the finance machine (SPEC_GATE_v2.md 4.6).

1. Exhaustive: every string over E T C P D up to length 8 (488,281 strings incl. empty), table verdict
   vs an independent rules-by-position verdict (no state variable).
2. Mutants: every single-cell change of a live row (3 rows x 5 symbols x 3 other targets = 45) must be
   distinguished from the original by some string of length <= 8, or be proven language-equivalent
   (CLEAN and EDITED behave the same for this rule, so 5 mutants cannot change the language).
Run: python docs/spikes/safe-ship/verify_safe_ship.py
"""
import itertools
import json
import sys
from pathlib import Path

TABLE = Path(__file__).with_name("safe_ship_table.json")
LETTERS = "ETCPD"


def load(path=TABLE):
    t = json.loads(Path(path).read_text(encoding="utf-8"))
    L = t["letters"]
    delta = {s: {L[sym]: tgt for sym, tgt in row.items()} for s, row in t["transitions"].items()}
    return delta, t["initial"], set(t["accepting"])


def table_verdict(delta, start, acc, s):
    q = start
    for ch in s:
        q = delta[q][ch]
    return q in acc


def rules_verdict(s):
    """Rule: a P or D at position i is allowed iff the latest E-or-T before i exists and is a T.
    Evaluated from the prefix alone (backward scan), no running state. Everything else is allowed."""
    for i, c in enumerate(s):
        if c in "PD":
            p = s[:i]
            last = max(p.rfind("E"), p.rfind("T"))
            if last < 0 or p[last] != "T":
                return False
    return True


def equivalent(d1, d2, start, acc):
    """Exact language equivalence by product-automaton BFS (all lengths, not only <= 8)."""
    seen, todo = {(start, start)}, [(start, start)]
    while todo:
        p, q = todo.pop()
        if (p in acc) != (q in acc):
            return False
        for ch in LETTERS:
            nxt = (d1[p][ch], d2[q][ch])
            if nxt not in seen:
                seen.add(nxt)
                todo.append(nxt)
    return True


def check_all(delta, start, acc, max_len=8, stop_at_first=False):
    n = mism = accepted = 0
    first = None
    for length in range(max_len + 1):
        for tup in itertools.product(LETTERS, repeat=length):
            s = "".join(tup)
            n += 1
            a = table_verdict(delta, start, acc, s)
            if a != rules_verdict(s):
                mism += 1
                first = first or s
                if stop_at_first:
                    return n, mism, accepted, first
            elif a:
                accepted += 1
    return n, mism, accepted, first


def main():
    delta, start, acc = load()
    n, mism, accepted, first = check_all(delta, start, acc)
    print(f"EXHAUSTIVE total={n} accepted={accepted} mismatches={mism}")
    ok = mism == 0 and n == sum(5 ** k for k in range(9))
    live = [s for s in delta if s != "SINK"]
    survivors = killed = equiv = 0
    for s in live:
        for ch in LETTERS:
            for tgt in delta:
                if tgt == delta[s][ch]:
                    continue
                m = {k: dict(v) for k, v in delta.items()}
                m[s][ch] = tgt
                _, mm, _, w = check_all(m, start, acc, stop_at_first=True)
                if mm:
                    killed += 1
                elif equivalent(delta, m, start, acc):
                    equiv += 1
                    print(f"EQUIVALENT MUTANT (same language, not a gap) {s} -{ch}-> {tgt}")
                else:
                    survivors += 1
                    print(f"SURVIVOR {s} -{ch}-> {tgt}")
    print(f"MUTANTS killed={killed} equivalent={equiv} survivors={survivors}")
    ok = ok and survivors == 0 and killed + equiv == 45
    print("RESULT", "PASS" if ok else "FAIL")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
