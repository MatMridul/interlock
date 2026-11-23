"""safe-ship hook: runs the safe_ship state machine on Kiro's own tool calls. Stdlib only.

Wire it as two hooks (see safe-ship.hook.json): PreToolUse and PostToolUse, matcher "*" or the
tool names below. Kiro starts a fresh process per event and sends one JSON object on STDIN:
{session_id, hook_event_name, cwd, tool_name, tool_input[, tool_response]}  (verified live, CLI 3.5.0).

  --phase pre   map the call to symbols, step the machine, exit 2 + reason on STDERR if a step is
                refused, else exit 0. EDIT/COMMIT/PUSH/DEPLOY step here. TEST does NOT step here.
  --phase post  a TEST step is recorded only when the command ran and exited 0 ("ran green").

Honest limits (shortcut: closed pattern list, a speed bump for a cooperative agent, not a sandbox):
  * a hook sees tool calls, not intent; unmapped tools and unmapped shell commands pass untouched
  * shell edits are only seen through a short pattern list (redirects, Set-Content, sed -i, tee)
  * wrappers such as `bash -c "..."` are only caught for PUSH/DEPLOY (searched anywhere in the command)
  * parallel tool calls in one model turn run their hooks concurrently; order between them is undefined
State: one small JSON file per session in a temp dir (override: SAFE_SHIP_STATE_DIR).
Missing, corrupt or unknown state is read as CLEAN, the most restrictive state (it blocks PUSH/DEPLOY).
"""
import hashlib
import json
import os
import re
import sys
import tempfile
import time
from pathlib import Path

TABLE_PATH = Path(__file__).with_name("safe_ship_table.json")
EDIT_TOOLS = {"str_replace", "fs_write", "fs_append", "write", "edit"}   # str_replace verified live; rest unverified aliases
SHELL_TOOLS = {"execute_pwsh", "execute_bash", "shell", "bash"}          # execute_pwsh verified live (Windows)
RISKY = ("PUSH", "DEPLOY")

RISKY_PATTERNS = [
    ("PUSH", r"\bgit(\s+-[cC]\s+\S+)*\s+push\b"),
    ("DEPLOY", r"\b(cdk|sam|serverless|sls|amplify)\s+deploy\b"),
    ("DEPLOY", r"\bterraform\s+apply\b"),
    ("DEPLOY", r"\baws\s+cloudformation\s+(deploy|create-stack|update-stack)\b"),
    ("DEPLOY", r"\bkubectl\s+apply\b"),
]
SEGMENT_PATTERNS = [
    ("COMMIT", r"^(&\s*)?git(\s+-[cC]\s+\S+)*\s+commit\b"),
    ("TEST", r"^(&\s*)?[\"']?[^\s\"']*python[^\s\"']*[\"']?\s+-m\s+(pytest|unittest)\b"),
    ("TEST", r"^(&\s*)?[\"']?[^\s\"']*pytest(\.exe)?[\"']?(\s|$)"),
    ("TEST", r"^(npm|yarn|pnpm)\s+(run\s+)?test\b"),
    ("TEST", r"^(cargo|go)\s+test\b"),
    ("EDIT", r"\b(set-content|add-content|out-file|tee|tee-object)\b|\bsed\s+-i\b|(?<![\d&>])>>?(?![&>])"),
]
NOT_A_TEST_RUN = re.compile(r"(--version|--help|--collect-only|--co\b|\s-h\b)")
SEPARATORS = re.compile(r"&&|\|\||;|\||\r?\n")


def load_table(path=TABLE_PATH):
    t = json.loads(Path(path).read_text(encoding="utf-8"))
    # a SINK cell is dropped: a missing cell means refuse, as in bank/executor_table.py
    return t["initial"], {s: {k: v for k, v in r.items() if v != "SINK"} for s, r in t["transitions"].items() if s != "SINK"}


def shell_symbols(command):
    """Closed mapping of a command string to an ordered list of symbols. Unmapped parts yield nothing."""
    out = []
    for seg in SEPARATORS.split(command):
        seg = seg.strip()
        if not seg:
            continue
        low = seg.lower()
        for sym, rx in RISKY_PATTERNS:
            if re.search(rx, low):
                out.append(sym)
                break
        else:
            for sym, rx in SEGMENT_PATTERNS:
                if re.search(rx, low):
                    if sym == "TEST" and NOT_A_TEST_RUN.search(low):
                        continue
                    out.append(sym)
                    break
    return out


def symbols_for(tool_name, tool_input):
    if tool_name in EDIT_TOOLS:
        return ["EDIT"]
    if tool_name in SHELL_TOOLS:
        cmd = tool_input.get("command") if isinstance(tool_input, dict) else None
        if not isinstance(cmd, str):
            raise ValueError("shell tool call without a command string")
        return shell_symbols(cmd)
    return []


def counts_as_green_test(command, response):
    """True only for a command that maps to exactly one TEST, joined only by &&, and exited 0."""
    if re.search(r"\|\||;|\||\r?\n", command) or shell_symbols(command) != ["TEST"]:
        return False
    if isinstance(response, dict):
        code = response.get("exit_code", response.get("exitCode"))
        return code == 0 and not isinstance(code, bool)
    if isinstance(response, str):
        m = re.search(r"Exit Code:\s*(-?\d+)\s*$", response)        # verified live: tool_response ends "Exit Code: N"
        return bool(m) and int(m.group(1)) == 0
    return False


class Store:
    def __init__(self, session_key):
        base = Path(os.environ.get("SAFE_SHIP_STATE_DIR") or Path(tempfile.gettempdir()) / "interlock-safe-ship")
        base.mkdir(parents=True, exist_ok=True)
        h = hashlib.sha256(session_key.encode("utf-8", "replace")).hexdigest()[:32]
        self.path, self.lock = base / f"{h}.json", base / f"{h}.lock"

    def __enter__(self):
        deadline = time.time() + 5
        while True:
            try:
                os.close(os.open(self.lock, os.O_CREAT | os.O_EXCL | os.O_WRONLY))
                return self
            except FileExistsError:
                try:
                    if time.time() - self.lock.stat().st_mtime > 30:    # stale lock from a killed hook
                        self.lock.unlink()
                        continue
                except OSError:
                    pass
                if time.time() > deadline:
                    raise TimeoutError("state lock busy")
                time.sleep(0.05)

    def __exit__(self, *exc):
        try:
            self.lock.unlink()
        except OSError:
            pass

    def read(self, states):
        try:
            s = json.loads(self.path.read_text(encoding="utf-8"))["state"]
            return s if s in states else "CLEAN"
        except Exception:
            return "CLEAN"      # missing or corrupt: most restrictive state

    def write(self, state):
        tmp = self.path.with_suffix(".tmp")
        tmp.write_text(json.dumps({"v": 1, "state": state, "ts": time.time()}), encoding="utf-8")
        os.replace(tmp, self.path)


def log(entry):
    p = os.environ.get("SAFE_SHIP_LOG")
    if p:
        try:
            with open(p, "a", encoding="utf-8") as f:
                f.write(json.dumps(entry) + "\n")
        except OSError:
            pass


def run(phase, payload):
    """Return (exit_code, stderr_message)."""
    tool, tin = payload.get("tool_name"), payload.get("tool_input")
    syms = symbols_for(tool, tin)
    if not syms and phase == "pre":
        return 0, ""
    _, table = load_table()
    if phase == "post":
        if tool in SHELL_TOOLS and syms == ["TEST"] and counts_as_green_test(tin["command"], payload.get("tool_response")):
            with Store(str(payload.get("session_id") or payload.get("cwd"))) as st:
                st.write(table[st.read(table)]["TEST"])
        return 0, ""
    if not syms:
        return 0, ""
    with Store(str(payload.get("session_id") or payload.get("cwd"))) as st:
        state = st.read(table)
        for sym in syms:
            if sym == "TEST":
                continue            # TEST only steps in the post phase, after the exit code is known
            nxt = table[state].get(sym)
            if nxt is None:
                return 2, (f"safe-ship: {sym} refused in state {state}. No passing test run since the last edit "
                           f"(or none this session). Run the project's tests (for example python -m pytest) as a "
                           f"separate command, fix failures, then retry.")
            state = nxt
        st.write(state)
    return 0, ""


def main(argv):
    phase = "post" if "--phase" in argv and argv[argv.index("--phase") + 1] == "post" else "pre"
    try:
        payload = json.load(sys.stdin)
        if not isinstance(payload, dict):
            raise ValueError("payload is not an object")
        code, msg = run(phase, payload)
    except Exception as e:
        # Fail closed in pre: we cannot tell whether the call is mapped. Post cannot block anyway, and a
        # missed TEST record only keeps PUSH/DEPLOY blocked (safe direction).
        code, msg = (2, f"safe-ship: internal error ({type(e).__name__}), call refused") if phase == "pre" else (0, "")
        payload = {}
    log({"phase": phase, "tool": payload.get("tool_name"), "exit": code, "msg": msg, "ts": time.time()})
    if msg:
        print(msg, file=sys.stderr)
    return code


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
