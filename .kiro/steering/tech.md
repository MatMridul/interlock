---
inclusion: always
---

# Tech stack and repo rules

- Python 3.12, Strands Agents SDK 1.65.0, Amazon Bedrock (defaults `global.amazon.nova-2-lite-v1:0`, `ap-south-1`; override `BEDROCK_MODEL_ID`, `AWS_REGION`), FastAPI + uvicorn, Hypothesis + pytest. Pins in `requirements.txt`.
- UI in `ui/`: Vite, React 19, TypeScript, `@xyflow/react`, Vitest. FastAPI serves `ui/dist`.
- JFLAP 7.1 through `jflap-cli` (vendored in `third_party/jflap-cli`; MCP binding in `.kiro/settings/mcp.json`).

## Rules
1. `bank/executor_table.py` is GENERATED. Never hand-edit it. Change `policy/finance_table.json`, run `python scripts/gen_jff.py`, then regenerate with `python scripts/gen_executor_table.py` (check with `--check`).
2. Only `bank/gate.py` may import `bank/real_tools.py`. `tests/test_gate_basic.py::test_only_gate_imports_real_tools` enforces it by AST scan.
3. `Gate._state` is written only in `__init__` and `_commit`.
4. MFA has no model tool. `source="human"` is set only by server code.
5. Tests never call Bedrock. Use `tests/stubmodel.py`. Real calls are manual and logged in `scripts/bedrock_calls.log`.
6. Do not weaken or edit an assertion to make a test pass; fix the code or ask.

## Policies: how they are generated and verified
One engine (`bank/gate.py`, class `Gate`), two policies. Each policy is data plus a generated table:
- `finance`: `policy/finance_table.json` -> `scripts/gen_jff.py` -> `policy/finance.jff` -> `bank/executor_table.py`
- `safe_ship`: `policy/safe_ship_table.json` -> `scripts/gen_jff.py policy/safe_ship_table.json policy/safe_ship.jff` -> `safeship/executor_table.py`
Generate both tables with `python scripts/gen_executor_table.py` (`--policy NAME` for one, `--check` to test freshness). Never hand-edit `safeship/executor_table.py` either.
Verification, same method for both: exhaustive check against an independent rule scan (`tests/test_sm_exhaustive.py`, `tests/test_safe_ship_machine.py`), every single-cell mutant killed or proven equivalent, JFLAP inspect and equivalence through `third_party/jflap-cli`. The Safe Ship hook (`safeship/hook.py`) calls `Gate`; it must not carry its own table logic. Its hooks in `.kiro/hooks/safe-ship.json` stay `enabled: false`; turn on locally with `python scripts/safe_ship.py enable`. The `gate-verifier` agent (`.kiro/agents/`) runs these checks read-only.

## Run the tests (from the repo root, Windows)
```
.venv\Scripts\python -m pytest -q                 # whole suite, about 1 to 2 minutes
.venv\Scripts\python -m pytest tests\test_sm_exhaustive.py tests\test_sm_mutation.py -q   # about 3 s
cd ui; npm ci; npm test; cd ..                    # UI tests
```
