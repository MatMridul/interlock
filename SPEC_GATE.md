# SPEC GATE: The Chimeric Automaton (v1, supersedes the claims in CHIMERIC_AUTOMATON_SPEC.md where they differ)

Status: PROPOSED. Becomes "GATE PASSED" only when the author approves it. After that, no spec revisions unless implementation forces one.
Window: build Oct 30 - Dec 4, 2026 (deadline Fri Dec 4, 2:00 PM PT = Sat Dec 5, 3:30 AM IST).

## 1. Kiro file formats (checked against kiro.dev docs on 2026-11-15)

| Item | Real format | Source page | Our old spec said |
| :-- | :-- | :-- | :-- |
| Specs | `.kiro/specs/<name>/requirements.md`, `design.md`, `tasks.md` | kiro.dev/docs/specs/ | `*.spec.json` (WRONG) |
| Hooks | JSON files at `.kiro/hooks/<id>.json`: `{"version":"v1","hooks":[{"name","trigger","matcher","action":{"type":"command"\|"agent",...}}]}` | kiro.dev/docs/hooks/ | `*.hook.ts` (WRONG) |
| Hook triggers (IDE) | PromptSubmit, AgentStop, SessionStart, PreCompaction, PostCompaction, **PreToolUse**, PostToolUse, FileCreate, FileSave, FileDelete, PreTaskExecution, PostTaskExecution | kiro.dev/docs/hooks/types/ | `tool_call_requested` (DOES NOT EXIST) |
| MCP config | `.kiro/settings/mcp.json` (workspace) with `mcpServers.<name>.{command,args,env,disabled,autoApprove,disabledTools}` | kiro.dev/docs/mcp/configuration/ | `.kiro/mcp/jflap-server.json` (WRONG path) |
| Steering | `.kiro/steering/*.md` with optional YAML front matter `inclusion: always \| fileMatch \| ...`; `AGENTS.md` also supported | kiro.dev/docs/steering/ | OK |
| Property-based testing | "Correctness" feature, IDE only | kiro.dev/docs/specs/ | not mentioned |

Verified (kiro.dev/docs/hooks/actions/, page updated 2026-10-10): a shell-command hook that exits 0 adds stdout to the agent context; any other exit code sends stderr to the agent and, for **PreToolUse**, BLOCKS the tool invocation (same for PromptSubmit in the IDE). Default timeout 60s. Command hooks receive session context as JSON on STDIN. Caveat: CLI PromptSubmit hooks cannot block.

## 2. Corrected claims (what we are allowed to say)

| Old claim | Problem | Replacement |
| :-- | :-- | :-- |
| "0.2ms / 0.18ms JFLAP proof latency" | Measured JFLAP call is ~260ms spawn-per-call (3.9ms persistent, 0.63ms/string batch, per Antigravity, test run on this host passed 21/21 but timings not re-measured). A runtime executor is microseconds. | Show only numbers measured by our own code in the Proof Inspector. Label which engine produced each number. |
| "Zero hallucination" | The automaton constrains the sequence of action TYPES only. | "Deterministically enforces that every executed action sequence belongs to a declared regular language." |
| "Mathematically proven safety" | Proof is about the model (JFLAP checks), not about the LLM. | "The policy model is machine-checked in JFLAP; enforcement is a generated table that is tested equal to it." |
| "JFLAP intercepts every action at runtime" | Too slow and a JVM on the hot path. | JFLAP = build time (author, inspect, minimize, prove equivalence, counterexamples). Runtime = small executor generated from `jflap_export_table`. |
| Novelty | Guard automata / runtime verification for agents is existing art (unverified names recalled: AgentSpec, Cedar policies). | Position as "authored and proven in JFLAP, enforced at runtime, with a replay-equivalence test". Do not claim the idea is new. |

## 3. The agent boundary (decision)

Two different agents, kept separate:

1. **Dev-time agent = Kiro itself.** Uses specs, steering, hooks and the JFLAP MCP server to build the project. Kiro features shown here: specs (requirements/design/tasks), steering, hooks, MCP, PBT if available.
2. **Runtime agent = the demo app's own LLM** (behind the playground chat). This is the agent that the automaton guards. Kiro hooks do NOT gate it.

Stretch (only after the core passes): a PreToolUse hook that runs the same executor against Kiro's own tool calls, once the blocking semantics are verified.

## 4. Scope

- **Core (must ship):** a DFA policy for one workflow (finance: AUTH -> DRAFT -> MFA -> TRANSFER style), a generated executor, a dispatcher, a replay-equivalence test, a stub LLM port, then the real LLM, then the UI.
- **Argument guard (should ship):** spend cap and retry limit as a separate counter guard, because a DFA cannot see arguments.
- **PDA (stretch):** nesting/bounded-depth rule via JFLAP PDA with explicit `acceptance_mode`.

## 5. Invariant -> Enforcement -> Test matrix

Rule: every guarantee is a column / cap / dispatch table / transition guard, never a sentence.

| ID | Invariant | Enforcement point | Test |
| :-- | :-- | :-- | :-- |
| INV-1 | Every executed action sequence is in L(M). | Single `dispatch(action)` function; it calls `executor.step(state, symbol)` and runs the tool only on an accepted transition. No other code path imports tool functions. | Property test: random action sequences through the dispatcher (stub LLM); each executed prefix replayed through JFLAP `jflap_simulate_batch` must be accepted. |
| INV-2 | Undefined transition = reject (fail closed). | Executor table lookup returns REJECT on a missing (state, symbol) key; exceptions also map to REJECT. | Enumerate all (state, symbol) pairs not in the table, assert REJECT; inject an executor exception, assert nothing runs. |
| INV-3 | Executor and JFLAP model agree. | Executor is generated from `jflap_export_table(model)`; never hand-edited. | Replay test: N random strings (including all strings up to length 6) through JFLAP batch and through the executor; assert identical verdicts. Also `jflap_equivalence_check(model, minimized)` is true. |
| INV-4 | An unmapped tool cannot run. | Closed dispatch table: tool name -> alphabet symbol -> function. Unknown name raises REJECT. | Call dispatch with unknown / misspelled / unicode-lookalike tool names; assert REJECT and no side effect. |
| INV-5 | The LLM cannot execute directly. | LLM port returns proposals (data) only; it is given no handle to tool functions or to executor state. | Adversarial prompt corpus against a stub LLM that always proposes TRANSFER first; assert blocked and side-effect counter stays 0. Later repeat with the real LLM. |
| INV-6 | Session state changes only through accepted transitions. | State is a private field written only inside `step()` after acceptance; transition guard rejects any other write. | Attempt direct state writes from the LLM port / API payload; assert state unchanged. |
| INV-7 | Policy model is deterministic, complete, with no unreachable or dead states. | CI check on `jflap_inspect` output (`isDeterministic`, `isComplete`, `unreachableStates`, `deadStates`). | CI fails the build if any is false / non-empty (dead sink state explicitly allowed and named). |
| INV-8 | A rejection carries a reason. | Dispatcher returns `{verdict, state, symbol, expected_symbols}`; counterexample via `jflap_trace` at build/debug time. | Assert every rejection has the 4 fields; golden test on the finance workflow. |
| INV-9 | Argument limits hold (spend cap, retries). | Counter guard inside `dispatch` after the automaton accepts; stored as a numeric field with a hard cap. | Boundary tests at cap-1, cap, cap+1; retry limit exhausted. |
| INV-10 | Displayed latencies are measured, not claimed. | Proof Inspector reads `time.perf_counter()` values from the engine that ran. | Test asserts the displayed value comes from a real measurement field and is absent when none exists. |

Explicit non-guarantees: the model's natural-language claims are not checked; the correctness of tool arguments beyond INV-9 is not checked; a policy that is wrong but well-formed is enforced faithfully.

## 6. Build order (hardest invariant first)

1. Policy model `finance.jff` + `jflap_inspect` CI check (INV-7).
2. Export table + generated executor + dispatcher with stub tools (INV-1,2,3,4,6,8).
3. Replay-equivalence test green (INV-3). **This is the real gate for coding further.**
4. Adversarial suite against a stub LLM (INV-5).
5. Counter guard (INV-9).
6. Real LLM wired behind the port.
7. UI (Next.js + React Flow) and Proof Inspector (INV-10).
8. Deployment (container host for a working URL), video, write-up, blog.

Day budget (Nov 15 -> Dec 4 = 19 days): steps 1-5 days 1-6, step 6 day 7-8, step 7 days 9-14, step 8 days 15-17, buffer days 18-19 (retakes, deploy fixes). The Devpost submission is done a day early.

## 7. Submission checklist

- [ ] Public GitHub repo with a detectable OSS license at root (jflap jar and its Duke license kept under `third_party/`; consider fetching the jar in setup instead of bundling)
- [ ] `/.kiro` committed, not gitignored (done in `.gitignore`)
- [ ] Working app URL (container host; JVM is only needed if JFLAP runs in the deployed app, which it should not need to)
- [ ] Public YouTube video under 3 minutes
- [ ] Kiro-usage write-up: specs, steering, hooks, MCP, PBT
- [ ] Disclose third-party/pre-existing: JFLAP 7.1 (Duke), jflap-cli (first commit 2026-11-13, in-window)
- [ ] Bonus prizes: Student (all team members students), Best Kiro Crew App, Best Demo, Blog, Social
- [ ] Remove unrelated coursework files that appear in the jflap-cli history only if they are bundled into this repo

## 8. Open items (not yet verified)

- (closed) PreToolUse blocking semantics: verified, see section 1. Exact STDIN JSON field names for the tool call are still unread.
- How Devpost's license detector treats a second license file.
- Prior-art names (AgentSpec, Cedar) are from memory.
- Whether Kiro loads `.kiro/settings/mcp.json` here with the absolute path (open the folder in Kiro and check).
- JFLAP7.1 redistribution: Duke terms allow unmodified redistribution with the license and no fee; no-fee rules out selling a product that bundles it.
