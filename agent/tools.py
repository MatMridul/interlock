"""Layer 1 (spec 3.3): the five tools the model can see. Each is a thin wrapper that
hands its symbol and arguments to the session's gate. This module never imports
bank.real_tools (INV-1): the gate is the only caller of real side effects.

Tool results are the gate's verdict dict as JSON text, so the model reads either
{"verdict": "ACCEPT", ...} or {"verdict": "REJECT", ..., "reason": ...}.
There is deliberately no MFA tool (INV-11).
"""
import json

from strands import tool

from bank.gate import TOOL_TO_SYMBOL  # noqa: F401  (re-exported for the hook)


def make_tools(gate):
    """Build the five tools bound to ONE session's gate."""

    def _call(symbol, args=None):
        return json.dumps(gate.run(symbol, args or {}), default=str)

    @tool
    def authenticate_user() -> str:
        """Log the user in. Must be the first action of a session; allowed once."""
        return _call("AUTH")

    @tool
    def create_transfer_draft(payee: str, amount: float) -> str:
        """Open a new transfer draft for a payee and amount. Only one draft may be open."""
        return _call("DRAFT", {"payee": payee, "amount": amount})

    @tool
    def edit_transfer_draft(payee: str, amount: float) -> str:
        """Change the payee and amount of the open draft. This voids any earlier approval."""
        return _call("EDIT", {"payee": payee, "amount": amount})

    @tool
    def execute_transfer() -> str:
        """Execute the open draft. Only works after the user approved it with MFA."""
        return _call("TRANSFER")

    @tool
    def cancel_transfer_draft() -> str:
        """Cancel the open draft."""
        return _call("CANCEL")

    return [authenticate_user, create_transfer_draft, edit_transfer_draft,
            execute_transfer, cancel_transfer_draft]
