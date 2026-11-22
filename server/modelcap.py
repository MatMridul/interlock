"""Model mode and the global daily cap on real-model (Bedrock) calls.

INTERLOCK_MODEL: "off" (no model call can happen) or "bedrock". Unset means "off" in production
and "bedrock" otherwise (local dev). INTERLOCK_DAILY_MODEL_CAP: calls per UTC day (default 200).
The counter lives in the store (DynamoDB in production) and is incremented atomically before each
model call, so concurrent instances cannot overshoot the cap.
"""
import os

from strands.hooks import BeforeModelCallEvent

from server import config
from server.store import daily_key

DEFAULT_CAP = 200
CAP_MESSAGE = "The daily limit of real-model calls is used up. Try again after 00:00 UTC."
OFF_MESSAGE = "Real-model chat is switched off on this deployment."


class CapReached(Exception):
    pass


def model_mode():
    m = os.environ.get("INTERLOCK_MODEL", "").strip().lower()
    return m or ("off" if config.is_production() else "bedrock")


def daily_cap():
    try:
        return max(0, int(os.environ.get("INTERLOCK_DAILY_MODEL_CAP", DEFAULT_CAP)))
    except ValueError:
        return DEFAULT_CAP


class ModelCap:
    def __init__(self, store, limit=None, now=None):
        self._store, self.limit = store, daily_cap() if limit is None else limit
        self._key = (lambda: daily_key()) if now is None else (lambda: daily_key(now=now))

    def take(self):
        if not self._store.incr_if_below(self._key(), self.limit):
            raise CapReached(CAP_MESSAGE)

    def exhausted(self):
        return self._store.count(self._key()) >= self.limit

    def attach(self, session):
        session.agent.add_hook(lambda event: self.take(), BeforeModelCallEvent)
