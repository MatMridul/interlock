# Requirements: the Gate (finance transfer approval)

DRAFT for owner review. Source of truth for detail: `SPEC_GATE_v2.md`. Format: Requirements-First feature spec, EARS notation (`WHEN ... THE SYSTEM SHALL ...`) as described on kiro.dev/docs/specs/feature-specs/.

## Introduction

An LLM agent proposes tool calls for a money-transfer workflow. A deterministic Gate decides which calls run. The allowed order is a small state machine (START, AUTHED, DRAFTED, APPROVED, plus a named SINK) checked in JFLAP at build time and enforced at runtime by a generated table. A human, not the model, supplies the MFA step.

## Requirements

### Requirement 1: Only accepted transitions execute (INV-1, INV-2)
**User story:** As an operator, I want every executed action sequence to belong to the declared language, so that an out-of-order tool call never runs.
1. WHEN the agent proposes a symbol that has no transition from the current state, THE SYSTEM SHALL reject it, run no tool and leave the state unchanged.
2. WHEN a proposal is accepted, THE SYSTEM SHALL run the tool and commit the new state under one lock.
3. THE SYSTEM SHALL allow only `bank/gate.py` to import `bank/real_tools.py`.
4. IF the table lookup or the tool raises, THEN THE SYSTEM SHALL reject, run nothing further and keep the state (INV-12).

### Requirement 2: The model and the table agree (INV-3, INV-7)
**User story:** As a reviewer, I want the runtime table to equal the JFLAP model.
1. THE SYSTEM SHALL generate `bank/executor_table.py` from the JFLAP `export-table` output and never hand-edit it.
2. WHEN the table is regenerated, THE SYSTEM SHALL detect staleness (`--check` exits 1).
3. THE JFLAP model SHALL be deterministic and complete, with SINK as its only dead state.
4. THE SYSTEM SHALL return the same verdict as JFLAP for every tested string (all strings of length 1 to 6 plus 1,000 random longer ones).

### Requirement 3: Closed alphabet (INV-4)
1. WHEN a tool name or symbol is outside the six-symbol alphabet (misspelled, other case, lookalike Unicode, non-string), THE SYSTEM SHALL reject it and run nothing.
2. THE agent SHALL be given exactly five wrapper tools, none of which is MFA.

### Requirement 4: The model cannot reach the checker's state (INV-5, INV-6)
1. THE SYSTEM SHALL change session state only through `Gate._commit` after an accepted transition.
2. WHEN the Strands `BeforeToolCallEvent` hook is removed, THE SYSTEM SHALL still block a disallowed call (layer 1).
3. WHEN the gate's table check is bypassed in a test double, THE hook SHALL still block it (layer 2).

### Requirement 5: Rejections explain themselves (INV-8)
1. WHEN a proposal is rejected, THE SYSTEM SHALL return `verdict`, `state`, `symbol`, `expected_symbols` and a `reason`.

### Requirement 6: Argument limits (INV-9)
1. WHEN a draft or edit names a payee outside the allow-list, or an amount that is not a finite positive number with at most 2 decimals, or above the spend cap, THE SYSTEM SHALL reject it.
2. WHEN the transfer count would exceed the per-session limit, THE SYSTEM SHALL reject the transfer.
3. WHEN consecutive rejected proposals reach the retry limit, THE SYSTEM SHALL lock the session.
4. WHEN TRANSFER runs, THE SYSTEM SHALL use the stored latest draft arguments, not model-supplied ones.
5. THE guard SHALL be on by default in `Gate()`.

### Requirement 7: Measured numbers only (INV-10)
1. WHEN no latency measurement exists, THE SYSTEM SHALL omit the latency field from events and UI.
2. THE UI SHALL label latency with the engine that produced it.

### Requirement 8: MFA is human only (INV-11)
1. WHEN `MFA` is run with `source` other than `human`, THE SYSTEM SHALL reject it.
2. WHEN `POST /session/{id}/mfa` receives the wrong code, THE SYSTEM SHALL return 403 and not change state.
3. THE `source` value SHALL be set by server code, never read from the request payload.

### Requirement 9: Playground and submission
1. THE UI SHALL show the live automaton, the agent chat, the executed log from the gate, counters, and the human approval control.
2. THE UI SHALL NOT claim zero hallucination, mathematical proof of safety, or JFLAP at runtime.
3. THE project SHALL ship a public repo with an OSS license (owner to choose), a working app URL, a video under 3 minutes and a Kiro-usage write-up. (Open, see tasks.)

## Non-guarantees
Natural-language claims by the model are not checked. A wrong but well-formed policy is enforced faithfully. Arguments are checked only by the guard (INV-9). No concurrency stress test was run.
