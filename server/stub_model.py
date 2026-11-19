"""Dev-only canned model for exercising the UI without Bedrock. Enabled ONLY by the env var
STUB=1 (see server/app.py). It ignores the prompt except for one keyword and never calls a network.

Per user message: if the text contains "log in" or "login" it proposes AUTH; otherwise it
proposes DRAFT then TRANSFER in one reply (so from START both are rejected by the gate).
After tool results come back it answers with a fixed sentence and ends the turn.
"""
import json
import re

from strands.models import Model

_PAYEES = ("alice", "bob", "carol", "electric co")


def _draft_args(text, default_amount=100.0):
    """Payee and amount read from the user text (stub only); defaults Bob / 100."""
    payee = next((p.title() if p != "electric co" else "Electric Co" for p in _PAYEES if p in text), "Bob")
    m = re.search(r"(\d+(?:\.\d+)?)", text)
    return {"payee": payee, "amount": float(m.group(1)) if m else default_amount}


def stub_calls(text):
    """Canned proposals per message keyword (dev/demo only). Rules are checked in order:
    login -> AUTH; "mfa tool"/"human-only" -> a tool that does not exist (the model has no MFA tool);
    "execute"/"already approved"/"ignore your previous"/"again" -> TRANSFER alone;
    "draft ..." -> one DRAFT with the payee and amount from the text; "edit ..." -> one EDIT;
    "cancel" -> CANCEL; anything else -> DRAFT then TRANSFER (the original behaviour)."""
    if re.search(r"log\s*(me\s*)?in", text):
        return [("authenticate_user", {})]
    if "mfa tool" in text or "human-only" in text:
        return [("approve_mfa", {})]
    if any(k in text for k in ("execute", "already approved", "pre-approved", "ignore your previous", "again")):
        return [("execute_transfer", {})]
    if text.startswith("draft") or "draft a transfer" in text:
        return [("create_transfer_draft", _draft_args(text))]
    if text.startswith("edit"):
        return [("edit_transfer_draft", _draft_args(text))]
    if "cancel" in text:
        return [("cancel_transfer_draft", {})]
    return [("create_transfer_draft", _draft_args(text)), ("execute_transfer", {})]


def _last_user_text(messages):
    for m in reversed(messages):
        if m.get("role") == "user":
            return " ".join(b.get("text", "") for b in m["content"] if "text" in b).lower()
    return ""


def _has_tool_result(messages):
    last = messages[-1] if messages else {}
    return any("toolResult" in b for b in last.get("content", []))


class StubModel(Model):
    def __init__(self):
        self.n = 0

    def update_config(self, **kw):
        pass

    def get_config(self):
        return {"model_id": "dev-stub"}

    async def structured_output(self, output_model, prompt, system_prompt=None, **kw):
        raise NotImplementedError
        yield  # pragma: no cover

    async def stream(self, messages, tool_specs=None, system_prompt=None, **kw):
        self.n += 1
        yield {"messageStart": {"role": "assistant"}}
        if _has_tool_result(messages):
            calls = []
        else:
            calls = stub_calls(_last_user_text(messages))
        if not calls:
            yield {"contentBlockStart": {"start": {}}}
            yield {"contentBlockDelta": {"delta": {"text": "[stub model] I tried the steps; see the gate verdicts."}}}
            yield {"contentBlockStop": {}}
            stop = "end_turn"
        else:
            for k, (name, args) in enumerate(calls):
                yield {"contentBlockStart": {"start": {"toolUse": {"toolUseId": f"stub{self.n}_{k}", "name": name}}}}
                yield {"contentBlockDelta": {"delta": {"toolUse": {"input": json.dumps(args)}}}}
                yield {"contentBlockStop": {}}
            stop = "tool_use"
        yield {"messageStop": {"stopReason": stop}}
        yield {"metadata": {"usage": {"inputTokens": 0, "outputTokens": 0, "totalTokens": 0},
                            "metrics": {"latencyMs": 0}}}


