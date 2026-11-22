# VERIFICATION REPORT: finance state machine (plan days D1 to D2)

Run on 2026-11-19 (IST), Windows, Python 3.12.10, Java 27.0.1, JFLAP 7.1 via `third_party/jflap-cli` (`jflap_cli.py`, the same code the `jflap_mcp.py` server wraps; the MCP server itself was not loaded, the CLI was called from a shell). Spec: `SPEC_GATE_v2.md` (unmodified). Nothing committed or pushed. No Strands, Bedrock or AWS used.

## Files produced

| File | Purpose |
| :-- | :-- |
| `policy/finance_table.json` | The machine as data, single source. 5 states, 6 symbols, 30 cells exactly as spec 4.3. |
| `scripts/gen_jff.py` | Generates `policy/finance.jff` from the JSON. |
| `policy/finance.jff` | JFLAP DFA (generated). One-letter symbols A D E M T C (JFLAP reads one character per symbol). |
| `scripts/gen_flags_jff.py` | Independent second machine: DFA over flags (authed, draftOpen, mfaFresh) from step rules. Does not read the JSON. |
| `policy/finance_flags.jff` | Second machine (generated). |
| `policy/finance_min.jff` | Output of JFLAP minimization of `finance.jff`. |
| `policy/traces_4_7.txt` | The 21 section 4.7 traces as letter strings, one per line. |
| `policy/jflap_raw_output.txt` | Raw output of every JFLAP command below. |
| `tests/sm_crosscheck.py`, `tests/test_sm_exhaustive.py`, `tests/test_sm_mutation.py`, `pytest.ini` | M1 and M4. |

The spec's table was copied unchanged. No disagreement with the spec was found; the spec's counts (2,015,539 strings, 321 accepted, 96 mutants) were all confirmed.

## M2: JFLAP checks (commands from the repo root; `J` = `python third_party/jflap-cli/jflap_cli.py`)

| # | Command | Result (raw, see `policy/jflap_raw_output.txt`) | Pass |
| :-- | :-- | :-- | :-- |
| 2.1 | `J inspect policy\finance.jff` | Deterministic: YES. Complete: YES. Unreachable: None (all reachable). Dead States: q4 (= SINK). Final: q0..q3 (START, AUTHED, DRAFTED, APPROVED). | PASS |
| 2.1b | `J inspect policy\finance_flags.jff` | Same: deterministic, complete, no unreachable, dead = q4 (REJECT). | PASS |
| 2.3 | `J fsa minimize policy\finance.jff policy\finance_min.jff` | "Minimized DFA from 5 to 5 states (30 transitions)." | PASS |
| 2.3 | `J equivalence-check policy\finance.jff policy\finance_min.jff` (and `J fsa equals` with the same files) | "The two automata ARE EQUIVALENT" (both commands) | PASS |
| 2.2 | `J equivalence-check policy\finance.jff policy\finance_flags.jff` (and `J fsa equals`) | "The two automata ARE EQUIVALENT" (both commands) | PASS |
| 2.2 control | `J equivalence-check policy\finance.jff <copy with APPROVED -T-> SINK>` | "ARE NOT EQUIVALENT. Shortest distinguishing string: 'ADMT'" (shows the checker can say no) | as expected |
| 2.4 | `J simulate-batch policy\finance.jff --inputs-file policy\traces_4_7.txt` | Total 21, Accepted 9, Rejected 12 (table below) | PASS |
| 2.5 | `J export-table policy\finance.jff` | Printed 30 transitions; states START, AUTHED, DRAFTED, APPROVED, SINK; accepting = first four. Matches JSON by eye only; not diffed by code. | not machine-checked |

Notes on 2.2: the second machine has exactly 5 states (the 4 reachable flag triples a0d0m0, a1d0m0, a1d1m0, a1d1m1 plus REJECT), built from rule logic on the flags rather than from the table. JFLAP has no regex-input tool in this CLI (`convert fsa-to-re` goes the other way), so the regex route was not used here; the flag-based DFA was used as the spec allows. The regex is checked in M1 instead. M2.5 "generate `executor_table.py`" belongs to a later day and was not done.

## Section 4.7 traces through `jflap simulate-batch` (letters A D E M T C)

| # | Trace | Letters | Expected | JFLAP | Match |
| :-- | :-- | :-- | :-- | :-- | :-- |
| 1 | AUTH | A | ACCEPT | ACCEPTED | yes |
| 2 | AUTH DRAFT | AD | ACCEPT | ACCEPTED | yes |
| 3 | AUTH DRAFT MFA | ADM | ACCEPT | ACCEPTED | yes |
| 4 | AUTH DRAFT MFA TRANSFER | ADMT | ACCEPT | ACCEPTED | yes |
| 5 | AUTH DRAFT EDIT MFA TRANSFER | ADEMT | ACCEPT | ACCEPTED | yes |
| 6 | AUTH DRAFT MFA EDIT MFA TRANSFER | ADMEMT | ACCEPT | ACCEPTED | yes |
| 7 | AUTH DRAFT MFA CANCEL | ADMC | ACCEPT | ACCEPTED | yes |
| 8 | AUTH DRAFT MFA TRANSFER DRAFT MFA TRANSFER | ADMTDMT | ACCEPT | ACCEPTED | yes |
| 9 | AUTH DRAFT EDIT EDIT MFA EDIT EDIT MFA TRANSFER | ADEEMEEMT | ACCEPT | ACCEPTED | yes |
| 10 | DRAFT | D | REJECT | REJECTED | yes |
| 11 | MFA | M | REJECT | REJECTED | yes |
| 12 | AUTH TRANSFER | AT | REJECT | REJECTED | yes |
| 13 | AUTH AUTH | AA | REJECT | REJECTED | yes |
| 14 | AUTH CANCEL | AC | REJECT | REJECTED | yes |
| 15 | AUTH DRAFT TRANSFER | ADT | REJECT | REJECTED | yes |
| 16 | AUTH DRAFT DRAFT | ADD | REJECT | REJECTED | yes |
| 17 | AUTH DRAFT MFA MFA | ADMM | REJECT | REJECTED | yes |
| 18 | AUTH DRAFT MFA EDIT TRANSFER | ADMET | REJECT | REJECTED | yes |
| 19 | AUTH DRAFT MFA TRANSFER TRANSFER | ADMTT | REJECT | REJECTED | yes |
| 20 | AUTH DRAFT MFA TRANSFER MFA | ADMTM | REJECT | REJECTED | yes |
| 21 | AUTH DRAFT MFA TRANSFER EDIT | ADMTE | REJECT | REJECTED | yes |

21 of 21 match (9 accepted, 12 rejected). The "reject at step N" column of spec 4.7 was not checked (JFLAP batch reports only the verdict).

## M1: exhaustive and randomized cross-check (table vs rules R1 to R7 vs regex)

Command: `.venv\Scripts\python -m pytest tests\test_sm_exhaustive.py -s -q` (venv inside the repo, `.venv/` is git-ignored; only pytest installed in it). Wall time about 2.5 s total with a multiprocessing pool.

| Sub-check | Test | Raw result |
| :-- | :-- | :-- |
| Table shape: 5 states, 30 cells, all 6 symbols per state, accepting set | `test_table_shape` | pass |
| All strings of length 0 to 8 | `test_exhaustive_up_to_length_8` | total = 2,015,539 strings, accepted = 321, mismatches = 0 (the spec's numbers are confirmed) |
| 100,000 seeded random strings, length 9 to 30 (seed 20261119) | `test_random_strings_len_9_to_30` | 0 mismatches |
| 20,000 table-guided random walks, length 9 to 30 (seed 20261120; 95% live moves, 5% any symbol) | `test_table_guided_random_walks` | 0 mismatches; 10,917 walks accepted, 9,083 rejected |

Result: 4 passed, 0 failed. The rules function scans the prefix at each position with no running state; the regex is spec 4.4 verbatim as a Python `fullmatch`.

## M4: single-cell mutation testing

Command: `.venv\Scripts\python -m pytest tests\test_sm_mutation.py -q`. Mutants: 4 live states x 6 symbols x 4 other targets (out of 5 states, including SINK) = 96. A mutant is killed when table, rules and regex disagree on some string up to length 8.

Result: 97 passed (1 count test + 96 mutants), 0 failed. **96 of 96 killed, 0 survivors.** Shortest distinguishing string length per mutant: length 1: 21 mutants, 2: 24, 3: 18, 4: 24, 5: 9 (so no mutant needed the longer strings).

Whole suite: `.venv\Scripts\python -m pytest tests -q` gives 101 passed, 0 failed, about 3 s.

## Honest limits (what was NOT checked)

- Lengths above 8 are sampled (random and walks), not exhaustive. Nothing proves equivalence beyond length 8 in M1 alone; JFLAP equivalence (M2.2) covers all lengths between `finance.jff` and the flag machine only.
- The two JFLAP models and the table all come from the same author reading the same spec. The rules and regex are independent of the table by construction, but they are not independent of the spec's intent. A wrong policy that the spec describes faithfully would pass everything here.
- The flag machine's reachable states happen to match the table's 4 live states; its independence is in how transitions are derived, not in structure.
- M3 (Hypothesis tests on the executor), M5 (replay equivalence executor vs JFLAP), M6 and the executor itself do not exist yet and were not run.
- Mutants were only single-cell retargetings of live cells. Mutations of the accepting set, the initial state, SINK cells, added or removed states, and mutations of the rules or regex were not tried. The 96 mutants were not run against M3 (spec 4.6 asks for that later).
- The JFLAP MCP server was not started; the CLI was used. `jflap_export_table` output was read, not diffed in code. JFLAP regex input is not available in this CLI, so no regex-to-DFA equivalence was run in JFLAP.
- JFLAP simulation was run only on the 21 section 4.7 traces, not on all strings up to length 8.
- No interaction with Strands, Bedrock or AWS was tested.
