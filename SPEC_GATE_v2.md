# SPEC GATE v2: The Chimeric Automaton (Strands runtime agent, finance workflow)

Status: GATE PASSED on 2026-11-19. Approved by Nova (mate) on the author's standing instruction ("if satisfied, approve the updated spec and go for the next step") after a full read of this file. Supersedes SPEC_GATE.md v1 and the claims in CHIMERIC_AUTOMATON_SPEC.md. No spec revisions unless implementation forces one.
Written 2026-11-19. Deadline: Fri 2026-12-04 2:00 PM PT (= Sat 2026-12-05 03:30 IST). Plan to submit on Thu 2026-12-03.
Marking: "VERIFIED-LOCAL" = I ran it on this machine. "DOCS" = read on the cited strandsagents.com page. "UNVERIFIED" = not checked, do not rely on it.

## 0. What changed from v1 (read this first)

1. The runtime agent is now built with the **Strands Agents SDK** (Python) on **Amazon Bedrock**. v1's "stub LLM" and "real LLM port" are replaced by a Strands `Agent` with a scripted stub `Model` for tests (section 3).
2. **Interception point (INV-1/INV-5):** the LLM only has Strands tools whose bodies call `gate.run(SYMBOL, args)`. The real side-effect code lives in a module the agent code never imports. A Strands `BeforeToolCallEvent` hook is a second, independent layer that cancels a disallowed call with `event.cancel_tool = "<reason>"`. The cancel path was run locally (section 3.4).
3. **Human-only MFA:** MFA is not a Strands tool. It is an HTTP endpoint the UI calls. The LLM cannot produce the MFA symbol at all.
4. **Use case decision: finance transfer approval stays.** Alternatives were scored in section 2. AWS change-approval agent is the best alternative and is kept only as a stretch second policy.
5. The state machine is now fully specified and checked (section 4): 5 states (4 live + 1 named sink), 6 symbols, three independent formulations (table, ordering rules, regex) agree on all 2,015,539 strings up to length 8, and 96 of 96 single-cell mutants are caught (VERIFIED-LOCAL, script described in 4.6).
6. Rejected proposals leave session state unchanged (the JFLAP model has a sink, the executor does not move into it). v1 did not say this.
7. Added invariants INV-11 (MFA is human-only) and INV-12 (checker failure is fail-closed). Tool executor is `SequentialToolExecutor` (Strands runs one turn's tool calls concurrently by default).
8. AWS scope: Bedrock model plus one deployment path chosen by a day-5 spike. Everything else is on the skip list (section 5).
9. Calendar reset to the real 15 days (section 7). Unchanged from v1: Kiro formats, corrected claims, invariants INV-1..10, submission checklist.
10. Nothing in this file has been implemented. No real Bedrock call was made (no credentials used). JFLAP checks have not been run on the finance model yet.

## 1. Kiro file formats and corrected claims (carried over from v1, unchanged)

Checked against kiro.dev docs on 2026-11-15 (not re-checked today).

| Item | Real format | Source page |
| :-- | :-- | :-- |
| Specs | `.kiro/specs/<name>/requirements.md`, `design.md`, `tasks.md` | kiro.dev/docs/specs/ |
| Hooks | JSON at `.kiro/hooks/<id>.json`: `{"version":"v1","hooks":[{"name","trigger","matcher","action":{"type":"command"\|"agent",...}}]}` | kiro.dev/docs/hooks/ |
| Hook triggers (IDE) | PromptSubmit, AgentStop, SessionStart, PreCompaction, PostCompaction, PreToolUse, PostToolUse, FileCreate, FileSave, FileDelete, PreTaskExecution, PostTaskExecution | kiro.dev/docs/hooks/types/ |
| MCP config | `.kiro/settings/mcp.json` with `mcpServers.<name>.{command,args,env,disabled,autoApprove,disabledTools}` | kiro.dev/docs/mcp/configuration/ |
| Steering | `.kiro/steering/*.md`, optional YAML front matter `inclusion:`; `AGENTS.md` also read | kiro.dev/docs/steering/ |
| PBT | "Correctness" feature, IDE only | kiro.dev/docs/specs/ |

PreToolUse command hook: exit 0 adds stdout to context, any other exit code sends stderr to the agent and blocks the tool (kiro.dev/docs/hooks/actions/, 2026-10-10). Exact STDIN JSON fields still unread.

| Claim to avoid | Say instead |
| :-- | :-- |
| "0.2ms JFLAP proof latency", "zero hallucination", "mathematically proven safety" | "Every executed action sequence belongs to a declared regular language. The model is checked in JFLAP; the runtime executor is a generated table tested equal to it." Show only latencies measured by our code, labelled with the engine that produced them. |
| "JFLAP intercepts every action at runtime" | JFLAP is build time. Runtime is a small Python executor generated from `jflap_export_table`. |
| Novelty | Do not claim the idea is new. Related art (UNVERIFIED, from memory or search snippets): AgentSpec, Cedar-style policies, AgentCore policy features, and a Strands "steering" plugin (`strands.vended_plugins.steering`, seen in API docs listing). Our angle: authored and checked in JFLAP, enforced by a generated table, with a replay-equivalence test. |

Two agents, kept separate: the dev-time agent is Kiro (specs, steering, hooks, JFLAP MCP). The runtime agent is the Strands agent in the demo app. Kiro hooks do not gate it.

## 2. Use-case decision

Question asked: is there a clearly bigger idea than finance? Honest scoring (H = high, M = medium, L = low; "Risk" high is bad):

| Candidate | Order of actions truly matters? | Authorable and fully verifiable in 15 days | Demo impact | Fit with AWS judges | Risk |
| :-- | :-- | :-- | :-- | :-- | :-- |
| A. Finance transfer approval (AUTH, DRAFT, MFA, TRANSFER) | H: "MFA after the latest edit, before transfer" is purely an ordering rule | H: 6 symbols, 5 states, exhaustively checkable | H: one attack ("skip MFA, wire 10k") is understood in 5 seconds | M: generic, but familiar to every enterprise | L |
| B. AWS ops agent behind change approval (snapshot, plan, approve, deploy-prod / IAM change / delete data) | H: snapshot before delete, approval after the latest plan | M: 9 to 12 symbols, needs mock AWS tools, plan/approval semantics are debatable ("why not IAM and Step Functions?") | H if it works: "agent about to delete prod" lands with AWS people | H | M to H: bigger machine, more to verify, more arguments about realism, real AWS calls are dangerous in a live demo |
| C. Clinical medication order (verify patient, order, pharmacist verify, administer) | H | M: similar size to A, but domain correctness (is the order clinically right?) invites expert challenge | M: emotional, but judges may question medical claims | L to M | M: liability optics, domain accuracy |
| D. Compliance / records deletion (legal hold check, approval, delete) | M: mostly a precondition, close to 2 symbols | H | L: weak story | M | L |

Recommendation: **A, finance transfer approval.** It wins on verifiability, demo clarity and risk. B is better only on judge fit and loses on risk and verification effort in 15 days. The engine is policy-agnostic (table loaded from `jflap_export_table`), so a second policy file for B is a stretch item after day 11 only if the core is green. That keeps "think big" as a roadmap statement without risking the deadline.

## 3. Runtime agent design with Strands

### 3.1 Sources used (all read 2026-11-19)

- Hooks guide: https://strandsagents.com/latest/documentation/docs/user-guide/concepts/agents/hooks/
- Hooks lesson with `cancel_tool` and `interrupt`: https://strandsagents.com/docs/learning/control-your-agent-with-hooks/
- API, `BeforeToolCallEvent` / `AfterToolCallEvent`: https://strandsagents.com/docs/api/python/strands.hooks.events/
- Custom tools (`@tool`): https://strandsagents.com/docs/user-guide/sdk/tools/custom-tools/
- Tool executors: https://strandsagents.com/docs/user-guide/sdk/tools/executors/
- Bedrock model provider: https://strandsagents.com/latest/documentation/docs/user-guide/concepts/model-providers/amazon-bedrock/
- AgentCore Runtime deploy: https://strandsagents.com/docs/user-guide/sdk/deploy/deploy_to_bedrock_agentcore/python/
- Repo: https://github.com/strands-agents/sdk-python (not read; install and source of the installed package were inspected instead).

### 3.2 Concepts in plain words (the owner has not used Strands)

- **Agent**: `Agent(model=..., tools=[...], system_prompt=...)`. Calling `agent("text")` runs a loop: the model replies, if it asks for a tool the SDK calls it, the result goes back to the model, repeat until the model answers. (DOCS)
- **Tool**: a normal Python function with `@tool`. The docstring and type hints become the description the model sees. A tool that returns normally gives a success result; one that raises becomes an error result sent back to the model. (DOCS)
- **Model provider**: `BedrockModel(model_id=..., temperature=...)` is the default provider; credentials come from the standard boto3 chain (`aws configure`, env vars or `aws login`). IAM needs `bedrock:InvokeModel` and `bedrock:InvokeModelWithResponseStream`. (DOCS)
- **Hook**: a function the SDK calls at fixed points (before and after each tool call, model call, invocation). It receives an event object whose fields you may change. `BeforeToolCallEvent` has `tool_use` (name, input), `selected_tool`, and `cancel_tool`; setting `cancel_tool` to a string stops the call and puts that string into an error tool result the model sees. (DOCS, and VERIFIED-LOCAL on strands-agents 1.65.0)
- **Custom tool executor**: the executors page says custom executors are not supported yet (GitHub issue #762). So we do not rely on one. Only `ConcurrentToolExecutor` (default) and `SequentialToolExecutor` exist. (DOCS)

### 3.3 Where the checker plugs in (decision)

Two layers; either alone is enough to keep a disallowed tool from running, which is the point.

- **Layer 1, enforcement (our code, Strands-independent):** the only tools registered with the agent are five thin wrappers. The real functions are in `bank/real_tools.py`, which only `gate.py` imports.

```python
# agent_tools.py  (sketch)
from strands import tool
from gate import SESSION_GATE          # per-session object, holds state + lock

@tool
def execute_transfer() -> str:
    """Execute the approved transfer draft. Only works after the user approved with MFA."""
    return SESSION_GATE.run("TRANSFER", {})
```

`gate.run(symbol, args)` does, under one lock: look up `(state, symbol)` in the generated table; if undefined return a rejection string `{verdict, state, symbol, expected_symbols}`; otherwise apply the argument guard (INV-9), call the real function, then commit the new state. Any exception means reject and no state change.
- **Layer 2, interception (Strands hook):** on `BeforeToolCallEvent`, ask `gate.peek(symbol)` (read-only, never changes state). If not allowed, set `event.cancel_tool = reason`. The whole body is wrapped in try/except that sets `cancel_tool` on any error. This gives the model the reason in-band and emits a UI event for the red flash. It does not replace layer 1.

```python
def checker_hook(event: BeforeToolCallEvent) -> None:
    try:
        ok, reason = SESSION_GATE.peek(TOOL_TO_SYMBOL[event.tool_use["name"]])
        if not ok:
            event.cancel_tool = reason
    except Exception as e:                      # fail closed (INV-12)
        event.cancel_tool = f"REJECT: checker error ({type(e).__name__})"

agent = Agent(model=model, tools=[...5 wrappers...],
              tool_executor=SequentialToolExecutor(),
              hooks=[...]  # or agent.add_hook(checker_hook)
              )
```

Why not replace the tool in the hook (`event.selected_tool = ...`)? The hooks page shows that pattern, but its snippet mixes attribute and dict access on `tool_use`, so I treated it as unreliable and did not use it. `cancel_tool` is documented on the API page and was run locally.

Why `SequentialToolExecutor`? One model message can contain several tool calls and the default runs them concurrently. Sequential order plus the gate lock keep the state machine single-threaded. Concurrent behavior was not tested (UNVERIFIED).

Why MFA is not a tool: MFA is `POST /mfa` called by the UI with the user's code; the server calls `gate.run("MFA", {...}, source="human")`. The agent has no tool for it, so no prompt can trigger it (INV-11). Why AUTH is a tool: it checks the demo login the UI already collected (passed through `invocation_state`, never in the prompt) so the story "agent must log in first" is real.

### 3.4 What I actually ran (VERIFIED-LOCAL, strands-agents 1.65.0, Python 3.12, Windows)

A scripted `Model` subclass that always proposes `execute_transfer` as its first action, plus a hook that sets `cancel_tool`: the hook saw the call with its input, the real function's side-effect list stayed empty, and the model received a tool result with `status: error` and the reason text. A hook that raised an exception made the whole invocation abort with `EventLoopException` (so a crashing checker does not let the tool through; we still catch and cancel to get a clean message). Script lives in my scratch dir, not the repo; the stub-model pattern becomes the INV-5 test harness.

Not verified: real Bedrock invocation, Bedrock model access and IDs in the owner's account and region (the docs page lists newer model IDs than I could confirm; read the ID from env `BEDROCK_MODEL_ID` and check model access in the console on day 0), concurrent executor with hooks, multiple tool calls in one message, `interrupt()` flow (we do not use it).

### 3.5 First agent, trivially simple (day 0 task)

1. `pip install strands-agents bedrock-agentcore` in a venv (1.65.0 resolved today; pin it).
2. `aws login` or `aws configure`, enable a Claude model in Bedrock, run the 5-line hello world: `Agent(model=BedrockModel(model_id=os.environ["BEDROCK_MODEL_ID"]))("hi")`.
3. Add one `@tool` that returns a string; confirm the model calls it.
Only then add the gate. No Graph, Swarm, memory, sessions manager, MCP or plugins in v2.

## 4. Authoring and verifying the state machine (finance workflow)

Language convention: L(M) is the set of **safe action traces** (prefix-closed). Every non-sink state is accepting; the sink is non-accepting. A trace is accepted iff no step enters the sink. At runtime a rejected proposal does not move the session (the executor stays in the old state and runs nothing); the sink exists so the JFLAP model is a complete DFA.

### 4.1 Alphabet (6 symbols)

| Symbol | Real tool (Strands tool name) | Proposed by |
| :-- | :-- | :-- |
| AUTH | `authenticate_user()` | LLM |
| DRAFT | `create_transfer_draft(payee, amount)` | LLM |
| EDIT | `edit_transfer_draft(payee, amount)` | LLM |
| MFA | `POST /mfa` (not a Strands tool) | human only |
| TRANSFER | `execute_transfer()` | LLM |
| CANCEL | `cancel_transfer_draft()` | LLM |

Deliberately NOT in the alphabet: read-only tools (`get_balance`, `list_payees`) are not given to the agent in v2 to keep the closed set minimal (shortcut: add later as ungated read-only symbols with a self-loop if the demo needs them); any write tool such as `add_payee`, `raise_limit`, `wire_international`, `delete_*`; any unknown or misspelled name (INV-4). An unregistered name never reaches `gate.run`; Strands returns an error for an unknown tool (DOCS: `selected_tool` may be None when lookup fails).

### 4.2 States

| State | Meaning |
| :-- | :-- |
| START | Nothing happened; user not authenticated. Initial. |
| AUTHED | Authenticated, no open draft. |
| DRAFTED | A draft is open and not approved (either fresh, or its MFA was invalidated by an edit). |
| APPROVED | A draft is open and MFA occurred after its latest DRAFT/EDIT. The only state from which TRANSFER is allowed. |
| SINK | Non-accepting, all symbols loop. Used only in the JFLAP model; never entered at runtime. |

### 4.3 Transition table (every other cell goes to SINK)

| State \ Symbol | AUTH | DRAFT | EDIT | MFA | TRANSFER | CANCEL |
| :-- | :-- | :-- | :-- | :-- | :-- | :-- |
| START | AUTHED | SINK | SINK | SINK | SINK | SINK |
| AUTHED | SINK | DRAFTED | SINK | SINK | SINK | SINK |
| DRAFTED | SINK | SINK | DRAFTED | APPROVED | SINK | AUTHED |
| APPROVED | SINK | SINK | DRAFTED | SINK | AUTHED | AUTHED |
| SINK | SINK | SINK | SINK | SINK | SINK | SINK |

Initial state START. Accepting: START, AUTHED, DRAFTED, APPROVED. 5 states x 6 symbols = 30 cells, all defined (complete). After a TRANSFER the machine returns to AUTHED: the draft is consumed, so a second transfer needs a new DRAFT and a new MFA.

### 4.4 Accepted language

In words: a session starts with AUTH (once). Then it is any number of transfer cycles, optionally followed by one unfinished cycle. A cycle opens with DRAFT, may have EDITs, needs an MFA after the latest DRAFT or EDIT before it can end in TRANSFER, and may end instead with CANCEL. MFA cannot be repeated without an intervening EDIT; EDIT after MFA cancels the approval.

Independent formulation 1, ordering rules R1 to R7 (a string is safe iff all hold at every position i):

- R1 Non-empty traces start with AUTH.
- R2 AUTH occurs only at position 1.
- R3 A draft is *open* at position i if the latest DRAFT before i has no TRANSFER or CANCEL after it.
- R4 DRAFT is allowed only if no draft is open.
- R5 EDIT, MFA, TRANSFER, CANCEL are allowed only if a draft is open.
- R6 MFA is allowed only if no MFA occurred after the latest DRAFT/EDIT of the open draft.
- R7 TRANSFER is allowed only if an MFA occurred after the latest DRAFT/EDIT of the open draft.

Independent formulation 2, regex over single letters A=AUTH D=DRAFT E=EDIT M=MFA T=TRANSFER C=CANCEL (full match, includes the empty string):

```
( ε | A ( D (E|ME)* (C | M(C|T)) )* ( ε | D (E|ME)* M? ) )
```

Formulation 3 is the transition table in 4.3. The table was authored from the rules (state = which of the R3/R6/R7 facts hold), the regex was derived separately from the state diagram's cycle structure; the check below makes them agree or fail.

### 4.5 Safety properties (checked on executed traces, i.e. what actually ran)

| # | Property | Test name |
| :-- | :-- | :-- |
| S1 | The first executed action is AUTH; nothing executes before it. | `test_s1_nothing_before_auth` |
| S2 | TRANSFER is never executed unless an MFA occurred after the latest DRAFT or EDIT that precedes it (so no EDIT occurred after that MFA). | `test_s2_transfer_requires_fresh_mfa` |
| S3 | Two TRANSFERs never occur without a DRAFT between them (a draft is spent once). | `test_s3_draft_spent_once` |
| S4 | AUTH executes at most once per session. | `test_s4_auth_once` |
| S5 | MFA is never executed twice in a row without an EDIT or new DRAFT between (no approval stacking). | `test_s5_no_mfa_stacking` |
| S6 | A rejected proposal changes no state and runs no tool (side-effect counter unchanged, state equal before and after). | `test_s6_reject_is_noop` |
| S7 | A tool name outside the alphabet, or the MFA symbol with source=llm, never runs. | `test_s7_closed_alphabet_and_human_mfa` |
| S8 | Executor verdict equals the JFLAP verdict for every tested trace. | `test_s8_executor_matches_jflap` |
| S9 | The argument guard holds at cap-1, cap, cap+1 and for retry exhaustion (INV-9). | `test_s9_argument_caps` |
| S10 | With the Strands hook removed, layer 1 still blocks (S1 to S7 hold). With layer 1's table check bypassed in a test double, the hook still blocks S2. | `test_s10_each_layer_alone_blocks` |

### 4.6 Verification plan (four independent methods)

M1 **Exhaustive cross-check of table vs rules vs regex.** Python script generates every string over the 6 symbols up to length 8 (2,015,539 strings including the empty string; 321 are accepted), runs the table, evaluates R1 to R7 by position scanning (no state variable), and fullmatches the regex. Pass criterion: all three verdicts equal on every string. Also 100,000 random strings of length 9 to 30 and 20,000 table-guided random walks (to reach long accepted strings). **Result today (VERIFIED-LOCAL, throwaway script in my scratch dir): 0 mismatches in all three runs.** The script will become `tests/test_sm_exhaustive.py` in the repo. Limit: lengths above 8 are sampled, not exhaustive; a 5-state DFA cannot hide a difference only visible beyond length about 8 except via a cell not exercised, which M3 covers.

M2 **JFLAP checks (build time, via the project's JFLAP MCP; NOT yet run).**
1. `jflap_inspect` on `finance.jff`: deterministic, complete; unreachable states none; dead states exactly {SINK}.
2. Author a second `.jff` independently from the regex (or, if the MCP cannot convert a regex, a differently structured DFA that tracks three flags: authed, draftOpen, mfaFresh) and run `jflap_equivalence_check(finance, second)`. The exact MCP tool coverage of regex input is UNVERIFIED.
3. `jflap_equivalence_check(finance, minimized)` true, and state count after minimization is 5. By hand: START/AUTHED separated by suffix A, AUTHED/DRAFTED by M, DRAFTED/APPROVED by T, START/DRAFTED and START/APPROVED by A, AUTHED/APPROVED by T, SINK from all others by the empty suffix. So the machine is minimal.
4. `jflap_simulate_batch` over every trace in 4.7 and compare to the expected verdicts.
5. `jflap_export_table` output is what generates `executor_table.py` (never hand-edited).

M3 **Property-based tests against the executor** (Hypothesis, new dev dependency): generate random action sequences, feed them to the real `gate.run` with stub tools, record executed actions, assert S1 to S7 and S9 on every executed trace. One test per property, names in 4.5.

M4 **Mutation testing.** Script mutates one cell of the table at a time (4 live states x 6 symbols x 4 other targets, plus removing a transition = 96 mutants) and runs the M1 comparison. **Result today (VERIFIED-LOCAL): 96 of 96 mutants killed, 0 survivors.** In the repo, the same loop runs against M3: for a hand-picked set of at least 8 mutants (for example `APPROVED -EDIT-> APPROVED`, `DRAFTED -TRANSFER-> AUTHED`, `START -DRAFT-> DRAFTED`, `AUTHED -MFA-> APPROVED`) the property suite must fail. If a mutant survives M3, add a test before moving on.

M5 **Replay-equivalence (INV-3):** all strings up to length 6 plus 1,000 random longer ones through the executor and through `jflap_simulate_batch`; verdicts identical.

M6 **Hand check** (done): the 9 accept and 12 reject traces below were traced by hand on the table and by script on all three formulations; all agreed.

Gate rule: no code beyond the executor is written until M1, M2, M4 pass and the author has read the trace table in 4.7.

### 4.7 Worked trace table (state after each step shown for the failing one)

Verdicts below were also produced by the script (table, rules, regex all agree).

| # | Trace | Verdict | Why |
| :-- | :-- | :-- | :-- |
| 1 | AUTH | ACCEPT | START to AUTHED |
| 2 | AUTH DRAFT | ACCEPT | open draft, DRAFTED |
| 3 | AUTH DRAFT MFA | ACCEPT | approved, APPROVED; legal to stop here |
| 4 | AUTH DRAFT MFA TRANSFER | ACCEPT | the happy path; returns to AUTHED |
| 5 | AUTH DRAFT EDIT MFA TRANSFER | ACCEPT | edit before MFA is fine |
| 6 | AUTH DRAFT MFA EDIT MFA TRANSFER | ACCEPT | edit invalidated MFA, a fresh MFA restored it |
| 7 | AUTH DRAFT MFA CANCEL | ACCEPT | cancel from APPROVED, back to AUTHED |
| 8 | AUTH DRAFT MFA TRANSFER DRAFT MFA TRANSFER | ACCEPT | second transfer needed its own DRAFT and MFA |
| 9 | AUTH DRAFT EDIT EDIT MFA EDIT EDIT MFA TRANSFER | ACCEPT | repeated edits, each followed by fresh MFA |
| 10 | DRAFT | REJECT at step 1 | nothing before AUTH (S1) |
| 11 | MFA | REJECT at step 1 | START has only AUTH |
| 12 | AUTH TRANSFER | REJECT at step 2 | no draft open (R5) |
| 13 | AUTH AUTH | REJECT at step 2 | AUTH only once (R2, S4) |
| 14 | AUTH CANCEL | REJECT at step 2 | nothing to cancel (R5) |
| 15 | AUTH DRAFT TRANSFER | REJECT at step 3 | skipped MFA: the headline attack (S2) |
| 16 | AUTH DRAFT DRAFT | REJECT at step 3 | a draft is already open (R4) |
| 17 | AUTH DRAFT MFA MFA | REJECT at step 4 | approval stacking (R6, S5) |
| 18 | AUTH DRAFT MFA EDIT TRANSFER | REJECT at step 5 | EDIT after MFA voided the approval (S2) |
| 19 | AUTH DRAFT MFA TRANSFER TRANSFER | REJECT at step 5 | draft already spent (S3) |
| 20 | AUTH DRAFT MFA TRANSFER MFA | REJECT at step 5 | no open draft after transfer |
| 21 | AUTH DRAFT MFA TRANSFER EDIT | REJECT at step 5 | the draft no longer exists |

Runtime reading of a REJECT row: the first 4 actions of row 15 executed, the 5th (TRANSFER proposal) is refused and the session stays in DRAFTED.

## 5. AWS scope

Use (all small): **Amazon Bedrock** via Strands `BedrockModel` (one Claude model, ID from env var; DOCS for the provider, model availability UNVERIFIED). IAM: a role or local profile with `bedrock:InvokeModel*` on that model only.

Live URL, pick ONE by a day-5 deploy spike, in this order of preference:
1. **Bedrock AgentCore Runtime** for the agent (`BedrockAgentCoreApp` with `@app.entrypoint`, deploy via the `agentcore` CLI; DOCS on the Strands deploy page). Good AWS-judge story. Unverified: cost, region, how per-session in-memory state behaves across invocations (our gate state must be keyed by session id and kept in the process; check that AgentCore routes one session to one runtime session), and how the browser UI calls it (needs auth and CORS or a thin proxy).
2. **One container** (FastAPI serving API plus static UI) on a container host with a public URL, one instance only (in-memory state; `shortcut: single instance, move state to DynamoDB only if scaling is ever needed`). Specific service choice UNVERIFIED (check current availability of App Runner vs ECS Express Mode before relying on either).
3. Fallback: a local-run video plus a public repo, with a hosted URL marked "best effort". Submission requires a working URL per the checklist, so avoid this fallback.

Skip (deadline protection): Cognito, DynamoDB, Step Functions, API Gateway, CDK/CloudFormation (click or CLI once, write the commands in the README), Bedrock Knowledge Bases, Bedrock Guardrails (does not give ordering guarantees; may be mentioned as complementary), AgentCore Memory/Gateway/Identity/Observability, Strands Graph/Swarm/multi-agent, Strands interrupts and steering plugins, JFLAP on the server.

## 6. Invariant -> Enforcement -> Test matrix (v1 rows updated, two added)

| ID | Invariant | Enforcement point | Test |
| :-- | :-- | :-- | :-- |
| INV-1 | Every executed action sequence is in L(M). | `gate.run` is the only caller of real tools (import-graph rule: only `gate.py` imports `bank/real_tools.py`). It steps the table and runs the tool only on an accepted transition, under a lock. | S1 to S5 via Hypothesis; replay of executed prefixes through `jflap_simulate_batch` (M5); a test that parses imports and fails if anything but `gate.py` imports `bank.real_tools`. |
| INV-2 | Undefined transition = reject (fail closed). | Table lookup default is REJECT; exceptions map to REJECT with no state change. | Enumerate all 16 undefined live-state cells, assert REJECT and unchanged state; inject an exception, assert nothing ran (S6). |
| INV-3 | Executor and JFLAP model agree. | `executor_table.py` generated from `jflap_export_table`; CI regenerates and diffs. | M5, M2. |
| INV-4 | An unmapped tool cannot run. | Closed `TOOL_TO_SYMBOL` dict; the agent is given only the 5 wrappers. | S7: unknown, misspelled, unicode-lookalike names; Strands lookup failure yields no call. |
| INV-5 | The LLM cannot execute a tool except through the checker. | LLM output is only Strands tool-use requests. Registered tools are gate wrappers. Real functions are not importable from agent code. Hook adds a second check. | Stub `Model` that always proposes TRANSFER first plus an adversarial prompt list; assert side-effect counter 0 (S10). Repeat with real Bedrock model once (manual, recorded). |
| INV-6 | Session state changes only through accepted transitions. | State is a private attribute written only in `gate._commit` after acceptance. | Try direct writes from the API payload and from tool args; state unchanged. |
| INV-7 | Model is deterministic, complete, no unreachable or dead states except the named SINK. | CI runs `jflap_inspect` on `finance.jff`. | M2.1 fails the build otherwise. |
| INV-8 | A rejection carries a reason. | Rejection returns `{verdict, state, symbol, expected_symbols}`; also placed into `cancel_tool` text. | Assert all four fields for each of the 16 undefined live cells. |
| INV-9 | Argument limits hold (amount cap, max transfers per session, retry limit). | Counter guard inside `gate.run` after the table accepts. Demo values (UNDECIDED, pick on day 3): cap 5,000, 3 transfers. | S9 boundary tests. |
| INV-10 | Displayed latencies are measured, not claimed. | Proof Inspector reads `time.perf_counter()` values from the engine that ran. | Test that the field is absent when no measurement exists. |
| INV-11 (new) | MFA cannot be produced by the LLM. | No MFA tool; `gate.run("MFA", ..., source="human")` called only by the `/mfa` endpoint; `source` is set by server code, never from the payload. | S7: MFA with source=llm rejected; prompt-injection corpus asking for MFA. |
| INV-12 (new) | A checker or hook failure never lets a tool run. | try/except in the hook sets `cancel_tool`; gate catches all exceptions; Strands aborts the invocation if a hook raises (VERIFIED-LOCAL). | Inject a failing `peek`; assert side-effect counter 0. |

Explicit non-guarantees: natural-language claims by the model are not checked; argument correctness beyond INV-9 is not checked (a DFA cannot see arguments); a wrong but well-formed policy is enforced faithfully; prompts can still make the model say false things about what it did, so the UI must show the executed log from the gate, not the model text.

## 7. Build order and calendar

Rule: hardest invariant first. Today is Thu Nov 19. D = days after today. Dates are IST days.

| Day | Date | Work | Exit check |
| :-- | :-- | :-- | :-- |
| D0 | Nov 19 (today) | Approve this gate. Strands hello world on Bedrock (3.5). Confirm model access. | Agent answers; one `@tool` called. |
| D1 to D2 | Nov 20 to 21 | `finance.jff`, second independent model, `jflap_inspect`/equivalence (M2), exhaustive script into repo (M1), mutation (M4). | INV-7, M1, M2, M4 green. Author reads 4.7. |
| D3 | Nov 22 | Export table, generated executor, `gate.run/peek`, stub tools, Hypothesis suite S1 to S7, M5. | INV-1,2,3,4,6,8 green. **This is the real gate.** |
| D4 | Nov 23 | Strands wrappers, hook, SequentialToolExecutor, stub-`Model` adversarial suite (S10), INV-11, INV-12. | INV-5 green. |
| D5 | Nov 24 | Argument guard (S9). Real Bedrock model through the same agent. **Deploy spike** for the live URL (section 5). | One real end-to-end run recorded; chosen host answers a request. |
| D6 to D9 | Nov 25 to 28 | API (SSE events), React (Vite) + React Flow UI: chat, live automaton, executed-log, Proof Inspector (INV-10), MFA button. | Demo script runs locally end to end. |
| D10 | Nov 29 | Deploy for real. Smoke test the public URL. | Public URL passes the demo script. |
| D11 to D12 | Nov 30 to Dec 1 | Video (under 3 min), Kiro write-up, README, license, blog, disclosures. | Draft submission complete. |
| D13 | Dec 2 | Feature freeze. Full test pass, retakes. | All suites green on the deployed build. |
| D14 | Dec 3 | **Submit on Devpost** (one day early). | Submission confirmed. |
| D15 | Dec 4 | Buffer only; deadline is 2:00 PM PT. | Nothing new. |

Cut order if behind (cut from the top): Proof Inspector polish, blog, second JFLAP-independent model (keep regex check), AgentCore (fall back to container), animations. Never cut: M1, M2.1, M4, S2, S10.

## 8. Dev-time Kiro usage (to show in the write-up)

Specs (`.kiro/specs/<name>/{requirements,design,tasks}.md`) for the gate and the agent; steering file stating "never hand-edit `executor_table.py`; regenerate from JFLAP"; a PostToolUse or FileSave hook that runs the M1 script when `finance.jff` or `executor_table.py` changes (hook format in section 1); the JFLAP MCP binding in `.kiro/settings/mcp.json`. Stretch: a PreToolUse hook that runs the same executor on Kiro's own tool calls, only after its STDIN fields are read.

## 9. Submission checklist (carried over, one line added)

- [ ] Public GitHub repo with OSS license detectable at root (JFLAP jar and Duke license under `third_party/`, or fetch the jar in setup)
- [ ] `/.kiro` committed, not ignored (`.gitignore` already complies)
- [ ] Working app URL (JVM and JFLAP are not needed at runtime)
- [ ] Public YouTube video under 3 minutes
- [ ] Kiro-usage write-up (specs, steering, hooks, MCP, PBT)
- [ ] Disclose third-party and pre-existing: JFLAP 7.1 (Duke), jflap-cli (first commit 2026-11-13), Strands Agents SDK (Apache-2.0, UNVERIFIED license text), Bedrock model used
- [ ] Bonus prizes: Student, Best Kiro Crew App, Best Demo, Blog, Social
- [ ] Bring only needed files from jflap-cli history into this repo
- [ ] README includes run commands, the 12 invariants, the verification commands, and honest non-guarantees
- [ ] No secrets or AWS keys in the repo; `.env` stays ignored

## 10. Open items (not verified)

- Real Bedrock call, model ID and access in the owner's account and region.
- AgentCore Runtime cost, region, session-state behavior; final deploy host.
- Concurrent tool calls in one model message through the hook (we avoid it with the sequential executor but did not test it).
- Whether `jflap_mcp` can take a regex or only `.jff` files (affects M2.2).
- Exact Kiro PreToolUse STDIN fields; whether Kiro loads `.kiro/settings/mcp.json` with the absolute path here.
- Prior-art names (AgentSpec, Cedar, Strands steering plugin) are from memory or snippets.
- Devpost license detection with a second license file; JFLAP redistribution terms (Duke terms allow unmodified redistribution with license and no fee).
- The doc page for hooks in the Strands "latest" path and the newer `/docs/user-guide/sdk/` path differ in layout; API behavior I rely on (`cancel_tool`) was confirmed against installed 1.65.0.
