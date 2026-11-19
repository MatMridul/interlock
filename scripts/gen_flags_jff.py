"""Independent second model: DFA over three flags (authed, draftOpen, mfaFresh).
Does NOT read policy/finance_table.json. States are the reachable flag triples plus REJECT.
Usage: python scripts/gen_flags_jff.py [out.jff]"""
import sys
from pathlib import Path

LETTERS = "ADEMTC"
REJECT = "REJECT"

def step(flags, ch):
    authed, draft, fresh = flags
    if not authed:
        return (True, False, False) if ch == "A" else REJECT
    if ch == "A":
        return REJECT
    if ch == "D":
        return REJECT if draft else (True, True, False)
    if not draft:                       # E M T C need an open draft
        return REJECT
    if ch == "E":
        return (True, True, False)      # edit voids approval
    if ch == "M":
        return REJECT if fresh else (True, True, True)
    if ch == "T":
        return (True, False, False) if fresh else REJECT
    if ch == "C":
        return (True, False, False)

start = (False, False, False)
order, seen, todo, trans = [start], {start}, [start], {}
while todo:
    s = todo.pop(0)
    for ch in LETTERS:
        n = step(s, ch)
        trans[(s, ch)] = n
        if n != REJECT and n not in seen:
            seen.add(n); order.append(n); todo.append(n)
order.append(REJECT)
name = lambda s: s if s == REJECT else "a%dd%dm%d" % tuple(map(int, s))
ids = {s: i for i, s in enumerate(order)}
L = ['<?xml version="1.0" encoding="UTF-8" standalone="no"?>', "<structure>", "\t<type>fa</type>", "\t<automaton>"]
for s in order:
    L += [f'\t\t<state id="{ids[s]}" name="{name(s)}">', f"\t\t\t<x>{100 + 140 * ids[s]}.0</x>", "\t\t\t<y>300.0</y>"]
    if s == start: L.append("\t\t\t<initial/>")
    if s != REJECT: L.append("\t\t\t<final/>")
    L.append("\t\t</state>")
for s in order:
    for ch in LETTERS:
        n = REJECT if s == REJECT else trans[(s, ch)]
        L += ["\t\t<transition>", f"\t\t\t<from>{ids[s]}</from>", f"\t\t\t<to>{ids[n]}</to>", f"\t\t\t<read>{ch}</read>", "\t\t</transition>"]
L += ["\t</automaton>", "</structure>", ""]
out = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(__file__).resolve().parent.parent / "policy" / "finance_flags.jff"
out.write_text("\n".join(L), encoding="utf-8")
print(f"wrote {out} with {len(order)} states")
