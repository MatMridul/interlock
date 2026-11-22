---
name: verify-policy
description: Verify an Interlock state-machine policy (policy/*.jff) with the JFLAP MCP tools. Use when asked to check, inspect, compare or prove properties of a finite-state policy, or after a policy table changed.
---

# Verify a policy with JFLAP

Policies live in `policy/<name>_table.json` (source) and `policy/<name>.jff` (generated JFLAP model). Names: `finance`, `safe_ship`.

1. `jflap_inspect` on `policy/<name>.jff`. Expect: deterministic true, complete true, the alphabet from the table, no unreachable states, one dead state (SINK).
2. `jflap_export_table` on the same file. The generated executor table (`bank/executor_table.py` or `safeship/executor_table.py`) must equal it; check with `python scripts/gen_executor_table.py --check`.
3. `jflap_simulate_batch` for the traces you care about (accept or reject verdicts).
4. After a change, `jflap_equivalence_check` the old and new `.jff`. Report the shortest distinguishing string if they differ. A mutant that is NOT equivalent is expected to be caught by the test suite; one that IS equivalent is not a test gap.
5. Report numbers exactly as the tools return them. Do not edit `bank/executor_table.py` or `safeship/executor_table.py` (generated).

Limit: JFLAP proves properties of the machine (the table), not of the code around it. The tests in `tests/test_sm_*.py` and `tests/test_safe_ship_*.py` cover the link from table to runtime.