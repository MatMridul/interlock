# Safe Ship spike (D1): can a Kiro hook run Interlock's gate on Kiro's own tool calls?

Date 2026-11-21. Branch `safe-ship-spike` (from `ui-instrument`). Spike only, nothing enabled in `.kiro/hooks/`.

## Verdict: GO

A `PreToolUse` command hook receives the tool name and arguments on STDIN, and exit code 2 with a STDERR message blocks the tool call and shows the message to the agent. This was **verified live on Kiro CLI 3.5.0** (Windows, logged in with Builder ID): the hook refused `git push` after an edit, allowed it after a green test run, and refused it again after another edit. The IDE and Kiro Crew were not run live (see section 8).

## 1. What I found (sources, exact wording under 30 words)

| Fact | Source | Wording relied on / evidence |
|---|---|---|
| Trigger names are PascalCase: `PreToolUse`, `PostToolUse`, `PostFileSave`, `Stop`, `SessionStart`, `PromptSubmit`... (not `FileSave`; the existing repo hook uses `PostFileSave`, which the docs example also uses) | [kiro.dev/docs/hooks](https://kiro.dev/docs/hooks/) | "trigger ... Event that fires the hook (PascalCase - see Hook types)" |
| Pre Tool Use exists in IDE, CLI and Web | [hooks/types](https://kiro.dev/docs/hooks/types/) | support table row "Pre Tool Use": IDE yes, CLI yes, Web yes |
| Purpose | hooks/types | "Triggers when the agent is about to invoke a tool. Can validate and block tool usage." |
| Matcher: tool ID, category (`read`, `write`, `shell`...), `@mcp`, `@<server>`, `@<server>/<tool>`, regex against tool ID, `*` and `?` wildcards in JSON | hooks/types | "The editor checks each entry as a regular expression matched against tool IDs." |
| MCP tool ids are `mcp_<server>_<tool>` in hook events | hooks/types | "V3 Hook events use the sanitized internal tool ID mcp_<server>_<tool>" |
| STDIN fields documented | hooks/types | example with `hook_event_name`, `cwd`, `session_id`, `tool_name`, `tool_input` |
| Blocking by exit code (IDE-wide doc) | [hooks/actions](https://kiro.dev/docs/hooks/actions/) | "any other exit code, the stderr output ... sent to the agent ... Pre Tool Use hook, the tool invocation is blocked" |
| Timeout default | hooks/actions | "The default timeout is 60 seconds. Set to 0 to disable" (field `timeout`, seconds) |
| `enabled: false` skips a hook | hooks | "Set false to skip the hook without deleting it (default: true)" |
| Exit 0 allow, 1 warn, 2 block, stderr to model (CLI v3) | third-party gist (njs14), **not official** | "0 = allow; 1 = allow with user-visible warning; 2 = block, stderr to model." |
| Kiro Crew: Hooks-page PreToolUse hooks fail closed on any non-0/2 exit | third-party mirror of docs with Crew notes (dev-rb-hub/rendu.ai), **not official** | "A gating hook that cannot deliver a verdict resolves to deny" |
| Kiro Crew local docs | `C:\Program Files\KiroCrew\...\docs\steering-and-hooks.md` | grep for PreToolUse / tool_name / exit code 2 found **nothing**. Local docs do not cover this. |
| Real payload | `live_run1_events.log` (this folder) | see section 2 |

Treat the official pages as the contract and the two third-party pages as hints. The live runs settle exit codes for CLI.

## 2. Real payloads (CLI 3.5.0, Windows), from `live_run1_events.log`

```
PreToolUse : {"session_id":"sess_...","hook_event_name":"PreToolUse","cwd":"...","tool_name":"str_replace",
              "tool_input":{"path":"...","oldStr":"x=1","newStr":"x=2","replace_all":false}}
PreToolUse : {... "tool_name":"execute_pwsh","tool_input":{"command":"git status --short","description":null,...}}
PostToolUse: {... same fields ..., "tool_response":"Output:\n M app.py\n...\n\n\nExit Code: 0"}
```

- Tool names seen: `read_file`, `str_replace`, `execute_pwsh` (the shell tool is named per platform; Windows = `execute_pwsh`). `fs_write`, `fs_append`, `execute_bash` are expected from the tool set but were not seen in a hook payload.
- `tool_response` for shell is one string ending `Exit Code: N`, also for a failing command (PostToolUse still fires on failure).
- `session_id` is stable within one run and different across runs (so state keyed by it resets per `kiro-cli chat` invocation).
- Two tool calls issued in one turn fire their hooks about 80 ms apart: hooks run concurrently.

## 3. The machine (`safe_ship_table.json`, same JSON format as `policy/finance_table.json`)

Symbols: `EDIT E`, `TEST T`, `COMMIT C`, `PUSH P`, `DEPLOY D`. States `CLEAN` (start), `EDITED`, `TESTED`, `SINK`; accepting = the three live states.

| state | EDIT | TEST | COMMIT | PUSH | DEPLOY |
|---|---|---|---|---|---|
| CLEAN | EDITED | TESTED | CLEAN | SINK | SINK |
| EDITED | EDITED | TESTED | EDITED | SINK | SINK |
| TESTED | EDITED | TESTED | TESTED | TESTED | TESTED |

Rule: PUSH and DEPLOY are allowed only when the latest EDIT-or-TEST so far is a TEST. **Design choice:** a fresh session starts in CLEAN, which also blocks PUSH. The agent cannot know whether the tree was tested before the session began, so it must run tests first. The relaxed variant (push of untouched work allowed) is one cell: `CLEAN --PUSH--> CLEAN`.

Consequence: `CLEAN` and `EDITED` are language-equivalent (JFLAP minimization goes 4 to 3 states). They stay separate for readability.

## 4. Verification (small scale, same method as the finance machine)

Run: `python docs/spikes/safe-ship/verify_safe_ship.py`, output in `verify_output.txt`.

- Exhaustive over all strings up to length 8 (488,281 incl. empty) against an independent rule scan with no state variable: **0 mismatches**, 93,241 accepted.
- Mutants: 45 single-cell mutants. **40 killed** by a string of length <= 8. **5 survive and are proven language-equivalent** by product-automaton search (all lengths), because CLEAN and EDITED behave the same: `CLEAN-E->CLEAN`, `CLEAN-C->EDITED`, `EDITED-E->CLEAN`, `EDITED-C->CLEAN`, `TESTED-E->CLEAN`. They are not test gaps. 0 real survivors.
- JFLAP (`C:\Users\mridu\jflap-cli`, worked from this worktree): `inspect` = deterministic, complete, alphabet C D E P T; `fsa minimize` 4 to 3 states; `equivalence-check` original vs minimized: EQUIVALENT; vs a mutant where EDIT after TEST does not invalidate: NOT EQUIVALENT, shortest distinguishing string `TED`. Output in `jflap_output.txt`. Generated model: `safe_ship.jff` (via `scripts/gen_jff.py`).
- Not done: the repo's generator `scripts/gen_executor_table.py` is hard-wired to finance (symbols, letters), so no `bank/executor_table`-style file was generated for safe_ship. See effort.

## 5. Prototype (`safe_ship_hook.py`, stdlib only, about 190 lines)

- Reads the hook JSON from STDIN, maps the call to symbols with a closed list, steps the table, keeps per-session state in `%TEMP%\interlock-safe-ship\<sha256(session_id)>.json` (override `SAFE_SHIP_STATE_DIR`), atomic write plus a lock file with stale-lock recovery.
- `--phase pre`: EDIT/COMMIT/PUSH/DEPLOY step here; a refused step prints the reason on STDERR and exits 2, state unchanged. TEST does not step in pre.
- `--phase post`: a TEST steps only when the command is exactly one test command (pytest, python -m pytest/unittest, npm/yarn/pnpm test, cargo/go test), joined only by `&&`, not `--version/--help/--collect-only`, and `tool_response` ends `Exit Code: 0`. So "tests ran green" means exit code 0, and `pytest && git push` in one command is refused in pre because the test has not happened yet.
- Mapping: EDIT tools `str_replace`, `fs_write`, `fs_append`, `write`, `edit` plus shell patterns (redirect, Set-Content, Add-Content, Out-File, tee, sed -i). Shell tools `execute_pwsh`, `execute_bash`, `shell`, `bash`. PUSH = `git push` anywhere in the command (so `bash -c "git push"` is caught), DEPLOY = cdk/sam/serverless/sls/amplify deploy, terraform apply, aws cloudformation deploy/create-stack/update-stack, kubectl apply.
- Fails closed: unreadable state dir, lock timeout, unparseable STDIN, or a shell call without a command string give exit 2 in pre. Missing, corrupt or unknown state is read as CLEAN, the most restrictive state, so it can only block more. Post errors exit 0 (a missed TEST record keeps PUSH blocked).
- Different from the finance demo: **unmapped tools pass**. The finance gate refuses anything not in the table. A coding agent has hundreds of tools and commands, so this policy only covers mapped risky actions.
- Tests: `test_safe_ship_hook.py`, 18 tests, simulated STDIN through real subprocesses: accept/reject sequences, EDIT invalidates TEST, failed or piped or version-only test does not unlock, wrapper push, corrupt and unknown state, unusable state dir, garbage STDIN, stale lock, 16 concurrent calls, unmapped tools, independent sessions. Result: 18 passed.
- Hook file: `safe-ship.hook.json`, **both hooks `enabled: false`**. To use: copy it to `.kiro/hooks/` and set `enabled` to `true` (needs `python` on PATH, or edit the command to the `.venv` path).

## 6. Live result (CLI 3.5.0, scratch repo, local bare remote, nothing sent to GitHub)

One `kiro-cli chat --no-interactive --trust-all-tools` run with the real hook enabled in a scratch repo (`live_run2_decisions.jsonl`, `live_run2_hook_used.json`). The agent was told to edit, push, run pytest, push, edit, push:

1. edit: allowed. 2. `git push`: **refused**, agent quoted "PUSH refused in state EDITED. No passing test run since the last edit...". 3. pytest: allowed, post hook recorded green. 4. `git push`: **ran** (exit 0, branch created on the local bare remote). 5. edit: allowed. 6. `git push`: **refused**, same message.

So: exit 2 blocks in the CLI, STDERR reaches the model, the matcher regex `str_replace|fs_write|fs_append|execute_pwsh|execute_bash` works, post hook sees the exit code. Invocations used: 2 (payload capture, blocking run).

## 7. Effort for production quality in this repo

About 1.5 to 2 days: wire the hook file and a steering note (0.25 d); generalize `scripts/gen_executor_table.py` and `tests/sm_crosscheck.py` to take a policy name so safe_ship gets a generated table and the same exhaustive and mutation tests under pytest (0.5 d); move the hook mapping to a shared module with the gate's `TOOL_TO_SYMBOL` idea and add the policy picker entry C7 (0.5 d); IDE and Kiro Crew manual runs, screenshots for D6 (0.25 d); README section (0.25 d).

## 8. Risks and limits

- A hook sees tool calls, not intent. An agent can edit through an unmapped path (a script that rewrites files, an MCP tool, `python -c`) or run tests through an unmapped command; the policy covers mapped actions only. It is a guard against mistakes by a cooperative agent, not a sandbox against a hostile one.
- `PostToolUse` exit code only proves the command exited 0, not that the tests were meaningful (a test run selecting zero tests exits 5 and does not count, but a trivial passing suite does).
- Parallel tool calls in one turn run their hooks concurrently; an EDIT and a PUSH in the same turn have no defined order. The live run asked for one call at a time.
- Tool names differ per platform and surface. Only `str_replace` and `execute_pwsh` were seen live; the other names are unverified guesses.
- A blocking hook can stall the owner's own sessions on this repo if enabled. Keep it disabled until demo time.
- Docs say "any other exit code" blocks (hooks/actions) while a third-party page says exit 1 only warns on CLI v3. Use exit 2 only; exit 1 was not tested.

## 9. Not verified

- Kiro IDE: hook firing, tool names (`fsWrite`/`strReplace` camelCase variants possible), blocking and where STDERR is shown.
- Kiro Crew's own agent and its Hooks page; Crew's local docs have no PreToolUse section.
- Exit code 1 behaviour, hook timeout behaviour, `execute_bash` / `fs_write` / `fs_append` payloads, hooks inside subagents, `updatedInput` rewrite (not used).
- macOS/Linux paths of the script (written portable, tested on Windows only).

## 10. Manual test for the owner in Kiro IDE (task D6)

1. In a throwaway clone of this repo, copy `docs/spikes/safe-ship/safe-ship.hook.json` to `.kiro/hooks/safe-ship.json`, set both `enabled` to `true`. Python must be on PATH.
2. Open the Kiro IDE panel for Agent Hooks, confirm both hooks are listed and on.
3. Ask the agent: "edit README.md (add a blank line), then run `git push origin HEAD:refs/heads/safe-ship-test`". Expected: the push is refused with the "PUSH refused in state EDITED" message. Screenshot it.
4. Ask: "run `python -m pytest -q` then push again". Expected: the push goes ahead (use a remote you own, or a local bare repo). Screenshot.
5. Record the actual tool names: temporarily set the command of a copy of the hook to log STDIN to a file, and compare with section 2. If names differ, add them to `EDIT_TOOLS` / `SHELL_TOOLS` and the matcher.
6. Set both hooks back to `enabled: false` afterwards. State files live in `%TEMP%\interlock-safe-ship`; delete them to reset.

## 11. Files and commits

Files in `docs/spikes/safe-ship/`: `safe_ship_table.json`, `safe_ship.jff`, `verify_safe_ship.py`, `verify_output.txt`, `jflap_output.txt`, `safe_ship_hook.py`, `test_safe_ship_hook.py`, `safe-ship.hook.json`, `live_run1_events.log`, `live_run2_decisions.jsonl`, `live_run2_hook_used.json`.

`git log --oneline ui-instrument..safe-ship-spike` before this file was committed:

```
d72b2bb Add live blocking run evidence
70381f2 Add safe-ship hook script and tests
225eef8 Add safe-ship machine and verification
eb5ef41 Add live hook payload capture
```

The last commit adds this report.
