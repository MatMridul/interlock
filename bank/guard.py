"""Argument guard (spec INV-9, S9). Used only by bank/gate.py.

All demo limits live in GuardConfig (one place). The guard is pure except for the
three counters, which the gate updates through the note_* methods.
"""
import math
from dataclasses import dataclass
from decimal import Decimal


@dataclass(frozen=True)
class GuardConfig:
    allowed_payees: tuple = ("Alice", "Bob", "Carol", "Electric Co")
    spend_cap: float = 5000  # per transfer; amount == cap is allowed
    max_transfers: int = 3  # executed TRANSFERs per session
    max_consecutive_rejects: int = 5  # then the session is locked


DEFAULT_CONFIG = GuardConfig()


def validate_draft_args(args, cfg):
    """None if args are a valid (payee, amount) pair, else a reason string."""
    payee, amount = args.get("payee"), args.get("amount")
    if type(payee) is not str or payee not in cfg.allowed_payees:
        return "payee not in allow-list"
    # bool is an int subclass, strings are refused: exact types only
    if type(amount) not in (int, float):
        return "amount must be a number"
    if isinstance(amount, float) and not math.isfinite(amount):
        return "amount must be finite"
    if amount <= 0:
        return "amount must be positive"
    if Decimal(repr(amount)).as_tuple().exponent < -2:
        return "amount has more than 2 decimals"
    if amount > cfg.spend_cap:
        return "amount above spend cap"
    return None


class Guard:
    def __init__(self, config=DEFAULT_CONFIG):
        self.cfg = config
        self.draft = None  # latest accepted (payee, amount)
        self.transfers = 0
        self.rejects = 0  # consecutive rejected proposals

    @property
    def locked(self):
        return self.rejects >= self.cfg.max_consecutive_rejects

    def check(self, symbol, args):
        """Read-only. Returns a reject reason or None. args may be None (peek)."""
        if self.locked:
            return "session locked"
        if symbol in ("DRAFT", "EDIT") and args is not None:
            return validate_draft_args(args, self.cfg)
        if symbol == "TRANSFER":
            if self.transfers >= self.cfg.max_transfers:
                return "transfer limit reached"
            if args is not None and self.draft is None:
                return "no draft to transfer"
        return None

    def transfer_args(self):
        return dict(self.draft)

    def note_accept(self, symbol, args):
        self.rejects = 0
        if symbol in ("DRAFT", "EDIT"):
            self.draft = {"payee": args["payee"], "amount": args["amount"]}
        elif symbol == "TRANSFER":
            self.transfers += 1

    def note_reject(self):
        self.rejects += 1

    def snapshot(self):
        return {"transfers": self.transfers, "max_transfers": self.cfg.max_transfers,
                "consecutive_rejects": self.rejects,
                "max_consecutive_rejects": self.cfg.max_consecutive_rejects,
                "locked": self.locked, "spend_cap": self.cfg.spend_cap}
