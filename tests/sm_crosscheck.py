"""Shared cross-check for the finance state machine (SPEC_GATE_v2.md section 4.4).

Three independent verdict functions over one-letter strings (A D E M T C):
  table_verdict : steps policy/finance_table.json
  rules_verdict : ordering rules R1..R7 by position scanning, no state variable carried across positions
  regex_verdict : the section 4.4 regex
"""
import itertools
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
TABLE_PATH = ROOT / "policy" / "finance_table.json"
LETTERS = "ADEMTC"
REGEX = re.compile(r"(?:|A(?:D(?:E|ME)*(?:C|M(?:C|T)))*(?:D(?:E|ME)*M?)?)")


def load_table(path=TABLE_PATH):
    """Return (delta, start, accepting) with delta[state][letter] = state, keyed by one-letter symbols."""
    t = json.loads(Path(path).read_text(encoding="utf-8"))
    letters = t["letters"]
    delta = {s: {letters[sym]: tgt for sym, tgt in row.items()} for s, row in t["transitions"].items()}
    return delta, t["initial"], set(t["accepting"])


def table_verdict(delta, start, accepting, s):
    q = start
    for ch in s:
        q = delta[q][ch]
    return q in accepting


def regex_verdict(s):
    return REGEX.fullmatch(s) is not None


def rules_verdict(s):
    """R1..R7 evaluated at each position i from the prefix s[:i] alone (backward scans, no running state)."""
    for i, c in enumerate(s):
        p = s[:i]
        if i == 0:                                        # R1
            if c != "A":
                return False
            continue
        if c == "A":                                      # R2
            return False
        j = max(p.rfind("D"), -1)                         # latest DRAFT before i
        is_open = j >= 0 and "T" not in p[j + 1:] and "C" not in p[j + 1:]   # R3
        if c == "D":
            if is_open:                                   # R4
                return False
            continue
        if not is_open:                                   # R5
            return False
        if c in "MT":
            k = max(p.rfind("D"), p.rfind("E"))           # latest DRAFT/EDIT of the open draft
            fresh = "M" in p[k + 1:]
            if c == "M" and fresh:                        # R6
                return False
            if c == "T" and not fresh:                    # R7
                return False
    return True


def check_string(delta, start, accepting, s):
    """Return None if table, rules and regex agree, else (table, rules, regex) verdicts."""
    a = table_verdict(delta, start, accepting, s)
    b = rules_verdict(s)
    c = regex_verdict(s)
    return None if a == b == c else (a, b, c)


def _chunk(args):
    delta, start, accepting, prefix, length = args
    n = mism = acc = 0
    first = None
    rest = length - len(prefix)
    for tail in itertools.product(LETTERS, repeat=rest):
        s = prefix + "".join(tail)
        n += 1
        r = check_string(delta, start, accepting, s)
        if r is not None:
            mism += 1
            first = first or (s, r)
        elif table_verdict(delta, start, accepting, s):
            acc += 1
    return n, mism, acc, first


def prefixes(length, depth=2):
    d = min(depth, length)
    return ["".join(p) for p in itertools.product(LETTERS, repeat=d)]


def exhaustive_chunks(delta, start, accepting, max_len=8):
    """Work items covering every string of length 1..max_len (the empty string is checked by the caller)."""
    for length in range(1, max_len + 1):
        for p in prefixes(length):
            yield (delta, start, accepting, p, length)


def shortest_distinguishing(delta, start, accepting, max_len=8):
    """Return the shortest string on which the three formulations disagree, or None (used for mutants)."""
    if check_string(delta, start, accepting, "") is not None:
        return ""
    for length in range(1, max_len + 1):
        for tail in itertools.product(LETTERS, repeat=length):
            s = "".join(tail)
            if check_string(delta, start, accepting, s) is not None:
                return s
    return None
