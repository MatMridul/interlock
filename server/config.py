"""Server settings. Everything tunable lives here; values come from env vars."""
import os
import secrets
import sys

MAX_MESSAGE_CHARS = 2000
MAX_SESSIONS = 50
DEFAULT_CORS_ORIGIN = "http://localhost:3000"
ENGINE = "executor-table"  # INV-10: which engine produced the measured decision

# The human's MFA code. It is never stored in source and never echoed by any endpoint.
# Set DEMO_MFA_CODE to choose it; otherwise one random code is made per server process
# and announced once on the server console (stderr), for local use only.
_generated_code = None


def demo_mfa_code():
    global _generated_code
    code = os.environ.get("DEMO_MFA_CODE", "")
    if code:
        return code
    if _generated_code is None:
        _generated_code = "".join(secrets.choice("0123456789") for _ in range(6))
    return _generated_code


def announce_mfa_code():
    """Print a generated code once at startup when DEMO_MFA_CODE is not set."""
    if os.environ.get("DEMO_MFA_CODE", ""):
        return
    print(f"[interlock] DEMO_MFA_CODE is not set; this run's human approval code is "
          f"{demo_mfa_code()} (console only; set DEMO_MFA_CODE to choose your own)",
          file=sys.stderr)


def cors_origin():
    return os.environ.get("CORS_ORIGIN", DEFAULT_CORS_ORIGIN)
