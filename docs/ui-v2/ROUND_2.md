# ROUND 2: comp D, "Dark Panel"

Item it_b4034719. Nothing committed or pushed. 0 Bedrock calls. Only `docs/ui-v2/` was touched (no `ui/src`, `server/`, `bank/`). The owner has not approved D yet: it exists to be compared with A and C at pixel level.

## Thesis
A dark anodized rack panel lit only by its own lamps: four filament lamps joined by conduits, a guarded amber key as the one human control, and mechanical counters that show the real counts.
Every physical part carries a fact (key = the human control, odometers = counted events, VOID stamps = blocked proposals, tape = executed word), so the object is evidence, not decoration.

## How to open
Open `docs/ui-v2/comps/comp-d.html` (also linked from `comps/index.html`). No server, offline, fonts local.
Flags: `?play=allowed`, `?play=rejected`, `?play=key` (lift, code, quarter turn, amber packet, APPROVED), `?view=hard` (locked session, 14 events), `?boot=1` (force the cold open; it plays once per browser session, off under reduced motion, any key or click skips). `?boot=0` skips it.
Keys: `1` to `6` fire the attack vectors. Sound toggle (top right) needs a click to start the AudioContext. Rebuild after editing: `.venv\Scripts\python docs\ui-v2\comps\build.py`.

## What makes D different from A and C
- **vs A:** A is flat phosphor linework on a graticule; D is a physical object. The machine fills about half the screen (A's sat small in empty grid). Counts are mechanical wheels, the human step is a hinged guard plus a key plus a keypad, not a bordered box with a button.
- **vs C:** C is a putty-grey slab with an olive LCD that outweighs the machine. D is dark, the console is a 22 percent dock (collapses to a one-line vertical strip), and the light comes from the lamps: a soft radial spill on the panel around the lit state, filament bulbs on every transition that heat up while a packet rides through and cool over 2.8 s.
- **vs both:** the two refusals of A and C are a bolt or a dashed line. D slams a red and graphite hazard barrier (the orb shudders with it), plates "BLOCKED", shatters the packet into the sink port, and hangs a VOID stamp from a rail above the tape. The trace below stays flat. Side effects are computed (see below), not typed.

## Anti-slop check (self-assessed)
**Not defaults:** no card grid; no centred symmetric hero (machine row is offset, ledger left, key bottom right, sink bottom left, agent jack top right); no gradient used as decoration (the only gradients are the lamp lens, the odometer drum cylinder shading, and the keycap tops, all functional); no frosted glass (the key cover is an opaque-ish smoked plastic guard, no blur); no generic icons (orbs, key, jacks, sink are custom SVG; no emoji, no icon font); no purple or blue anywhere; amber appears only on the key (and on the key packet while the human sequence runs); the hazard barrier is red and graphite on purpose so amber stays unique; condensed engraved labels plus plain mono numerals; notation (δ table, q₀ arrow, double ring on every state because F = Q, M tuple) is silkscreened into the panel.
**Three details a judge remembers:** (1) the guarded key: lift the smoked cover, key in an amber slot, quarter turn with a detent, then an amber packet rides the human conduit to APPROVED; (2) the barrier slam with a physical shudder, BLOCKED plate, red shards pulled into a recessed black sink port while the green lamp never moves; (3) VOID stamps hanging from a rail above a flat trace, with a SIDE EFFECTS wheel at 000 that is recomputed from the tape.
**Is it "A with skeuomorphic decoration"? Check per part:** key = the only way to reach APPROVED, and it is physically separate from the agent console; odometers = `c.proposed/allowed/blocked` from the replay; side-effects wheel = recomputed on every frame (executed entries that delta does not allow from the replayed state, plus entries with no ALLOW or human approval to explain them; 0 for all three canned states, the rule would light the red lamp otherwise); VOID stamps = the real blocked events, placed at their event index; filament bulbs = how recently a transition ran; hazard barrier = the REJECT verdict. Screws, grain and bevels are the only parts with no job (they are the chassis).

## Honest deviations from the brief
- Cold open ends on START (lamp test, then START alone) and then restores the canned session (counters roll to 004/002/002, lamp moves to DRAFTED). That follows the brief literally but the jump from START to DRAFTED is explained only by the roll of the counters.
- No proof drawer in D (the brief did not list it). `shoot.mjs` looks for `#tg-proof`; D has none, so the hard shot is just the hard view.
- All six attack vectors replay the same one canned refusal (as in A and C), labelled on screen. The keypad accepts any 1 to 4 digits (no server), also stated in the module.
- After a key sequence, any other replay resets the key to its armed state and the machine to the canned baseline.

## Contrast
`docs/ui-v2/contrast-d.mjs`, results in `docs/ui-v2/contrast-d.txt`: 30 pairs, all pass, none needed a fix. Highlights: silkscreen ink on panel 12.66:1; secondary silk 7.09:1; secondary on terminal 7.72:1; phosphor on terminal 15.18:1; red on terminal 6.40:1, red on panel 5.89:1; VOID word 5.87:1 on its stamp; odometer cream 12.00:1 and blocked digits 7.30:1 on the drum midtone; white on BLOCKED plate 16.75:1; amber key vs plate 10.33:1 (graphic, needs 3); smoked cover text 10.59:1. The disabled keypad is 3.06:1 by design (exempt, conveys "locked", and the status line says it in words).

## Weight
`comps/comp-d.html`: 81,127 bytes (A 62.6 KB, C 60.8 KB; heaviest of the four because the key, keypad, boot and sound code is inline). Fonts actually loaded: Barlow Condensed 600 and 700 (44.7 KB), IBM Plex Mono 400, 500, 600 (45.2 KB): about 90 KB, all reused from `comps/fonts/` (OFL). No images, no external requests. Render cost measured in headless Chrome: 0.68 ms per frame (mean of 40 forced renders, CPU only, no GPU or real fps measurement).

## Checks run
- Console errors in headless Chrome across all shots and flags: none.
- Reduced motion (emulated `prefers-reduced-motion`): cold open overlay opacity 0 (no cold open), `?play=rejected` jumps to the outcome (state unchanged, DRAFTED), screenshot `comp-d-1440-reduced-motion-rejected.png`. The key lift/turn is instant under reduced motion; not screenshotted.
- Audio: flipping the toggle (a real click) creates an AudioContext in state `running`; all four cues ran without exception. **I did not hear it** (headless); the sounds are noise-burst and sine synthesis and may sound thin. Haptics: feature-detected, hidden when unsupported; untested.
- Frames are `__comp.seek(kind, t)` (pure function of time) as in round 1; real-time smoothness of the key tween and the boot is not measured.

## Files
- `docs/ui-v2/comps/src/comp-d.html` (source), `docs/ui-v2/comps/comp-d.html` (built, single file), `docs/ui-v2/comps/index.html` (D added), `docs/ui-v2/comps/src/core.js` unchanged (D overrides `CORE.Snd.play` for its own sounds).
- `docs/ui-v2/comps/tools/shoot-d.mjs` (screenshots, reduced motion, audio check, perf).
- `docs/ui-v2/contrast-d.mjs`, `docs/ui-v2/contrast-d.txt`.
- Screenshots in `docs/ui-v2/round2/`: `comp-d-{1440,1920}-{idle,allowed-mid,rejected-mid,rejected-barrier,key-lifted,key-approved,hard-locked}.png`; `comp-d-strip-{allowed,rejected,key}.png` (8 frames at 1440, stage only, t in ms); `comp-compare-A-C-D-1440.png` (A | C | D, 1440 idle, 50 percent, labelled); `comp-d-1440-reduced-motion-rejected.png`; `comp-d-1440-dock-collapsed.png`. The 4 cold-open frames and the JSON report are in the scratch dir only (not kept).

## The 5 weakest things
1. **Density of small type.** Tape sub-labels are 9 px, ledger and keypad about 11 to 12 px. At 1440 in a screen recording these will blur; at 1920 they hold.
2. **The key module is crowded and sits on the long return conduit.** At 1440 the module's left edge touches the end of the `TRANSFER / CANCEL` conduit and covers the lower right of the stage; the cover, status line and keypad compete in 330 px.
3. **The cover lift reads as a shelf, not a lid.** `rotateX` foreshortens the "HUMAN ONLY" text into a smear at the top; it needs real depth cues (side hinge hardware, a shadow that grows) to be convincing. Not seen in motion.
4. **Sound and haptics unverified by ear and hand.** Only that the context starts and the cues run. The relay click and low thunk may need tuning, and iOS and desktop have no haptics at all.
5. **The scene is dark and dense, and the "powered object" metaphor is carried by one green hue.** Lit-state vs unlit orb is clear, but the glow spill is subtle on a poor projector; the chassis grain is invisible on compressed video. Also not designed below 1200 px wide (same as A and C).

## Recommendation
Build D, with two fixes before the React port: give the key module more room (or move the return-conduit label) and add real depth to the cover lift. D keeps C's strongest idea (the human step is a physical guard and key, and the counters are real wheels) while fixing C's two faults (the LCD slab outweighing the machine, and the low-atmosphere putty), and it keeps A's tape and shortcut console at a size that does not compete with the machine. It costs about 18 KB more HTML than A or C and about 90 KB of fonts, nothing heavy. Fall back to C only if the owner wants a lighter, less moody look for projector use; fall back to A only if the owner values restraint over objects. The owner should open `comp-compare-A-C-D-1440.png` first, then `comp-d.html?play=key`, then flip the sound toggle.
