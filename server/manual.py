"""'You are the agent' mode (C1): a visitor proposes actions by hand, with no model.

POST /session/{sid}/propose runs each action through the SAME gate.run() the agent's tools use,
and streams the same SSE events (tool_proposed, gate_verdict, state_change, done). The request
has no source field: the gate always sees source='llm', so this endpoint can never produce the
human MFA step. The human key stays POST /session/{sid}/mfa. GET /config tells the UI whether
the model is on (INTERLOCK_MODEL=off turns it off and makes 'you' mode the default).
"""
import json
import os
from typing import Literal, Optional

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse, StreamingResponse
from pydantic import BaseModel, Field

from bank.gate import TOOL_TO_SYMBOL

MAX_ACTIONS = 8  # one request may carry a short scripted sequence (attack vectors), no more


def model_enabled():
    return os.environ.get("INTERLOCK_MODEL", "on").strip().lower() != "off"


class Action(BaseModel):
    # the five agent tools, plus 'mfa_tool': an attempt to call the human-only step as the agent,
    # which the gate refuses. Any other name is a 422.
    tool: Literal["authenticate_user", "create_transfer_draft", "edit_transfer_draft",
                  "execute_transfer", "cancel_transfer_draft", "mfa_tool"]
    payee: Optional[str] = Field(default=None, max_length=64)
    amount: Optional[float] = None


class ProposeBody(BaseModel):  # extra fields (such as 'source') are ignored by pydantic
    actions: list[Action] = Field(min_length=1, max_length=MAX_ACTIONS)


def _frame(name, data):
    return f"event: {name}\ndata: {json.dumps(data, default=str)}\n\n"


def run_actions(session, actions):
    """Caller holds session.lock; this releases it. Runs in the request thread (no model, nothing to wait for)."""
    events = []
    gate = session.gate
    gate.sink = lambda name, data: events.append((name, data))
    try:
        for a in actions:
            symbol = TOOL_TO_SYMBOL.get(a.tool, "MFA")
            args = {k: v for k, v in (("payee", a.payee), ("amount", a.amount)) if v is not None}
            events.append(("tool_proposed", {"name": a.tool, "args": args}))
            gate.run(symbol, args, source="llm")  # emits gate_verdict and state_change through the sink
        events.append(("done", {"state": gate.state}))
    finally:
        gate.sink = None
        session.lock.release()
    return [_frame(name, data) for name, data in events]

def add_routes(app: FastAPI, registry, limiter):
    @app.get("/config")
    def get_config():
        return {"model": "on" if model_enabled() else "off"}

    @app.post("/session/{sid}/propose")
    def propose(sid: str, body: ProposeBody, request: Request):
        client = request.client.host if request.client else "unknown"
        wait = limiter.rate_limited("chat", client)
        if wait:
            return JSONResponse({"detail": "too many requests"}, status_code=429, headers={"Retry-After": str(wait)})
        s = registry.get(sid)
        if s is None:
            return JSONResponse({"detail": "unknown session"}, status_code=404)
        if not s.lock.acquire(blocking=False):
            return JSONResponse({"detail": "session busy"}, status_code=409)
        return StreamingResponse(iter(run_actions(s, body.actions)), media_type="text/event-stream",
                                 headers={"Cache-Control": "no-cache"})
