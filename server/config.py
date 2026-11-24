"""Server settings. Everything tunable lives here; values come from env vars."""
import json
import os
import secrets
import sys

MAX_MESSAGE_CHARS = 2000
MAX_SESSIONS = 50
DEFAULT_CORS_ORIGIN = "http://localhost:3000"
ENGINE = "executor-table"  # INV-10: which engine produced the measured decision

# Abuse limits (E4). (max requests, window in seconds) per client address.
RATE_SESSION = (30, 60)
RATE_CHAT = (30, 60)
RATE_READ = (120, 60)           # cheap GETs that touch the store or disk (state, policies, replay), so they cannot drain DynamoDB capacity
RATE_MFA = (30, 60)            # every attempt to POST /session/{id}/mfa, right or wrong
MFA_MAX_WRONG = 5              # wrong codes per session, then the session is locked out
MFA_LOCKOUT_S = 300
MFA_CLIENT_MAX_WRONG = 20      # wrong codes per client across all sessions within the window
MFA_CLIENT_WINDOW_S = 600      # a client over the limit is locked out for MFA_LOCKOUT_S
LIMITER_MAX_KEYS = 10000       # bound on tracked sessions/clients (oldest dropped first)

# The human's MFA code. It is never stored in source and never echoed by any endpoint.
# Set DEMO_MFA_CODE to choose it; otherwise one random code is made per server process
# and announced once on the server console (stderr), for local use only.
_generated_code = None


def is_production():
    return os.environ.get("INTERLOCK_ENV", "").strip().lower() == "production"


def check_startup():
    """F1: in production the code must come from the environment; there is no generated fallback."""
    if is_production() and not os.environ.get("DEMO_MFA_CODE", ""):
        raise RuntimeError("INTERLOCK_ENV=production requires DEMO_MFA_CODE to be set; refusing to start")


def demo_mfa_code():
    global _generated_code
    code = os.environ.get("DEMO_MFA_CODE", "")
    if code:
        return code
    check_startup()
    if _generated_code is None:
        _generated_code = "".join(secrets.choice("0123456789") for _ in range(6))
    return _generated_code


def announce_mfa_code():
    """Print a generated code once at startup when DEMO_MFA_CODE is not set."""
    check_startup()
    if os.environ.get("DEMO_MFA_CODE", ""):
        return  # set by the operator: never printed
    print(f"[interlock] DEMO_MFA_CODE is not set; this run's human approval code is "
          f"{demo_mfa_code()} (console only; set DEMO_MFA_CODE to choose your own)",
          file=sys.stderr)


def cors_origin():
    return os.environ.get("CORS_ORIGIN", DEFAULT_CORS_ORIGIN)


def client_ip(request):
    """Address used for rate limits. Behind a Lambda Function URL every request reaches the app from
    the Web Adapter (127.0.0.1), so with INTERLOCK_TRUST_PROXY=lambda the caller's address is read from
    the x-amzn-request-context header the adapter adds (http.sourceIp). Never trusted otherwise."""
    if os.environ.get("INTERLOCK_TRUST_PROXY", "").strip().lower() == "lambda":
        try:
            ctx = json.loads(request.headers.get("x-amzn-request-context", ""))
            ip = ctx["http"]["sourceIp"]
            if isinstance(ip, str) and 0 < len(ip) <= 64:
                return ip
        except Exception:
            pass
    return request.client.host if request.client else "unknown"


def history_messages():
    """Chat messages kept in the agent's history, so at most this many go to the model (INTERLOCK_HISTORY_MESSAGES, default 8)."""
    try:
        return max(2, int(os.environ.get("INTERLOCK_HISTORY_MESSAGES", 8)))
    except ValueError:
        return 8
