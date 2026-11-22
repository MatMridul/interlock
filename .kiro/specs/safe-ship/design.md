# Design: Safe Ship

Evidence and limits: `docs/SAFE_SHIP.md`. Spike with the first live run: `docs/spikes/SAFE_SHIP_SPIKE.md`.

## Architecture

```
Kiro tool call --PreToolUse--> safeship/hook.py --map tool+command to symbols--> bank.gate.Gate (table: safeship/executor_table.py)
                                  | REJECT -> exit 2 + STDERR reason (Kiro blocks the call, the agent reads the reason)
                                  | ACCEPT -> exit 0, new state saved in a per-session file
Kiro tool result --PostToolUse--> safeship/hook.py --exit code 0 and one test command--> Gate.run("TEST")
policy/safe_ship_table.json -> scripts/gen_jff.py -> policy/safe_ship.jff -> JFLAP export-table -> scripts/gen_executor_table.py -> safeship/executor_table.py
```

## Machine
Symbols EDIT E, TEST T, COMMIT C, PUSH P, DEPLOY D. States CLEAN (start), EDITED, TESTED, SINK. PUSH and DEPLOY are allowed only in TESTED. CLEAN and EDITED are language-equivalent (JFLAP minimization 4 to 3 states); they stay separate for readability.

## Components
- `safeship/hook.py`: mapping (closed list), state store (one JSON file per session, lock file, atomic replace), `step()` which builds a `Gate` from the stored state and runs one symbol. No table logic of its own.
- `bank/gate.py`: `Gate(initial=..., symbols=...)` lets another policy use the engine; the finance defaults are unchanged.
- `scripts/safe_ship.py`: `enable`, `disable`, `status`, `reset`.
- `.kiro/hooks/safe-ship.json` (disabled), `.kiro/agents/gate-verifier.json` (verifier), `powers/jflap/`.

## Invariants and their tests

| ID | Invariant | Tests |
| :-- | :-- | :-- |
| SS-1 | PUSH/DEPLOY accepted iff the latest EDIT-or-TEST before it is a TEST | `test_safe_ship_machine.py::test_exhaustive_up_to_length_8` (488,281 strings, table vs rule scan), `test_safe_ship_engine.py::test_engine_equals_rule_scan_exhaustively_to_length_6`, Hypothesis `test_property_engine_equals_rule_scan_on_long_strings` |
| SS-2 | EDIT revokes a green test | Hypothesis `test_property_edit_always_revokes_push`, hook test `test_edit_test_push_accepted_then_edit_invalidates` |
| SS-3 | Only an exit-0 single test command counts | hook tests `test_failed_test_does_not_unlock`, `test_version_check_and_piped_test_do_not_count`, `test_pre_does_not_trust_a_compound_test_and_push` |
| SS-4 | Same engine as finance | `test_hook_uses_the_shared_gate_class`, `test_finance_defaults_are_untouched` |
| SS-5 | Table = JSON = JFLAP model = generated file | `test_generated_file_is_fresh_and_matches_json`, `test_jff_is_generated_from_json`, `test_jflap_inspect`, `test_jflap_minimize_is_equivalent_and_smaller`, `test_jflap_distinguishes_a_real_mutant` |
| SS-5b | Every single-cell mutant is killed or proven equivalent | `test_mutants_all_killed_or_proven_equivalent` (40 killed, 5 proven equivalent, 0 survivors) |
| SS-6 | Fail closed in pre; corrupt state reads as CLEAN | hook tests `test_fail_closed_when_state_dir_unusable`, `test_garbage_stdin_pre_blocks_post_passes`, `test_corrupt_state_reads_as_clean`, `test_unknown_state_value_reads_as_clean`, `test_stale_lock_is_broken_and_busy_lock_fails_closed`, `test_concurrent_calls_leave_a_valid_state` |
| SS-7 | Closed mapping; unmapped passes | `test_unmapped_tools_and_commands_pass`, `test_symbols_for_closed_mapping_and_observed_names`, `test_wrapper_push_is_caught` |
| SS-8 | Off by default | `test_safe_ship_switch.py` (4 tests) |

Property-based testing: Hypothesis is used in `test_safe_ship_engine.py` (two properties, 300 and 200 examples) and for the finance gate in `tests/test_gate_properties.py`. Kiro's own PBT feature was not used.

## Limits (not invariants)
Only mapped actions are covered. A green test means exit code 0, not a meaningful suite. Parallel tool calls in one turn have no defined order. See `docs/SAFE_SHIP.md`.
