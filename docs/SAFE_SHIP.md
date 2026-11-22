# Safe Ship

Safe Ship is Interlock's second policy: the same verified gate, pointed at Kiro's own tool calls instead of a bank transfer. One verified engine, two policies.

## What it is, in plain words

A coding agent can run `git push` or a deploy command on code it never tested. Safe Ship is a Kiro hook that checks each tool call first. A push or deploy is refused until a test run exited with code 0 **after the last edit**. Edit again and the push is refused again. The refusal text goes back to the agent, which can then run the tests.

The rule is a four-state machine, built and checked in JFLAP like the finance machine:

| state | EDIT | TEST | COMMIT | PUSH | DEPLOY |
|---|---|---|---|---|---|
| CLEAN (start) | EDITED | TESTED | CLEAN | refused | refused |
| EDITED | EDITED | TESTED | EDITED | refused | refused |
| TESTED | EDITED | TESTED | TESTED | TESTED | TESTED |

A new session starts in CLEAN, so the first push needs a test run first. Files: `policy/safe_ship_table.json` (source), `policy/safe_ship.jff` (JFLAP model, generated), `safeship/executor_table.py` (generated), `safeship/hook.py` (hook runtime). The hook builds a `bank.gate.Gate`, the same class the finance policy uses (`Gate(initial=..., symbols=...)`), and carries no table logic of its own.

## Turn it on and off

The committed hook `.kiro/hooks/safe-ship.json` has `enabled: false` on both hooks, so cloning the repo never blocks anyone.

```
python scripts/safe_ship.py enable    # writes .kiro/hooks/safe-ship.local.json (untracked, gitignored), enabled
python scripts/safe_ship.py status
python scripts/safe_ship.py disable   # deletes it
python scripts/safe_ship.py reset     # forget saved per-session states
```

Start a new Kiro session after `enable`. Needs `python` on PATH (`enable` writes absolute paths to the Python that ran it).

Why this and not the alternative (leave it enabled but scoped to push and deploy only): the hook fails closed in `PreToolUse`. If its Python is missing or broken, it would also block edits and test runs, which can stall the owner's normal work. A scope in the matcher cannot prevent that, because the matcher must include edit and shell tools to see edits and tests. So it is off by default and local-only when on. Verified: `tests/test_safe_ship_switch.py`, and the live run used the local file next to the disabled committed one.

## The closed mapping and its limits

Only these tool names are mapped (`TOOL_ROLES` in `safeship/hook.py`):

| Tool name | Role | Status |
|---|---|---|
| `str_replace` | EDIT | observed live (Kiro CLI 3.5.0, Windows) |
| `execute_pwsh` | shell | observed live |
| `read_file` | maps to nothing | observed live |
| `fs_write`, `fs_append`, `write`, `edit` | EDIT | **guessed**, never seen in a payload |
| `execute_bash`, `shell`, `bash` | shell | **guessed** |

Shell commands map by pattern: PUSH = `git push` anywhere in the command (so `bash -c "git push"` is caught); DEPLOY = `cdk|sam|serverless|sls|amplify deploy`, `terraform apply`, `aws cloudformation deploy|create-stack|update-stack`, `kubectl apply`; TEST = pytest, `python -m pytest|unittest`, `npm|yarn|pnpm test`, `cargo test`, `go test`; COMMIT = `git commit`; EDIT = redirects, `Set-Content`, `Add-Content`, `Out-File`, `tee`, `sed -i`.

Limits, stated plainly:

- **Only mapped risky actions are covered. Unmapped tools and commands pass.** This is the opposite of the finance gate, which refuses anything outside its table. An agent can edit through an unmapped path (a script, an MCP tool, `python -c`) or push through one the patterns miss. Safe Ship guards against a cooperative agent's mistakes; it is not a sandbox against a hostile one.
- **A green test means exit code 0** of exactly one recognised test command. It does not mean the suite is meaningful. `pytest | tail`, `pytest; echo`, `pytest || true`, `--version` and `--collect-only` do not count. `pytest && git push` in one command is blocked, since the push is judged before the test has run.
- **Parallel tool calls in one turn** run their hooks concurrently, so an EDIT and a PUSH in the same turn have no defined order. The live run asked for one call at a time.
- Fail closed in `PreToolUse` (unparseable input, unusable state dir, shell call without a command string). Missing or corrupt state reads as CLEAN. `PostToolUse` errors exit 0, which keeps push blocked.
- Exit code 2 is the only blocking code used and tested.

## Verification results

All run on 2026-11-22.

| Check | Result | Where |
|---|---|---|
| Exhaustive: every string over E T C P D up to length 8 vs an independent rule scan (no state variable) | 488,281 strings, 93,241 accepted, 0 mismatches | `tests/test_safe_ship_machine.py` |
| Single-cell mutants (15 live cells x 3 targets) | 45 total: 40 killed by a string of length 8 or less, 5 proven language-equivalent by product-automaton search (CLEAN and EDITED are equivalent), 0 survivors | same |
| Engine equals rule scan on all strings to length 6 (through the real `Gate`) | pass | `tests/test_safe_ship_engine.py` |
| Hypothesis properties (engine vs rule scan, lengths up to 30, 300 examples; "EDIT always revokes PUSH/DEPLOY", 200 examples) | pass | same |
| Generated table fresh, equal to JSON and to the JFLAP `export-table` cell by cell (20 cells) | pass; `gen_executor_table.py --check` exits 0 for both policies | `tests/test_safe_ship_machine.py` |
| JFLAP inspect (`third_party/jflap-cli`) | deterministic, complete, alphabet C D E P T, no unreachable state, SINK the only dead state | same |
| JFLAP minimize and equivalence | 4 to 3 states, equivalent to the original; a mutant where EDIT does not revoke is NOT equivalent, shortest witness `TED` | same |
| Hook behaviour through real subprocesses with simulated STDIN | 18 tests (the spike's 18, now on the shared engine) | `tests/test_safe_ship_hook.py` |
| On/off switch | 4 tests | `tests/test_safe_ship_switch.py` |

The finance machine keeps its own checks (2,015,539 strings, 96 of 96 mutants) in `tests/test_sm_*.py`. The finance Gate behaves as before (`test_finance_defaults_are_untouched`, `tests/test_gate_basic.py`).

## Test counts

`pytest -q --ignore=tests/test_mutation_m3.py --ignore=tests/test_replay_m5.py` on this branch: **370 passed** in 105 s. New in this branch: 18 hook + 9 machine + 8 engine + 4 switch = 39 tests (the rest of the 370 was already there). The two slow suites were not run here. The UI tests (`npm test`) were not run.

## Live evidence (Kiro CLI 3.5.0, Windows, scratch repo with a local bare remote, nothing sent to GitHub)

- `docs/evidence/safe_ship_live_recheck.md`, `safe_ship_live_decisions.jsonl`, `safe_ship_live_transcript.txt`: integrated version, 2 model invocations. Edit (allowed), push (**refused**, exit 2, message quoted by the agent), pytest (allowed, recorded as green), push (**allowed**, the local remote moved), edit (allowed), push (**refused**). Same result as the spike (`docs/spikes/SAFE_SHIP_SPIKE.md`, `docs/spikes/safe-ship/`).
- Total Kiro CLI chat invocations for this work: 5 (2 for Safe Ship, 3 for the custom agent).

## Custom Kiro agent: `gate-verifier`

`.kiro/agents/gate-verifier.json`. Format checked against [Custom agents: configuration reference](https://kiro.dev/docs/custom-agents/configuration-reference/), which says an agent config "can be a JSON file or a Markdown file with YAML front matter" and lists the fields used here: `name`, `description`, `prompt`, `tools`, `permissions` (`rules` with `capability`, `match`, `effect`), `resources`, `includeMcpJson`, `welcomeMessage`. `kiro-cli agent validate --path` accepts it (and rejects a deliberately wrong file), and `kiro-cli agent list` shows it as a workspace agent "(v3 format)". Job: run the exhaustive and mutation tests, the table freshness check and the JFLAP checks through the `jflap` MCP server for one policy, and report numbers. Read-only by its permission rules (`fs_write` denied, shell allowed only for the test and generator commands).

Used for real, three runs (`docs/evidence/gate_verifier_runs.md`): run 1 stopped on a permission prompt (non-interactive mode cannot answer), run 2 passed the shell checks but was denied the MCP tools, run 3 (after adding an `mcp` allow rule) passed everything without trust flags: 488,281 strings, 0 mismatches, 40 killed, 5 equivalent, 0 survivors, table fresh, `jflap_inspect` and `jflap_equivalence_check` called through MCP. The finance policy was not run through the agent. The permission rules were not tested against a hostile prompt.

## Kiro power / MCP: `powers/jflap/`

Docs ([Powers](https://kiro.dev/docs/powers/), [Create powers](https://kiro.dev/docs/powers/create/)): a power is a directory with `plugin.json`, optional `mcp.json`, optional `skills/`. `powers/jflap/` has exactly those. **Not verified:** the install (`kiro-cli powers install <path>` exists, but running it would change the owner's real Kiro configuration), keyword activation, and the working directory of a power's MCP server (the config uses a path relative to the repo root). The project config `.kiro/settings/mcp.json` is the path proven live. Details: `docs/KIRO_MCP.md`.

## Property-based testing, honestly

- Hypothesis tests that exist: `tests/test_safe_ship_engine.py` (2 properties), `tests/test_gate_properties.py` (finance gate S1 to S7, 300 examples each), plus the exhaustive and mutation checks, which are enumeration, not Hypothesis.
- Kiro's own property-based testing feature is IDE-only and was **not used**. No claim of it is made.

## Specs and steering

`.kiro/specs/safe-ship/` (requirements in EARS, design with invariants SS-1 to SS-8 mapped to tests, tasks with done items ticked and open items open); `.kiro/specs/gate/` updated for the shared engine; `.kiro/steering/tech.md` explains how policies are generated and verified.

## Commits (`git log --oneline origin/sync-main..safe-ship` before the final docs commit)

```
597f839 Add safe-ship spec and steering notes
76e1ea4 Test Safe Ship on and off switch
33050f4 Add jflap power and MCP docs
9150728 Add gate-verifier run evidence and fixes
2eb94a8 Add Safe Ship live re-check evidence
87b16ac Add gate-verifier custom Kiro agent
d6c2274 Verify Safe Ship machine and engine
b21513f Add Safe Ship hook on shared gate
cc73eaa Add safe_ship policy and table generator
```

## Not verified

- Kiro IDE: hook firing, tool names, where the refusal text is shown (manual test steps: section 10 of `docs/spikes/SAFE_SHIP_SPIKE.md`, task D6, owner).
- Kiro Crew's own agent and Hooks page.
- `fs_write`, `fs_append`, `execute_bash` payloads; hooks inside subagents; exit code 1 and timeout behaviour.
- macOS and Linux (written portable, run on Windows only). The power install. The policy picker in the UI (C7) is not part of this branch.
- The spike folder `docs/spikes/safe-ship/` is a frozen snapshot of the first prototype; the maintained code is in `safeship/`, `policy/` and `tests/`.
