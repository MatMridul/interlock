# Bedrock guardrails at judge scale

Scope: the only expected users are a handful of hackathon judges, but the URL is public. So real-model use is locked behind a judge access code and capped small. No Bedrock Guardrails product is used (not needed, adds cost). Nothing here was run against real Lambda or real Bedrock; see "Not verified".

## Every limit

All counters are items in the one DynamoDB table (the in-memory store locally), updated with a conditional write, so they hold across Lambda instances. "Shared" means that. Every cap is an env var, set from a template parameter where one exists. Test file `T` = `tests/test_judge_limits.py`.

| Limit | Value | Where enforced | Shared or per instance | Resets | Test |
| :-- | :-- | :-- | :-- | :-- | :-- |
| Model calls, all visitors, per day | 100 (`DailyModelCap`, `INTERLOCK_DAILY_MODEL_CAP`) | `ModelCap.take` before each model call (Strands `BeforeModelCallEvent` hook) and `ModelCap.blocked` before a chat starts, `server/modelcap.py` | Shared | 00:00 UTC | `T::test_each_cap_refuses_with_its_own_message[...DAILY...]`, `T::test_caps_hold_across_instances`, `tests/test_store.py::test_cap_stops_model_calls_and_says_so` |
| Model calls, all visitors, per month | 1,500 (`MonthlyModelCap`, `INTERLOCK_MONTHLY_MODEL_CAP`) | same | Shared | 1st of the month, 00:00 UTC | `T::test_each_cap_refuses_with_its_own_message[...MONTHLY...]`, `T::test_month_counter_is_separate_and_survives_the_day` |
| Model calls per client address per day | 40 (`PerIpDailyModelCap`, `INTERLOCK_IP_DAILY_MODEL_CAP`) | same; the address comes from the Function URL request context (`INTERLOCK_TRUST_PROXY=lambda`) | Shared | 00:00 UTC | `T::test_each_cap_refuses_with_its_own_message[...IP...]` |
| Model calls per chat session | 25 (`PerSessionModelCap`, `INTERLOCK_SESSION_MODEL_CAP`) | same | Shared | When the visitor resets the session (new session id). The per-address cap bounds that. | `T::test_each_cap_refuses_with_its_own_message[...SESSION...]` |
| Model calls per chat turn | 4 (`INTERLOCK_TURN_MODEL_CALLS`) | hook in `ModelCap.attach` counts calls since the turn began and raises; the turn ends with an error event and a `done` event | Per turn, in the instance running it | Next message | `T::test_turn_limit_stops_the_turn_cleanly` |
| Live race runs per address per day | 5 (`RACE_IP_DAILY_RUNS`) | `POST /race/live`, `server/race.py` | Shared | 00:00 UTC | `T::test_race_live_runs_are_limited_per_address` |
| Output tokens per model call | 300 | `make_bedrock_model(max_tokens=300)`, `agent/bedrock.py` (existing) | Fixed in code | n/a | not tested here (needs a real model); value read from the code |
| Input message length | 2,000 characters | request validation, `ChatBody`, `server/config.py` (existing) | Fixed in code | n/a | `T::test_defaults_are_judge_sized` (value), `tests/test_server_api.py` (422 on longer) |
| Chat history sent to the model | last 8 messages (`INTERLOCK_HISTORY_MESSAGES`) | Strands `SlidingWindowConversationManager` set in `build_agent`, `agent/factory.py` | Per instance (history lives in the instance; known shortcut in `server/persist.py`) | n/a | `T::test_history_sent_to_the_model_is_trimmed_to_8` |
| Wrong judge codes | 5 per address per 15-minute window, then that address is locked until the window ends (at most 15 minutes) | `Judge.check`, `server/judge.py` | Shared | End of the 15-minute window | `T::test_wrong_codes_lock_out_that_ip_only`, `T::test_lockout_ends_with_the_window`, `T::test_wrong_code_counts_are_shared_across_instances` |
| Wrong MFA codes per address | 20 per 10-minute window (existing numbers, `config.MFA_CLIENT_MAX_WRONG`) | `POST /session/{id}/mfa`, `server/app.py` | Shared (was per instance) | End of the 10-minute window | `T::test_wrong_mfa_codes_per_address_are_shared_across_instances` |
| Wrong MFA codes per session | 5, then 5 minutes locked (existing) | `Limiter` + `StoredRegistry` | Shared (existing, stored with the session) | 5 minutes | `tests/test_store.py`, `tests/test_server_limits.py` |
| Cheap request rates (30 per minute per address per endpoint) | unchanged | `Limiter`, `server/limits.py` | Per instance (left as is: they do not spend money) | rolling minute | `tests/test_server_limits.py` |
| Model on or off | `INTERLOCK_MODEL` (`Mode`, default bedrock) | `modelcap.model_mode()`, chat and race routes | Per deployment | on redeploy or kill switch | `tests/test_store.py::test_model_off_blocks_chat_without_touching_a_model`, `T::test_missing_env_fails_closed` |

Ordering note: a call is checked against session, address, day, month, in that order. The counters are separate items, so a call refused by a later cap has already used one unit of the earlier ones. That over-counts slightly and never under-counts.

When a cap is hit the server answers with a plain message naming the limit and its reset (for example "The daily limit of real-model calls is used up (100 per UTC day, all visitors). It resets at 00:00 UTC. Use 'you' mode meanwhile."). Before a chat starts this is HTTP 429; inside a turn it is an `error` SSE event followed by `done`. The UI shows it and switches to "you" mode (`ui/src/test/unlock.test.tsx`).

## Unlock design

- Locked features: agent chat with the model, live race runs, model-mode Autoplay (it sends chat messages). Open without a code and with zero model calls: "you are the agent" mode, scripted attack vectors, "you"-mode Autoplay, recorded race replay, Safe Ship view, proof drawer.
- The code is `JUDGE_ACCESS_CODE` (template parameter `JudgeAccessCode`, `NoEcho`). Unset or empty means the lock never opens (fail closed), also with `STUB=1` locally (`T::test_missing_env_fails_closed`, `T::test_empty_env_fails_closed`). With `STUB=1` and the variable set, the same code unlocks.
- The UI shows "Unlock live model (judges)" (`ui/src/components/Unlock.tsx`). The code is checked by `POST /judge/unlock`, kept in the tab's `sessionStorage` only (not `localStorage`), sent in the `X-Judge-Code` header on chat and live-race requests, and never rendered.
- Server side: constant-time compare (`hmac.compare_digest` on SHA-256 digests), never stored, never echoed, never logged. A request with no code is refused without counting as a wrong guess. A right code during a lockout is also refused. The demo MFA code for the human key is a separate secret and unchanged.
- Tests: `T::test_right_code_unlocks_and_is_never_echoed`, `T::test_locked_without_a_code_and_open_features_need_none`, UI tests in `ui/src/test/unlock.test.tsx` (locked start, wrong code, right code kept in `sessionStorage` not `localStorage`, fallback to "you" mode on a cap).
- The judge finds the code in the Devpost judges-only testing field (the owner enters it there; it is in no file in this repository).

## Kill switch

`INTERLOCK_MODEL=off` stops every model call at once. `aws lambda update-function-configuration --environment` replaces the whole environment, so use the script, which reads the current environment and changes only `INTERLOCK_MODEL`:

```powershell
.\infra\model_switch.ps1 off          # or: ./infra/model_switch.sh off   (needs jq)
.\infra\model_switch.ps1 on           # back to bedrock
.\infra\model_switch.ps1 off -DryRun  # shows the change, writes nothing, never prints values
```

The raw command and its warning are in `DEPLOY_PLAN.md` section 6. A later stack deploy resets the variable to the `Mode` parameter. Tests: `tests/test_model_switch.py` (dry run, only `INTERLOCK_MODEL` changes, other variables kept, empty environment refused). The AWS Budgets alert stays as planned; no CloudWatch alarm was added.

## Cost at these caps

Worst case is 1,500 calls a month (the monthly cap) times about 300 output tokens plus the input of each call. Token prices must be read on the Bedrock pricing page for Nova 2 Lite in ap-south-1; none is quoted here. Reaching the worst case needs the judge code.

## Not verified

- Real Lambda: nothing was deployed. The template passes `aws cloudformation validate-template` and `cfn-lint`; the stack was not created.
- Real Bedrock: 0 real calls were made. All tests use the canned stub or a scripted model. The 300-output-token setting and the real token usage per call were not measured. History trimming was tested on the stub, not on tool-heavy real turns.
- Header spoofing: the per-address caps rely on the caller address in the Function URL request context. Behind a Function URL that value is set by AWS, but this was tested only with a made-up header against the local app, not against the real service. If the app were reachable some other way with `INTERLOCK_TRUST_PROXY=lambda`, a client could pick its own address.
- `infra/model_switch.sh` was not run (no `jq` here); `infra/model_switch.ps1` was run in dry-run mode only, with no AWS call. The live `update-function-configuration` call is untested.
- DynamoDB behavior was tested on moto's fake, not real DynamoDB. The conditional counters use the same code path as before.
- Fixed windows: the wrong-code lockout and the MFA window are fixed windows, so up to 2x the count can land around a boundary (see `server/judge.py`).
- Per-session cap: a visitor can reset the session for a new allowance; the per-address and global caps still bound the total.
- A call fails mid-turn at a cap with an error event (the model is stopped, not the bank state); the UI then switches to "you" mode.
- A browser tab that keeps its code in `sessionStorage` sends it on every model request; anyone with the tab can use it until it closes.

## Commits

`git log --oneline origin/demo-fixes..judge-limits` (this file's own commit follows these):

```
8d51e91 Document judge lock and caps
b7f49f8 Add unlock control and fallback
5fddfbf Add kill switch scripts, template params
1c82f63 Test judge code and caps
3c799b4 Add judge code and model caps
```

## Final checks run

`pytest -q --ignore=tests/test_mutation_m3.py --ignore=tests/test_replay_m5.py` 448 passed, 2 skipped (bash and jq missing); `npm test` 134 passed (14 files); `npm run build` ok; `python scripts/secret_scan.py` 0 findings; `python infra/local_proof.py` all PASS; `aws cloudformation validate-template` ok; `cfn-lint infra/template.yaml` no findings.

## Public access update (branch access-and-hardening)

This page was written when the model was code-only. Now a visitor without a code may use the model too, but their calls also count against a public pool: `PublicDailyModelCap` (`INTERLOCK_PUBLIC_DAILY_MODEL_CAP`), default 60 per UTC day, counted inside the 100 per day for everyone. A valid code skips the public pool, so about 40 calls a day stay for judges. A wrong code is refused and counted toward the lockout above, never treated as public. `0` brings back code-only access. Enforced in `ModelCap.take` (check order: session, address, public pool, day, month), tested in `tests/test_public_access.py`. The "Unlock live model (judges)" control is now a small "Judge code" button.
