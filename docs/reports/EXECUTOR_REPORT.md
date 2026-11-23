# EXECUTOR REPORT: gate and executor core (plan day D3)

Run 2026-11-19 (IST), Windows, `.venv` in the repo (added only `hypothesis` to it). Spec `SPEC_GATE_v2.md` and the verified machine files were not modified. Nothing committed or pushed. No Strands, Bedrock or AWS.

## Files made

| File | Purpose |
| :-- | :-- |
| `scripts/gen_executor_table.py` | Runs `jflap_cli.py export-table policy\finance.jff`, parses it, writes `bank/executor_table.py`. `--check` exits 1 if the file is stale. |
| `bank/executor_table.py` | GENERATED, DO NOT EDIT (header present). Live cells only; a missing cell = undefined = REJECT. |
| `bank/real_tools.py` | Stub side effects AUTH, DRAFT, EDIT, TRANSFER, CANCEL, plus a separate `record_mfa_human`. They append to a per-session list passed in by the gate. No network, no money. |
| `bank/gate.py` | `Gate` with `run(symbol, args, source='llm')`, read-only `peek`, `state` (read-only property), `effects()`. One lock; private `_state` written only in `__init__` and `_commit`. Also the closed `TOOL_TO_SYMBOL` map and `symbol_for_tool`. |
| `bank/__init__.py` | empty |
| `tests/conftest.py` | puts the repo root on `sys.path` |
| `tests/props.py` | The S1 to S7 checkers (+X1), generators, `falsified()` helper. Checkers read the executed trace (side-effect log) with plain rules, not the table. |
| `tests/test_gen_table.py`, `test_gate_basic.py`, `test_gate_properties.py`, `test_replay_m5.py`, `test_mutation_m3.py` | The new tests. |

Design choice: the generator reads the JFLAP export (its output was parseable), so the JSON is not the source. A test additionally checks the JSON equals the parsed JFLAP export cell by cell, which closes the "read by eye only" gap in `VERIFICATION_REPORT.md` (2.5).

## Commands and raw results

Regenerate: `.venv\Scripts\python scripts\gen_executor_table.py` (check mode: add `--check`, exit 0 now).
Run everything: `.venv\Scripts\python -m pytest tests -q`

| Group | Command | Raw result |
| :-- | :-- | :-- |
| Generated table | `pytest tests\test_gen_table.py` | 3 passed (fresh vs regenerated, JSON == JFLAP export all 30 cells, executor table == JSON live cells) |
| Gate basics: import graph, INV-2, 4, 6, 8, 11, 12 | `pytest tests\test_gate_basic.py` | 92 passed |
| Hypothesis S1 to S7 (+X1, + non-vacuity check) | `pytest tests\test_gate_properties.py` | 9 passed, 300 examples per property |
| M5 replay vs JFLAP | `pytest tests\test_replay_m5.py -s` | 55,986 strings of length 1 to 6: 0 mismatches. 1,000 seeded random strings (seed 20261120, length 7 to 24, 189 accepted): 0 mismatches. One batch file per group, two JFLAP processes in total. |
| M3 mutation | `pytest tests\test_mutation_m3.py -s` | 14 passed (see below), about 54 s |
| Earlier M1 and M4 (unchanged) | `pytest tests\test_sm_exhaustive.py tests\test_sm_mutation.py` | 4 passed, 97 passed |
| Whole suite | `pytest tests -q` | **221 passed, 0 failed**, 87 s |

The empty string was not sent to JFLAP (blank line in a batch file); length 0 is covered by M1 and trivially by the gate (state START, accepting).

## Invariant coverage

| Invariant | Covered by |
| :-- | :-- |
| INV-1 only gate runs tools | `test_only_gate_imports_real_tools` (AST scan of every `.py` in the repo except `.venv`; also catches `from bank import real_tools`, relative imports, `import_module`), `test_import_detector_detects`; S1 to S5 on executed traces; M5 |
| INV-2 undefined = reject | `test_inv2_undefined_cell_rejects_and_is_noop` x16 (each of the 16 undefined live cells: reject, state and log unchanged), `test_there_are_16_undefined_live_cells`, `test_inv2_inv12_exception_in_lookup_rejects_nothing_runs` |
| INV-3 executor equals JFLAP | M5 tests, `test_gen_table.py` |
| INV-4 closed alphabet | `test_inv4_bad_symbol_rejects` x19 (case, spaces, empty, None, int, bytes, list, Cyrillic and fullwidth lookalikes, zero-width char), `test_inv4_unknown_tool_name_has_no_symbol` x13, `test_inv4_tool_map_is_closed_and_has_no_mfa`; S7 |
| INV-6 state only via commit | `test_inv6_state_written_only_in_commit_and_init` (AST), `test_inv6_state_property_is_read_only`; S6 |
| INV-8 four fields | checked in the 16 cell tests, in the bad-symbol tests, and on every reject inside every Hypothesis run (`props.play`) |
| INV-11 MFA human only | `test_inv11_mfa_non_human_rejected_everywhere` (4 states x 7 source values), `test_inv11_mfa_human_accepted_only_in_drafted`, `test_inv11_default_source_is_llm`; S7 |
| INV-12 failure is fail-closed | lookup exception test, `test_inv12_tool_exception_rejects_state_unchanged`, `peek` with a failing table |
| S1 to S7 | `test_s1_nothing_before_auth`, `test_s2_transfer_requires_fresh_mfa`, `test_s3_draft_spent_once`, `test_s4_auth_once`, `test_s5_no_mfa_stacking`, `test_s6_reject_is_noop`, `test_s7_closed_alphabet_and_human_mfa` |
| S8 (executor == JFLAP) | M5 tests |

S2 is checked slightly stricter than the spec's sentence: a TRANSFER must have an earlier DRAFT/EDIT, an MFA after the latest one, and no TRANSFER/CANCEL since. Otherwise "AUTH MFA TRANSFER" would pass S2 vacuously.

## M3 mutant results (12 single-cell mutants injected into a `Gate`)

| Mutant | Killed by |
| :-- | :-- |
| APPROVED -EDIT-> APPROVED | S2 |
| DRAFTED -TRANSFER-> AUTHED | S2 |
| START -DRAFT-> DRAFTED | S1 |
| AUTHED -MFA-> APPROVED | S2, S3, S5 |
| APPROVED -MFA-> APPROVED | S5 |
| AUTHED -AUTH-> AUTHED | S4 |
| APPROVED -TRANSFER-> APPROVED | S2, S3 (also the happy-path test) |
| DRAFTED -EDIT-> APPROVED | S2 |
| APPROVED -CANCEL-> APPROVED | S2 |
| AUTHED -TRANSFER-> AUTHED | S2, S3 |
| **DRAFTED -DRAFT-> DRAFTED** | **SURVIVED S1 to S7** (no stated property forbids two DRAFTs in a row). Killed by the added property X1 `test_x1_no_stacked_drafts`. |
| DRAFTED -MFA-> DRAFTED | S5 (also the happy-path test) |

11 of 12 killed by S1 to S7; 1 survivor, and X1 was added for it; with X1 all 12 are killed. `test_s1_to_s7_alone_kill_every_safety_mutant_except_known_gaps` pins the survivor list so it cannot change silently. The unmutated gate passes S1 to S7 and X1 under the same search (`test_unmutated_gate_survives_nothing_fails`). Mutants are searched with Hypothesis (`derandomize=True`, 300 examples); a survivor means "not found in 300 examples".

## Honest limits

- Not built or tested: the Strands layer (wrappers, `BeforeToolCallEvent` hook, INV-5, S10), the argument guard (INV-9, S9), INV-10 (latency display), the `/mfa` HTTP endpoint (only the `source` parameter exists), AWS or deploy.
- Concurrency: the gate has one lock but no multi-thread test was run.
- INV-6 is enforced by convention plus an AST test; Python cannot stop code from writing `gate._state` directly.
- INV-1 import test is static. It does not stop dynamic imports built from computed strings. `real_tools` functions can also be called by anyone holding the `DEFAULT_TOOLS` dict from `gate.py`.
- `Gate(table=..., tools=...)` is injectable for tests; production code must not pass either.
- Hypothesis properties are sampled (300 examples each), not exhaustive; exhaustive coverage comes from M5 (length up to 6) and M1 (length up to 8, verified earlier).
- M5 compares verdicts only. JFLAP gives no reject position, and the empty string was not sent to JFLAP.
- Mutants are single-cell table edits (12 of the 96 possible); initial state, accepting set and the gate code itself were not mutated.
- Liveness (the happy path works) is covered by one test only; S1 to S7 are safety properties.
- `test_mutation_m3.py` takes about 54 s, so the suite is not "seconds short" (87 s total).
