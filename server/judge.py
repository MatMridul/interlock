"""Judge access code: the lock on every feature that can call the real model, and the public door beside it.

A request WITHOUT a code is "public": allowed while INTERLOCK_PUBLIC_DAILY_MODEL_CAP is above 0, and it
counts against the public daily pool (server/modelcap.py). A request with the right code is "judge": it
skips that pool. A WRONG code is always refused and counted; it never falls back to public.

The code is the env var JUDGE_ACCESS_CODE. With it unset or empty the lock never opens (fail closed).
The browser sends the code in the X-Judge-Code header on model requests; it is compared in constant
time, never stored by the server, never echoed, never logged. Wrong codes are counted per client
address in the shared store: JUDGE_MAX_WRONG (5) wrong codes inside one JUDGE_WINDOW_S (900 s) window
lock that address out for the rest of the window, so a lockout lasts at most 15 minutes.
shortcut: a fixed window, not a sliding one; a guesser can fit 5 wrong codes at the end of one window
and 5 at the start of the next. That is 10 guesses in a few seconds, still hopeless against a long code.
"""
import hashlib
import hmac
import os
import time

from server import modelcap

HEADER = "x-judge-code"
MAX_WRONG = 5
WINDOW_S = 900
LOCKED = "The live model is locked. Use 'Judge code' with the access code, or stay in 'you' mode."
WRONG = "That judge access code is not right."


class Denied(Exception):
    def __init__(self, status, message, retry_after=None):
        super().__init__(message)
        self.status, self.message, self.retry_after = status, message, retry_after


def _digest(s):
    return hashlib.sha256(s.encode("utf-8")).digest()


class Judge:
    def __init__(self, store, now=time.time):
        self._store, self._now = store, now

    def _bucket(self):
        return int(self._now() // WINDOW_S)

    def _key(self, ip):
        return f"jwrong#{self._bucket()}#{ip}"

    def _locked_for(self, ip):
        if self._store.count(self._key(ip)) >= MAX_WRONG:
            return int(WINDOW_S - self._now() % WINDOW_S) + 1
        return 0

    def check(self, code, ip, allow_public=False):
        """Return "judge" for the right code, or "public" for no code when allow_public and the public pool is on.
        Raise Denied otherwise. A missing code is refused without counting; a wrong code is refused and counted."""
        expected = os.environ.get("JUDGE_ACCESS_CODE", "")
        if not code:
            if allow_public and modelcap.public_cap() > 0:
                return "public"
            raise Denied(403, LOCKED)
        if not expected:
            raise Denied(403, LOCKED)
        wait = self._locked_for(ip)
        if wait:  # checked before the compare: a right guess during a lockout fails too
            raise Denied(429, f"Too many wrong codes from your address. Try again in {max(1, wait // 60)} min.", wait)
        if not hmac.compare_digest(_digest(code), _digest(expected)):
            self._store.incr_if_below(self._key(ip), 10**9, 2 * WINDOW_S)
            raise Denied(403, WRONG)
        return "judge"

    def check_request(self, request, ip, allow_public=False):
        return self.check(request.headers.get(HEADER, ""), ip, allow_public)
