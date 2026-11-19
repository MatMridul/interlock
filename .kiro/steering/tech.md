---
inclusion: always
---

# Tech stack and repo rules

- Python 3.12, Strands Agents SDK 1.65.0, Amazon Bedrock (defaults `global.amazon.nova-2-lite-v1:0`, `ap-south-1`; override `BEDROCK_MODEL_ID`, `AWS_REGION`), FastAPI + uvicorn, Hypothesis + pytest. Pins in `requirements.txt`.
- UI in `ui/`: Vite, React 19, TypeScript, `@xyflow/react`, Vitest. FastAPI serves `ui/dist`.
- JFLAP 7.1 through `jflap-cli` (outside this repo; MCP binding in `.kiro/settings/mcp.json`).

## Rules
1. `bank/executor_table.py` is GENERATED. Never hand-edit it. Change `policy/finance_table.json`, run `python scripts/gen_jff.py`, then regenerate with `python scripts/gen_executor_table.py` (check with `--check`).
2. Only `bank/gate.py` may import `bank/real_tools.py`. `tests/test_gate_basic.py::test_only_gate_imports_real_tools` enforces it by AST scan.
3. `Gate._state` is written only in `__init__` and `_commit`.
4. MFA has no model tool. `source="human"` is set only by server code.
5. Tests never call Bedrock. Use `tests/stubmodel.py`. Real calls are manual and logged in `scripts/bedrock_calls.log`.
6. Do not weaken or edit an assertion to make a test pass; fix the code or ask.

## Run the tests (from the repo root, Windows)
```
.venv\Scripts\python -m pytest -q                 # whole suite, about 1 to 2 minutes
.venv\Scripts\python -m pytest tests\test_sm_exhaustive.py tests\test_sm_mutation.py -q   # about 3 s
cd ui; npm ci; npm test; cd ..                    # UI tests
```
