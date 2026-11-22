# Interlock: open tasks (single source of truth)

Everything still to do for the Kiroween 2026 submission lives here. If a task is not in this file, it is not planned. Update a task's status in the same commit that changes it. Commit messages are 5 to 7 words; if a change cannot be said in that, split it.

Last updated: 2026-11-21. Owners: **Me** = Nova (helpers do the work, Nova reviews), **You** = the owner, **Both** = needs both.

## 1. Fixed facts

| Item | Value |
|---|---|
| Hackathon | Kiroween 2026 (Devpost), sponsor AWS |
| Category | Frankenstein (one category only) |
| Entrant | Solo, student |
| Submission closes | Fri 2026-12-04 2:00 PM PT = Sat 2026-12-05 03:30 IST. No extensions. |
| Our target submit date | **Thu 2026-12-03** (one day of slack) |
| Judging period | 2026-12-16 to 2027-01-29. The live app must stay free and unrestricted until then. |
| Kiro credits | Redeemed (4,000). They expire 2026-12-31. |
| Judging criteria (20% each) | Potential Impact, Technological Implementation (how deeply Kiro is used), Design, Innovation, Presentation |
| Stage 1 | Pass or fail: fits the theme and genuinely uses Kiro. "Insufficient use of Kiro" means disqualification. |
| Bonus prizes we are going for | Best Student Project: Frankenstein ($1,500 + 1-year Kiro Pro Max, all members must be students), Bonus Blog (top 100, 2,000 credits), Social Blitz (5 winners), Best Demo (no extra steps) |
| Not going for | Best Startup, Ghost of Kiroween Past (confirm: only if registered in 2025), Best Kiro Crew App (needs a separate Kiro Crew app repo) |
| Judges | 2026 panel not published and may change. Judging may include automated AI analysis, so the repo and write-up must be easy for a machine to read. |

Source: the live Devpost Rules and Overview pages, read 2026-11-21 (the Rules page was read through a text proxy, so skim the Rules tab yourself).

## 2. Calendar (IST)

| Window | Goal |
|---|---|
| Nov 21 to 23 | Repo hardening, CI, UX basics (phase A and B) |
| Nov 23 to 27 | Product depth: race mode, "you are the agent", Safe Ship (phase C and D) |
| Nov 27 to 30 | Deploy with spend caps (phase E), security pass (phase F) |
| Nov 30 to Dec 2 | Submission assets, you record the video (phase G) |
| Dec 2 to 3 | Dry run, then submit on Dec 3 (phase H) |
| Dec 4 | Buffer only. Nothing new. |

## 3. Tasks

Status: `todo`, `doing`, `blocked`, `done`. Priority: P0 must have, P1 should have, P2 nice to have.

### A. Repo hardening and compliance (P0)

| ID | Task | Owner | Pri | Status | Done when |
|---|---|---|---|---|---|
| A1 | Merge `ui-instrument` into `main` through a PR (small commits kept, regular merge) | Me opens PR, You merge | P0 | doing (PR #2 to #5 merged; #3 to #5 landed on ui-instrument, so PR #6 brings them to main) | UI is on GitHub `main`; `ui/dist` builds from a clean clone |
| A2 | Remove machine-specific paths: vendor `jflap-cli` into `third_party/jflap-cli` (check JFLAP redistribution terms first), make `.kiro/settings/mcp.json`, the save hook and `scripts/*` use relative paths | Me | P0 | done (branch hardening-ci, unmerged) | A fresh clone on another machine runs `gen_executor_table.py --check` and the replay test with only documented installs |
| A3 | Add cross-platform run instructions (Windows, macOS, Linux) and a one-command setup | Me | P0 | done (branch hardening-ci, unmerged) | README quick start works from a clean clone |
| A4 | GitHub Actions CI: fast Python tests, UI tests and build, `gen_executor_table.py --check`, secret scan, dependency audit | Me | P0 | done (PR #3: 5 jobs green, slow suites run on push to main only) | Green check on `main` |
| A5 | Re-run the two slow suites (mutation, replay vs JFLAP) in CI or locally and record the real counts | Me | P0 | done (branch hardening-ci, unmerged) | One verified test count, written once, referenced everywhere |
| A6 | Fix stale and inconsistent docs: test counts (334 / 336 / 320 / 258), Next.js mentions, old `UI_REPORT.md`, old `docs/screens` | Me | P0 | done (branch hardening-ci, unmerged) | Counts generated from CI output; no contradictions in README, reports or write-up |
| A7 | Tidy repo root: move `*_REPORT.md` to `docs/reports/` with an index; keep v1 specs marked superseded | Me | P1 | done (branch hardening-ci, unmerged) | Root has README, LICENSE, source folders and config only |
| A8 | Third-party disclosures: JFLAP 7.1 (Duke), `jflap-cli`, Strands Agents SDK, Bedrock model, fonts (OFL); read each license text and record it in `THIRD_PARTY.md` | Me | P0 | done (branch hardening-ci, unmerged) | Every dependency has a read license entry, no "check" markers left |
| A9 | Confirm the first commit date and what pre-existing work is disclosed (New Projects Only rule) | Me | P0 | done (branch hardening-ci, unmerged) | README states: built in window; pre-existing = JFLAP 7.1 and `jflap-cli` (first commit 2026-11-13) |
| A10 | Verify the Kiro save-hook trigger name (`PostFileSave` or `FileSave`) by running it in Kiro | Both | P1 | todo | Hook fires on save in Kiro; spec corrected |

### B. UI and UX basics (P0 to P1)

| ID | Task | Owner | Pri | Status | Done when |
|---|---|---|---|---|---|
| B1 | Resizable and collapsible panels: drag handles on tape, console and proof drawer, keyboard resizable, sizes remembered, reset-layout button | Me | P0 | done (branch ux-basics, PR #4; tape not collapsible, panel can shrink the stage too small) | Panels drag and keyboard-resize; layout survives reload |
| B2 | First-run tour (about 30 seconds): machine, human key, tape, attack vectors; replayable from a help button | Me | P0 | done (branch ux-basics, PR #4) | A new visitor understands the point without help |
| B3 | Fix the known layout flaws: toast over the delta table, key panel over the return conduit, empty tape and console space | Me | P0 | done (branch ux-basics, PR #4) | Screenshots at 1440, 1920, 1280 show no overlaps |
| B4 | Real motion review: capture animations against a deliberately slowed stub so token flight, barrier and shatter are actually visible; fix timing | Me | P0 | done (branch ux-basics, PR #4; found headless Chrome defaults to reduced motion) | 8-frame strips show distinct frames |
| B5 | Command palette (Ctrl+K), full keyboard map, help overlay | Me | P1 | done (branch ux-basics, PR #4) | Every action reachable by keyboard |
| B6 | Phone layout that works (390 wide): stage, tape, console stack; full-screen drawer | Me | P1 | todo | Usable on a real phone, checked by you once |
| B7 | Accessibility pass: screen reader walkthrough, focus order, aria-live review, reduced-motion check in a browser | Me, You test once | P1 | todo | Written checklist with results |
| B8 | Sound and haptics tuning (cues exist, unheard) | Both | P2 | todo | You listened once and approved or listed changes |

### C. Product depth (P0 to P1)

| ID | Task | Owner | Pri | Status | Done when |
|---|---|---|---|---|---|
| C1 | "You are the agent" mode: visitors propose actions by hand with no model, using the real gate; becomes the default on the public URL | Me | P0 | done (branch product-depth, PR #8) | Works with zero Bedrock calls |
| C2 | Race mode: the same attack against a prompt-only agent and against Interlock, side by side, with a raw-counts scoreboard (include attacks the prompt-only agent resists) | Me | P0 | done (PR #10: prompt-only 10 of 20 forbidden executed, Interlock 0 of 20; 91 Nova calls) | A 20-attack run produces honest counts; results saved as a replay |
| C3 | "Why was this blocked?" overlay: show the shortest allowed path from the current state on the machine | Me | P0 | done (branch product-depth, PR #8) | Appears on every block |
| C4 | "What if" box: type a symbol sequence, see accept or reject and the step it fails at | Me | P1 | done (branch product-depth, PR #8) | Matches the JFLAP table on all of the 21 documented traces |
| C5 | Session replay and scrubber, plus shareable replay files | Me | P1 | done (branch product-depth, PR #8) | Any finished session can be replayed step by step |
| C6 | Audit log export (JSON lines) | Me | P1 | done (branch product-depth, PR #8) | Download button; format documented |
| C7 | Second policy behind a policy picker (see D1) | Me | P0 | doing (branch release, integrates PRs #6 to #10) | Picker switches machines; second machine passes the same verification as the first |

### D. Kiro-usage evidence (P0, this is 20% of the score)

| ID | Task | Owner | Pri | Status | Done when |
|---|---|---|---|---|---|
| D1 | **Safe Ship policy:** a Kiro `PreToolUse` hook runs the gate on the coding agent's own tool calls (no push or deploy until tests ran after the last edit). **Spike done 2026-11-21: GO** (live on Kiro CLI 3.5.0, branch `safe-ship-spike`, report `docs/spikes/SAFE_SHIP_SPIKE.md`). Remaining: production integration (about 1.5 to 2 days), IDE and Crew live test (D6). **Fallback:** AWS change-approval policy | Me | P0 | done (branch safe-ship, PR #9; live CLI re-check passed; IDE and Crew untested; UI picker C7 open) | Hook blocks a real Kiro tool call in a recorded run, wired into the policy picker (C7) |
| D2 | Custom agent in `.kiro/agents/` (a verifier agent that runs the policy checks) used during the build | Me | P0 | done (gate-verifier agent validated and run 3 times, PR #9) | File committed and used in at least one logged task |
| D3 | A Kiro power or documented MCP integration for the JFLAP checks | Me | P1 | doing (powers/jflap written per docs; install not run) | Installable from the repo; documented |
| D4 | Specs: keep `.kiro/specs/gate` in sync; add one spec per new feature (race mode, Safe Ship) and work them through tasks | Me | P0 | done (safe-ship spec added, gate spec updated, PR #9) | Every shipped feature maps to a spec task ticked off |
| D5 | Steering: keep the product, tech and security files current | Me | P1 | todo | Reviewed before submit |
| D6 | Open the repo once in Kiro IDE and Kiro CLI, confirm the MCP loads and the hook fires, take screenshots | **You** | P0 | todo | Screenshots stored in `docs/evidence/`; write-up can truthfully compare IDE, CLI and Crew |
| D7 | Property-based testing section stated honestly: Hypothesis tests we wrote, plus Kiro PBT if used in D4 | Me | P1 | done (Hypothesis only; Kiro PBT not used, stated) | Write-up matches the repo |

### E. Deploy and operations (P0, needs your approval first)

| ID | Task | Owner | Pri | Status | Done when |
|---|---|---|---|---|---|
| E1 | Choose the host (AgentCore Runtime or one container) after a short spike; list monthly cost before creating anything | Me proposes, **You approve** | P0 | done as plan and template (PR #7); waits on owner approval to deploy | Written cost estimate and your yes |
| E2 | Deploy so it stays up and free through 2027-01-29 | Me | P0 | doing (design and template on branch deploy-prep; nothing created on AWS) | Public URL passes the demo script |
| E3 | Spend and abuse controls: default to "you are the agent" and stub; real-model chat behind a daily cap; AWS budget alarm | Me | P0 | done as plan and template (PR #7); waits on owner approval to deploy | Cap proven by test; alarm exists |
| E4 | Rate limits and a lockout on `/mfa` attempts; session limits | Me | P0 | done (branch hardening-ci, unmerged) | Brute force is blocked by test |
| E5 | Uptime check and a rollback plan | Me | P1 | done as plan and template (PR #7); waits on owner approval to deploy | Documented |
| E6 | Claude access (Anthropic use-case form in the Bedrock console) for one real Claude run | **You** | P2 | todo | Haiku answers from the CLI |

### F. Security and quality (P0 to P1)

| ID | Task | Owner | Pri | Status | Done when |
|---|---|---|---|---|---|
| F1 | Replace the demo MFA code with an env-only secret in the deployed app; document the demo credentials in the Devpost field (judges only) | Me | P0 | done (branch hardening-ci, unmerged) | No code in the repo or video |
| F2 | Security headers and a content security policy; dependency and secret scanning in CI | Me | P1 | todo | CI scan clean |
| F3 | Error handling: no stack traces to users; SSE reconnect behavior | Me | P1 | todo | Tested |
| F4 | Final full test pass with the real counts | Me | P0 | todo | Recorded in `docs/reports/` |

### G. Submission assets

| ID | Task | Owner | Pri | Status | Done when |
|---|---|---|---|---|---|
| G1 | README rewrite: 5-line pitch, 10-second GIF, quick start, architecture, honest limits, links to evidence | Me | P0 | doing (branch release, integrates PRs #6 to #10) | A stranger runs it in under 10 minutes |
| G2 | `docs/JUDGES.md`: how to evaluate in 3 minutes, mapped to the five criteria with evidence links (also readable by automated analysis) | Me | P0 | doing (branch release, integrates PRs #6 to #10) | One page |
| G3 | Kiro write-up covering IDE/CLI/Web/Crew, custom agents, hooks, specs, steering, MCP, PBT, powers, with real moments | Me | P0 | doing (branch release, integrates PRs #6 to #10) | Every claim traceable to a repo file or a log |
| G4 | Video script (under 3:00, open on the blocked transfer next to the human key), shot list, pre-flight checklist | Me | P0 | draft exists | Updated to the final UI |
| G5 | **Record, edit and upload the video** to YouTube (public). No third-party trademarks or copyrighted music. | **You** | P0 | todo | Public link |
| G6 | Devpost text: tagline, description, how built, challenges, what's next | Me drafts, You paste | P0 | doing (branch release, integrates PRs #6 to #10) | Final copy ready |
| G7 | Blog post for the Bonus Blog Prize: must be published on a third-party platform during the submission period and say it is written for Kiroween 2026 | Me drafts, **You publish** | P1 | doing (branch release, integrates PRs #6 to #10) | Public URL |
| G8 | Social post for Social Blitz: must **start** with `#KiroweenHackathon26`, share your favorite thing about Kiro and how it changed your approach, original voice | Me drafts, **You post** | P1 | doing (branch release, integrates PRs #6 to #10) | Public URL |
| G9 | Best Student details for the form: LinkedIn, student email, year and degree, school name; be ready to show proof of enrollment | **You** | P0 | todo | Details ready in a private note, never in the repo |
| G10 | Architecture diagram refresh (Archify) for the final system | Me | P1 | doing (branch release, integrates PRs #6 to #10) | Matches the deployed design |

### H. Final gate (Dec 2 to 3)

| ID | Task | Owner | Pri | Status | Done when |
|---|---|---|---|---|---|
| H1 | Dry run from a clean machine or clean clone: clone, install, run, tests, public URL, video link | Me | P0 | todo | Written result |
| H2 | Rules checklist re-read against the Rules tab: license visible in About, `/.kiro` present and not ignored, public repo, YouTube public, under 3 minutes, English, URL works | Both | P0 | todo | Every line ticked with evidence |
| H3 | Submit on Devpost (category Frankenstein, Best Student Project, blog and social links) | **You** (login needed) | P0 | todo | Confirmation page saved |
| H4 | Keep the app and repo untouched except for fixes until Jan 29, 2027 | Both | P0 | todo | App still passes the demo script on Jan 29 |

## 4. Decisions waiting on you

1. Approve a hosting choice and cost estimate (E1).
2. Do the Kiro IDE and CLI check (D6).
3. Provide the student details privately (G9) and publish the blog and social post (G7, G8).
4. Record and upload the video (G5) once the final UI is frozen.
5. Optional: submit the Anthropic use-case form for a Claude run (E6).

## 5. Done so far

- State machine authored and verified: JFLAP checks, 2,015,539-string exhaustive check, 96 of 96 single-cell mutants caught, 21 worked traces.
- Gate, generated executor table, argument guard (default on), human-only MFA path.
- Strands agent layer with a checker hook; stub-model adversarial suite; real Bedrock run on Nova 2 Lite.
- FastAPI SSE server; UI built on comp A (`ui-instrument` branch, 30 small commits, not yet merged).
- Specs, steering, hook drafts; README, write-up, video script, Devpost and blog drafts; Archify diagram.
- Repo public on GitHub with MIT license; first PR merged; demo MFA code removed from source.
- Kiro credits redeemed.

## 6. Risks to watch

- Hosting for eight weeks is a cost and uptime risk. Mitigation: E3, E4, E5.
- Kiro-usage depth is a scored criterion and a disqualification risk. Mitigation: D1 to D7, G3.
- The Kiro `PreToolUse` input format is unverified. Mitigation: spike first, fallback policy ready.
- Claude may stay blocked in Bedrock. Mitigation: the benchmark runs on Nova and says so.
- Claims must stay honest: no "zero hallucination", no "mathematically proven safety", no "JFLAP at runtime".

## 7. Roadmap after the hackathon (do not claim as built)

Policy spec format compiled from JFLAP; signed policy hash on every verdict; hash-chained audit logs; pluggable human approval instead of a demo code; installable library with a Strands plugin; CI action that verifies a policy; infrastructure as code for deploy; more policies.
