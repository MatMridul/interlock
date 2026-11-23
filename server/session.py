"""Per-session state: an ObservedGate (a Gate that reports events and measures latency),
its Strands agent, a lock, and the registry that holds at most MAX_SESSIONS of them."""
import json
import queue
import threading
import time
import uuid
from collections import OrderedDict

from strands.hooks import BeforeModelCallEvent, BeforeToolCallEvent

from agent.factory import build_agent
from bank.gate import Gate
from server import config
from server.explain import explain


def verdict_event(r, layer, latency_ms, actor="llm"):
    """SSE payload for one decision. latency_ms/engine appear only when a measurement exists (INV-10)."""
    ev = {k: r[k] for k in ("verdict", "state", "symbol", "expected_symbols", "reason") if k in r}
    ev["source"] = layer
    ev["actor"] = actor
    if latency_ms is not None:
        ev["latency_ms"] = round(latency_ms, 4)
        ev["engine"] = config.ENGINE
    return ev


class ObservedGate(Gate):
    """Gate plus (a) INV-10 latency measurement with time.perf_counter() and (b) an optional
    event sink. Verdicts come from Gate unchanged; this class only watches them."""

    def __init__(self, *a, **kw):
        super().__init__(*a, **kw)
        self.sink = None  # callable(name, data) or None
        self.explains, self.rejected, self.stop = [], {}, False  # per chat turn, see begin_turn
        self._tl = threading.local()

    def emit(self, name, data):
        sink = self.sink
        if sink:
            sink(name, data)

    def begin_turn(self):
        self.explains, self.rejected, self.stop = [], {}, False

    def note_explain(self, info):
        """Remember the server-built 'gate says' line for a rejection; a second REJECT of the same symbol stops the turn."""
        if self.sink is None:  # only during a chat turn
            return
        line = explain(info)
        if line and line not in self.explains:
            self.explains.append(line)
        sym = info.get("symbol") if isinstance(info, dict) else None
        self.rejected[sym] = self.rejected.get(sym, 0) + 1
        if self.rejected[sym] >= 2:
            self.stop = True

    def last_peek_ms(self):
        return getattr(self._tl, "peek_ms", None)

    def peek(self, symbol, source="llm", args=None):
        t0 = time.perf_counter()
        out = super().peek(symbol, source, args)
        self._tl.peek_ms = (time.perf_counter() - t0) * 1000
        return out

    def run(self, symbol, args=None, source="llm"):
        before = self.state
        t0 = time.perf_counter()
        r = super().run(symbol, args, source)
        ms = (time.perf_counter() - t0) * 1000
        self.emit("gate_verdict", verdict_event(r, "gate", ms, source))
        if r["verdict"] == "REJECT" and source == "llm":
            self.note_explain(r)
        if self.state != before:
            self.emit("state_change", {"from": before, "to": self.state})
        return r


def _observer_hook(gate):
    """Registered AFTER the checker hook, so cancel_tool is already set when this runs."""
    def hook(event: BeforeToolCallEvent) -> None:
        gate.emit("tool_proposed", {"name": event.tool_use.get("name"), "args": event.tool_use.get("input")})
        if event.cancel_tool:
            text = event.cancel_tool if isinstance(event.cancel_tool, str) else "REJECT: {}"
            try:
                info = json.loads(text.split("REJECT: ", 1)[1])
            except Exception:
                info = {"verdict": "REJECT", "reason": "rejected by hook"}
            gate.emit("gate_verdict", verdict_event(info, "hook", gate.last_peek_ms()))
            gate.note_explain(info)
    return hook


class TurnStopped(Exception):
    """Raised before a model call when the same symbol was rejected twice in this turn."""


def _stop_hook(gate):
    """The same symbol rejected twice in one turn: no further model call. This only shortens the existing
    per-turn call allowance (modelcap); it is not a new budget."""
    def hook(event: BeforeModelCallEvent) -> None:
        if gate.stop:
            raise TurnStopped("same symbol rejected twice in one turn")
    return hook


def _is_stop(e):
    while e is not None:
        if isinstance(e, TurnStopped):
            return True
        e = e.__cause__ or e.__context__
    return False


def _cap_message(e):
    """The daily model-call cap raises CapReached inside the agent loop, which wraps it; find it."""
    while e is not None:
        if type(e).__name__ == "CapReached":
            return str(e)
        e = e.__cause__ or e.__context__
    return None


class Session:
    def __init__(self, sid, model, guard=True):
        self.id = sid
        self.gate = ObservedGate(guard=guard)
        self.agent = build_agent(self.gate, model, history=config.history_messages()) if model is not None else None  # None: model off, driven by hand
        if self.agent is not None:
            self.agent.add_hook(_observer_hook(self.gate), BeforeToolCallEvent)
            self.agent.add_hook(_stop_hook(self.gate), BeforeModelCallEvent)  # added before the cap hook: a stopped call spends nothing
        self.lock = threading.Lock()  # one chat turn at a time

    def run_chat(self, message, emit):
        """Runs one agent turn in the calling thread, emitting events through `emit`."""
        self.gate.sink = emit
        self.turn_calls = 0  # the per-turn model-call cap counts from here
        self.gate.begin_turn()
        try:
            emit("user_message", {"text": message})
            try:
                result = self.agent(message)
                emit("assistant_text", {"text": str(result).strip()})
            except Exception as e:  # no stack trace leaves the server
                if not (self.gate.stop and _is_stop(e)):  # an early stop is not an error: the gate line below is the last word
                    emit("error", {"message": _cap_message(e) or f"agent error ({type(e).__name__})"})
            for line in self.gate.explains:  # built from the rejection fields only, after the model text, labelled gate
                emit("gate_explain", {"text": line})
            emit("done", {"state": self.gate.state})
        finally:
            self.gate.sink = None

    def state_view(self):
        return {"id": self.id, "state": self.gate.state,
                "executed_log": [dict(e) for e in self.gate.effects()],
                "counters": self.gate.guard_state()}


class Registry:
    def __init__(self, model_factory, max_sessions=config.MAX_SESSIONS):
        self._model_factory = model_factory
        self._max = max_sessions
        self._lock = threading.Lock()
        self._s = OrderedDict()
        self.on_new = None  # optional callback(session), e.g. to attach the model-call cap

    def create(self):
        sid = uuid.uuid4().hex
        s = Session(sid, self._model_factory())
        if self.on_new:
            self.on_new(s)
        with self._lock:
            self._s[sid] = s
            while len(self._s) > self._max:
                self._s.popitem(last=False)  # evict the oldest
        return s

    def get(self, sid):
        with self._lock:
            return self._s.get(sid)

    def load_limits(self, s, limiter):  # no-op here; StoredRegistry shares lockout state across instances
        pass

    def mutate(self, s, fn, limiter=None):
        return fn()

    def __len__(self):
        return len(self._s)


def stream_events(session, message):
    """Generator of SSE frames. The agent runs in a worker thread; this drains its queue.
    The caller must already hold session.lock; the worker releases it."""
    q = queue.Queue()

    def emit(name, data):
        q.put((name, data))

    def worker():
        try:
            session.run_chat(message, emit)
        finally:
            q.put(None)
            session.lock.release()

    threading.Thread(target=worker, daemon=True).start()
    while True:
        item = q.get()
        if item is None:
            return
        name, data = item
        yield f"event: {name}\ndata: {json.dumps(data, default=str)}\n\n"
