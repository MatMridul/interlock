# INTERLOCK UI build report (comp A, Instrument)

Branch `ui-instrument` (local only, not pushed, not merged). Written last, after the final screenshot run.

## What was built

Vite + React + TypeScript with a hand-built SVG stage. No @xyflow/react, no CDN, no external requests. Fonts (Barlow Condensed, IBM Plex Mono, OFL) are self-hosted in `ui/src/assets/fonts` with licence texts.

- Machine stage: automaton drawn from `GET /policy` (only per-state screen positions are in the UI), delta table, q0 arrow, M = (Q, Sigma, delta, q0, F) notation, rejected-moves sink port with its label.
- Event director: SSE events go through a queue and a timeline (PROPOSED token, ALLOWED ride and ignite, REJECTED barrier and shatter into the sink, state unchanged). Reduced motion gives an instant outcome with a short highlight.
- Trace tape with stepped state trace, per-cell latency on hover, red VOID stamps for blocked proposals. "executed trace is in L(M)" is computed by replaying the server's executed log through `/policy`.
- Scoreboard: Proposed, Allowed, Blocked, Side effects from blocked (computed from the executed log against rejected proposals), transfers x of 3, consecutive rejects x of 5, spend cap.
- Human key (the only amber object): guarded cover, inline keypad, calls `POST /session/{id}/mfa`, never displays the code, shows success, gate reject and 403 plainly. The console is labelled as having no path to it.
- Agent console dock (collapsible), plain-text transcript, tool and verdict chips, "untrusted" label, six attack vectors on keys 1 to 6, Reset session, stoppable AUTOPLAY using real chat messages and the real `/mfa` endpoint.
- Proof drawer (executed log as source of truth, last verdict fields as sent, invariants, non-guarantees), cold open (skippable, once per session, off under reduced motion), sound and haptics toggles (off by default), toast stack (max 3, assertive for blocked and needs-human).
- Python server: no changes.

## Deviations and caveats

- Proof drawer: invariants are short lines with pointers to report files; I did not re-verify each pointer line by line.
- The STUB model answers instantly, so the timed screenshots (`*-token-in-flight`, `*-allowed-mid`, `*-rejected-barrier`, `*-rejected-shatter`) mostly show settled frames, not the true mid-animation moment. See weakest things below.
- Frame sampling is software-rendered headless Chrome, not a real GPU.
- Bedrock: 0 real calls.
- The brief's 336 Python test count was not re-run in full; the fast subset was.

## Commit list (`git log --oneline main..ui-instrument`)

```
c356142 Add UI build screenshots and strips
185818b Rewrite UI README for Instrument
faf78b4 Update README UI and test counts
a4c48cc Add contrast check over UI tokens
bec196b Anchor key panel inside stage bottom
9a48b1d Test stage highlights policy state
832593c Test scoreboard and log replay
5044bac Test event queue and timeline order
8c1b16b Wire application shell to server
737ec99 Add skippable cold open title card
adaa747 Add toast stack and live region
f44175b Add proof drawer with invariants
787dec0 Add collapsible agent console dock
1dbc8f8 Add guarded human key control
ccc7190 Add stepped trace tape with VOID stamps
6974174 Add scoreboard component
d112d79 Add SVG machine stage component
baaaf51 Add instrument stylesheet from comp A
8a6ac78 Place human port beside key panel
18b2f76 Let queue observers see beat moments
76a8421 Add scripted autoplay runner
d8fdf70 Add sound and haptic cue synthesis
74d0d0a Add notification model with toast stacking
c4f8891 Add phosphor canvas effects and fonts
7fc54fb Add scoreboard maths and stage geometry
3769789 Add event queue and animation timeline
34e7a12 Add UI reducer with tests
0e7b84b Add SSE parser and API client
5772fd5 Add UI project configuration files
```

## Commands

```
cd ui; npm ci; npm run build; npm test; node scripts/contrast.mjs; cd ..
$env:DEMO_MFA_CODE = "<choose a code>"    # env var name only; value never written here
$env:STUB = "1"                            # optional canned model
.venv\Scripts\python -m uvicorn server.app:app --host 127.0.0.1 --port 8000
.venv\Scripts\python -m pytest -q --ignore=tests/test_mutation_m3.py --ignore=tests/test_replay_m5.py
node docs/ui-v2/build/shoot-ui.mjs docs/ui-v2/build <file-with-code-outside-repo>   # server must run with STUB=1
```

## Tests

- Python fast subset: 320 passed (11.5 s).
- UI (Vitest + RTL): 26 passed in 5 files: SSE parser (chunk boundaries, multi-line data, split UTF-8), reducer, event queue (order, no loss, reduced motion), scoreboard side-effects, stage highlighting from policy JSON.
- `npm run build`: passes, no TypeScript errors.

## Size and frame time

- JS 278,228 bytes raw, 87,416 bytes gzipped. CSS 21,361 raw, 5,506 gzipped. Under the 400 KB target.
- rAF deltas, headless Chrome, software rendering, page load through one allowed animation: n=351, median 16.7 ms, p95 16.9 ms, max 18.7 ms, 0 frames over 33 ms (`docs/ui-v2/build/shoot-report.json`). Console errors during the run: 0.

## Contrast (real tokens from `ui/src/styles.css`, `ui/scripts/contrast.mjs`)

All 24 pairs pass (`docs/ui-v2/build/contrast-ui.txt`). Lowest text pairs: faint on panel2 4.82, muted on panel2 6.93, red on panel 6.87; ink on void 15.75; amber on void 11.23; ph on void 16.01; void on red 7.16. Non-text: amber-dim on void 3.22 (min 3), line2 on void 2.07 (min 1.5).

## Screenshots (all in `docs/ui-v2/build/`, all captured; none skipped for memory)

For each of 1440 (1440x900) and 1920 (1920x1080):
- `<w>-cold-open.png` and `<w>-idle.png`: start state; cold-open is captured after the title card, so it is near-identical to idle.
- `<w>-token-in-flight.png`, `<w>-allowed-mid.png`: legit AUTH proposal; mostly settled frame (see weaknesses).
- `<w>-rejected-barrier.png`, `<w>-rejected-shatter.png`: TRANSFER in START, BLOCKED toast, VOID stamp on tape, sink.
- `<w>-after-reject-scoreboard.png`: scoreboard after the reject.
- `<w>-key-cover-lifted.png`, `<w>-key-keypad.png`: human key with cover lifted, keypad.
- `<w>-key-approved.png`, `<w>-transfer-success.png`: key turned, then a successful transfer.
- `<w>-proof-drawer.png`: proof drawer open.
- `<w>-locked.png`: session locked after repeated rejects.
- `<w>-autoplay-running.png`, `<w>-autoplay-after-key.png`: autoplay in progress.
- `1280-idle.png`: 1280x720 idle. `390-idle.png`, `390-rejected.png`, `390-after-reject.png`: 390x844.
- `strip-allowed-0..7.png`, `strip-rejected-0..7.png`: 8 frames each at about 250 ms to 3 s (1440 stage crop). Several frames are byte-identical, so the strips show the settled outcome, not a smooth animation.
- `shoot-report.json`, `shoot-ui.mjs`, `contrast-ui.txt`: capture script, results, contrast output.

## Not checked

Screen reader behaviour; real sound by ear; haptics (needs a supporting Android browser); real-device mobile (390x844 was only emulated in headless Chrome); real Bedrock responses (0 calls); real GPU frame times; the full Python suite and the two ignored slow test files; strict 3 flashes per second verified only by design, not by measurement.

## Five weakest things in the screenshots

1. Mid-animation frames are not truly mid: with STUB the events arrive instantly and the captures land after the animation; the token and shatter are not visible in `allowed-mid` or the strips.
2. Strips are largely duplicate frames, so they do not demonstrate motion.
3. At 1440 the delta table at top left runs under the toast stack ("q0 = START", "last de..." is cut off by the toast).
4. The human key panel sits over the lower right of the stage and overlaps the return conduit's curve near the TRANSFER / CANCEL label; it has its own box but the conduit still passes behind it.
5. The tape is mostly empty early in a session (a few cells in a wide band), and the console below the transcript has a large empty gap above the input.
