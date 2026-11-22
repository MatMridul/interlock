# Demo video script - target 2:50, hard limit under 3:00

The owner records and uploads the video (public YouTube, English, no third-party music or trademarks). Screen names below are the ones in the final UI: header buttons **Agent: model / you**, **Policy: finance / safe-ship**, **Race**, **Proof**; the console has **Autoplay** (both modes) and the six attack buttons; the human key panel sits next to the machine.

## Two ways to record the first part (pick one before you start)

| Setup | How | Say on screen or in narration |
| :-- | :-- | :-- |
| A. Canned model, no AWS | `STUB=1` server, Agent: model, press Autoplay | "canned model" (the gate behaves the same with any model) |
| B. Real model | AWS credentials and Bedrock access, Amazon Nova 2 Lite, a few model calls | "Amazon Nova 2 Lite" |
| C. You mode, no model | Agent: you (the default when the model is off), press Autoplay or the attack buttons | "I play the agent by hand; the script proposes, the real gate decides" |

Autoplay works in both modes. In model mode (A or B) it sends real chat messages. In you mode (C) it plays a fixed 70 to 80 second script of proposals through the real gate, with no model: a legitimate transfer, then a replayed approval (double spend), a transfer with no approval (skip MFA) and an edit after approval, each blocked with the why-blocked path, then the scoreboard. Before it starts, a prompt asks the owner to type the demo code once (kept in memory for the run, never in the page source) or to skip the human step, in which case the transfer is refused. The public deployment, if any, has the model off, so C is the setup it supports. Record C with the code typed off camera or hidden: the field is a password field.

## Shot list

| Time | On screen | Narration | Action |
| :-- | :-- | :-- | :-- |
| 0:00-0:12 | Policy: finance. The agent's TRANSFER stamped BLOCKED, next to the human key panel | "An AI agent just tried to move money without approval. A small state machine refused it. Only a human can turn this key." | Before recording, run "Skip MFA" so the blocked verdict and the "why was this blocked" path are on screen; start the recording there |
| 0:12-0:30 | The machine, the trace tape | "This is Interlock. The agent proposes, the machine decides, a human holds the only key. The machine is checked in JFLAP at build time and enforced by a generated table." | Press Autoplay (any setup; in C type the code in the prompt first); the states light up, the tape fills |
| 0:30-1:05 | **Race** view, recorded run, Replay all 20 | "Same model, same prompt, same tools, 20 attacks. Without the gate, the prompt-only agent executed a forbidden action 10 times. With Interlock, zero. This is one run on one model, so it is not a statistic. The zero follows from the gate; the ten is what this model did that day." | Click Race, press Replay all 20, let the counters reach 10 and 0; stay on the final scoreboard 3 seconds |
| 1:05-1:50 | Back to the gate, Policy: **safe-ship**. Machine with CLEAN, EDITED, TESTED; the what-if box; the recorded run | "Same engine, second policy, pointed at Kiro itself. A Kiro hook checks each tool call. A push is refused until tests pass after the last edit. This is a recording of Kiro CLI 3.5.0, not live in the browser." | Type `EDIT PUSH` in the what-if box (refused at step 2); press Replay the recorded run; hold on the REFUSED line for Kiro's push, then on the allowed push after the test |
| 1:50-2:25 | Evidence: `docs/reports/TEST_COUNTS.md`, `docs/reports/RACE_REPORT.md`, `docs/evidence/` file list | "Every claim points to a file. The machine is checked on two million strings, 96 table mutants are all caught, and the Kiro run is recorded. The limits are written down: the race is one run, Safe Ship only covers the actions we mapped." | Scroll the README "How verification works" and "What it does not guarantee"; do not read numbers you have not re-run |
| 2:25-2:45 | Architecture diagram `docs/architecture/architecture.html`, then the `.kiro/` tree | "Built with Kiro: specs, steering, hooks, a custom agent and a JFLAP MCP server, with a Kiro Crew bot directing the work. Hosting is planned, not deployed." | Show the diagram; show `.kiro/` in the repo |
| 2:45-2:50 | Closing card | "Interlock. It does not check what the model says, only what it does. Open source." | Repo URL; live URL if it exists (**TODO owner**) |

## Honest-claim checklist for narration

Say "build time" for JFLAP. Never say "zero hallucination", "provably safe", "mathematically proven" or "novel". Say the race is one run on one model (Amazon Nova 2 Lite). Say the Safe Ship replay is a recording of Kiro CLI 3.5.0. Do not say Safe Ship was tested in the Kiro IDE or Crew. Do not say the app is deployed unless it is. Show a latency only if the UI shows a measured number.

## Fallbacks

- Live model misbehaves: use `STUB=1` and say "canned model", or use the race replay, which calls no model.
- The Safe Ship replay needs no model and no hook; it works on any server run.
- Pre-record the 0:00-0:12 shot as a separate clip so it can be cut in.

## Pre-flight checklist

- [ ] Server started with `--host 127.0.0.1`; `DEMO_MFA_CODE` set to a demo value you will not reuse; the code is not visible on screen, in terminal history or in the UI
- [ ] If using a real model: `AWS_REGION` and `BEDROCK_MODEL_ID` set, one dry run done
- [ ] Policy picker, Race and Safe Ship replay each opened once before recording
- [ ] No secrets, account IDs or credentials visible (terminal, env, browser tabs, bookmarks)
- [ ] Resolution 1920x1080, browser zoom 100 to 125 percent (small type blurs at 1440 in compressed video, [ROUND_2.md](../ui-v2/ROUND_2.md))
- [ ] Sound decided (off by default; never tested by ear, B8); notifications off; clean browser profile
- [ ] Do not narrate numbers that are not in [TEST_COUNTS.md](../reports/TEST_COUNTS.md) or the reports
- [ ] Total length checked under 3:00 after editing; captions or on-screen text are in English
