# BACKEND_REPORT

Item it_7671d978. Argument guard (INV-9, S9) and FastAPI backend with SSE. Not committed, not pushed. Spec files untouched.

## Files

New:
- `bank/guard.py`: `GuardConfig` (all demo limits in one place: payees Alice/Bob/Carol/Electric Co, cap 5000, 3 transfers, 5 consecutive rejects) and `Guard` (validation plus counters).
- `server/config.py` (DEMO_MFA_CODE default, CORS origin, 2000-char cap, 50 sessions, engine name), `server/session.py` (`ObservedGate`, `Session`, `Registry`, SSE stream), `server/app.py` (routes).
- `tests/test_guard_s9.py` (51 tests), `tests/test_server_api.py` (19 tests).
- `scripts/smoke_api.py` (manual real-model smoke test), `requirements.txt` (pins: fastapi 0.165.0, starlette 1.10.0, pydantic 2.14.4, uvicorn 0.54.0, httpx 0.28.1, plus existing packages).

Changed:
- `bank/gate.py` (minimal, see below), `agent/factory.py` (hook passes the tool args to `peek` and reports its refusals to the gate), `agent/bedrock.py` (defaults now `global.amazon.nova-2-lite-v1:0` / `ap-south-1`, override with `BEDROCK_MODEL_ID` and `AWS_REGION`).

### Changes to `bank/gate.py` and why
1. `Gate(table, tools, guard=None)`. `guard=True` (or a `GuardConfig`) turns the guard on. **Default is off**: the existing tests call `DRAFT` with `{}` or payee `"x"` and `EDIT` with 9000, which the guard rightly rejects. Keeping the default off keeps those tests and behavior unchanged. The server always builds gates with `guard=True`. Risk: a caller who forgets `guard=True` gets no argument guard. The server is the only production caller.
2. `run` is split into `run` (lock + retry counting) and `_run` (old logic). In `_run`, after the table accepts and before the tool runs: locked check, `guard.check`, and for TRANSFER the args are replaced by the stored latest DRAFT/EDIT. Counters update only after the tool ran and the state committed.
3. `peek(..., args=None)` also applies the guard checks (read-only). `note_rejected_proposal()` lets the hook layer count its refusals toward the retry limit (otherwise the hook would catch almost every bad proposal first and the lock would never trigger). `guard_state()` exposes counters.

Guard rejections use the same four fields plus `reason`, and change no state. Reasons: `payee not in allow-list`, `amount must be a number`, `amount must be finite`, `amount must be positive`, `amount has more than 2 decimals`, `amount above spend cap`, `transfer limit reached`, `session locked`.

## Commands

```
cd <repo root>
.venv\Scripts\python -m pip install -r requirements.txt
.venv\Scripts\python -m pytest -q                      # full suite
# run the server, localhost only (real Bedrock; model/region from env, defaults Nova 2 Lite / ap-south-1)
.venv\Scripts\python -m uvicorn server.app:app --host 127.0.0.1 --port 8000
# optional env: DEMO_MFA_CODE, CORS_ORIGIN (default http://localhost:3000), BEDROCK_MODEL_ID, AWS_REGION
# manual smoke test (about 2 Bedrock calls)
.venv\Scripts\python scripts\smoke_api.py
```

## API

| Method and path | Body | Result |
| :-- | :-- | :-- |
| POST `/session` | none | `{"session_id"}` |
| POST `/session/{id}/chat` | `{"message"}` (1 to 2000 chars) | SSE stream; 404 unknown session, 409 if a turn is running, 422 invalid |
| GET `/session/{id}/state` | none | `{id, state, executed_log, counters}` |
| POST `/session/{id}/mfa` | `{"code"}` | human only. Right code: gate runs `MFA` with `source='human'` set in server code, returns `{verdict, state[, reason]}`. Wrong code: 403, no state change. The code is never echoed. |

Extra body fields (for example `source`) are ignored by the models. No tool or endpoint lets the model reach MFA.

## SSE events

`user_message {text}`, `tool_proposed {name, args}`, `gate_verdict {verdict, state, symbol, expected_symbols, reason (REJECT), source: "gate"|"hook", actor, latency_ms, engine}`, `state_change {from, to}`, `assistant_text {text}`, `error {message}` (only on agent failure, no trace), `done {state}`.

`latency_ms` (time.perf_counter around the decision, ms) and `engine: "executor-table"` appear only when a measurement exists (INV-10; tested). ACCEPT verdicts carry no `expected_symbols`. For MFA-less proposals the model-side `expected_symbols` hides MFA (human-only).

Real example (smoke test, real Nova 2 Lite):
```
event: tool_proposed
data: {"name": "authenticate_user", "args": {}}

event: gate_verdict
data: {"verdict": "ACCEPT", "state": "AUTHED", "symbol": "AUTH", "source": "gate", "actor": "llm", "latency_ms": 0.0452, "engine": "executor-table"}

event: state_change
data: {"from": "START", "to": "AUTHED"}
```

## Tests (all run, all passing)

Test groups added here: `tests/test_guard_s9.py` (S9, boundaries, bad types, lock, Hypothesis, mutants) and `tests/test_server_api.py` (API, SSE, INV-10, hygiene, 4.7 e2e). Counts per suite: [TEST_COUNTS.md](TEST_COUNTS.md).

`test_s9_argument_caps` covers cap-0.01, cap, cap+0.01, transfers 3 and 4, retry exhaustion and lock. Other tests cover bad payee/amount types (None, bool, strings, NaN, inf, 3 decimals), stored-draft TRANSFER (model-supplied args ignored), EDIT voiding MFA, and two Hypothesis tests (random arguments never give an executed TRANSFER above the cap, off the list, or a 4th). End-to-end test `test_e2e_section_4_7_accept_traces_through_api` replays the nine 4.7 accept traces (stub model plus human `/mfa`); every one ended with the expected executed log, no rejects. Final states: A/ADMT/ADEMT/ADMEMT/ADMC/ADMTDMT/ADEEMEEMT end AUTHED, AD DRAFTED, ADM APPROVED; e.g. ADMTDMT executed `AUTH DRAFT MFA TRANSFER DRAFT MFA TRANSFER`, transfers=2.

## Guard mutants (all killed)

| Mutant | Killed by |
| :-- | :-- |
| M-G1 cap check removed | `s9_checks` (cap+0.01 accepted) and the Hypothesis-property check |
| M-G2 off-by-one on transfer count (4th allowed) | `s9_checks` and the many-transfers property |
| M-G3 payee check removed | `s9_checks` (payee `Mallory`) |

Run as `test_guard_mutants_are_killed[...]` (3) plus `test_guard_mutants_killed_by_hypothesis_too`; the unmutated guard passes the same checks.

## Smoke test (real model)

`scripts/smoke_api.py`: server bound to 127.0.0.1:8765, one session, one chat message "Please log me in.", Nova 2 Lite in ap-south-1 (defaults). HTTP 200; events user_message, tool_proposed(authenticate_user), gate_verdict ACCEPT (0.0452 ms, executor-table), state_change START to AUTHED, assistant_text "You are now logged in. What can I do for you?", done. State ended AUTHED, log `[AUTH]`. Server stopped.

**Bedrock calls in this item: 2** (confirmed by 2 `smoke_api` lines in `scripts/bedrock_calls.log`). All automated tests use the stub model.

## Honest limits

- Guard is off by default in `Gate()` (see above); the server turns it on. A test pins the legacy behavior.
- Hook refusals count toward the retry limit through `note_rejected_proposal`, but the lock itself is enforced by the gate.
- A gate-layer REJECT (source `gate`) is rare through the agent because the hook peeks first; it is tested directly on `ObservedGate`.
- In-memory, single process, no auth on `/session` or `/state`; the demo MFA code is a shared constant. Session ids are random 128-bit but not secret-managed.
- If the client disconnects mid-stream the agent turn still finishes in its worker thread.
- Only one real chat message was run against Bedrock; model behavior on multi-step flows through the API was not exercised live.
- The allow-list payees and 4.7 trace amounts are demo values. Amounts are floats (2-decimal check uses the shortest repr).
- No UI, deployment, AgentCore or Docker (out of scope).
