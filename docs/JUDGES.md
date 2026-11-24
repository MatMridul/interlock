# Judges: evaluate in 3 minutes

Interlock puts a small verified state machine between an AI agent and its actions. The agent proposes, the machine decides, a human holds the only key. Every claim below points to a file, a test or a report. Anything unverified is marked.

## Three paths (pick one, or all)

| Time | Path | What to do |
| :-- | :-- | :-- |
| 3 min | **Watch the video** | YouTube: **TODO (owner): link.** Script and shot list: [VIDEO_SCRIPT.md](submission/VIDEO_SCRIPT.md). |
| 3 min | **Use the live app** | URL: **https://7mjrrbknt7psv5xud3jtxdi7de0umxfb.lambda-url.ap-south-1.on.aws/** (the first load after a quiet spell takes a few seconds while the function starts). Open it and, in **you** mode (the default when the model is off), press the attack buttons (skip MFA, fake approval, call the human-only tool, overspend, double spend). Or press **Autoplay**: it plays a fixed 70 to 80 second script through the real gate with no model (one legitimate transfer, then double spend, skip MFA and edit after approval, all blocked), and asks you first to type the demo code for the human key step or to skip it (then the transfer is refused). Every attack is refused and the state does not move. Switch **Policy** to **safe-ship** to see Kiro's own push refused in the recorded run. Open **Race** for the 20-attack scoreboard. No account or AWS needed. The live model (agent chat, live race runs, model-mode Autoplay) is open to everyone, but small by design: 100 model calls per day in total, of which 60 are the public share; 25 per session, 40 per address per day, 4 per turn. The remaining calls are reserved for judges: press the small **Judge code** button and enter the access code from the Devpost judges-only testing field (the code is not in this repository) and your calls skip the public share. When a limit is hit the app says which one and when it resets (00:00 UTC), and falls back to **you** mode; if the public share is used up it says judges can still unlock with their code. Local run: [README quick start](../README.md#quick-start). |
| 3 min | **Read the evidence** | [RACE_REPORT.md](reports/RACE_REPORT.md) (10 of 20 vs 0 of 20, one run), [SAFE_SHIP.md](SAFE_SHIP.md) and the live run in [evidence/](evidence/), [TEST_COUNTS.md](reports/TEST_COUNTS.md), [KIRO_WRITEUP.md](submission/KIRO_WRITEUP.md). |

## The five criteria, with evidence

| Criterion | What to look at | Files |
| :-- | :-- | :-- |
| **Potential Impact** | Agents that touch money or production fail by doing the right actions in the wrong order. Interlock enforces an order a human can read, whatever the model says. The same engine guards a finance workflow and a coding agent's `git push`. Honest limits are written down. | [README](../README.md), [RACE_REPORT.md](reports/RACE_REPORT.md), [SAFE_SHIP.md](SAFE_SHIP.md) (section "The closed mapping and its limits") |
| **Technological Implementation (depth of Kiro use)** | Specs for two features; steering files; a save hook; a `PreToolUse` hook that blocked Kiro CLI's own push (recorded run); a custom agent run three times with transcripts; the JFLAP MCP server used through that agent; a `powers/jflap` package (install not run); Hypothesis property tests. The project was built by a Kiro Crew bot directing helper sessions. What was not tested (Kiro IDE, Crew hook) is listed. | [KIRO_WRITEUP.md](submission/KIRO_WRITEUP.md), [.kiro/specs/gate](../.kiro/specs/gate), [.kiro/specs/safe-ship](../.kiro/specs/safe-ship), [.kiro/steering](../.kiro/steering), [.kiro/hooks](../.kiro/hooks), [.kiro/agents/gate-verifier.json](../.kiro/agents/gate-verifier.json), [evidence/gate_verifier_runs.md](evidence/gate_verifier_runs.md), [evidence/safe_ship_live_recheck.md](evidence/safe_ship_live_recheck.md), [KIRO_MCP.md](KIRO_MCP.md), [powers/jflap](../powers/jflap) |
| **Design** | An "instrument" UI: the machine drawn from the generated table (never hand-copied), the human key, a trace tape with a replay scrubber, a "why was this blocked" overlay, a what-if box, command palette and keyboard map, a first-run tour. Design reasoning and screenshots. | [UI_BUILD_REPORT.md](ui-v2/UI_BUILD_REPORT.md), [DEPTH_REPORT.md](ui-v2/DEPTH_REPORT.md), [UX_BASICS_REPORT.md](ui-v2/UX_BASICS_REPORT.md), [DESIGN_SPEC.md](ui-v2/DESIGN_SPEC.md), screenshots in `docs/ui-v2/` |
| **Innovation** | A policy authored and checked in an automata tool (JFLAP) at build time, enforced by a generated table tested equal to it; two policies on one engine; a verified machine pointed at the coding agent itself. We do not claim it is the first: related work exists ([product.md](../.kiro/steering/product.md)). | [VERIFICATION_REPORT.md](reports/VERIFICATION_REPORT.md), [EXECUTOR_REPORT.md](reports/EXECUTOR_REPORT.md), [SAFE_SHIP.md](SAFE_SHIP.md), [architecture diagram](architecture/architecture.html) |
| **Presentation** | The video, the README, this page, the architecture diagram, one place for test counts, and reports that state what was not checked. | [VIDEO_SCRIPT.md](submission/VIDEO_SCRIPT.md), [README](../README.md), [TEST_COUNTS.md](reports/TEST_COUNTS.md), [reports index](reports/README.md) |

## Claims to spot-check

| Claim | Where it is checked |
| :-- | :-- |
| The agent cannot call MFA | `tests/test_strands_agent.py`, `test_inv11_*`; the agent has five tools and none is MFA |
| A forbidden sequence runs nothing | `tests/test_gate_basic.py`, 16-cell tests; Race view, Interlock lane |
| Generated table equals the JFLAP model | `tests/test_replay_m5.py`, `python scripts/gen_executor_table.py --check` |
| 2,015,539 strings, 0 mismatches (finance) | `tests/test_sm_exhaustive.py`, [VERIFICATION_REPORT.md](reports/VERIFICATION_REPORT.md) |
| Kiro's push was refused after an edit and allowed after a green test | [evidence/safe_ship_live_decisions.jsonl](evidence/safe_ship_live_decisions.jsonl), [evidence/safe_ship_live_recheck.md](evidence/safe_ship_live_recheck.md) (Kiro CLI 3.5.0, scratch repo, one run) |
| The policy picker replays that run without running any hook | `server/policies.py`, `tests/test_policies_c7.py`, `ui/src/test/safeship.test.tsx` |
| No secrets in the repo | `python scripts/secret_scan.py`, CI job "Secret scan" |

## What this does not claim

No "zero hallucination", no "mathematically proven safety", no JFLAP at runtime (JFLAP is build time). The race is one run on Amazon Nova 2 Lite, not a statistic. Safe Ship covers only mapped actions and was observed on Kiro CLI only. Deployed 2026-11-23 on one AWS Lambda (ap-south-1). Full list: [README, "What it does not guarantee"](../README.md#what-it-does-not-guarantee).
