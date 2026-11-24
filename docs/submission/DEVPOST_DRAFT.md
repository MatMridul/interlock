# Devpost text (owner pastes; items marked TODO need the owner)

**Project name:** Interlock (subtitle: The Chimeric Automaton)

**Category:** Frankenstein

**Tagline:** An AI agent proposes, a small verified state machine decides what runs, and a human holds the only key.

## Inspiration
Agents that touch money or production fail in a specific way: they do the right actions in the wrong order. A prompt asks the model to behave; we wanted a check that does not depend on the model's cooperation. A transfer needs an ordering rule anyone can read: approval comes after the latest edit and before the transfer. Then we asked a second question: what if the agent being checked is the coding agent itself, and the risky action is `git push` on code nobody tested?

## What it does
- **Finance policy (the live demo).** A Strands agent on Amazon Bedrock proposes tool calls (log in, draft, edit, transfer, cancel). A Gate runs a call only if the state machine allows it in the current state. A rejected proposal runs nothing and the state does not move. Approval (MFA) is an endpoint a human uses; the model has no tool for it. Visitors can play the agent by hand ("you are the agent" mode), with no model and no AWS account, and watch the real gate refuse each attack.
- **Race.** The same 20 attacks against a prompt-only agent and against Interlock. One run on Amazon Nova 2 Lite: the prompt-only agent executed a forbidden action in 10 of 20 attacks, Interlock in 0 of 20. One run, one model, no statistical claim ([RACE_REPORT.md](../reports/RACE_REPORT.md)).
- **Safe Ship policy.** The same engine, pointed at Kiro. A Kiro `PreToolUse` hook refuses `git push` until a test run passed after the last edit. In a recorded run on Kiro CLI 3.5.0 Kiro's own push was refused, then allowed after a green test run ([evidence](../evidence/safe_ship_live_recheck.md)). A policy picker in the UI shows the machine and replays that recording; no hook runs in the browser.
- The UI shows the machine drawn from the generated table, the human key, a trace tape with a replay scrubber, a "why was this blocked" overlay and a what-if box.

## How we built it
- **Kiro, in depth** (details and evidence: [KIRO_WRITEUP.md](KIRO_WRITEUP.md)): specs for two features, three steering files, a save hook, a `PreToolUse` hook that gated Kiro CLI live, a read-only custom agent (`gate-verifier`, three transcripts), a JFLAP MCP server called through that agent, a `jflap` power package (install not run), and Hypothesis property tests. The project was built by a Kiro Crew bot directing helper sessions: one conductor, small work items with acceptance files, every report reviewed.
- **JFLAP 7.1** at build time: each policy is a small DFA checked for determinism, completeness and equivalence to a second machine.
- **Generated executor tables** tested equal to the JFLAP models; JFLAP does not run at runtime.
- **Strands Agents SDK**: five wrapper tools plus a before-tool-call hook that cancels disallowed calls; sequential tool execution.
- **Amazon Bedrock**: Amazon Nova 2 Lite (Claude Haiku 4.5 was blocked by the Anthropic use-case form).
- FastAPI with SSE, a Vite and React UI. Hosting on AWS Lambda and DynamoDB with a judge access code and small model-call caps is planned and templated, not deployed: [DEPLOY_PLAN.md](../deploy/DEPLOY_PLAN.md).

## Challenges
Keeping the claims honest: the first spec overclaimed JFLAP's runtime role and was corrected before any code. Proving the table equals the model. A mutation survivor that exposed a missing property. An argument guard that shipped off by default. Headless Chrome defaulting to reduced motion, which hid the animations from our own screenshots. DynamoDB on-demand having no free tier. Bedrock model access for Claude.

## Accomplishments
Finance: all 2,015,539 strings up to length 8 checked three ways with 0 mismatches; 96 of 96 table mutants caught. Safe Ship: 488,281 strings checked, 45 mutants (40 killed, 5 proven equivalent). A forbidden action executed 0 times in 20 attacks for Interlock. A real Kiro tool call blocked by our hook. Test counts: [TEST_COUNTS.md](../reports/TEST_COUNTS.md).

## What we learned
Mutation testing finds missing properties, not only missing tests. A default-off safety feature is a trap. A checker that only guards mapped actions must say so. A spec gate before code is cheap and corrected three claims we would have shipped.

## What's next
Deployed on 2026-11-23 (see Live app below). Planned next: a third policy for AWS change approval, signed policy hashes, and hash-chained audit logs. None of these is built.

The finance and Safe Ship policies are regular languages: each is a finite state machine (a DFA), and that is why the gate can check them exhaustively. Some agent workflows need counting or nesting, for example nested sub-agent calls or paired open/close transactions, and a regular language cannot express those. Pushdown automata (PDAs) add a stack and can. JFLAP models PDAs, and the vendored `third_party/jflap-cli` has PDA support: its README lists PDA simulation with a choice of final-state or empty-stack acceptance, step-by-step traces that show the stack, a PDA builder, and CFG-to-PDA and PDA-to-CFG conversion. This repo copied only the runtime files, not the CLI's tests or examples (see `third_party/jflap-cli/VENDORED.md`), and no Interlock test exercises the PDA path, so that support is untested here. A PDA policy, for example bounded-depth nested sub-agent calls, is future work. It is not built, and nothing PDA-based runs in Interlock today.

## Built with
Kiro (CLI, Crew, specs, steering, hooks, custom agent, MCP), JFLAP 7.1, jflap-cli, Strands Agents SDK, Amazon Bedrock (Amazon Nova 2 Lite), Python, FastAPI, Hypothesis, React, TypeScript, Vite, AWS Lambda and DynamoDB (planned).

## Links (fill in)
- Repo: https://github.com/MatMridul/interlock
- Live app: https://7mjrrbknt7psv5xud3jtxdi7de0umxfb.lambda-url.ap-south-1.on.aws/
- Judges-only testing field (owner: put the judge access code here, never in the public text): the code unlocks the live model in the app via "Unlock live model (judges)". Everything else, including "you are the agent" mode, scripted attacks, the Race replay and Safe Ship, needs no code. Model use is capped at 100 calls per day for everyone; when a cap is hit the app says so and falls back to "you" mode.
- Demo video (YouTube, under 3 minutes): **TODO (owner)**
- Judges' guide: [docs/JUDGES.md](../JUDGES.md)

## Bonus prizes
- **Best Student Project (Frankenstein):** **TODO (owner):** student details go in the Devpost form, never in the repo.
- **Bonus Blog:** [BLOG_OUTLINE.md](BLOG_OUTLINE.md) is a publish-ready draft; **TODO (owner):** publish on a third-party platform and add the URL.
- **Social Blitz:** [SOCIAL_POST.md](SOCIAL_POST.md); **TODO (owner):** post and add the URL.
- **Best Demo:** [VIDEO_SCRIPT.md](VIDEO_SCRIPT.md), runs with Autoplay and no extra steps.

## Third-party disclosure
JFLAP 7.1 (Duke) and `jflap-cli` pre-date the hackathon (`jflap-cli` first commit 2026-11-13); this repository's first commit is 2026-11-15. Full list with licenses: [THIRD_PARTY.md](../../THIRD_PARTY.md).

## Submission checklist
- [ ] Public GitHub repo with the MIT license visible in About; `/.kiro` committed and not ignored
- [x] Working app URL (deployed 2026-11-23)
- [ ] Public YouTube video under 3 minutes
- [ ] Kiro-usage write-up pasted from `KIRO_WRITEUP.md` (Kiro IDE lines marked "owner to confirm")
- [ ] Demo credentials for judges in the Devpost field (never in the repo)
- [ ] Re-read the Devpost Rules tab against [OPEN_TASKS.md](../OPEN_TASKS.md) H2
