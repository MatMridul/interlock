"""Scripted stand-in for the LLM. Not a test file (helper imported by test_strands_*.py).

A Step is one model reply: a list of tool calls [(name, input_dict), ...] sent in ONE
message (or no calls = a plain text answer). `before` runs just before that reply, to
simulate the human pressing Approve in the UI between two model turns. When the script
runs out the stub answers 'done' and stops. It ignores the prompt text on purpose: it
tests plumbing, not language understanding.
"""
import json
from dataclasses import dataclass, field
from typing import Callable, Optional

from strands.models import Model


@dataclass
class Step:
    calls: list = field(default_factory=list)
    before: Optional[Callable] = None


def tool_results(agent):
    """All tool results the model received: [(status, text), ...] in order."""
    out = []
    for m in agent.messages:
        for b in m["content"]:
            if "toolResult" in b:
                r = b["toolResult"]
                out.append((r["status"], " ".join(c.get("text", "") for c in r["content"])))
    return out


class ScriptedModel(Model):
    def __init__(self, steps):
        self.steps = list(steps)
        self.i = 0
        self.seen = 0

    def update_config(self, **kw):
        pass

    def get_config(self):
        return {"model_id": "scripted-stub"}

    async def structured_output(self, output_model, prompt, system_prompt=None, **kw):
        raise NotImplementedError
        yield  # pragma: no cover

    async def stream(self, messages, tool_specs=None, system_prompt=None, **kw):
        self.seen += 1
        step = self.steps[self.i] if self.i < len(self.steps) else None
        self.i += 1
        if step is not None and step.before:
            step.before()
        yield {"messageStart": {"role": "assistant"}}
        if step is None or not step.calls:
            yield {"contentBlockStart": {"start": {}}}
            yield {"contentBlockDelta": {"delta": {"text": "done"}}}
            yield {"contentBlockStop": {}}
            stop = "end_turn"
        else:
            for n, (name, args) in enumerate(step.calls):
                yield {"contentBlockStart": {"start": {"toolUse": {
                    "toolUseId": f"tu{self.i}_{n}", "name": name}}}}
                yield {"contentBlockDelta": {"delta": {"toolUse": {"input": json.dumps(args)}}}}
                yield {"contentBlockStop": {}}
            stop = "tool_use"
        yield {"messageStop": {"stopReason": stop}}
        yield {"metadata": {"usage": {"inputTokens": 0, "outputTokens": 0, "totalTokens": 0},
                            "metrics": {"latencyMs": 0}}}
