---
inclusion: always
---

# Product: The Chimeric Automaton

A Strands agent (Amazon Bedrock model) proposes tool calls for a finance transfer workflow. A Gate, backed by a state machine checked in JFLAP at build time, decides which calls run. The human supplies MFA through an HTTP endpoint; the model has no MFA tool. Hackathon: Kiroween 2026, Frankenstein category. Full spec: `SPEC_GATE_v2.md`.

## Honesty rules (SPEC_GATE_v2.md section 1)
Never write the left column in code, UI text, README, video or Devpost text. Use the right column.

| Avoid | Say instead |
| :-- | :-- |
| "0.2ms JFLAP proof latency", "zero hallucination", "mathematically proven safety" | "Every executed action sequence belongs to a declared regular language. The model is checked in JFLAP; the runtime executor is a generated table tested equal to it." Show only latencies our code measured, labelled with the engine. |
| "JFLAP intercepts every action at runtime" | JFLAP is build time. Runtime is a small Python executor generated from `jflap_export_table`. |
| "novel", "first" | Do not claim novelty. Related work exists (AgentSpec, Cedar-style policies, AgentCore policy features, a Strands steering plugin; names unverified). |

Also: say Nova 2 Lite was used for the recorded real run, not Claude. Say the Kiro agent (dev time) and the Strands agent (runtime) are different. Kiro's own property-based-testing feature was not used; our PBT is Hypothesis tests.

## Non-guarantees to keep visible
Model text is not checked. Arguments are checked only by the guard. A wrong policy is enforced faithfully. The UI shows the gate's executed log, not model claims.
