"""In-memory abuse limits (E4): per-client request rate limits and MFA attempt lockouts.

shortcut: state lives in one process and the client key is the socket address, so it resets on
restart, is not shared between workers, and behind a reverse proxy every user shares one key.
Upgrade to a shared store and a trusted X-Forwarded-For when the app runs behind a proxy.
"""
import threading
import time
from collections import OrderedDict, deque

from server import config


class Limiter:
    def __init__(self, clock=time.monotonic, rate_session=None, rate_chat=None, rate_mfa=None,
                 mfa_max_wrong=None, mfa_lockout_s=None, client_max_wrong=None, client_window_s=None):
        self._now = clock
        self._lock = threading.Lock()
        self.rates = {"session": rate_session or config.RATE_SESSION,
                      "chat": rate_chat or config.RATE_CHAT,
                      "mfa": rate_mfa or config.RATE_MFA}
        self.max_wrong = mfa_max_wrong or config.MFA_MAX_WRONG
        self.lockout_s = mfa_lockout_s or config.MFA_LOCKOUT_S
        self.client_max_wrong = client_max_wrong or config.MFA_CLIENT_MAX_WRONG
        self.client_window_s = client_window_s or config.MFA_CLIENT_WINDOW_S
        self._hits = OrderedDict()      # (kind, client) -> deque of request times
        self._wrong = OrderedDict()     # session id -> count of wrong codes
        self._client_wrong = OrderedDict()  # client -> deque of wrong-code times
        self._locked_until = OrderedDict()  # ("s", sid) or ("c", client) -> time

    def _trim(self, d):
        while len(d) > config.LIMITER_MAX_KEYS:
            d.popitem(last=False)

    def rate_limited(self, kind, client):
        """Record one request; return seconds to wait (> 0) if the client is over its limit, else 0."""
        limit, window = self.rates[kind]
        now = self._now()
        with self._lock:
            q = self._hits.setdefault((kind, client), deque())
            while q and now - q[0] >= window:
                q.popleft()
            if len(q) >= limit:
                return max(1, int(window - (now - q[0])) + 1)
            q.append(now)
            self._trim(self._hits)
            return 0

    def mfa_locked(self, sid, client):
        """Seconds left if this session or this client is locked out of MFA attempts, else 0."""
        now = self._now()
        with self._lock:
            left = 0
            for key in (("s", sid), ("c", client)):
                until = self._locked_until.get(key)
                if until is not None:
                    if until > now:
                        left = max(left, int(until - now) + 1)
                    else:
                        del self._locked_until[key]
                        if key[0] == "s":
                            self._wrong.pop(sid, None)
            return left

    def mfa_failed(self, sid, client):
        """Record a wrong code. Locks the session after max_wrong, the client after client_max_wrong."""
        now = self._now()
        with self._lock:
            n = self._wrong.get(sid, 0) + 1
            self._wrong[sid] = n
            if n >= self.max_wrong:
                self._locked_until[("s", sid)] = now + self.lockout_s
            q = self._client_wrong.setdefault(client, deque())
            while q and now - q[0] >= self.client_window_s:
                q.popleft()
            q.append(now)
            if len(q) >= self.client_max_wrong:
                self._locked_until[("c", client)] = now + self.lockout_s
                q.clear()
            for d in (self._wrong, self._client_wrong, self._locked_until):
                self._trim(d)

    def mfa_succeeded(self, sid):
        with self._lock:
            self._wrong.pop(sid, None)
