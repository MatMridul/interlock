# Tasks: the Gate

DRAFT. Ticked = done and verified per the reports; open = not done. Checkbox format as in Kiro's tasks.md.

- [x] 1. Spec gate: SPEC_GATE_v2.md approved 2026-11-19 (corrected v1 claims, 12 invariants)
- [x] 2. Policy and verification (docs/reports/VERIFICATION_REPORT.md)
  - [x] 2.1 `policy/finance_table.json`, `scripts/gen_jff.py`, `finance.jff`
  - [x] 2.2 Independent flag machine `finance_flags.jff`; JFLAP equivalence
  - [x] 2.3 JFLAP inspect, minimize (5 to 5), 21 traces (9 accept, 12 reject)
  - [x] 2.4 M1 exhaustive: 2,015,539 strings, 0 mismatches
  - [x] 2.5 M4 mutation: 96 of 96 killed
- [x] 3. Executor core (docs/reports/EXECUTOR_REPORT.md)
  - [x] 3.1 `scripts/gen_executor_table.py` with `--check`, generated `bank/executor_table.py`
  - [x] 3.2 `bank/gate.py`, `bank/real_tools.py` (stubs)
  - [x] 3.3 Hypothesis S1 to S7, M5 replay vs JFLAP, M3 mutants, X1 for the survivor
- [x] 4. Strands layer (docs/reports/STRANDS_REPORT.md)
  - [x] 4.1 Five wrappers, hook, SequentialToolExecutor, stub model suite (S10, INV-12)
  - [x] 4.2 Real Bedrock adversarial run (Nova 2 Lite fallback; Haiku blocked)
- [x] 5. Argument guard INV-9 / S9 and FastAPI + SSE + /mfa (docs/reports/BACKEND_REPORT.md)
- [x] 6. Guard on by default in `Gate()`; Playground UI (docs/ui-v2/UI_BUILD_REPORT.md); UI tests counted in docs/reports/TEST_COUNTS.md
- [x] 7. UI direction comps A, C, D (docs/ui-v2/ROUND_2.md)
- [x] 8. Submission drafts (.kiro specs, steering, hook, README, write-up, script, Devpost text, blog outline, diagram)
- [ ] 9. Owner picks the final UI look (comp D leading); port it to React; rebuild `ui/dist`; update screenshots
- [ ] 10. Fix known UI gaps from ROUND_2.md (key module room, cover-lift depth) if D is chosen
- [ ] 11. Run the full suite on the final build (Python and `npm test`)
- [ ] 12. One real end-to-end recorded run through the UI (accepted path, MFA dialog); only the stub flow was seen in a browser
- [ ] 13. Deploy and smoke-test a public URL (host undecided, no deployment exists)
- [ ] 14. Choose and add a LICENSE; third-party license texts under `third_party/` or fetch steps
- [ ] 15. Create public GitHub repo; commit (nothing is committed beyond 2 early commits); confirm `/.kiro` is tracked
- [ ] 16. Record and upload the video (under 3:00) to YouTube
- [ ] 17. Read the Devpost Rules, Resources and FAQ tabs; decide bonus prizes
- [ ] 18. Submit on Devpost (target Thu 2026-12-03; deadline Fri 2026-12-04 2:00 PM PT)

Added after the list above (2026-11-22):
- [x] 19. Gate engine reused for a second policy (Safe Ship): `Gate(initial=, symbols=)`, generator `--policy`; finance behaviour and tests unchanged. See `.kiro/specs/safe-ship/tasks.md`.
