"""Model mode and the caps on real-model (Bedrock) calls, sized for a handful of judges.

INTERLOCK_MODEL: "off" (no model call can happen) or "bedrock". Unset means "off" in production
and "bedrock" otherwise (local dev).

Every cap is a counter in the store (DynamoDB in production, memory locally), incremented atomically
before each model call, so concurrent instances cannot overshoot. Env vars (defaults):
  INTERLOCK_DAILY_MODEL_CAP 100    all visitors, per UTC day
  INTERLOCK_MONTHLY_MODEL_CAP 1500 all visitors, per UTC calendar month
  INTERLOCK_IP_DAILY_MODEL_CAP 40  per client address, per UTC day
  INTERLOCK_SESSION_MODEL_CAP 25   per chat session
  INTERLOCK_PUBLIC_DAILY_MODEL_CAP 60  calls from visitors WITHOUT a judge code, per UTC day (0 = public access off)
  INTERLOCK_TURN_MODEL_CALLS 4     per chat turn
  RACE_IP_DAILY_RUNS 5             live race runs per client address, per UTC day
A call is checked against session, address, [public pool, only without a valid judge code], day, month in that order.
A valid judge code skips the public pool, so judges keep the rest of the day cap when strangers use up the public pool. The counters are separate
items, not one transaction, so a call refused by a later cap has already used one unit of the
earlier ones (a slight over-count, never an under-count).
"""
import os

from strands.hooks import BeforeModelCallEvent

from server import config
from server.store import daily_key, month_key

DEFAULT_CAP = 100
DEFAULT_MONTHLY = 1500
DEFAULT_IP_DAILY = 40
DEFAULT_SESSION = 25
DEFAULT_TURN = 4
DEFAULT_PUBLIC = 60
DEFAULT_RACE_RUNS = 5
CAP_MESSAGE = "The daily limit of real-model calls is used up. Try again after 00:00 UTC."
OFF_MESSAGE = "Real-model chat is switched off on this deployment."
MONTH_TTL_S = 35 * 86400


class CapReached(Exception):
    def __init__(self, message, kind="day"):
        super().__init__(message)
        self.kind = kind


def _int(name, default):
    try:
        return max(0, int(os.environ.get(name, default)))
    except ValueError:
        return default


def model_mode():
    m = os.environ.get("INTERLOCK_MODEL", "").strip().lower()
    return m or ("off" if config.is_production() else "bedrock")


def daily_cap():
    return _int("INTERLOCK_DAILY_MODEL_CAP", DEFAULT_CAP)


def turn_calls():
    return _int("INTERLOCK_TURN_MODEL_CALLS", DEFAULT_TURN)


def public_cap():
    return _int("INTERLOCK_PUBLIC_DAILY_MODEL_CAP", DEFAULT_PUBLIC)


def race_runs_cap():
    return _int("RACE_IP_DAILY_RUNS", DEFAULT_RACE_RUNS)


def messages(day, month, ip, session, turn, public=0):
    return {
        "day": f"The daily limit of real-model calls is used up ({day} per UTC day, all visitors). It resets at 00:00 UTC. Use 'you' mode meanwhile.",
        "month": f"The monthly limit of real-model calls is used up ({month} per UTC month, all visitors). It resets on the 1st at 00:00 UTC. Use 'you' mode.",
        "ip": f"Your address has used its {ip} real-model calls for today. It resets at 00:00 UTC. Use 'you' mode meanwhile.",
        "session": f"This session has used its {session} real-model calls. Reset the session to get a fresh allowance, or use 'you' mode.",
        "public": f"The public live-model allowance for today ({public} calls) is used up. It resets at 00:00 UTC. Judges can still unlock the live model with their access code; otherwise use 'you' mode.",
        "turn": f"A chat turn may make at most {turn} model calls; this one was stopped. Send a new message to continue.",
    }


class ModelCap:
    def __init__(self, store, limit=None, now=None, monthly=None, per_ip=None, per_session=None, per_turn=None, public=None):
        self._store = store
        self.limit = daily_cap() if limit is None else limit
        self.monthly = _int("INTERLOCK_MONTHLY_MODEL_CAP", DEFAULT_MONTHLY) if monthly is None else monthly
        self.per_ip = _int("INTERLOCK_IP_DAILY_MODEL_CAP", DEFAULT_IP_DAILY) if per_ip is None else per_ip
        self.per_session = _int("INTERLOCK_SESSION_MODEL_CAP", DEFAULT_SESSION) if per_session is None else per_session
        self.per_turn = turn_calls() if per_turn is None else per_turn
        self.public = public_cap() if public is None else public
        self._key = (lambda: daily_key()) if now is None else (lambda: daily_key(now=now))
        self._mkey = (lambda: month_key()) if now is None else (lambda: month_key(now=now))
        self.msg = messages(self.limit, self.monthly, self.per_ip, self.per_session, self.per_turn, self.public)

    def _checks(self, ip, sid, public=False):
        """(kind, key, limit, ttl) in the order a call is checked."""
        day = self._key()
        out = []
        if sid:
            out.append(("session", f"capsess#{sid}", self.per_session, 2 * 86400))
        if ip:
            out.append(("ip", f"capip#{day}#{ip}", self.per_ip, 2 * 86400))
        if public:  # a visitor without a judge code: the shared public pool, which judges never touch
            out.append(("public", f"cappub#{day}", self.public, 2 * 86400))
        out.append(("day", day, self.limit, 2 * 86400))
        out.append(("month", self._mkey(), self.monthly, MONTH_TTL_S))
        return out

    def take(self, ip=None, sid=None, public=False):
        for kind, key, limit, ttl in self._checks(ip, sid, public):
            if not self._store.incr_if_below(key, limit, ttl):
                raise CapReached(self.msg[kind], kind)

    def blocked(self, ip=None, sid=None, public=False):
        """Message of the first cap already used up, or None. Reads only; nothing is consumed."""
        for kind, key, limit, _ in self._checks(ip, sid, public):
            if self._store.count(key) >= limit:
                return self.msg[kind]
        return None

    def exhausted(self):
        return self.blocked() is not None

    def remaining(self, public=False):
        left = min(self.limit - self._store.count(self._key()), self.monthly - self._store.count(self._mkey()))
        if public:
            left = min(left, self.public - self._store.count(f"cappub#{self._key()}"))
        return max(0, left)

    def attach(self, session):
        """Before each model call: stop the turn after per_turn calls, then spend from the caps."""
        def hook(event: BeforeModelCallEvent) -> None:
            if model_mode() == "off":  # the kill switch was thrown while this turn was running
                raise CapReached(OFF_MESSAGE, "off")
            session.turn_calls = getattr(session, "turn_calls", 0) + 1
            if session.turn_calls > self.per_turn:
                raise CapReached(self.msg["turn"], "turn")
            self.take(getattr(session, "client", None), session.id, getattr(session, "public", False))
        session.agent.add_hook(hook, BeforeModelCallEvent)
