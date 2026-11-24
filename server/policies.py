"""C7: read-only policy endpoint for the UI policy picker.

GET /policies/finance and GET /policies/safe_ship return the generated machine table. safe_ship also
carries the RECORDED Kiro CLI run (docs/evidence/safe_ship_live_decisions.jsonl) so the browser can replay
Kiro's own push being refused. Nothing runs here: no hook, no model, no session. The files are read only.
"""
import json
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

ROOT = Path(__file__).resolve().parent.parent
TABLES = {"finance": ROOT / "policy" / "finance_table.json", "safe_ship": ROOT / "policy" / "safe_ship_table.json"}
DECISIONS = ROOT / "docs" / "evidence" / "safe_ship_live_decisions.jsonl"
RECORDED_LABEL = "recorded Kiro CLI 3.5.0 run, 2026-11-22"  # date and CLI version: docs/evidence/safe_ship_live_recheck.md

# What the agent did at each PreToolUse call, in order (docs/evidence/safe_ship_live_recheck.md, steps 1 to 7).
# The decisions file records tool name, exit code and message; the action text comes from that table.
STEPS = [
    ("EDIT", "edit app.py"),
    ("COMMIT", "git add -A && git commit -m edit1"),
    ("PUSH", "git push origin main"),
    ("TEST", "python -m pytest -q"),
    ("PUSH", "git push origin main"),
    ("EDIT", "edit app.py back"),
    ("PUSH", "git push origin main"),
]


def recorded_run(table):
    """Pair each recorded PreToolUse decision with its action and replay it through the table."""
    rows = [json.loads(x) for x in DECISIONS.read_text(encoding="utf-8").splitlines() if x.strip()]
    pre = [d for d in rows if d["phase"] == "pre"]
    if len(pre) != len(STEPS):
        raise ValueError(f"expected {len(STEPS)} recorded decisions, found {len(pre)}")
    q, out = table["initial"], []
    for i, (d, (symbol, action)) in enumerate(zip(pre, STEPS), 1):
        refused = d["exit"] != 0
        n = table["transitions"][q][symbol]
        if refused != (n == "SINK"):  # the recording and the table must agree, else the data is wrong
            raise ValueError(f"step {i}: recorded exit {d['exit']} disagrees with the table")
        out.append({"n": i, "symbol": symbol, "action": action, "tool": d["tool"], "refused": refused,
                    "message": d["msg"], "from": q, "to": q if refused else n})
        q = q if refused else n
    return {"label": RECORDED_LABEL, "source": "docs/evidence/safe_ship_live_decisions.jsonl", "steps": out}


def add_routes(app: FastAPI, read_limited=lambda request: None):
    @app.get("/policies/{name}")
    def policy_by_name(name: str, request: Request):
        limited = read_limited(request)
        if limited:
            return limited
        path = TABLES.get(name)
        if path is None:
            return JSONResponse({"detail": "unknown policy"}, status_code=404)
        table = json.loads(path.read_text(encoding="utf-8"))
        out = {"policy": table}
        if name == "safe_ship":
            out["recorded"] = recorded_run(table)
        return out
