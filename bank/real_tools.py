"""Stub side-effect functions. Only bank/gate.py may import this module (INV-1).

Each function appends one entry to the session's side-effect log and returns a
result. No network, no money. MFA is separate and records source='human'; the
gate refuses to call it for any other source (INV-11).
"""


def _do(log, symbol, args, result):
    log.append({"symbol": symbol, "args": dict(args)})
    return result


def authenticate_user(args, log):
    return _do(log, "AUTH", args, "authenticated")


def create_transfer_draft(args, log):
    return _do(log, "DRAFT", args, "draft created")


def edit_transfer_draft(args, log):
    return _do(log, "EDIT", args, "draft edited")


def execute_transfer(args, log):
    return _do(log, "TRANSFER", args, "transfer executed (stub, no money moved)")


def cancel_transfer_draft(args, log):
    return _do(log, "CANCEL", args, "draft cancelled")


def record_mfa_human(args, log):
    """Human-source only. The gate enforces that; this just records it."""
    log.append({"symbol": "MFA", "args": dict(args), "source": "human"})
    return "mfa recorded"
