# Blog outline and first draft (DRAFT)

Rules for the blog prize (platform, length, tags) are unread; adjust after reading the Devpost Rules tab.

## Outline
1. The failure: right actions, wrong order.
2. Why a prompt is not enough.
3. The machine: 5 states, 6 symbols, one rule.
4. Checking it three ways, then in JFLAP.
5. Runtime: a generated table, two layers.
6. What mutation testing found.
7. What this does not guarantee.
8. What's next.

## Draft (about 600 words)

**An AI agent that cannot skip the approval step**

Imagine an assistant that can draft a bank transfer, ask you to approve it, and send it. Each action is fine. The failure that worries me is the order: send before approval, or approve and then quietly edit the amount. I built a small system, The Chimeric Automaton, to make that failure impossible for one workflow, and I tried to be careful about what "impossible" covers.

**Why not just tell the model?** A system prompt asks the model to follow the rule. A model can misread it, and a message can argue against it. In my real test run, a model was told to ignore its instructions and call the transfer tool. It did call it. What stopped the call was not the model's judgment but code.

**The machine.** The workflow has four live states: START, AUTHED, DRAFTED, APPROVED. Six actions move between them. Transfer is allowed only from APPROVED. Approval is only allowed after a draft, and an edit sends you back to DRAFTED, so a stale approval cannot be reused. Anything not in the table is refused, nothing runs, and the state stays where it was.

**Checking the machine.** I drew it in JFLAP, the automata tool from Duke, and checked it is deterministic, complete and minimal. I built a second machine from three yes/no flags and had JFLAP confirm the two accept the same language. I also wrote the rule as ordering conditions and as a regular expression, then compared all three on every string up to length 8: 2,015,539 strings, no disagreements. Changing any single table cell broke the comparison in all 96 cases I tried.

**At runtime.** JFLAP does not run when the agent does. A script exports the JFLAP table into a small Python file that the app uses, and tests compare it to JFLAP's verdicts. The agent, built with the Strands Agents SDK, has five tools. Each one calls a gate. A hook also asks the gate before each tool call and cancels a disallowed one. Either layer alone blocks the bad call; tests remove each in turn to show it.

Approval is deliberately not a tool. A person submits a code through a separate endpoint, and the server marks that call as human. The model has nothing to call.

**What mutation testing found.** I injected wrong transitions into the gate to see whether my property tests would notice. Eleven of twelve were caught. The survivor let a second draft start while one was already open. No property of mine forbade it. I added one. The tests had passed because I had not said what I wanted.

**What it does not do.** It does not check that the model's words are true. It does not check that the payee is right; only an allow-list and an amount cap are enforced. If the policy is wrong, it enforces the wrong policy faithfully. I did not stress-test concurrency. And my real-model run used Amazon Nova 2 Lite, because Claude was blocked in my account; it describes one model on four prompts, not a statistic.

**Built with Kiro.** I used Kiro for specs, steering rules (for example, never hand-edit the generated table), a hook that re-runs the checks when the policy changes, and a JFLAP MCP server. The write-up in the repo lists exactly what is and is not there. (Owner: confirm before publishing.)

**Next.** The same engine could guard an AWS change-approval agent: snapshot, plan, approval, then deploy. That needs a new machine and tools, and it has not been started.
