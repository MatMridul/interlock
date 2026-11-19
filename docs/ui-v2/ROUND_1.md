# ROUND 1 (revised): design process, three comps

Item it_0a5794d6. Nothing committed or pushed. 0 Bedrock calls. After the conductor's steer I stopped the React build and ran the design-studio process: psychology rationale, one motion grammar, three openable comps, screenshots. The earlier React work in `ui/` (new `src/lib/*`, `Stage`, `Scoreboard`, `TraceTape`, `Airlock`, `Console`, `ProofDrawer`, fonts) is kept on disk but paused and not finished: `ui/src` was left half-migrated (old `Automaton`/`Chat`/`MfaControl` deleted, `@xyflow/react` uninstalled, `App.tsx` not rewired), so `npm run build` and the old 20 UI tests do **not** pass right now. Python: **336 passed** (334 plus 2 new tests for the stub).

## Assumptions I made instead of asking
- The interview answers are inferred from the brief: the viewer is a hackathon judge, skeptical, 3 minutes, comparing against "another AI wrapper"; the one moment is a blocked proposal next to a human approval; it must NOT feel like a Halloween costume, a crypto dashboard, or a chat UI with a sidebar. Adjective triad used to judge every comp: **exact, dry, physical**.
- Comps use canned data and say so on screen ("canned replay, not live"). The attack vector buttons all replay the same single rejected sequence; "Draft 250 to Alice" replays the allowed one.
- Window size 1440x900 first, then 1920x1080. 390x844 was not designed for in the comps (see weaknesses).

## How to open
Open `docs/ui-v2/comps/index.html` (links to `comp-a.html`, `comp-b.html`, `comp-c.html`). No server, no build. Query flags: `?play=allowed`, `?play=rejected`, `?view=hard&drawer=1` (locked session with a dense tape and the proof drawer). Rebuild after editing `comps/src/*`: `.venv\Scripts\python docs\ui-v2\comps\build.py`. Screenshots: `node docs/ui-v2/comps/tools/shoot.mjs comp-a "#scope" docs/ui-v2/round1 <frameDir>` (Chrome headless over DevTools, one process, closed afterwards), strips stitched with Pillow (installed into `.venv`).

## Deliverables
- `docs/ui-v2/PSYCHOLOGY.md`: 13 principles, each with decision and test; effect sizes marked qualitative.
- `docs/ui-v2/MOTION_GRAMMAR.md`: one table (12 events), notification taxonomy, 3-toast rule, sound and haptic notes (Android-only haptics stated).
- `docs/ui-v2/comps/comp-a.html`, `comp-b.html`, `comp-c.html`, `index.html`; sources `comps/src/core.js` (shared model: timeline, snapshot, token pose, notifications, WebAudio, vibrate), `comps/src/comp-{a,b,c}.html`; `comps/build.py`; `comps/tools/shoot.mjs`; fonts and OFL licences in `comps/fonts/` (IBM Plex Mono, Barlow Condensed, IM Fell English, EB Garamond, B612, B612 Mono).
- `docs/ui-v2/contrast-comps.mjs` and `contrast-comps.txt` (also older `contrast.mjs/.txt` for the paused React tokens; `DESIGN_SPEC.md` marked superseded).
- Screenshots in `docs/ui-v2/round1/`, per comp `comp-X-`:
  - `1440-idle.png`, `1920-idle.png`: hero screen at rest (history: 1 refused, 2 allowed, 1 refused).
  - `1440-allowed-mid.png`, `1920-allowed-mid.png`: token mid-conduit, arc charging, DRAFT being allowed.
  - `1440-rejected-mid.png`, `1920-rejected-mid.png`: shatter and drain toward the sink, lit state unchanged.
  - `1440-rejected-barrier.png`, `1920-rejected-barrier.png`: barrier shudder at the gate.
  - `1440-hard-locked-proof.png`, `1920-hard-locked-proof.png`: the hard screen: locked session, 9-cell tape, 5 refused cells, proof drawer open.
  - `strip-allowed.png`, `strip-rejected.png`: 8-frame strips at 1440 (stage region, t in ms printed on each frame).
  - `390-idle.png`, `390-rejected.png`: narrow check (documents that the comps are desktop-only, see weaknesses).
- Frames are produced by `__comp.seek(kind, t)`, a pure function of time, so a frame is the real render at that instant; real-time smoothness (fps) was **not** measured this round.

## Comp A, "Instrument" (the conductor's direction)
**Thesis.** The machine is a measuring instrument: thin phosphor linework on near-black, a graticule, tabular numerals, and a trace tape that is a stepped chart-recorder line. Amber appears once, on the human key. **Keep:** the chart-recorder tape (state level over event index, refused cells hanging above and never reaching the trace); the hatched Blocked numeral and the huge "Side effects 0"; key-number shortcuts 1 to 6; the phosphor persistence as the afterglow. **Weak (brutal):** (1) it is the genre everyone expects from "serious AI safety demo": green on black, so the first 10 seconds do not surprise; (2) the machine is small inside a large empty graticule, and the vector list eats the transcript height; (3) the stepped line is cropped on the left in the dense tape and the human key box crowds the return conduit label.
- Contrast: all 11 pairs pass; body ink 15.75:1, muted 7.68:1, red 7.16:1, amber on dark 10.77:1; the faint notation grey is 5.33:1 (decorative use only).
- Weight: 62 KB HTML (inlined JS and CSS) plus 109 KB fonts.

## Comp B, "Plate" (divergent, light)
**Thesis.** A natural-philosophy plate: warm paper, engraved glass globes joined by double-line conduits, marginalia in italic, one vivid ultramarine ink for electricity; refusals are a brick stamp and a struck-through line, the human step is a brass seal. **Keep:** the Plate IV framing and "Register of the Experiment"; the receiver (bell jar) as the sink; the stamped "Refused" chips; the ink-wash afterglow; the voice of the copy. **Weak:** (1) the seal box still sits close to the APPROVED globe and the long return conduit label at 1440; (2) marginalia at 14 to 15 px italic are hard to read in a 3-minute screen recording, and a bright paper page glares in video; (3) the reject beat has the least drama: ink dots on paper read as dust, there is no energy, and the title and register arrangement in the header is awkward.
- Contrast: all 11 pairs pass; ink 14.75:1, soft 7.27:1, blue ink 7.22:1, brick 6.90:1, brass 5.20:1; the faint ledger notation 4.18:1 (decorative only).
- Weight: 59 KB HTML plus 208 KB fonts (the heaviest).

## Comp C, "Panel" (my own: tactile hardware panel)
**Thesis.** A putty-grey rack panel with silkscreen print: state lamps, transition lamps that cool down like filaments, odometer counters, hazard-striped barrier, a paper strip for the tape, and the human step as a **guarded key switch** (lift the cover, then turn the key). It is the one point of view where the physical constraint is the safety message, and where sound and haptic feedback match what the eye sees (click, thunk, relay). **Keep:** the guarded key; odometer counters with a "LOG CLEAN" lamp; the hazard bar as the blocked signifier; VOID stamps on the tape. **Weak:** (1) the olive LCD transcript is a large flat slab that competes with the machine, which should be the hero; (2) the mid-tone putty has less atmosphere than A or B and risks reading as a retro toy; engraved labels are 10.5 to 11.5 px; (3) the signal packet (dashed line plus tag) is less beautiful than A's bolt, and the physical metaphor lacks depth cues beyond a few shadows.
- Contrast: all 12 pairs pass after one fix (the human conduit label went from 4.01:1 to 5.73:1); ink on panel 10.29:1, LCD ink 8.57:1, white on blocked chip 9.39:1.
- Weight: 60 KB HTML plus 71 KB fonts (the lightest).

## Recommendation
**C as the frame, with A's tape and B's voice.** Against the psychology doc: C is the only comp where signifiers and constraints (cover, key, hazard bar) carry the "human vs agent" message without words (Norman, von Restorff), where cross-modal sound and haptics are natural (cross-modal congruence), and the counters show measured numbers (calibrated trust). It is also the least likely to be taken for AI-generated: no neon, no gradient, no card grid. Take from A the stepped chart-recorder trace and the keyboard shortcuts; take from B the specific, dry copy and the bell-jar sink. If the owner values the first 10 seconds above everything, B is the more unforgettable image and C is the more explanatory one; I would still build C because B's light paper and small italics are a recording risk. Anti-slop check: none of the three uses a purple/blue gradient, glass cards, a rounded card grid, emoji icons, sparkle icons, centred symmetry, or lorem ipsum; all use custom-drawn glyphs and self-hosted OFL fonts.

## What I did not do or check
- No screen-reader run; live-region wiring (polite for allowed, assertive for blocked and needs-human) is in `core.js` but unverified with a real reader. Reduced-motion code path exists (instant outcome plus a short highlight) and was not screenshot-tested. Sound was not heard (headless); haptics untested (Android only). Narrow layout (390) is not designed in any comp: the `*-390-*.png` files show a broken stage. No real-time frame-time measurement. The new-user usability review (frontend-design-workflow Phase 4) was not run; it needs a fresh sub-agent and a chosen direction.
- Canned replays only: the comps do not call the server. The autoplay and SSE queue built earlier in `ui/src/lib` are untouched and would be reused for the chosen direction.

## Questions for the owner (max 3)
1. Should the 3-minute video lead with the dark, cinematic look (A) or can the hero image be a light paper plate or a hardware panel (B, C)?
2. Is physical, tactile metaphor (guarded key, relay clunk, optional sound and haptics) welcome, or must the product feel purely digital?
3. Is a laptop-only demo enough, or must a phone view be designed (it changes the stage layout for every comp)?
