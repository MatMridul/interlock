"""FastAPI app. Local run (127.0.0.1 only): see docs/reports/BACKEND_REPORT.md."""
import hmac
import json
import logging
import os
import time
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from server import config, judge as judgemod, manual, modelcap, policies, race
from server.limits import Limiter
from server.persist import StoredRegistry
from server.session import Registry, stream_events
from server.store import Busy, MemoryStore, make_store


class ChatBody(BaseModel):  # extra fields (e.g. a 'source') are ignored by pydantic
    message: str = Field(min_length=1, max_length=config.MAX_MESSAGE_CHARS)


class MfaBody(BaseModel):
    code: str = Field(max_length=64)


ROOT = Path(__file__).resolve().parent.parent
POLICY_PATH = ROOT / "policy" / "finance_table.json"
UI_DIST = ROOT / "ui" / "dist"
DEV_UI_ORIGIN = "http://localhost:5173"  # Vite dev server
log = logging.getLogger("server")


def default_model_factory():
    if not manual.model_enabled():  # INTERLOCK_MODEL=off: no model, no Bedrock; sessions are driven by hand
        return None
    if os.environ.get("STUB") == "1":  # explicit opt-in only; any other value means off
        log.warning("STUB=1: using the canned dev model, NOT Bedrock. Never use this outside local UI testing.")
        from server.stub_model import StubModel
        return StubModel()
    from agent.bedrock import make_bedrock_model  # lazy: tests never touch Bedrock
    return make_bedrock_model()


_client = config.client_ip  # socket address, or the caller behind a Lambda Function URL


def _too_many(seconds):
    return JSONResponse({"detail": "too many requests"}, status_code=429, headers={"Retry-After": str(seconds)})


def create_app(model_factory=default_model_factory, max_sessions=config.MAX_SESSIONS, limiter=None, store=None, cap=None, judge=None):
    config.announce_mfa_code()
    limiter = limiter or Limiter()
    if store is None and os.environ.get("INTERLOCK_STORE", "memory").strip().lower() != "memory":
        store = make_store()  # shared store (DynamoDB); by default the in-memory Registry runs unchanged
    app = FastAPI(title="Kiroween gate backend")
    registry = StoredRegistry(model_factory, store, max_sessions) if store else Registry(model_factory, max_sessions)
    default_factory = model_factory is default_model_factory  # real Bedrock, or STUB=1 locally: both are locked and capped
    chat_off = default_factory and os.environ.get("STUB") != "1" and modelcap.model_mode() == "off"  # INTERLOCK_MODEL=off: no model call can happen
    shared = store or MemoryStore()  # caps and wrong-code counts; held in memory only when there is no store (local)
    if cap is None and default_factory and not chat_off:
        cap = modelcap.ModelCap(shared)
    if judge is None and default_factory:
        judge = judgemod.Judge(shared)
    if cap:
        registry.on_new = cap.attach
    app.state.registry = registry
    app.add_middleware(CORSMiddleware, allow_origins=[config.cors_origin(), DEV_UI_ORIGIN],
                       allow_methods=["GET", "POST"], allow_headers=["Content-Type", "X-Judge-Code"])

    @app.exception_handler(RequestValidationError)
    async def _invalid(request: Request, exc):  # generic: never echo submitted values
        return JSONResponse({"detail": "invalid request"}, status_code=422)

    @app.exception_handler(Busy)
    async def _busy(request: Request, exc):
        return JSONResponse({"detail": "session busy"}, status_code=409)

    @app.exception_handler(Exception)
    async def _boom(request: Request, exc):
        return JSONResponse({"detail": "internal error"}, status_code=500)

    def _missing():
        return JSONResponse({"detail": "unknown session"}, status_code=404)

    def _locked(request, client):
        """The judge-code lock on real-model features. None when open (or no lock is configured)."""
        if judge is None:
            return None
        try:
            judge.check_request(request, client)
        except judgemod.Denied as d:
            return JSONResponse({"detail": d.message}, status_code=d.status,
                                headers={"Retry-After": str(d.retry_after)} if d.retry_after else None)
        return None

    @app.post("/judge/unlock")
    def unlock(request: Request):  # checks the X-Judge-Code header; wrong codes count toward the lockout
        return _locked(request, _client(request)) or {"ok": True}

    @app.get("/policy")
    def policy():  # the machine the gate was generated from; the UI draws it, never hand-copies it
        return json.loads(POLICY_PATH.read_text(encoding="utf-8"))

    @app.post("/session")
    def new_session(request: Request):
        wait = limiter.rate_limited("session", _client(request))
        if wait:
            return _too_many(wait)
        return {"session_id": registry.create().id}

    @app.post("/session/{sid}/chat")
    def chat(sid: str, body: ChatBody, request: Request):
        wait = limiter.rate_limited("chat", _client(request))
        if wait:
            return _too_many(wait)
        if chat_off:
            return JSONResponse({"detail": modelcap.OFF_MESSAGE}, status_code=403)
        client = _client(request)
        denied = _locked(request, client)
        if denied:
            return denied
        blocked = cap.blocked(client, sid) if cap else None
        if blocked:
            return JSONResponse({"detail": blocked}, status_code=429)
        s = registry.get(sid)
        if s is None:
            return _missing()
        if s.agent is None:
            return JSONResponse({"detail": "model is off on this server"}, status_code=403)
        if not s.lock.acquire(blocking=False):
            return JSONResponse({"detail": "session busy"}, status_code=409)
        s.client = client  # the per-address model cap counts against it
        return StreamingResponse(stream_events(s, body.message), media_type="text/event-stream",
                                 headers={"Cache-Control": "no-cache"})

    @app.get("/session/{sid}/state")
    def state(sid: str):
        s = registry.get(sid)
        return _missing() if s is None else s.state_view()

    @app.post("/session/{sid}/mfa")
    def mfa(sid: str, body: MfaBody, request: Request):
        client = _client(request)
        wait = limiter.rate_limited("mfa", client)
        if wait:
            return _too_many(wait)
        s = registry.get(sid)
        if s is None:
            return _missing()
        registry.load_limits(s, limiter)
        wait = limiter.mfa_locked(sid, client)  # checked before the code: a right guess during lockout fails too
        if wait:
            return _too_many(wait)
        mkey = f"mfawrong#{int(time.time() // config.MFA_CLIENT_WINDOW_S)}#{client}"  # shared across instances
        if shared.count(mkey) >= config.MFA_CLIENT_MAX_WRONG:
            return _too_many(int(config.MFA_CLIENT_WINDOW_S - time.time() % config.MFA_CLIENT_WINDOW_S) + 1)
        if not hmac.compare_digest(body.code.encode(), config.demo_mfa_code().encode()):
            shared.incr_if_below(mkey, 10**9, 2 * config.MFA_CLIENT_WINDOW_S)
            registry.mutate(s, lambda: limiter.mfa_failed(sid, client), limiter)
            return JSONResponse({"detail": "wrong code"}, status_code=403)
        # source='human' is set here, by server code only. No request field reaches it.
        r = registry.mutate(s, lambda: (limiter.mfa_succeeded(sid), s.gate.run("MFA", {}, source="human"))[1], limiter)
        out = {"verdict": r["verdict"], "state": r["state"]}
        if "reason" in r:
            out["reason"] = r["reason"]
        return out

    policies.add_routes(app)  # C7: read-only /policies/{name} for the UI policy picker
    manual.add_routes(app, registry, limiter, judge_required=judge is not None)  # C1: /config and /session/{sid}/propose
    race.add_routes(app, model_factory, limiter, cap, locked=_locked, store=shared)  # C2: /race/replay, /race/live (own arms, no registry session)

    if UI_DIST.is_dir():  # same-origin static UI; registered last so API routes win
        app.mount("/", StaticFiles(directory=str(UI_DIST), html=True), name="ui")
    return app


app = create_app()
