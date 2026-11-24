"""Race mode (C2): GET /race/replay serves the recorded benchmark (no model call);
POST /race/live runs ONE corpus attack against both arms with the real model.

Isolation: bench.race.run_attack builds its own fresh Gate (arm B) and its own UngatedBank (arm A)
for every run. Neither is a registry session, so a live race can never read or change the state of
any /session/{sid} gate, and the unprotected arm only ever touches the in-memory stub bank (no money moves).
Live runs are allowed only when INTERLOCK_MODEL is on, take an attack id from the fixed corpus (no
free text), run one at a time, and spend from a per-process daily model-call budget.

The daily budget is the shared server.modelcap.ModelCap (one counter for chat and race, kept in the
store) when the app has one; otherwise a per-process DailyCap.
shortcut: the per-process fallback resets on restart and is not shared between workers; it is used
only without a store (local dev).
"""
import datetime
import json
import os
import threading

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from bench import race as bench
from server import config, manual, modelcap
from server.store import daily_key

DAILY_CALLS = 40  # model invocations per UTC day per process (override: RACE_DAILY_CALLS)
MIN_CALLS_TO_START = 6  # a two-arm run of one attack needs about this many
LATEST = bench.RESULTS / "latest.json"


def daily_limit():
    try:
        return max(0, int(os.environ.get("RACE_DAILY_CALLS", DAILY_CALLS)))
    except ValueError:
        return DAILY_CALLS


class DailyCap:
    def __init__(self, today=lambda: datetime.datetime.now(datetime.timezone.utc).date()):
        self._today, self._day, self.used = today, None, 0
        self._lock = threading.Lock()

    def _roll(self):
        d = self._today()
        if d != self._day:
            self._day, self.used = d, 0

    def remaining(self):
        with self._lock:
            self._roll()
            return max(0, daily_limit() - self.used)

    def take(self):
        with self._lock:
            self._roll()
            if self.used >= daily_limit():
                return False
            self.used += 1
            return True


class SharedCap:
    """Adapts modelcap.ModelCap to the take()/remaining() interface RaceMeter uses."""

    def __init__(self, shared, ip=None, public=False):
        self._shared, self._ip, self._public = shared, ip, public

    def remaining(self):
        return self._shared.remaining(self._public)

    def take(self):
        try:
            self._shared.take(ip=self._ip, public=self._public)
        except modelcap.CapReached:
            return False
        return True


class RaceMeter:
    """Same interface as bench.race.CallMeter, but spends from the daily cap and writes no file."""

    def __init__(self, cap, run_cap=bench.RUN_CALL_CAP):
        self.cap, self.run_cap, self.run_calls, self.label = cap, run_cap, 0, ""

    def start_run(self, label):
        self.run_calls, self.label = 0, label

    def hook(self, event):
        if self.run_calls >= self.run_cap:
            raise bench.BudgetExceeded(f"run cap {self.run_cap} reached")
        if not self.cap.take():
            raise bench.BudgetExceeded("daily cap reached")
        self.run_calls += 1


class LiveBody(BaseModel):
    attack_id: str = Field(min_length=1, max_length=32)


def _load_corpus():
    return json.loads(bench.CORPUS.read_text(encoding="utf-8"))


def add_routes(app: FastAPI, model_factory, limiter, shared_cap=None, locked=None, store=None, read_limited=lambda request: None):
    cap = SharedCap(shared_cap) if shared_cap else DailyCap()
    busy = threading.Lock()
    app.state.race_cap = cap

    @app.get("/race/replay")
    def replay(request: Request):
        limited = read_limited(request)
        if limited:
            return limited
        if not LATEST.exists():
            return JSONResponse({"detail": "no recorded run"}, status_code=404)
        return json.loads(LATEST.read_text(encoding="utf-8"))

    @app.post("/race/live")
    def live(body: LiveBody, request: Request):
        if not manual.model_enabled() or modelcap.model_mode() == "off":
            return JSONResponse({"detail": "model is off on this server"}, status_code=403)
        client = config.client_ip(request)
        wait = limiter.rate_limited("chat", client)  # before the judge check, which reads the store
        if wait:
            return JSONResponse({"detail": "too many requests"}, status_code=429, headers={"Retry-After": str(wait)})
        denied = locked(request, client, True) if locked else None
        if denied:
            return denied
        public = bool(getattr(request.state, "public", False))
        corpus = _load_corpus()
        attack = next((a for a in corpus["attacks"] if a["id"] == body.attack_id), None)
        if attack is None:
            return JSONResponse({"detail": "unknown attack"}, status_code=404)
        if (SharedCap(shared_cap, client, public) if shared_cap else cap).remaining() < MIN_CALLS_TO_START:
            return JSONResponse({"detail": "daily race budget used up, try the recorded run"}, status_code=429)
        if not busy.acquire(blocking=False):
            return JSONResponse({"detail": "a race is already running"}, status_code=409)
        try:
            n = modelcap.race_runs_cap()
            if store is not None and not store.incr_if_below(daily_key(f"racerun#{client}"), n):
                return JSONResponse({"detail": f"Live race limit reached: {n} live runs per address per UTC day. "
                                               "It resets at 00:00 UTC. The recorded replay is still open."},
                                    status_code=429)
            run_cap = SharedCap(shared_cap, client, public) if shared_cap else cap
            model = model_factory()
            if model is None:
                return JSONResponse({"detail": "model is off on this server"}, status_code=403)
            model_id = (model.get_config() or {}).get("model_id", "unknown")
            meter = RaceMeter(run_cap)
            runs = [bench.run_attack(attack, arm, model, meter) for arm in bench.ARMS]
        finally:
            busy.release()
        keep = ("attack_id", "category", "arm", "events", "executed_log", "violation", "rules_fired",
                "model_calls", "error", "assistant_text")
        return {"label": f"live run, {datetime.date.today().isoformat()}, model {model_id}",
                "model": model_id, "attack": attack,
                "runs": [{k: r[k] for k in keep} for r in runs], "calls_left": cap.remaining()}
