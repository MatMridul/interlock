"""The gate (spec 3.3): the only caller of real tools. One Gate per session.

run(): under one lock, look up (state, symbol) in the generated table; an
undefined cell, an unknown symbol, a bad source or ANY exception is a REJECT
with state unchanged and no tool run (INV-2, INV-4, INV-11, INV-12). On an
accepted transition the tool runs, then _commit writes the new state (INV-6).
The optional argument guard (bank/guard.py, INV-9) runs after the table accepts and before the tool.
"""
import threading

from bank import real_tools
from bank.executor_table import INITIAL, SYMBOLS, TABLE
from bank.guard import Guard, GuardConfig

# Closed map of agent-visible tool names to symbols (INV-4). MFA is not a tool.
TOOL_TO_SYMBOL = {
    "authenticate_user": "AUTH",
    "create_transfer_draft": "DRAFT",
    "edit_transfer_draft": "EDIT",
    "execute_transfer": "TRANSFER",
    "cancel_transfer_draft": "CANCEL",
}

DEFAULT_TOOLS = {
    "AUTH": real_tools.authenticate_user,
    "DRAFT": real_tools.create_transfer_draft,
    "EDIT": real_tools.edit_transfer_draft,
    "MFA": real_tools.record_mfa_human,
    "TRANSFER": real_tools.execute_transfer,
    "CANCEL": real_tools.cancel_transfer_draft,
}


def symbol_for_tool(name):
    """Exact-match lookup; None for anything not in the closed set."""
    return TOOL_TO_SYMBOL.get(name) if type(name) is str else None


class Gate:
    def __init__(self, table=None, tools=None, guard=True, initial=None, symbols=None):
        # initial/symbols let a second policy (safeship/, the Kiro hook) run on this same engine;
        # the defaults are the finance policy.
        self._symbols = SYMBOLS if symbols is None else symbols
        # table/tools are injectable for tests (mutants, fault injection).
        self._table = TABLE if table is None else table
        self._tools = DEFAULT_TOOLS if tools is None else tools
        self._lock = threading.Lock()
        self._log = []
        self._state = INITIAL if initial is None else initial
        # guard: default ON. True/None = default limits, a GuardConfig = custom, False = off (explicit opt-out, tests only)
        self._guard = None if guard is False else Guard(GuardConfig() if guard in (True, None) else guard)

    @property
    def state(self):
        return self._state

    def effects(self):
        """Copy of the side-effect log (what actually executed)."""
        return tuple(dict(e) for e in self._log)

    def _commit(self, new_state):
        self._state = new_state  # the only write to _state after __init__

    def _expected(self, state, source):
        row = self._table[state]
        return [s for s in self._symbols if s in row and (s != "MFA" or source == "human")]

    def _reject(self, symbol, reason, source="llm"):
        try:
            expected = self._expected(self._state, source)
        except Exception:
            expected = []
        return {"verdict": "REJECT", "state": self._state, "symbol": symbol,
                "expected_symbols": expected, "reason": reason}

    def _decide(self, symbol, source):
        """Pure check. Returns (next_state, None) or (None, reason)."""
        if type(symbol) is not str or symbol not in self._symbols:
            return None, "unknown symbol"
        if symbol == "MFA" and source != "human":
            return None, "MFA is human-only"
        nxt = self._table[self._state].get(symbol)
        if nxt is None:
            return None, f"{symbol} not allowed in {self._state}"
        return nxt, None

    def guard_state(self):
        return self._guard.snapshot() if self._guard else None

    def note_rejected_proposal(self):
        """Called by the hook layer when it refuses a proposal, so hook rejections count toward the retry limit."""
        with self._lock:
            if self._guard:
                self._guard.note_reject()

    def peek(self, symbol, source="llm", args=None):
        """Read-only. Returns (allowed, info dict). Never changes anything."""
        with self._lock:
            try:
                nxt, reason = self._decide(symbol, source)
                if not reason and self._guard:
                    reason = self._guard.check(symbol, args if isinstance(args, dict) else None)
                if reason:
                    return False, self._reject(symbol, reason, source)
                return True, {"verdict": "ACCEPT", "state": self._state,
                              "symbol": symbol, "next_state": nxt}
            except Exception as e:
                return False, self._reject(symbol, f"checker error ({type(e).__name__})", source)

    def run(self, symbol, args=None, source="llm"):
        with self._lock:
            r = self._run(symbol, args, source)
            if self._guard and r["verdict"] == "REJECT":
                self._guard.note_reject()
            return r

    def _run(self, symbol, args, source):
        try:
            args = {} if args is None else args
            if not isinstance(args, dict):
                return self._reject(symbol, "args must be a dict", source)
            if self._guard and self._guard.locked:
                return self._reject(symbol, "session locked", source)
            nxt, reason = self._decide(symbol, source)
            if reason:
                return self._reject(symbol, reason, source)
            if self._guard:
                reason = self._guard.check(symbol, args)
                if reason:
                    return self._reject(symbol, reason, source)
                if symbol == "TRANSFER":
                    args = self._guard.transfer_args()  # the model cannot choose these
            result = self._tools[symbol](args, self._log)
            self._commit(nxt)
            if self._guard:
                self._guard.note_accept(symbol, args)
            return {"verdict": "ACCEPT", "state": self._state, "symbol": symbol,
                    "result": result}
        except Exception as e:
            return self._reject(symbol, f"error ({type(e).__name__}), nothing committed", source)