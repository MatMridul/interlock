# Interlock

*The Chimeric Automaton.* Kiroween 2026, Frankenstein category. Solo entry.

1. An AI agent **proposes** actions (tool calls).
2. A small state machine, checked in JFLAP at build time and enforced at runtime by a generated table, **decides** what runs.
3. A **human holds the only key**: approval (MFA) is an endpoint a person uses, and the model has no tool for it.
4. A forbidden proposal runs nothing and leaves the state unchanged.
5. The same engine guards two policies: a finance transfer, and Kiro's own `git push` ("Safe Ship").

**Race result (one run, one model, no statistical claim).** Against 20 fixed attacks, a prompt-only agent executed a forbidden action in **10 of 20**; Interlock in **0 of 20**. Model: Amazon Nova 2 Lite, one run per attack. The Interlock 0 follows from the gate; the 10 is what this model did on this run and can change. Details and every raw row: [RACE_REPORT.md](docs/reports/RACE_REPORT.md).

- Live demo: **TODO (owner): URL not deployed yet.** Hosting is planned, not built: [DEPLOY_PLAN.md](docs/deploy/DEPLOY_PLAN.md).
- Demo video: **TODO (owner): YouTube link.**
- Judges: start at [docs/JUDGES.md](docs/JUDGES.md) (3-minute path, criteria mapped to files).

Tools are stubs: no network, no money moves.

## Quick start

Needs Python 3.10+ (CI uses 3.12) and, for the UI, Node 20+. The JFLAP-based checks also need a JDK (11+); JFLAP 7.1 and `jflap-cli` are vendored in `third_party/`.

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

Open `http://127.0.0.1:8000`. In the UI:

- **You are the agent** (no model, no AWS): press the attack buttons. The real gate decides. **Autoplay** works here too: a fixed 70 to 80 second script of proposals through the real gate, with no model. It asks you to type the demo code once for the human key step, or to skip that step (then the transfer is refused). With the model on, Autoplay sends real chat messages instead.
- **Policy: finance | safe-ship** in the header. safe-ship shows the second machine, a what-if box, and a replay of the recorded Kiro CLI run where Kiro's own push is refused.
- **Race** replays the recorded 20-attack benchmark. **Proof** shows the receipt for each verdict.

The human approval (MFA) code is a random 6-digit number printed once on the server console; set `DEMO_MFA_CODE` to choose your own. Real model calls need AWS credentials and Bedrock model access (`AWS_REGION`, `BEDROCK_MODEL_ID`; defaults `ap-south-1`, `global.amazon.nova-2-lite-v1:0`); `INTERLOCK_MODEL=off` turns the model off. `INTERLOCK_ENV=production` refuses to start unless `DEMO_MFA_CODE` is set. UI dev server: `cd ui && npm run dev`.

## Architecture

Diagram: [docs/architecture/architecture.html](docs/architecture/architecture.html) (spec: `docs/architecture/architecture.spec.json`, rendered with Archify). Hosting on Lambda and DynamoDB is drawn as planned: nothing is deployed.

```
Browser UI -> FastAPI (SSE chat, /session/{id}/mfa, /race/*, /policies/*) -> Strands agent (5 wrapper tools)
Agent -> BeforeToolCallEvent hook -> Gate.peek (read-only; cancels a disallowed call)
Agent tool body -> Gate.run -> generated executor table -> stub bank tools (only on ACCEPT)
Kiro CLI tool call -> PreToolUse hook (safeship/hook.py) -> the same Gate class, second table
JFLAP 7.1 (build time) -> .jff -> export-table -> scripts/gen_executor_table.py -> generated tables
Agent -> Amazon Bedrock (daily call cap in server/modelcap.py)
```

## The two policies

| Policy | Machine | Enforced on | Doc |
| :-- | :-- | :-- | :-- |
| **finance** (live demo) | START, AUTHED, DRAFTED, APPROVED. Symbols AUTH, DRAFT, EDIT, MFA, TRANSFER, CANCEL. TRANSFER only after a human MFA that follows the latest draft or edit. | The Strands agent's five tools | [SPEC_GATE_v2.md](SPEC_GATE_v2.md), [.kiro/specs/gate](.kiro/specs/gate) |
| **safe_ship** | CLEAN, EDITED, TESTED. Symbols EDIT, TEST, COMMIT, PUSH, DEPLOY. PUSH or DEPLOY only after a passing TEST that follows the last EDIT. | Kiro's own tool calls through a `PreToolUse` hook (off by default, `python scripts/safe_ship.py enable`) | [docs/SAFE_SHIP.md](docs/SAFE_SHIP.md), [.kiro/specs/safe-ship](.kiro/specs/safe-ship) |

Both use `bank.gate.Gate(initial, symbols)`. Tables: `policy/finance_table.json`, `policy/safe_ship_table.json`.

## How verification works

1. **Model checked in JFLAP** (deterministic, complete, minimal, equal to a second machine built from flags): [VERIFICATION_REPORT.md](docs/reports/VERIFICATION_REPORT.md).
2. **Exhaustive check**: table, ordering rules and regex compared on all 2,015,539 strings up to length 8 (finance; 0 mismatches); 488,281 strings for safe_ship (0 mismatches). Tests: `tests/test_sm_*.py`, `tests/test_safe_ship_machine.py`.
3. **Mutation testing**: 96 of 96 finance table mutants killed; 12 gate mutants with one survivor that led to property X1 ([EXECUTOR_REPORT.md](docs/reports/EXECUTOR_REPORT.md)); safe_ship 45 mutants, 40 killed, 5 proven language-equivalent, 0 survivors.
4. **Generated table equals the JFLAP model**: `tests/test_replay_m5.py`, `python scripts/gen_executor_table.py --check` (both policies).
5. **Two enforcement layers** (gate and hook) each shown to block alone: [STRANDS_REPORT.md](docs/reports/STRANDS_REPORT.md).
6. **Benchmark**: [RACE_REPORT.md](docs/reports/RACE_REPORT.md), raw rows in `bench/results/`.
7. CI (`.github/workflows/ci.yml`): fast Python tests, UI tests and build, table freshness, secret scan, dependency audit (report only).

Test counts and commands, measured once and written in one place: [TEST_COUNTS.md](docs/reports/TEST_COUNTS.md). Release integration run: [RELEASE_REPORT.md](docs/reports/RELEASE_REPORT.md).

Run them yourself:

```
python -m pytest -q --ignore=tests/test_mutation_m3.py --ignore=tests/test_replay_m5.py   # fast subset
python -m pytest -q tests/test_mutation_m3.py tests/test_replay_m5.py                     # slow, needs Java
python scripts/gen_executor_table.py --check                                              # table freshness
cd ui && npm test && npm run build                                                        # UI tests and build
```

## What it does not guarantee

- The model's text is not checked; the UI shows the gate's executed log.
- Arguments are checked only by the guard (payee allow-list, amount cap, transfer count). A wrong but well-formed policy is enforced faithfully.
- Lengths above 8 are sampled, not exhaustive. JFLAP equivalence covers all lengths between the two JFLAP models only.
- Gate concurrency was not stress-tested; some invariants rest on static (AST) tests.
- The race is one run, one model (Nova 2 Lite, not Claude: Claude was blocked by the Bedrock use-case form). It is not a statistic.
- **Safe Ship only covers mapped actions.** An unmapped tool or command passes. It guards a cooperative agent's mistakes, not a hostile one. It was observed live on Kiro CLI 3.5.0 only; Kiro IDE and Kiro Crew were not tested.
- Not deployed. Demo only: sessions in memory unless a store is configured, a shared demo MFA code.
- JFLAP is a build-time tool. It does not run at runtime.

## Kiro usage and evidence

- Write-up: [docs/submission/KIRO_WRITEUP.md](docs/submission/KIRO_WRITEUP.md) (specs, steering, hooks, custom agent, MCP, powers, how it was built).
- `.kiro/`: [specs](.kiro/specs), [steering](.kiro/steering), [hooks](.kiro/hooks), [agents/gate-verifier.json](.kiro/agents/gate-verifier.json), [settings/mcp.json](.kiro/settings/mcp.json). Power: [powers/jflap](powers/jflap).
- Evidence: [docs/evidence/](docs/evidence/) (Safe Ship live run, gate-verifier runs), [docs/spikes/SAFE_SHIP_SPIKE.md](docs/spikes/SAFE_SHIP_SPIKE.md).
- Reports index: [docs/reports/README.md](docs/reports/README.md).

## Third-party and provenance

Every dependency, bundled asset (JFLAP 7.1, `jflap-cli`, fonts), model and service, with the license text it was read from, is in [THIRD_PARTY.md](THIRD_PARTY.md). It also records what pre-dates this repository (JFLAP 7.1; `jflap-cli`, first commit 2026-11-13) and what was built after its first commit (2026-11-15).

## What is next

Not built: deployment of a public URL (plan and template only), a third policy (AWS change approval), and the post-hackathon ideas in [docs/OPEN_TASKS.md](docs/OPEN_TASKS.md) section 7.

## License

MIT, see [LICENSE](LICENSE).
