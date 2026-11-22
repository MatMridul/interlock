# Blog post (publish-ready draft for the owner to edit)

Owner: publish this on a third-party blog platform (not GitHub) during the submission period, keep the sentence that says it was written for the Kiroween 2026 hackathon, fill the two `[OWNER: ...]` spots, and add the public URL to Devpost. Check the platform's tags and length rules against the Devpost Rules tab. Facts below come from files in this repo; the link list at the end names them.

---

# I built a state machine that stops an AI agent from skipping the approval step

*I wrote this post as part of the Kiroween 2026 hackathon, where I entered a project called Interlock in the Frankenstein category.*

Imagine an assistant that can draft a bank transfer, ask you to approve it, and send it. Every action is fine on its own. What worries me is the order: sending before approval, or approving and then quietly editing the amount. Agents fail this way. They do the right things in the wrong sequence.

[OWNER: one or two sentences on why this problem caught your attention, in your words.]

## A prompt is a request, not a lock

The usual fix is a line in the system prompt: "never transfer without approval." That asks the model to behave. I wanted something that does not depend on what the model says.

So I put a small state machine between the agent and its tools. The agent can only call five wrapper tools. Each wrapper asks a gate, and the gate runs the real function only if the machine allows that action in the current state. If not, nothing runs and the state does not change. Approval is deliberately not a tool at all: a person submits a code through a separate endpoint, and the model has nothing to call.

The machine for the transfer workflow has four live states, START, AUTHED, DRAFTED and APPROVED. A transfer is only allowed from APPROVED. An edit sends you back to DRAFTED, so an old approval cannot be reused.

## How I checked the machine

I drew the machine in JFLAP, the automata tool from Duke, and checked that it is deterministic, complete and minimal. I built a second machine from three yes/no flags and had JFLAP confirm both accept the same sequences. I also wrote the rule two more ways, as ordering conditions and as a regular expression, and compared all three on every string up to length 8: 2,015,539 strings, no disagreements. Then I changed each table cell in turn, 96 mutants in all. The checks caught every one.

JFLAP does not run when the agent runs. A script exports its table into a small Python file, and a test compares that file to JFLAP's verdicts. I try to be careful here, because my first spec said JFLAP "intercepts every action at runtime." It does not. Before writing code I rewrote the spec to say what is true, and removed two other claims I could not back up.

## What a mutation survivor taught me

I also injected wrong transitions into the gate to see whether my property tests would notice. They caught eleven of twelve. The survivor allowed a second draft while one was already open. No property I had written forbade that. I added one. The tests had passed because I had not said what I wanted, and mutation testing was the thing that made me say it.

## The race

To see whether the gate does anything a good prompt does not, I wrote 20 fixed attacks: prompt injection, fake pre-approval, urgency, role-play as an admin, overspending, double spending and more. I ran each against two agents with the same model, the same prompt and the same five tools. One had the gate. The other had only the prompt.

The prompt-only agent executed a forbidden action in 10 of the 20 attacks. The gated agent executed none. The caveats matter. It was one run per attack, on one model (Amazon Nova 2 Lite, because Claude was blocked in my account), so this is not a statistic. The zero for the gated agent follows from how the gate works. The ten for the prompt-only agent is what that model did that day and could differ tomorrow.

## Pointing it at Kiro itself

The part I enjoyed most came late. If a gate can stop an agent's tool calls, it can stop a coding agent's tool calls too. I wrote a second policy, which I call Safe Ship: a `git push` or a deploy is refused until a test run passed after the last edit. A Kiro `PreToolUse` hook feeds each tool call to the same gate class.

I ran it on Kiro CLI. Kiro edited a file, tried to push, and was refused with a message that went back to the agent. It ran the tests, pushed successfully, edited again, and was refused again. The transcript and the hook's decisions are in the repo. This policy only covers the actions I mapped. A tool or command I did not think of passes, so it guards against honest mistakes, not a hostile agent. I only tested it on Kiro CLI, not the IDE.

[OWNER: a sentence or two about how it felt to watch Kiro get stopped by your own hook, or skip this if it did not feel like much.]

## How Kiro shaped the work

I did not build this alone in one editor. I used Kiro Crew to run the build: one coordinating bot handed small work items to helper sessions, each with a file that had to exist before the item counted as done, and every report was read before I accepted it. That habit mattered more than any single feature. Several claims in my first drafts did not survive a reviewer asking "which file shows that?"

Specs came first for the core, and I wrote the rules before the code. The interface I explored the other way, by building four rough versions and picking one. I can feel the difference: where I had a spec, the tests fell out of it. Where I did not, I found problems late. Steering files kept rules like "never hand-edit the generated table" in front of every session. A custom agent runs the verification checks read-only, and I kept all three of its transcripts, including the two where it was blocked by my own permission rules. For the property tests I used Hypothesis; I did not use Kiro's own property-based testing.

## What this does not do

It does not check that the model's words are true. It does not check that a payee is the right one; only an allow-list and an amount cap are enforced. If the policy is wrong, the gate enforces the wrong policy faithfully. I did not stress-test concurrency. The public demo is not deployed as I write this; the Lambda and DynamoDB plan exists, and nothing has been created on AWS.

## Try it

The repo has a quick start that runs with a canned model and no AWS account. In the UI you can play the agent yourself and try to skip approval. The gate will tell you why each attempt fails.

Repo: https://github.com/MatMridul/interlock
Live demo: [OWNER: add the URL when it exists, or delete this line.]

---

Files behind the claims: `docs/reports/RACE_REPORT.md`, `docs/reports/VERIFICATION_REPORT.md`, `docs/reports/EXECUTOR_REPORT.md`, `docs/SAFE_SHIP.md`, `docs/evidence/safe_ship_live_recheck.md`, `docs/evidence/gate_verifier_runs.md`, `docs/submission/KIRO_WRITEUP.md`.
