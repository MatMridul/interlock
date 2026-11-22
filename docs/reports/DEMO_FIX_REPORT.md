# Demo fix report

Branch `demo-fixes` (from `origin/release` f0aceba). Nothing pushed or merged. 0 Bedrock calls: every run used `INTERLOCK_MODEL=off`, server bound to 127.0.0.1.

## 1. What changed

- **Autoplay now works in you mode** (and still works in model mode). It plays a fixed script of proposals through the real gate (`POST /session/{id}/propose`) and the real human key (`POST /session/{id}/mfa`). No model, no new endpoint, no server change. Files: `ui/src/lib/autoplay.ts` (`SCRIPTED_STEPS`, new step kinds), `ui/src/App.tsx` (`startAutoplay(scripted, code)`, `requestAutoplay`), `ui/src/components/AutoStart.tsx` (the prompt), `ui/src/components/Console.tsx` (button shown in both modes).
- **Race view**: the attack selector follows the attack being played during "Replay all 20" (`RaceView.tsx`, one effect). Checked live: the selector took 20 distinct values, `inj-01` to `multi-02`.
- **Layout fixes found by looking at the screenshots** (section 5).
- **Docs**: `VIDEO_SCRIPT.md`, `README.md`, `docs/JUDGES.md` no longer say Autoplay needs model mode.

## 2. The autoplay sequence (you mode, measured at 1440 and 1920, human step done by typing the code at the start)

Total about 83 s. The caption shows 1.8 s before each step runs, then a 4.2 s pause (the last step holds 7 s).

| # | Starts at | Step | Real call | Result seen |
| :-- | :-- | :-- | :-- | :-- |
| 1 | 0 s | legitimate: log in | propose AUTH | ALLOWED, AUTHED |
| 2 | 8.5 s | legitimate: draft 250 to Alice | propose DRAFT | ALLOWED, DRAFTED |
| 3 | 17 s | the human turns the key | POST /mfa with the code the owner typed | MFA, APPROVED (key animation plays) |
| 4 | 25.4 s | legitimate: execute the approved transfer | propose TRANSFER | ALLOWED, back to AUTHED |
| 5 | 33.9 s | attack: double spend (replay the spent approval) | propose TRANSFER | BLOCKED, not allowed in AUTHED |
| 6 | 42.7 s | attack: skip MFA on a new draft | propose DRAFT, TRANSFER | DRAFT allowed, TRANSFER BLOCKED in DRAFTED |
| 7 | 54.2 s | the human approves the new draft | POST /mfa | MFA, APPROVED |
| 8 | 62.6 s | attack: edit the draft after approval, then execute | propose EDIT, TRANSFER | EDIT allowed and drops the approval, TRANSFER BLOCKED in DRAFTED |
| 9 | 73.8 s | final state: scoreboard | none | caption reads "8 proposed, 7 ran, 3 blocked"; the scoreboard stays up 7 s |

The task asked for a human step before one execute and three attacks. The script has two human steps because "edit after approval" needs an approval to exist first. Each blocked step opens the why-blocked path on the stage and the receipt in the console. The run is stoppable with Esc or the Stop button at any moment, including while the key is requested.

## 3. How the human step stays honest

- The demo code is not in UI source (a test checks that no step carries a code) and not in any file of this branch. The server reads it from `DEMO_MFA_CODE`; for the screenshots it came from a file under `$KIROCREW_SCRATCH`.
- Before the run, a prompt (`AutoStart`) explains that the key is the human's step, and asks the owner to type the code once. The code stays in a ref in that tab for the run and is cleared when the run ends or stops. It is sent only in the body of the same `POST /mfa` a person uses; the script never sends MFA as an agent proposal (a test checks that the proposals contain only the five agent tools).
- "Skip the human step": nothing approves, steps 3 and 7 show a toast saying so, and the gate refuses the transfer (covered by a test against the real transition table).
- A wrong code makes the real key dialog open so the owner can retry; the gate's 403 path and lockouts are unchanged.
- No event is faked: every ALLOWED, BLOCKED and MFA beat comes from the server's SSE stream or the `/mfa` response.
- Limit: whoever types the code at the start is the human. A viewer who watches the video does not see the code typed (the field is a password field).

## 4. Tests

- Python fast subset: **422 passed** (`pytest -q --ignore=tests/test_mutation_m3.py --ignore=tests/test_replay_m5.py`).
- `npm test`: **131 passed** in 13 files. New: `autoplay.test.ts` (5: step order, no step bypasses the gate and no code in steps, legit transfer plus three blocked attacks against the real table, skipped human step refuses the transfer, stop at the human step and by the owner), `autostart.test.tsx` (2), one race selector test.
- `npm run build`: JS 326.9 kB, **103.7 kB gzipped** (limit about 400 kB). CSS 8.4 kB gzipped.
- `python scripts/secret_scan.py`: 0 findings.

## 5. Screenshots (`docs/ui-v2/final/`, headless Chrome over DevTools, `prefers-reduced-motion: no-preference`, script `shoot-final.mjs`, raw timings and console errors in `shoot-report.json`: 0 errors)

At 1440x900 and 1920x1080 (`1440-*.png`, `1920-*.png`):

- `*-finance-idle.png`: finance, you mode, fresh session. Header fits.
- `*-autoplay-prompt.png`: the start prompt before the code is typed.
- `*-autoplay-human-key.png`: step 3, caption "the human turns the key", "needs a human" notice up.
- `*-autoplay-key-turned.png`: the same step after the key turned (MFA token on DRAFTED).
- `*-autoplay-blocked-attack.png`: step 6, TRANSFER blocked in AUTHED and DRAFTED, VOID stamps on the tape, why-blocked line on the stage.
- `*-autoplay-final.png`: step 9, scoreboard 8 proposed, 7 ran, 3 blocked.
- `*-safe-ship.png`: Policy safe-ship with the recorded Kiro run, step 3 PUSH REFUSED in EDITED. `*-safe-ship-end.png`: after the replay finished.
- `*-race-mid.png`, `*-race-after.png`: race view during and after Replay all 20 (10 forbidden for prompt-only, 0 for Interlock; the selector ends on `multi-02`).

At 390x844: `390-finance-idle.png`, `390-safe-ship.png` (full page).

`architecture.png`: `docs/architecture/architecture.html` at 1440 wide. Nothing looks wrong. One small point: the "model" label under the Strands agent sits very close to the box edge. Not changed.

**Fixed after looking (each a small commit):**

1. At 1440 the header was 101 px too wide, so the **Race** and **Proof** buttons were cut off (Race is in the video script). Tighter gap, padding and no subtitle under 1700 px; all buttons now fit.
2. Safe Ship at desktop sizes: the "recorded Kiro CLI run" tag was drawn on top of the table rows and the loop labels (COMMIT) sat on the table. The three states moved right and the table starts lower when the tag is shown.
3. Safe Ship at desktop sizes: the finance drag-handle lines and the finance scoreboard showed through the view. Both are hidden while it is open.
4. Safe Ship at 390 px: the view was squeezed into a 36 px column (text one word per line). Fixed; the stage, what-if box and recorded run now fill the width.

**Still imperfect, not fixed:** at 390 px the two loop labels "EDIT / COMMIT" and "TEST / COMMIT / PUSH / DEPLOY" sit close together on the horizontally scrolling stage, and the table is partly off screen to the left (the stage scrolls to the current state). Readable, not tidy. On the 390 px finance view the stage is cropped by design (it scrolls sideways).

## 6. Commits (`git log --oneline origin/release..demo-fixes`)

Two more commits come after the list below: b623601 Add final screenshots, and the one that adds this report. The report is the final file.

```
11c9e26 Fix Safe Ship ledger overlap
17233ba Fix header and mobile Safe Ship layout
4d86b7b Fix Safe Ship overlap and stray lines
b375f9a Docs: autoplay works in both modes
2c86dc9 Autoplay works without a model
2c78024 Race selector follows played attack
```

## 7. Not checked

- Model-mode Autoplay (needs Bedrock; 0 calls allowed). Its code path is unchanged apart from the shared `propose` hook in the step runner; the existing tests pass.
- Touch devices, Firefox and Safari: only headless Chrome was used.
- The wrong-code path inside autoplay (falls back to the key dialog) is implemented but was not exercised in the browser.
- Python slow tests (`test_mutation_m3.py`, `test_replay_m5.py`) were skipped as instructed.
- Rate limits: the sequence sends about 8 proposals and 2 MFA calls, under the 30 per 60 s limits; a visitor who also clicks by hand during autoplay is blocked by the busy state, not by the limiter.
- Autoplay run on a public host over HTTPS: not available (nothing deployed).
