"""StoredRegistry: sessions whose gate state lives in a store (server/store.py), so any Lambda
instance can serve any request. Used only when a store is configured; otherwise the plain
in-memory Registry runs unchanged.

shortcut: the Strands agent's chat history stays in the instance that served the turn (the gate
state, guard counters, MFA lockout and executed log are the shared, authoritative part). A turn
that lands on a cold instance starts with an empty chat history. Upgrade by storing messages too.
"""
import logging
import threading
import time
import uuid
from collections import OrderedDict

from server import config
from server.session import Session
from server.store import Busy, Conflict, begin_turn, end_turn, restore_gate, snapshot_gate

log = logging.getLogger("server")
RETRIES = 5


def key(sid):
    return "s#" + sid


class StoredLock:
    """Stands in for Session.lock: a local lock plus the store lease, so a chat turn is exclusive
    across instances. acquire(blocking=False) is the only form the app uses."""

    def __init__(self, reg, session):
        self._l, self._reg, self._s = threading.Lock(), reg, session

    def locked(self):
        return self._l.locked()

    def acquire(self, blocking=True):
        if not self._l.acquire(blocking):
            return False
        try:
            it = begin_turn(self._reg.store, key(self._s.id), now=self._reg.now)
        except (Busy, Conflict, KeyError):
            self._l.release()
            return False
        restore_gate(self._s.gate, it.data["gate"])
        self._s.item = it
        return True

    def release(self):
        try:
            data = dict(self._s.item.data)
            data["gate"] = snapshot_gate(self._s.gate)
            end_turn(self._reg.store, key(self._s.id), self._s.item, data)
        except Conflict:
            log.warning("session %s lost its lease; turn result not stored", self._s.id)
        finally:
            self._l.release()


class StoredRegistry:
    def __init__(self, model_factory, store, max_sessions=config.MAX_SESSIONS, now=time.time):
        self._model_factory, self.store, self._max, self.now = model_factory, store, max_sessions, now
        self._lock = threading.Lock()
        self._s = OrderedDict()  # local cache of Session objects (agent + gate); the store is the truth
        self.on_new = None

    def _build(self, sid):
        s = Session(sid, self._model_factory())
        s.lock = StoredLock(self, s)
        s.item = None
        if self.on_new:
            self.on_new(s)
        return s

    def create(self):
        sid = uuid.uuid4().hex
        s = self._build(sid)
        self.store.put(key(sid), {"gate": snapshot_gate(s.gate), "mfa": {}})
        s.item = self.store.get(key(sid))
        with self._lock:
            self._s[sid] = s
            while len(self._s) > self._max:  # local cache only; the store keeps the session
                self._s.popitem(last=False)
        return s

    def get(self, sid):
        if not isinstance(sid, str) or not 0 < len(sid) <= 64:
            return None
        it = self.store.get(key(sid))
        with self._lock:
            s = self._s.get(sid)
            if it is None:
                self._s.pop(sid, None)
                return None
            if s is None:
                s = self._s[sid] = self._build(sid)
            self._s.move_to_end(sid)
        if not s.lock.locked():  # never overwrite a turn in progress here
            restore_gate(s.gate, it.data["gate"])
            s.item = it
        return s

    def load_limits(self, s, limiter):
        limiter.import_session(s.id, (s.item.data if s.item else {}).get("mfa"))

    def mutate(self, s, fn, limiter=None):
        """Run fn() against fresh stored state and write the result with a version check; on a
        lost race restore and run it again. Raises Busy while a chat turn holds the lease."""
        for _ in range(RETRIES):
            it = self.store.get(key(s.id))
            if it is None:
                raise KeyError(s.id)
            if it.lease_until > self.now():
                raise Busy(s.id)
            restore_gate(s.gate, it.data["gate"])
            if limiter:
                limiter.import_session(s.id, it.data.get("mfa"))
            out = fn()
            data = {"gate": snapshot_gate(s.gate),
                    "mfa": limiter.export_session(s.id) if limiter else it.data.get("mfa", {})}
            try:
                v = self.store.put(key(s.id), data, it.version)
            except Conflict:
                continue
            s.item = self.store.get(key(s.id))
            return out
        raise Busy(s.id)

    def __len__(self):
        return len(self._s)
