# Interlock

*The Chimeric Automaton.* Kiroween 2026, Frankenstein category. An interlock stops a dangerous action unless the conditions for it are met; this one does that for AI agent actions.

DRAFT README for owner review.

- An LLM agent (Strands Agents SDK, Amazon Bedrock) proposes tool calls for a money-transfer workflow: log in, draft, edit, approve, transfer, cancel.
- A deterministic Gate decides which proposals run. The allowed order is a 5-state machine authored and checked in JFLAP 7.1.
- At runtime the Gate uses a Python table generated from the JFLAP model, tested equal to it. JFLAP does not run at runtime.
- The approval step (MFA) is done by a human through an HTTP endpoint. The model has no tool for it.
- The repo includes an Instrument-style UI (custom SVG stage), 336 Python tests (320 in the fast subset re-run for this README) and 26 UI tests, and the reports that record what was and was not checked.

Tools are stubs: no network, no money moves.

## Why not just prompt guardrails?

A prompt asks the model to behave. A model can ignore or misread it, and a prompt-injected message can argue against it. The Gate does not depend on what the model says: the model can only call five wrapper tools, each wrapper calls `gate.run`, and `gate.run` runs the real function only when the state machine allows that symbol in the current state. The check for "MFA came after the latest edit" is an ordering rule a table can enforce exactly.

This is narrower than it sounds. It checks the order of actions and a few argument limits. It does not check whether the model's words are true, whether a payee is the right one, or whether the policy itself is wise. Guardrail products and prompts can still be useful alongside it. The idea is not new; related work includes AgentSpec, Cedar-style policies and Strands steering (names from memory, unverified). Our angle: the policy is authored and checked in JFLAP and enforced by a generated table with a replay-equivalence test.

## Architecture

Diagram: [docs/architecture/architecture.html](docs/architecture/architecture.html) (spec: `docs/architecture/architecture.spec.json`).

```
Browser UI -> FastAPI (SSE chat, POST /session/{id}/mfa) -> Strands Agent (5 wrapper tools)
Agent -> BeforeToolCallEvent hook -> Gate.peek (read-only; cancels a disallowed call)
Agent tool body -> Gate.run -> generated executor table -> stub real tools (only on ACCEPT)
JFLAP 7.1 (build time) -> finance.jff -> export-table -> scripts/gen_executor_table.py -> bank/executor_table.py
Agent -> Amazon Bedrock
```

Deployment does not exist yet.

## How the gate works

States: START, AUTHED, DRAFTED, APPROVED (and a SINK that only the JFLAP model uses). Symbols: AUTH, DRAFT, EDIT, MFA, TRANSFER, CANCEL.

1. A proposal arrives as a tool call. The hook asks `gate.peek`; a disallowed call is cancelled and the model sees the reason.
2. `gate.run` looks up `(state, symbol)` under a lock. No transition means reject: nothing runs, state does not change.
3. On accept, the argument guard checks payee allow-list, amount cap, transfer count and retry limit. Then the stub tool runs and the state commits.
4. EDIT after MFA voids the approval. After TRANSFER the draft is spent.

Layer 1 (gate) and layer 2 (hook) each block alone; tests prove both.

## The 12 invariants and their tests

Reports: [SPEC_GATE_v2.md](SPEC_GATE_v2.md), [VERIFICATION_REPORT.md](VERIFICATION_REPORT.md), [EXECUTOR_REPORT.md](EXECUTOR_REPORT.md), [STRANDS_REPORT.md](STRANDS_REPORT.md), [BACKEND_REPORT.md](BACKEND_REPORT.md), [UI_REPORT.md](UI_REPORT.md).

| ID | Invariant | Covered by |
| :-- | :-- | :-- |
| INV-1 | Only accepted sequences run; only `gate.py` imports real tools | `test_only_gate_imports_real_tools`, S1 to S5, replay |
| INV-2 | Undefined transition rejects | `test_inv2_undefined_cell_rejects_and_is_noop` (16 cells) |
| INV-3 | Executor equals JFLAP | `tests/test_replay_m5.py`, `tests/test_gen_table.py` |
| INV-4 | Unknown tool cannot run | `test_inv4_bad_symbol_rejects`, `test_inv4_unknown_tool_name_has_no_symbol` |
| INV-5 | Model can act only through the checker | `tests/test_strands_agent.py` |
| INV-6 | State changes only by accepted transition | `test_inv6_*` |
| INV-7 | Model is deterministic and complete, only SINK is dead | JFLAP `inspect` (VERIFICATION_REPORT 2.1), not a pytest test |
| INV-8 | Rejections carry a reason | 16-cell tests, Hypothesis runs |
| INV-9 | Argument limits | `tests/test_guard_s9.py` |
| INV-10 | Latencies are measured | `test_latency_absent_when_no_measurement` |
| INV-11 | MFA is human only | `test_inv11_*`, `test_mfa_wrong_code_403_and_state_unchanged` |
| INV-12 | Checker failure is fail-closed | `test_inv12_*` |

Also: M1 exhaustive check of table, ordering rules and regex over all 2,015,539 strings up to length 8 (0 mismatches); 96 of 96 table mutants killed; 12 gate mutants with one survivor that led to property X1.

## Run locally (Windows, bound to 127.0.0.1)

```
.venv\Scripts\python -m pip install -r requirements.txt
cd ui; npm ci; npm run build; cd ..
$env:DEMO_MFA_CODE = "<choose a demo code>"      # the code typed in the Human approval dialog
# optional: $env:STUB = "1"   (canned model, no Bedrock)
# optional: $env:AWS_REGION, $env:BEDROCK_MODEL_ID   (defaults: ap-south-1, global.amazon.nova-2-lite-v1:0)
.venv\Scripts\python -m uvicorn server.app:app --host 127.0.0.1 --port 8000
```

Open `http://127.0.0.1:8000`. Real model calls need AWS credentials from the standard boto3 chain and Bedrock model access in your account. UI dev server: `cd ui; npm run dev` (127.0.0.1:5173, proxies to :8000).

## Verify

```
.venv\Scripts\python -m pytest -q          # 336 tests collected as of this draft; expected all pass
cd ui; npm test                            # 26 UI tests (Vitest), see docs/ui-v2/UI_BUILD_REPORT.md
```

The last full-suite result recorded in the reports is 334 passed (UI_REPORT.md); the 336 count and a fresh full pass were not re-run (unverified); the fast subset without test_mutation_m3 and test_replay_m5 gives 320 passed. The suite takes 1 to 2 minutes; the JFLAP-based tests need `jflap-cli` and Java (`C:\Users\mridu\jflap-cli` in this setup). Quick check (about 3 s): `pytest tests\test_sm_exhaustive.py tests\test_sm_mutation.py`. Table freshness: `python scripts\gen_executor_table.py --check`.

## Honest non-guarantees

- The model's text is not checked; the UI shows the gate's executed log.
- Argument correctness beyond the guard is not checked. A wrong but well-formed policy is enforced faithfully.
- Lengths above 8 are sampled, not exhaustive, in M1; JFLAP equivalence covers all lengths between the two JFLAP models only.
- Gate concurrency was not stress-tested; INV-6 and INV-1 rest partly on AST tests (static).
- The recorded real-model run used Amazon Nova 2 Lite, not Claude (Claude was blocked by the Bedrock use-case form). One run per prompt; not a statistic.
- Demo only: in-memory sessions, no auth on session endpoints, a shared demo MFA code.
- Browser checks covered only the stub-model flow.

## Third-party

| Item | Use | License |
| :-- | :-- | :-- |
| JFLAP 7.1 (Duke University) | build-time model checking | check; text to be added by owner |
| jflap-cli / JFLAP MCP server | wraps JFLAP; first commit 2026-11-13, pre-existing | check (owner's own project) |
| Strands Agents SDK 1.65.0 | runtime agent | check (believed Apache-2.0, unverified) |
| Amazon Bedrock, Amazon Nova 2 Lite | runtime model (Claude Haiku 4.5 was targeted but blocked) | AWS terms |
| FastAPI, React, React Flow, Vite, Hypothesis, others | see `requirements.txt`, `ui/package.json` | check |

## Roadmap

A second policy for an AWS change-approval agent (snapshot, plan, approval, then deploy or delete). The engine loads a table from a JFLAP model, so this is a new model and tool set; it has not been started. Deployment of a public URL is also open.

## License

Not chosen yet (owner to decide).
