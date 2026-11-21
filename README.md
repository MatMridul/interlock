# Interlock

*The Chimeric Automaton.* Kiroween 2026, Frankenstein category. An interlock stops a dangerous action unless the conditions for it are met; this one does that for AI agent actions.

DRAFT README for owner review.

- An LLM agent (Strands Agents SDK, Amazon Bedrock) proposes tool calls for a money-transfer workflow: log in, draft, edit, approve, transfer, cancel.
- A deterministic Gate decides which proposals run. The allowed order is a 5-state machine authored and checked in JFLAP 7.1.
- At runtime the Gate uses a Python table generated from the JFLAP model, tested equal to it. JFLAP does not run at runtime.
- The approval step (MFA) is done by a human through an HTTP endpoint. The model has no tool for it.
- The repo includes an Instrument-style UI (custom SVG stage), Python and UI test suites (counts and commands: [TEST_COUNTS.md](docs/reports/TEST_COUNTS.md)), and the reports that record what was and was not checked.

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

Reports: [SPEC_GATE_v2.md](SPEC_GATE_v2.md), [docs/reports/](docs/reports/README.md) (verification, executor, Strands, backend, UI build and hardening reports; test counts in [TEST_COUNTS.md](docs/reports/TEST_COUNTS.md)).

| ID | Invariant | Covered by |
| :-- | :-- | :-- |
| INV-1 | Only accepted sequences run; only `gate.py` imports real tools | `test_only_gate_imports_real_tools`, S1 to S5, replay |
| INV-2 | Undefined transition rejects | `test_inv2_undefined_cell_rejects_and_is_noop` (16 cells) |
| INV-3 | Executor equals JFLAP | `tests/test_replay_m5.py`, `tests/test_gen_table.py` |
| INV-4 | Unknown tool cannot run | `test_inv4_bad_symbol_rejects`, `test_inv4_unknown_tool_name_has_no_symbol` |
| INV-5 | Model can act only through the checker | `tests/test_strands_agent.py` |
| INV-6 | State changes only by accepted transition | `test_inv6_*` |
| INV-7 | Model is deterministic and complete, only SINK is dead | JFLAP `inspect` (docs/reports/VERIFICATION_REPORT.md 2.1), not a pytest test |
| INV-8 | Rejections carry a reason | 16-cell tests, Hypothesis runs |
| INV-9 | Argument limits | `tests/test_guard_s9.py` |
| INV-10 | Latencies are measured | `test_latency_absent_when_no_measurement` |
| INV-11 | MFA is human only | `test_inv11_*`, `test_mfa_wrong_code_403_and_state_unchanged` |
| INV-12 | Checker failure is fail-closed | `test_inv12_*` |

Also: M1 exhaustive check of table, ordering rules and regex over all 2,015,539 strings up to length 8 (0 mismatches); 96 of 96 table mutants killed; 12 gate mutants with one survivor that led to property X1.

<!-- quick-start:begin (maintained by the hardening task; the final README may replace this block) -->
## Quick start (Windows, macOS, Linux)

Needs Python 3.10+ (CI uses 3.12) and, for the UI, Node 20+. The JFLAP-based checks and tests also need a JDK (11+); JFLAP 7.1 and `jflap-cli` are vendored in `third_party/`.

```
python scripts/setup.py          # creates .venv, installs requirements.txt, builds the UI (add --no-ui to skip)
```

Start the server (bound to 127.0.0.1; `STUB=1` uses a canned model, so no AWS account is needed):

```
# macOS / Linux
STUB=1 .venv/bin/python -m uvicorn server.app:app --host 127.0.0.1 --port 8000

# Windows (PowerShell)
$env:STUB = "1"; .venv\Scripts\python -m uvicorn server.app:app --host 127.0.0.1 --port 8000
```

Open `http://127.0.0.1:8000`. The human approval (MFA) code is a random 6-digit number printed once on the server console; set `DEMO_MFA_CODE` to choose your own. Real model calls need AWS credentials from the standard boto3 chain and Bedrock model access (`AWS_REGION`, `BEDROCK_MODEL_ID`; defaults `ap-south-1`, `global.amazon.nova-2-lite-v1:0`). UI dev server: `cd ui && npm run dev` (127.0.0.1:5173, proxies to :8000). `INTERLOCK_ENV=production` refuses to start unless `DEMO_MFA_CODE` is set.

## Verify

Commands and the last recorded results per suite are in [docs/reports/TEST_COUNTS.md](docs/reports/TEST_COUNTS.md). In short:

```
python -m pytest -q --ignore=tests/test_mutation_m3.py --ignore=tests/test_replay_m5.py   # fast subset
python -m pytest -q tests/test_mutation_m3.py tests/test_replay_m5.py                     # slow, needs Java
python scripts/gen_executor_table.py --check                                              # table freshness
cd ui && npm test && npm run build                                                        # UI tests and build
```

Set `JFLAP_CLI` to use a different `jflap_cli.py` than the vendored one.
<!-- quick-start:end -->
## Honest non-guarantees

- The model's text is not checked; the UI shows the gate's executed log.
- Argument correctness beyond the guard is not checked. A wrong but well-formed policy is enforced faithfully.
- Lengths above 8 are sampled, not exhaustive, in M1; JFLAP equivalence covers all lengths between the two JFLAP models only.
- Gate concurrency was not stress-tested; INV-6 and INV-1 rest partly on AST tests (static).
- The recorded real-model run used Amazon Nova 2 Lite, not Claude (Claude was blocked by the Bedrock use-case form). One run per prompt; not a statistic.
- Demo only: in-memory sessions, no auth on session endpoints, a shared demo MFA code.
- Browser checks covered only the stub-model flow.

## Third-party and provenance

Every dependency, bundled asset (JFLAP 7.1, `jflap-cli`, fonts), model and service, with the license text or metadata it was read from, is in [THIRD_PARTY.md](THIRD_PARTY.md). It also records which parts pre-date this repository (JFLAP 7.1; `jflap-cli`, first commit 2026-11-13) and what was built after this repository's first commit (2026-11-15).

## Roadmap

A second policy for an AWS change-approval agent (snapshot, plan, approval, then deploy or delete). The engine loads a table from a JFLAP model, so this is a new model and tool set; it has not been started. Deployment of a public URL is also open.

## License

Not chosen yet (owner to decide).
