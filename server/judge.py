"""Judge access code: the lock on every feature that can call the real model.

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

HEADER = "x-judge-code"
MAX_WRONG = 5
WINDOW_S = 900
LOCKED = "The live model is locked. Use 'Unlock live model (judges)' with the access code, or stay in 'you' mode."
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

    def check(self, code, ip):
        """Raise Denied unless `code` is the judge code. A missing code is refused without counting."""
        expected = os.environ.get("JUDGE_ACCESS_CODE", "")
        if not expected or not code:
            raise Denied(403, LOCKED)
        wait = self._locked_for(ip)
        if wait:  # checked before the compare: a right guess during a lockout fails too
            raise Denied(429, f"Too many wrong codes from your address. Try again in {max(1, wait // 60)} min.", wait)
        if not hmac.compare_digest(_digest(code), _digest(expected)):
            self._store.incr_if_below(self._key(ip), 10**9, 2 * WINDOW_S)
            raise Denied(403, WRONG)

    def check_request(self, request, ip):
        self.check(request.headers.get(HEADER, ""), ip)
