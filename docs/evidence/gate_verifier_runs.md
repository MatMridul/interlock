# gate-verifier: real runs with Kiro CLI 3.5.0

Agent file: `.kiro/agents/gate-verifier.json`. Command (from the repo root of this worktree, `python` on PATH = the repo venv): `kiro-cli chat --no-interactive --agent gate-verifier "Verify the safe_ship policy now and report the table."`. Read-only task: `git status` was clean after every run except the agent file edits I made between runs.

Three runs, kept in full because the first two failed for real reasons:

| Run | File | What happened |
|---|---|---|
| 1 | `gate_verifier_run1_denied.txt` | Shell command asked for approval and non-interactive mode cannot answer. The agent stopped and reported "Not run" for every check. It did not work around it. Cause: it first tried a `.venv\Scripts\python` path that my shell allow rule (`python -m pytest tests/*`) does not match. |
| 2 | `gate_verifier_run2_trust_run_command.txt` | With `--trust-tools=run_command`: exhaustive and mutant tests and the freshness check passed. Both `@jflap/*` calls were denied because the agent had no `mcp` permission rule. The agent reported "Not run" for them. |
| 3 | `gate_verifier_run3_pass.txt` | After adding an `mcp` allow rule for four jflap tools and telling the agent to use plain `python`: no trust flags, everything ran. |

Run 3 result as reported by the agent (numbers quoted from tool output, and they match the pytest `-s` output in `docs/SAFE_SHIP.md`):

| Check | Result |
|---|---|
| Exhaustive (machine + engine tests) | 488,281 strings, 93,241 accepted, 0 mismatches |
| Mutants | 40 killed, 5 equivalent, 0 survivors; 17 passed |
| `gen_executor_table.py --policy safe_ship --check` | fresh, exit 0 |
| MCP `jflap_inspect` on `policy/safe_ship.jff` | deterministic, complete, alphabet C D E P T, 4 states, dead state SINK, none unreachable |
| MCP `jflap_equivalence_check` file against itself | equivalent (only shows the tool works) |

Limits: this run used the `safe_ship` policy only; the finance policy was not run through the agent. The agent sandbox is the permission rules in the agent file; they were not tested against a hostile prompt.
