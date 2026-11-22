# Test counts

The single place where test counts are written. Other documents link here instead of repeating numbers.

Measured 2026-11-21 (IST) on Windows, Python 3.12.10, Java 27.0.1 (JDK), Node 24.19.0, from branch `hardening-ci`, with the vendored `third_party/jflap-cli` and JFLAP 7.1. CI on Linux has not run yet (see HARDENING_REPORT.md).

| Suite | Result | Time | Command (repo root) |
| :-- | :-- | :-- | :-- |
| Python fast subset | 329 passed | 22 s (65 s on the first, cold run) | `python -m pytest -q --ignore=tests/test_mutation_m3.py --ignore=tests/test_replay_m5.py` |
| Mutation (M3) | 14 passed | 115 s | `python -m pytest -q tests/test_mutation_m3.py` |
| Replay vs JFLAP (M5) | 2 passed | 3.5 s | `python -m pytest -q tests/test_replay_m5.py` |
| **Python total** | **345 collected, 345 passed** (329 + 14 + 2) | | `python -m pytest -q --collect-only` |
| UI (Vitest) | 26 passed in 5 files | 4.5 s | `cd ui && npm test` |
| UI build | success | under 1 s | `cd ui && npm run build` |

Other checks run with them: `python scripts/gen_executor_table.py --check` (exit 0), `python scripts/secret_scan.py` (0 findings), `pip-audit -r requirements.txt` (no known vulnerabilities), `npm audit` in `ui/` (0 vulnerabilities).

Update this file whenever a suite changes; do not copy these numbers into other documents.