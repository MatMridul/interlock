"""Generate bank/executor_table.py from the verified JFLAP model.

Source: `jflap_cli.py export-table policy/finance.jff` (spec 4.6 M2.5).
Usage:  python scripts/gen_executor_table.py          (writes bank/executor_table.py)
        python scripts/gen_executor_table.py --check  (exit 1 if the file is stale)

JFLAP reads one character per symbol, so the model uses letters; LETTERS maps
them back to the spec's symbol names. SINK cells are not emitted: at runtime a
missing cell means REJECT (INV-2) and the session never enters SINK.
"""
import os
import re
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
JFLAP_CLI = os.environ.get("JFLAP_CLI", os.path.join(ROOT, "third_party", "jflap-cli", "jflap_cli.py"))
JFF = os.path.join(ROOT, "policy", "finance.jff")
OUT = os.path.join(ROOT, "bank", "executor_table.py")

SYMBOLS = ["AUTH", "DRAFT", "EDIT", "MFA", "TRANSFER", "CANCEL"]  # spec 4.1 order
LETTERS = {"A": "AUTH", "D": "DRAFT", "E": "EDIT", "M": "MFA", "T": "TRANSFER", "C": "CANCEL"}
SINK = "SINK"

HEADER = '''# GENERATED, DO NOT EDIT.
# Source: policy/finance.jff via `jflap_cli.py export-table`; regenerate with
#   python scripts/gen_executor_table.py
# A test fails if regenerating changes this file.
'''


def export_table_text(jff=JFF):
    r = subprocess.run([sys.executable, JFLAP_CLI, "export-table", jff],
                       capture_output=True, text=True, check=True)
    return r.stdout


def parse_export(text):
    """Parse export-table output into (states, initial, accepting, cells).
    cells[(state, symbol_name)] = next_state, one entry per (state, symbol)."""
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
                key = (src, LETTERS[letter])
                assert key not in cells, f"duplicate cell {key}"
                cells[key] = dst
    assert states and initial and accepting, "header lines missing in export-table output"
    assert len(cells) == len(states) * len(SYMBOLS), f"expected a complete table, got {len(cells)} cells"
    return states, initial, accepting, cells


def render(text=None):
    states, initial, accepting, cells = parse_export(text if text is not None else export_table_text())
    assert SINK in states and SINK not in accepting
    live = [s for s in states if s != SINK]
    out = [HEADER, f"STATES = {tuple(live)!r}", f"SYMBOLS = {tuple(SYMBOLS)!r}",
           f"INITIAL = {initial!r}", f"ACCEPTING = {tuple(accepting)!r}",
           "", "# TABLE[state][symbol] = next state. Missing cell = undefined = REJECT.", "TABLE = {"]
    for s in live:
        row = ", ".join(f"{sym!r}: {cells[(s, sym)]!r}" for sym in SYMBOLS if cells[(s, sym)] != SINK)
        out.append(f"    {s!r}: {{{row}}},")
    out.append("}")
    return "\n".join(out) + "\n"


def main():
    text = render()
    if "--check" in sys.argv:
        with open(OUT) as f:  # text mode: tolerate CRLF checkouts (autocrlf)
            sys.exit(0 if f.read() == text else 1)
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w", newline="\n") as f:
        f.write(text)
    print("wrote", OUT)


if __name__ == "__main__":
    main()
