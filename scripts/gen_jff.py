"""Generate a JFLAP DFA (.jff) from policy/finance_table.json.
Usage: python scripts/gen_jff.py [table.json] [out.jff]
One-letter symbols are used because JFLAP reads input one character at a time."""
import json, sys
from pathlib import Path

root = Path(__file__).resolve().parent.parent
src = Path(sys.argv[1]) if len(sys.argv) > 1 else root / "policy" / "finance_table.json"
out = Path(sys.argv[2]) if len(sys.argv) > 2 else root / "policy" / "finance.jff"
t = json.loads(src.read_text(encoding="utf-8"))
ids = {s: i for i, s in enumerate(t["states"])}
L = ['<?xml version="1.0" encoding="UTF-8" standalone="no"?>', "<structure>", "\t<type>fa</type>", "\t<automaton>"]
for s in t["states"]:
    L += [f'\t\t<state id="{ids[s]}" name="{s}">', f"\t\t\t<x>{120 + 150 * ids[s]}.0</x>", "\t\t\t<y>150.0</y>"]
    if s == t["initial"]:
        L.append("\t\t\t<initial/>")
    if s in t["accepting"]:
        L.append("\t\t\t<final/>")
    L.append("\t\t</state>")
for s in t["states"]:
    for sym in t["symbols"]:
        L += ["\t\t<transition>", f"\t\t\t<from>{ids[s]}</from>", f'\t\t\t<to>{ids[t["transitions"][s][sym]]}</to>',
              f'\t\t\t<read>{t["letters"][sym]}</read>', "\t\t</transition>"]
L += ["\t</automaton>", "</structure>", ""]
out.write_text("\n".join(L), encoding="utf-8")
print(f"wrote {out}")
