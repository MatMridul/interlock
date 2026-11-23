# Requirements: Safe Ship (a second policy on the same gate)

Format: Requirements-First feature spec, EARS notation as on kiro.dev/docs/specs/feature-specs/. Detail and evidence: `docs/SAFE_SHIP.md`, `docs/spikes/SAFE_SHIP_SPIKE.md`.

## Introduction

A coding agent can push or deploy code it never tested. Safe Ship applies the Interlock gate to Kiro's own tool calls through a `PreToolUse` hook: pushes and deploy commands are refused until a test run exited 0 after the last edit. The allowed order is a small state machine (CLEAN, EDITED, TESTED, plus a named SINK) verified in JFLAP, run by the same `bank.gate.Gate` engine as the finance policy. Safe Ship covers mapped risky actions only; it is a guard for a cooperative agent, not a sandbox.

## Requirements

### Requirement 1: Push and deploy need a green test after the last edit (SS-1, SS-2)
**User story:** As a developer, I want the agent unable to push untested work, so that a broken edit does not reach the remote.
1. WHEN the agent calls a tool that maps to PUSH or DEPLOY and the latest EDIT-or-TEST in the session is not a TEST, THE SYSTEM SHALL block the call with exit code 2 and a message on STDERR.
2. WHEN a mapped EDIT happens, THE SYSTEM SHALL move the session to EDITED, so the next PUSH or DEPLOY is blocked.
3. WHEN a session starts, THE SYSTEM SHALL treat it as CLEAN, which also blocks PUSH and DEPLOY until a test has run.
4. WHEN a COMMIT happens, THE SYSTEM SHALL keep the current state.

### Requirement 2: What counts as a test (SS-3)
1. THE SYSTEM SHALL record a TEST only when the command is exactly one recognised test command (pytest, python -m pytest or unittest, npm/yarn/pnpm test, cargo test, go test), joined only by `&&`, and its tool response ends with `Exit Code: 0`.
2. IF a test command is piped, joined with `;` or `||`, asks only for `--version`, `--help` or `--collect-only`, or exits non-zero, THEN THE SYSTEM SHALL NOT record a TEST.
3. WHEN one shell command contains a test and a push, THE SYSTEM SHALL judge the push before the test has run and block it.

### Requirement 3: One engine, two policies (SS-4, SS-5)
1. THE SYSTEM SHALL run Safe Ship on `bank.gate.Gate`, with `safeship/executor_table.py` as its table.
2. THE SYSTEM SHALL generate `safeship/executor_table.py` from `policy/safe_ship.jff` through `scripts/gen_executor_table.py --policy safe_ship`, never hand-edit it, and detect staleness with `--check`.
3. THE machine SHALL be verified with the finance method: every string up to length 8 against an independent rule scan, every single-cell mutant killed or proven language-equivalent, JFLAP inspect and equivalence.

### Requirement 4: Safe failure (SS-6)
1. IF the hook input cannot be parsed, the state store cannot be read or locked, or a shell call has no command string, THEN THE SYSTEM SHALL block the call (fail closed in `PreToolUse`).
2. IF the stored state is missing, corrupt or unknown, THEN THE SYSTEM SHALL read it as CLEAN.
3. IF the `PostToolUse` hook fails, THEN THE SYSTEM SHALL exit 0; a missed TEST record only keeps PUSH and DEPLOY blocked.

### Requirement 5: A closed, honest mapping (SS-7)
1. THE SYSTEM SHALL map only the tool names and command patterns in `safeship/hook.py`, and mark each tool name as observed live or guessed.
2. WHEN a tool or command is not mapped, THE SYSTEM SHALL let it pass without writing state.

### Requirement 6: Off by default (SS-8)
1. THE committed `.kiro/hooks/safe-ship.json` SHALL have `enabled: false` on every hook.
2. WHEN the owner runs `python scripts/safe_ship.py enable`, THE SYSTEM SHALL write an untracked local copy `.kiro/hooks/safe-ship.local.json` with the hooks enabled, and `disable` SHALL remove it.
