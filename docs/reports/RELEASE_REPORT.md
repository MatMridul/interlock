# RELEASE REPORT (item it_8b39b0d6)

Branch `release`, worktree `C:\Mridul\Programs\Kiroween-wt\release`, created from `origin/sync-main` (2316274). Nothing pushed, nothing merged into `main` or any other branch. No Bedrock calls were made. Run on Windows, Python 3.12, Node 24, 2026-11-22.

## 1. Merges (real merge commits, no squash, no rebase, no force)

| Order | Merge commit | Source | Conflicts |
| :-- | :-- | :-- | :-- |
| 1 | da46b83 | `origin/product-depth` | none |
| 2 | 9a781ef | `origin/race-mode` | none |
| 3 | 21a5ce9 | `origin/safe-ship` | none (`Gate(initial, symbols)` kept as Safe Ship made it) |
| 4 | 8a7c2d8 | `origin/deploy-prep` | `.gitignore`, `server/app.py` |

Conflict resolutions in the fourth merge (one merge commit, "Merge deploy-prep; race uses shared modelcap"):

- `.gitignore`: kept both blocks (the Safe Ship local switch pattern `.kiro/hooks/*.local.json` and `build/`).
- `server/app.py`: one import line, `from server import config, manual, modelcap, policies, race`; kept deploy's `StoredRegistry`, `make_store`, `Busy` imports and the C1 and C2 routes.
- **Race cap wired onto modelcap** (not a text conflict, a semantic one): `server/race.py` had its own per-process `DailyCap`; `server/modelcap.py` (deploy) has the shared, store-backed `ModelCap`. Now `race.add_routes(app, model_factory, limiter, shared_cap)` uses `SharedCap(modelcap)` when the app has a cap (store present), so chat and race draw from one daily counter; the per-process `DailyCap` stays as the no-store fallback and keeps its tests. `ModelCap.remaining()` was added. `/race/live` also refuses when `INTERLOCK_MODEL` resolves to off by `modelcap.model_mode()` (production default is off). New test `test_live_spends_from_the_shared_model_cap` in `tests/test_race_api.py`. `tests/test_store.py` (deploy) and the race tests all pass together.
- No fix commits were needed after the merges other than the above (inside the merge commit).

## 2. Commands run and results

| Command | Result |
| :-- | :-- |
| `pytest -q --ignore=tests/test_mutation_m3.py --ignore=tests/test_replay_m5.py` (after merges) | 419 passed, 54 s |
| same, final (after picker tests) | **422 passed**, 88 s |
| `pytest -q tests/test_mutation_m3.py` | 14 passed, 59 s |
| `pytest -q tests/test_replay_m5.py` | 2 passed, 2 s |
| `pytest --collect-only` | 438 collected (422 + 14 + 2) |
| `cd ui && npm ci` | ok, 0 vulnerabilities |
| `cd ui && npm test` | 119 passed after merges; **123 passed in 11 files** final |
| `cd ui && npm run build` | ok; `index-*.js` 323.5 kB, **102.7 kB gzip** (limit asked: about 400 kB gzip) |
| `cd ui && npx tsc --noEmit` | no errors |
| `python scripts/gen_executor_table.py --check` and `--policy finance --check`, `--policy safe_ship --check` | exit 0 each |
| `python scripts/secret_scan.py` (the CI job's script) | 0 findings (run twice, before and after the docs) |
| `python infra/local_proof.py` | all PASS (readiness `/policy` 200, state stored in DynamoDB (local fake), chat refused in off mode, lockout after 5 wrong codes, per-IP rate limit, sessions are table items) |
| `archify validate` then `deliver` (architecture, showcase quality) | ok |

Counts are also written in [TEST_COUNTS.md](TEST_COUNTS.md) (the single place). Not run: CI on GitHub (the workflow file is unchanged), a real DynamoDB or Lambda, any Bedrock call.

## 3. C7 policy picker

- Server: `server/policies.py`, `GET /policies/finance` and `GET /policies/safe_ship` (read-only; any other name 404, POST 405). safe_ship returns the generated table plus the recorded Kiro CLI run built from `docs/evidence/safe_ship_live_decisions.jsonl`: 7 PreToolUse decisions paired with the actions in `docs/evidence/safe_ship_live_recheck.md`, each replayed through the table; the endpoint raises if a recorded exit code disagrees with the table. Label: `recorded Kiro CLI 3.5.0 run, 2026-11-22`. Tests: `tests/test_policies_c7.py` (3).
- UI: header group **Policy: finance | safe-ship** (finance is the default, the live demo is unchanged). safe-ship opens `ui/src/components/SafeShipView.tsx` under the header: the same `Stage` with the same notation, a what-if box over EDIT TEST COMMIT PUSH DEPLOY (the existing `whatif` library), and a replay (Replay, Step, Reset) that shows Kiro's push REFUSED in EDITED and allowed in TESTED. No hook runs in the browser; the view only reads. Layout entries for CLEAN, EDITED, TESTED were added to `ui/src/lib/geometry.ts`. Tests: `ui/src/test/safeship.test.tsx` (3), a picker test in `ui/src/test/app_depth.test.tsx`.
- **Not verified:** the picker was not looked at in a real browser (the browser tool refuses localhost; jsdom tests only). The stage height inside the overlay (`.ssv-stage`, 52vh up to 460 px) and the mobile layout are unchecked; the owner or conductor should open Policy: safe-ship once at 1440 and 390 wide.

## 4. Docs written

README (G1), `docs/JUDGES.md` (G2), `docs/submission/KIRO_WRITEUP.md` (G3), `DEVPOST_DRAFT.md` (G6), `BLOG_OUTLINE.md` (G7, about 1,140 words, says it was written as part of Kiroween 2026, two `[OWNER: ...]` spots), `SOCIAL_POST.md` (G8, both variants start with `#KiroweenHackathon26`), `docs/architecture/architecture.spec.json` and `architecture.html` (G10, validated, 11 components, Lambda and DynamoDB drawn as planned), `VIDEO_SCRIPT.md` updated (2:50, shot list, pre-flight). Also updated: `TEST_COUNTS.md`, `docs/reports/README.md`, the stale cap paragraph in `RACE_REPORT.md`, task 10 in `.kiro/specs/safe-ship/tasks.md`. `docs/OPEN_TASKS.md` was not touched.

## 5. TODO for the owner

- Live URL (nothing is deployed; the plan and template are in `docs/deploy/DEPLOY_PLAN.md`, waiting on approval, E1 to E3).
- Record, upload and link the YouTube video (G5), then fill the link in README, JUDGES and Devpost.
- Student details for Best Student (G9), privately in the form.
- Kiro IDE and CLI evidence into `docs/evidence/` (D6): IDE run, save-hook trigger name (A10), power install. Until then the write-up says "owner to confirm".
- Publish the blog post on a third-party platform and post the social text; add both URLs to Devpost (G7, G8); fill the `[OWNER: ...]` and `<LINK>` placeholders.
- Look at the Policy: safe-ship view in a browser once; look at the architecture diagram once (it was validated by Archify, not looked at by me).
- Re-read the Devpost Rules tab (H2).

## 6. Inconsistencies found

1. **Autoplay does not work in "you" mode, which is the default on a deployment with the model off.** `Console.tsx` hides the button in you mode and `startAutoplay` sends chat messages. The old video script and the brief assumed Autoplay on the public URL. README, JUDGES and VIDEO_SCRIPT now say it needs model mode (`STUB=1` locally). A small change (an autoplay that uses `SCRIPTS` in you mode) would fix the "Best Demo, no extra steps" path; I did not make it (outside the item). Recommend it.
2. `RACE_REPORT.md` said the race cap is per process; after this merge it is shared with chat when a store exists (updated there).
3. `manual.model_enabled()` defaults to on when `INTERLOCK_MODEL` is unset, while `modelcap.model_mode()` defaults to off in production. The race route now checks both; `/config` and chat follow their own existing rules. Consistent in effect, but there are two readers of one variable.
4. `docs/OPEN_TASKS.md` says the repo has an MIT license while the old README said "not chosen yet"; the `LICENSE` file is MIT. README now says MIT. OPEN_TASKS C7, G1 to G3, G6 to G8 and G10 rows still say "doing" (conductor owns it); the safe-ship spec task 10 is now ticked.
5. The Strands report says Claude Haiku 4.5 worked once from the conductor's machine; the old write-up said it was blocked in two regions. The write-up now states what the report shows.
6. Safe Ship doc "Test counts" and DEPLOY_PLAN and HARDENING_REPORT carry branch-time counts (370, 359, 329); they are history of those branches, and TEST_COUNTS.md is the only current number.
7. The `.kiro/hooks/policy-checks-on-save.json` hook has never fired in Kiro (A10); the write-up says so.
8. `docs/submission/DRAFTS_REPORT.md` is from an earlier round and describes the old drafts; it was left alone.

## 7. Not checked

The architecture HTML and the Safe Ship view were not looked at as pixels; the Linux CI run was not executed; the Devpost Rules tab was not re-read by me; word counts (blog about 1,140; X post about 265 with a link) were counted, not judged for voice.
