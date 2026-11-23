# UX BASICS report (B1 to B5)

Branch `ux-basics`, worktree `C:\Mridul\Programs\Kiroween-wt\ux-basics`, cut from `ui-instrument`. Local only: not pushed, not merged. Comp A identity kept (near-black ground, thin phosphor lines, amber only for the human key). No new library, no new colour token.

## What was built, per task id

- **B1 Resizable panels.** `ui/src/lib/layout.ts` (sizes, bounds, versioned `interlock.layout.v1` in localStorage, per-field fallback on corrupt or missing data, window-aware clamping so the stage never drops under 240 px) and `ui/src/components/Separator.tsx` (role=separator, aria-orientation, aria-valuenow/min/max, focusable; arrows step 16 px, Shift 64 px, Home/End min/max, Enter or double click reset; pointer capture, release on up, cancel and lostpointercapture). Three separators: console width, tape height, proof drawer width. Header has a visible Reset layout button (also in the palette). The SVG stage already scales through its ResizeObserver; tape lanes now spread to use extra height. Collapse: the console keeps its Hide toggle; the drawer closes. The tape has no collapse (see weakest things).
- **B2 Tour.** `lib/tour.ts` (6 steps, reducer, once-only rule, key `interlock.tour.v1`), `components/Tour.tsx` (spotlight plus callout, focus to Next and back to the opener, Esc skips, Left/Right keys, Tab trapped in the callout, polls the target so it finds the machine after load, no transitions under reduced motion). Auto-starts once per browser after the cold open; skip, finish and close all count as seen. Replay from the header Help button, the T key and the palette. Copy makes no claim beyond the reports (a test bans "hallucination", "mathematically", "jflap", "proven").
- **B3 Layout flaws.** Notifications moved out of the stage into their own rail row (94 px, sized for the 3-toast cap, empty-state line when idle). Key panel now has a reserved zone `KEY_ZONE` in stage units, positioned from the stage mapping (not the stage bottom); the long return conduit bows 105 instead of 150, the human port moved beside the panel with a label; a unit test samples every conduit and label against the zone, and the screenshot script checks the same in the real DOM. Tape: default 250 px, explanatory empty state, void stamp text shortened. Console: explanatory empty transcript (what PROPOSES, ALLOWED, BLOCKED chips will look like). Narrow layout: key panel icon no longer escapes to the page corner; toasts use the rail.
- **B4 Motion review.** `server/stub_model.py` gets dev-only `STUB_DELAY_MS` (default 0, off; bad or negative values mean off; own commit 85516a1, 2 tests). **Finding that explains the old screenshots:** headless Chrome reports `prefers-reduced-motion: reduce` by default, so every earlier "animation" capture was the reduced-motion path (160 ms highlight), independent of the stub speed. `shoot-ux.mjs` now forces `no-preference` (and `reduce` for one labelled strip). With STUB_DELAY_MS=600 the strips have 8 of 8 distinct frames for allowed and rejected (sha1 hashes in `shoot-report.json`), plus a 4-frame reduced-motion strip (3 distinct, the last two equal because the outcome has settled). Review against MOTION_GRAMMAR: spawn 380, flight 760 (inout), verdict 140, conduit 620, ignite 520, impact 120, shudder 380, shatter 300, suck 760 all match the table; frames show the token spawning at the agent port, the bolt trail in flight, the green conduit ride, the red barrier arcs at the gate and the shard burst. I changed no timing or easing: nothing looked wrong enough to deviate from the single source.
- **B5 Command palette.** `lib/keymap.ts` (actions, shortcut map, `isTyping` guard, fuzzy filter), `Palette.tsx` (Ctrl+K or `/`; combobox with listbox, arrows, Enter, Esc, focus returns), `HelpOverlay.tsx` (`?` or Keys button, lists every shortcut). Actions: fire vector 1 to 6, autoplay, reset session, toggle console, toggle drawer, toggle sound, toggle haptics (only where supported), reset layout, start tour, help. Single keys: 1 to 6, A, C, P, S, T, ?, /; none fire inside input, textarea, select, dialog, an aria-modal element or a separator; Ctrl/Cmd+K works from inside the message box; nothing fires while a modal is open.

## Commits (`git log --oneline ui-instrument..ux-basics`)

```
61063fd Add UX screenshots and strips
a88f7ef Fix narrow key panel and toast placement
10a24ee Add UX screenshot script
de6b8e4 Size rail for three toasts, taller tape
0da3599 Shrink rail and fix empty tape text
4cbda08 Tidy void stamp text and stem
462bd5d Track tour target while page loads
219d8e2 Wire tour, palette, help into shell
05ba702 Test tour, palette and shortcut guard
db8ecfd Add first-run tour and state machine
841eeb7 Add command palette and shortcut map
a799e91 Test layout persistence and separators
39ebc03 Wire resizable panels and notification rail
ad8e791 Clear key zone and scale tape lanes
89597be Add keyboard and pointer separator
6a13e64 Add persisted panel layout store
85516a1 Add dev-only STUB_DELAY_MS to stub model
```

## Tests

- UI (Vitest + RTL): **52 passed in 7 files** (26 existing unchanged, 13 in `layout.test.tsx`: persistence, corrupt storage, bounds, separator keys and pointer drag, key-zone geometry; 13 in `tour_palette.test.tsx`: tour state machine, once-only, Tour component, palette filtering and run, shortcut guard). `npm run build` clean (tsc and vite).
- Python fast subset (`pytest -q --ignore=tests/test_mutation_m3.py --ignore=tests/test_replay_m5.py`): **321 passed, 1 failed**. The failure is `tests/test_gen_table.py::test_generated_file_is_fresh`: in this worktree `bank/executor_table.py` is checked out with CRLF line endings (autocrlf) and the test compares bytes. The same test passes (3 passed) in the main folder. Not caused by this work; not fixed.

## Bundle

JS 294,461 bytes raw, 93,691 gzipped (was 87,416 gzipped; target under about 400 KB). CSS 25,163 raw. Offline, no new dependency.

## Contrast

No new colour tokens. `node ui/scripts/contrast.mjs`: all pairs pass (unchanged). New text uses existing tokens: "human port" label uses `--faint` on void (same family as the existing 4.82+ port labels), tour and palette text use `--ink` and `--muted` on `--panel2`. The palette's highlighted row (`--ph` on a 9 % phosphor tint over panel2) and the dimmed spotlight backdrop were not measured separately.

## Screenshots (`docs/ui-v2/ux/`, STUB=1, STUB_DELAY_MS=600, server on 127.0.0.1:8011, headless Chrome over DevTools, motion forced to no-preference except where named)

For each of 1440 (1440x900), 1920 (1920x1080), 1280 (1280x720):
- `<w>-idle.png`: default layout, no overlays.
- `<w>-resized.png`: after real mouse drags (console 160 px wider, tape 120 px taller); `<w>-resized-after-reload.png`: same layout restored from localStorage.
- `<w>-tour-1-machine.png`, `<w>-tour-3-tape.png`, `<w>-tour-4-key.png`: tour steps 1, 3 and 4 (first-run state).
- `<w>-palette.png`: command palette open. `<w>-help.png`: shortcut overlay.
- `<w>-rejected-rail.png`: TRANSFER in START rejected, BLOCKED notification in the rail, VOID stamp on the tape.
- `1440-key-approved.png`: log in, draft, key turned (demo code typed on the keypad, read from a file outside the repo), human cell on the tape, three notifications in the rail.
- `390-idle.png`: 390x844 at 2x.
- `strip-allowed-0..7.png`, `strip-rejected-0..7.png`: 8 frames each, 1440 stage crop, 800 to 3500 ms after the click; 8 of 8 distinct hashes each. `strip-reduced-rejected-0..3.png`: reduced-motion path for comparison.
- `shoot-report.json`: hashes, distinct counts, saved layouts, DOM overlap checks (0 findings at every size and state), console errors (0). `shoot-ux.mjs`: the script.

Server and Chrome were stopped afterwards (port 8011 not listening; the servers still running on port 8000 belong to someone else).

## Not checked

Screen reader behaviour (separator, palette combobox, tour dialog announcements); a real touch device (390x844 is emulated, and drag handles are hidden at 900 px and under, so resizing is desktop only); real GPU frame times (software rendering, no new frame-time sample taken); sound by ear; haptics; the full Python suite and the two ignored slow files; 1920 and 1280 tour steps 2, 5, 6 were not looked at one by one; contrast of the palette highlight and spotlight dimming; Firefox and Safari; strict 3-flashes-per-second by measurement.

## Five weakest things

1. Mobile (900 px and under) gets no resizing, no collapsible tape and a long stacked page; the tour and palette there were not screenshotted beyond idle.
2. The tape cannot be collapsed (B1 says collapsible): it can only be dragged to its 150 px minimum. The rail is a fixed 94 px band, so there is a visible empty strip when no notification is showing.
3. Motion was reviewed from 8 sampled frames per beat, not a video, and I made no timing change; the token at the gate still covers part of the orb and the edge label for a moment (e.g. "AUTH" under TRANSFER), which I judged transient and in line with the grammar.
4. The key panel is a fixed 126-unit box with `overflow: hidden`; if a result message or the keypad text grows it could clip. It was not stress-tested with long messages. The tour's callout placement is a simple below/above rule and can sit over other controls on small windows.
5. Shortcut letters (A, C, P, S, T) are my choice, not from an existing keymap, and single-key actions can still fire when focus is on a plain button; reset session and reset layout have no single key on purpose.
