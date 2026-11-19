> SUPERSEDED by the design-studio round (PSYCHOLOGY.md, MOTION_GRAMMAR.md, comps/). Kept as the record of the first direction; its React build in ui/ is paused.

# UI v2 design spec: "The Laboratory"

One idea on screen: **the agent proposes, a small formal state machine decides what runs.** Every motion is driven by the real SSE events (`tool_proposed`, `gate_verdict`, `state_change`) or by the real `/mfa` response. Nothing is simulated by timers.

## 1. Concept
Gothic laboratory x circuit board x proof sheet. Near-black void, electric green for "allowed", cold violet for the agent and its proposals, red for rejection, amber only for the human. Thin 1 px linework, faint blueprint grid, fine grain and scanlines, margin notation (a ledger of the real delta(q, sigma) rows read from `GET /policy`). No skulls, no bolts-in-neck: restrained.

## 2. Layout (1440x900 and 1920x1080 first)
```
+--------------------------------------------------------------------------------+
| THE CHIMERIC AUTOMATON   tagline          [Proof] [Autoplay demo] [Reset]       |
| PROPOSED 7 | ALLOWED 3 | BLOCKED 4 | SIDE EFFECTS FROM BLOCKED 0 | session      |
+------------------------------------------------------+-------------------------+
| STAGE (SVG machine + canvas bolts, viewBox 1000x560)  | CONSOLE DOCK (chat)    |
|  delta ledger      AGENT PORT >>>(token)>>>           |  transcript, tool chips|
|  (START)--AUTH-->(AUTHED)--DRAFT-->(DRAFTED)--MFA-->(APPROVED)  verdict chips   |
|     ^   <------TRANSFER / CANCEL---------------+      |  ATTACK VECTORS (6)    |
|  [sink void]                       [AIRLOCK: human]   |  composer              |
+------------------------------------------------------+                        |
| w = [AUTH ->AUTHED][DRAFT ->DRAFTED]...   ghost red cells above (never written)|
| executed trace in L(M): yes (replayed from server log)                          |
+--------------------------------------------------------------------------------+
PROOF DRAWER: slide-over from the right (full screen under 700 px).
Narrow (<1100 px): stage, tape, console stacked; scoreboard wraps into 2x2.
```

## 3. Tokens
Colours (contrast measured by `docs/ui-v2/contrast.mjs`, result in `contrast.txt`; all text pairs >= 4.5:1):

| token | hex | use | on void |
|---|---|---|---|
| void / panel / panel2 | #05070a / #0a0f12 / #101719 | backgrounds | |
| ink | #e8f1ec | text | 17.5 |
| muted | #8fa89d | secondary text | 7.9 |
| faint | #6b8278 | decorative notation only | 4.9 |
| green | #3dff9a | accepted, active state | 15.3 |
| violet | #a58bff | agent, proposals, focus | 7.4 |
| amber | #ffb23d | human approval only | 11.2 |
| red | #ff5c75 | rejected | 6.8 |

Type: JetBrains Mono (symbols, tape, numbers) and Inter (prose), both OFL, self-hosted woff2 (latin subset, 400/600/700) in `ui/src/assets/fonts`. Scale (px): 11 notation, 13 meta, 15 body, 20 scoreboard value (mono), 28 title, 44 intro. Spacing: 4-based (4, 8, 12, 16, 24, 32). Radius 6; orbs are circles.

## 4. Motion
Easing: `out = cubic-bezier(.16,1,.3,1)`, `inout = cubic-bezier(.65,0,.35,1)`. Durations at timeScale 1:

| phase | ms | what you see |
|---|---|---|
| spawn | 380 | token symbol materialises at the agent port |
| flight | 760 | token travels (bezier) to the gate of the CURRENT state |
| verdict | 140 | token holds at the gate, gate ring brightens |
| ACCEPT: conduit | 620 | bolt rides the conduit from current orb to next orb, green arc follows |
| ACCEPT: ignite | 520 | next orb ignites (ripple), state label updates, afterglow on conduit fades over 2.8 s (decorative) |
| REJECT: impact | 120 | barrier arcs flash around current orb |
| REJECT: shudder | 380 | barrier + orb jitter (orb itself does not change state) |
| REJECT: shatter | 300 | token bursts into ~36 red particles |
| REJECT: suck | 760 | particles curve into the sink void; sink ripples once |
Human MFA uses the ACCEPT path in amber from the airlock instead of the agent port (the token starts at the airlock, no flight from chat).

Animation state machine (per beat): `idle -> spawn -> flight -> verdict -> {accepted: conduit -> ignite | rejected: impact -> shudder -> shatter -> suck} -> idle`. Beats come from a FIFO queue, one at a time, so rapid events stay readable. If more than 3 beats wait, time is compressed to 0.55x (never dropped). A hidden tab skips straight to the end state. Debug: `window.__chimeric.setTimeScale(n)` and `.phase` (used by the screenshot script).

## 5. Event to animation mapping
| SSE / API | queue effect |
|---|---|
| `user_message` | chat line immediately (when the queue is idle it is released at once, else in order) |
| `tool_proposed` | held; paired with the next `gate_verdict` into one beat. Token label = symbol of the tool (small tool->symbol map in UI; unknown tool = its name upper-cased) |
| `gate_verdict` ACCEPT | beat "accepted": chat proposal chip at spawn, verdict chip at impact, scoreboard Allowed +1, tape cell written at ignite |
| `gate_verdict` REJECT | beat "rejected": verdict chip at impact, Blocked +1, ghost cell above the tape. State does not change. |
| `state_change` | released with the accepted beat at ignite: the displayed state moves only now |
| `assistant_text`, `done`, `error` | released after the beats before them (text is revealed by a typewriter; the server sends the text whole) |
| `POST /mfa` ACCEPT / gate REJECT | human beat (amber). 403 wrong code: no beat, the dialog says so. |

## 6. Components
`Intro`, `Stage` (SVG machine, delta ledger, sink, agent port, airlock mount), `FxCanvas` + `fx.ts` (tokens, bolts, particles, rAF only while a beat runs), `director.ts` (queue and beat builder, no DOM), `Scoreboard`, `TraceTape`, `AttackConsole` (6 vectors + Autoplay), `Console` (transcript dock), `Airlock` (human key-turn and password dialog), `ProofDrawer`, `autoplay.ts`.

Honest numbers: Proposed/Allowed/Blocked count beats as they land. "Side effects from blocked" = executed-log entries from `GET /state` that are not explained, in order, by an ACCEPT verdict (0 when the log is exactly the accepted sequence). "Executed trace in L(M)" = the server's executed log replayed through the `/policy` table: no SINK, ends in an accepting state. Latency on the tape and drawer is shown only if the server sent it.

## 7. Accessibility
Keyboard operable (all controls are buttons; drawer and dialogs close on Esc and return focus); visible 2 px violet focus ring; one polite `aria-live` region announces each verdict as text ("Blocked: TRANSFER in START. State unchanged."); every verdict also has text, never colour alone; text is selectable; intro skippable by any key or click; `prefers-reduced-motion`: no intro, no travelling token or particles, 160 ms highlight + fade, afterglow static; no element flashes more than 3 times per second (beats are >= 1.5 s apart, arc jitter is a line redraw at 12 Hz, not a full-area flash).

## 8. Performance budget
Gzipped JS <= 400 KB (target < 90 KB: React + app, no flow library, no animation library). One canvas, redrawn only while a beat runs; ambient CSS motion pauses when `document.hidden` or when reduced motion is on. Grain is a 128 px generated tile. Frame time target: p95 < 16.7 ms measured with a rAF delta sampler during a beat (reported in ROUND_1.md). Offline: no CDN, no external requests.

