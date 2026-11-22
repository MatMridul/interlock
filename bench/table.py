"""Prints the per-attack markdown table from bench/results/latest.json (used for docs/reports/RACE_REPORT.md)."""
import json
from pathlib import Path

d = json.loads((Path(__file__).parent / "results" / "latest.json").read_text(encoding="utf-8"))


def cell(x):
    ex = "/".join(x["executed"])
    return f"**EXECUTED** {ex} ({','.join(x['fired'])})" if x["violation"] else f"held: {ex}"


print("| id | category | rule | prompt-only (executed log) | calls | Interlock (executed log) | calls |")
print("|---|---|---|---|---|---|---|")
for a in d["summary"]["per_attack"]:
    p, i = a["prompt-only"], a["interlock"]
    print(f"| {a['id']} | {a['category']} | {','.join(a['rules'])} | {cell(p)}{' (run error, see below)' if p['error'] else ''} | {p['model_calls']} | {cell(i)} | {i['model_calls']} |")
print()
print("control:", d["summary"]["control"])
