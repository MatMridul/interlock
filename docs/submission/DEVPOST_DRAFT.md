# Devpost draft (DRAFT, owner to edit)

**Project name:** The Chimeric Automaton

**Tagline:** An AI agent stitched to a state machine, so a skipped approval step never runs.

## Inspiration
Agents that touch money or production fail in a specific way: they do the right actions in the wrong order. Prompts ask the model to behave; we wanted a check that does not depend on the model's cooperation. A finance transfer needs an ordering rule anyone understands: approval must come after the latest edit and before the transfer.

## What it does
A Strands agent on Amazon Bedrock proposes tool calls (log in, draft, edit, transfer, cancel). A Gate runs a call only if the state machine allows it in the current state. A rejected proposal runs nothing and leaves the state unchanged. Approval (MFA) is an endpoint a human uses; the model has no tool for it. The playground shows the live automaton, the chat, the gate's executed log, counters and the human approval control.

## How we built it
- **Kiro:** a spec, steering files, a save hook and a JFLAP MCP binding (see `docs/submission/KIRO_WRITEUP.md`).
- **JFLAP 7.1:** the policy is a 5-state DFA, checked at build time (deterministic, complete, minimal, equal to a second independently built machine).
- **Generated executor:** a Python table generated from the JFLAP export and tested equal to it.
- **Strands Agents SDK:** five wrapper tools plus a BeforeToolCall hook that cancels disallowed calls; sequential tool execution.
- **Amazon Bedrock:** Amazon Nova 2 Lite for the recorded real run (Claude Haiku 4.5 was blocked by the use-case form).
- FastAPI with SSE, a Vite + React UI.

## Challenges
Keeping the claims honest (the first spec overclaimed JFLAP's runtime role); proving the table equals the model; a mutation survivor that exposed a missing property; Bedrock model access.

## Accomplishments
336 Python tests, 20 UI tests; all 2,015,539 strings up to length 8 checked three ways with 0 mismatches; 96 of 96 table mutants caught; two independent enforcement layers each shown to block alone. (Numbers from the repo's reports; re-run before submitting.)

## What we learned
Mutation testing finds missing properties, not just missing tests. A default-off safety feature is a trap. Say what the checker cannot see.

## What's next
A second policy for an AWS change-approval agent; a public deployment.

## Built with
Kiro, JFLAP 7.1, jflap-cli, Strands Agents SDK, Amazon Bedrock, Python, FastAPI, Hypothesis, React, TypeScript, Vite, React Flow.

**Category:** Frankenstein.

## Bonus prizes (owner must decide; eligibility details unread)
- Student: depends on the owner's status and the rule text. Unread.
- Best Kiro Crew App: unclear what qualifies; unread.
- Best Demo: needs the video; unread criteria.
- Blog: outline in `BLOG_OUTLINE.md`; platform, length and tagging rules unread.
- Social: post requirements unread.

## Submission checklist
- [ ] Public GitHub repo, OSS license detectable at root (owner chooses; none added)
- [ ] `/.kiro` committed (`.gitignore` does not ignore it; checked)
- [ ] Working app URL (no deployment exists yet)
- [ ] Public YouTube video under 3 minutes
- [ ] Kiro-usage write-up pasted from `KIRO_WRITEUP.md`
- [ ] Third-party disclosure: JFLAP 7.1 (Duke), jflap-cli (pre-existing, first commit 2026-11-13), Strands SDK, Bedrock model
- [ ] No secrets in repo; `.env` ignored; check `scripts/bedrock_calls.log` and raw JSON
- [ ] **Unverified: the Devpost Rules, Resources and FAQ tabs have never been read.** Check: eligibility and team rules, whether pre-existing work (jflap-cli) is allowed and how to disclose it, license requirement wording, whether a live URL is mandatory, video rules (length, platform, language), required form fields and word limits, what the Kiro-usage write-up must contain, AI-model usage rules, bonus prize criteria, submission and timezone cutoff (believed Fri 2026-12-04 2:00 PM PT)
