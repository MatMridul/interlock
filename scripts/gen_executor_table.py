"""Generate each policy's executor table from its verified JFLAP model.

Source: `jflap_cli.py export-table policy/<name>.jff` (spec 4.6 M2.5).
One verified engine, two policies:
  finance    policy/finance.jff    -> bank/executor_table.py
  safe_ship  policy/safe_ship.jff  -> safeship/executor_table.py
Usage:  python scripts/gen_executor_table.py [--policy NAME]          (default: all; writes the files)
        python scripts/gen_executor_table.py [--policy NAME] --check  (exit 1 if a file is stale)

JFLAP reads one character per symbol, so the model uses letters; the "letters" field of
policy/<name>_table.json maps them back to symbol names (and fixes the symbol order).
SINK cells are not emitted: at runtime a missing cell means REJECT (INV-2) and the
session never enters SINK.
"""
import json
import os
import re
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
JFLAP_CLI = os.environ.get("JFLAP_CLI", os.path.join(ROOT, "third_party", "jflap-cli", "jflap_cli.py"))
POLICIES = {  # name -> (JFLAP model, JSON source, generated file), relative to the repo root
    "finance": ("policy/finance.jff", "policy/finance_table.json", "bank/executor_table.py"),
    "safe_ship": ("policy/safe_ship.jff", "policy/safe_ship_table.json", "safeship/executor_table.py"),
}


def _abs(policy, i):
    return os.path.join(ROOT, *POLICIES[policy][i].split("/"))


JFF = _abs("finance", 0)   # defaults: the finance policy (tests import these names)
OUT = _abs("finance", 2)
SINK = "SINK"

HEADER = '''# GENERATED, DO NOT EDIT.
# Source: {jff} via `jflap_cli.py export-table`; regenerate with
#   python scripts/gen_executor_table.py
# A test fails if regenerating changes this file.
'''


def policy_symbols(policy="finance"):
    """(symbols in spec order, letter -> symbol name) from the policy's JSON source."""
    with open(_abs(policy, 1), encoding="utf-8") as f:
        j = json.load(f)
    return list(j["symbols"]), {letter: sym for sym, letter in j["letters"].items()}


def export_table_text(jff=JFF):
    r = subprocess.run([sys.executable, JFLAP_CLI, "export-table", jff],
                       capture_output=True, text=True, check=True)
    return r.stdout


def parse_export(text, policy="finance"):
    """Parse export-table output into (states, initial, accepting, cells).
    cells[(state, symbol_name)] = next_state, one entry per (state, symbol)."""
    symbols, letters = policy_symbols(policy)
    states = initial = accepting = None
    cells = {}
    for line in text.splitlines():
        if line.startswith("States"):
            states = [s.strip() for s in line.split(":", 1)[1].split(",")]
        elif line.startswith("Start"):
            initial = line.split(":", 1)[1].strip()
        elif line.startswith("Accepting"):
            accepting = [s.strip() for s in line.split(":", 1)[1].split(",")]
        else:
            m = re.match(r"^(\w+)\s*\|\s*->\s*\|\s*(\w+)\s*\|\s*'(\w)'\s*$", line)
            if m:
                src, dst, letter = m.groups()
                key = (src, letters[letter])
                assert key not in cells, f"duplicate cell {key}"
                cells[key] = dst
    assert states and initial and accepting, "header lines missing in export-table output"
    assert len(cells) == len(states) * len(symbols), f"expected a complete table, got {len(cells)} cells"
    return states, initial, accepting, cells


def render(text=None, policy="finance"):
    symbols, _ = policy_symbols(policy)
    if text is None:
        text = export_table_text(_abs(policy, 0))
    states, initial, accepting, cells = parse_export(text, policy)
    assert SINK in states and SINK not in accepting
    live = [s for s in states if s != SINK]
    out = [HEADER.format(jff=POLICIES[policy][0]), f"STATES = {tuple(live)!r}", f"SYMBOLS = {tuple(symbols)!r}",
           f"INITIAL = {initial!r}", f"ACCEPTING = {tuple(accepting)!r}",
           "", "# TABLE[state][symbol] = next state. Missing cell = undefined = REJECT.", "TABLE = {"]
    for s in live:
        row = ", ".join(f"{sym!r}: {cells[(s, sym)]!r}" for sym in symbols if cells[(s, sym)] != SINK)
        out.append(f"    {s!r}: {{{row}}},")
    out.append("}")
    return "\n".join(out) + "\n"


def main():
    names = [sys.argv[sys.argv.index("--policy") + 1]] if "--policy" in sys.argv else list(POLICIES)
    stale = False
    for name in names:
        text, out = render(policy=name), _abs(name, 2)
        if "--check" in sys.argv:
            with open(out) as f:  # text mode: tolerate CRLF checkouts (autocrlf)
                stale = stale or f.read() != text
            continue
        os.makedirs(os.path.dirname(out), exist_ok=True)
        with open(out, "w", newline="\n") as f:
            f.write(text)
        print("wrote", out)
    if "--check" in sys.argv:
        sys.exit(1 if stale else 0)


if __name__ == "__main__":
    main()
