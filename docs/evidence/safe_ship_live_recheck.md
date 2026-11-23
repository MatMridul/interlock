# Safe Ship live re-check (integrated version)

Date 2026-11-22. Kiro CLI 3.5.0, Windows, logged in with Builder ID. Model calls: 2 `kiro-cli chat --no-interactive --trust-all-tools` invocations (the second used `--resume`; the first model turn stopped after step 1).

Setup: scratch git repo with a LOCAL bare remote (nothing went to GitHub). The scratch repo held a copy of `bank/`, `safeship/`, `scripts/safe_ship.py` and the committed `.kiro/hooks/safe-ship.json` (`enabled: false`). Safe Ship was turned on with `python scripts/safe_ship.py enable`, which wrote the untracked `.kiro/hooks/safe-ship.local.json`. So this run also shows that Kiro CLI loads the local override file next to the disabled committed one.

Files: `safe_ship_live_decisions.jsonl` (one line per hook call, written by the hook through `SAFE_SHIP_LOG`), `safe_ship_live_transcript.txt` (CLI output of both runs).

| Step | Tool call | Hook state before | Result |
|---|---|---|---|
| 1 | edit `app.py` (`str_replace`) | CLEAN | allowed -> EDITED |
| 2 | `git add -A && git commit -m edit1` (`execute_pwsh`) | EDITED | allowed (COMMIT keeps EDITED) |
| 3 | `git push origin main` | EDITED | **refused, exit 2**: "PUSH refused in state EDITED (PUSH not allowed in EDITED). No passing test run since the last edit..." The agent quoted it and did not work around it. |
| 4 | `python -m pytest -q` | EDITED | allowed; post hook saw exit code 0 -> TESTED |
| 5 | `git push origin main` | TESTED | **allowed**; remote moved `7044790..e546cf4` (checked in the local bare remote) |
| 6 | edit `app.py` back (`str_replace`) | TESTED | allowed -> EDITED |
| 7 | `git push origin main` | EDITED | **refused, exit 2**, same message. The revert stayed unpushed. |

Result: the integrated version (hook on the shared `bank.gate.Gate`, generated table `safeship/executor_table.py`) blocks and allows exactly as the spike did: refuse after an edit, allow after a green test run, refuse again after another edit.

Not covered by this run: Kiro IDE, Kiro Crew, `fs_write` / `fs_append` / `execute_bash` payloads, parallel tool calls in one turn.
