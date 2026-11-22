"""Tests for safeship/hook.py (Safe Ship, the Gate engine on Kiro tool calls) using simulated STDIN payloads, run as real subprocesses (a hook is a fresh process).
Engine-level and verification tests are in test_safe_ship_engine.py and test_safe_ship_machine.py.
"""
import hashlib
import json
import subprocess
import sys
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import pytest

HOOK = Path(__file__).resolve().parent.parent / "safeship" / "hook.py"
OK_RESP = "Output:\n1 passed\n\n\nExit Code: 0"
FAIL_RESP = "Output:\n1 failed\n\n\nExit Code: 1"


@pytest.fixture
def env(tmp_path, monkeypatch):
    monkeypatch.setenv("SAFE_SHIP_STATE_DIR", str(tmp_path / "state"))
    return tmp_path


def fire(phase, tool, tin, session="s1", resp=None, raw=None):
    payload = {"session_id": session, "hook_event_name": "PreToolUse" if phase == "pre" else "PostToolUse",
               "cwd": "C:\\x", "tool_name": tool, "tool_input": tin}
    if resp is not None:
        payload["tool_response"] = resp
    r = subprocess.run([sys.executable, str(HOOK), "--phase", phase], input=raw if raw is not None else json.dumps(payload),
                       capture_output=True, text=True, timeout=30)
    return r.returncode, r.stderr


def edit(s="s1"):
    return fire("pre", "str_replace", {"path": "a.py", "oldStr": "x", "newStr": "y"}, s)


def sh(cmd, s="s1"):
    return fire("pre", "execute_pwsh", {"command": cmd}, s)


def green(cmd="python -m pytest -q", s="s1"):
    assert sh(cmd, s)[0] == 0
    return fire("post", "execute_pwsh", {"command": cmd}, s, resp=OK_RESP)


def state_file(env, session="s1"):
    return env / "state" / (hashlib.sha256(session.encode()).hexdigest()[:32] + ".json")


def test_push_blocked_in_fresh_session(env):
    code, err = sh("git push origin main")
    assert code == 2 and "PUSH refused in state CLEAN" in err


def test_edit_test_push_accepted_then_edit_invalidates(env):
    assert edit()[0] == 0
    assert sh("git push")[0] == 2                      # EDITED
    assert green()[0] == 0
    assert sh("git commit -m x")[0] == 0               # COMMIT keeps TESTED
    assert sh("git push origin feature")[0] == 0       # TESTED
    assert edit()[0] == 0                              # EDIT invalidates
    code, err = sh("git push origin feature")
    assert code == 2 and "state EDITED" in err


def test_deploy_follows_same_rule(env):
    assert sh("cdk deploy --all")[0] == 2
    green()
    assert sh("cdk deploy --all")[0] == 0


def test_failed_test_does_not_unlock(env):
    edit()
    assert sh("pytest")[0] == 0                        # pre never blocks TEST
    fire("post", "execute_pwsh", {"command": "pytest"}, resp=FAIL_RESP)
    assert sh("git push")[0] == 2


def test_version_check_and_piped_test_do_not_count(env):
    edit()
    for cmd in ("python -m pytest --version", "pytest | tail -1", "pytest; echo done", "pytest || true"):
        fire("post", "execute_pwsh", {"command": cmd}, resp=OK_RESP)
    assert sh("git push")[0] == 2


def test_pre_does_not_trust_a_compound_test_and_push(env):
    edit()
    assert sh("pytest && git push")[0] == 2            # TEST has not happened yet in the pre phase


def test_wrapper_push_is_caught(env):
    assert sh('bash -c "git push origin main"')[0] == 2
    assert sh("cd repo && git -C repo push")[0] == 2


def test_shell_edit_patterns(env):
    green()
    assert sh("echo hi > notes.txt")[0] == 0           # shell EDIT, steps to EDITED
    assert sh("git push")[0] == 2
    green()
    assert sh("pytest 2>&1 | tail -3")[0] == 0         # 2>&1 is not an edit
    assert sh("git push")[0] == 0


def test_unmapped_tools_and_commands_pass(env):
    assert fire("pre", "read_file", {"path": "a"})[0] == 0
    assert fire("pre", "mcp_foo_bar", {"x": 1})[0] == 0
    assert sh("ls -la")[0] == 0
    assert not state_file(env).exists()                # nothing mapped, nothing written


def test_sessions_are_independent(env):
    green(s="a")
    assert sh("git push", s="a")[0] == 0
    assert sh("git push", s="b")[0] == 2


def test_corrupt_state_reads_as_clean(env):
    green()
    state_file(env).write_text("{not json", encoding="utf-8")
    assert sh("git push")[0] == 2
    assert edit()[0] == 0                              # EDIT still fine, rewrites a valid file
    assert json.loads(state_file(env).read_text())["state"] == "EDITED"


def test_unknown_state_value_reads_as_clean(env):
    green()
    state_file(env).write_text('{"state": "ROOT"}', encoding="utf-8")
    assert sh("git push")[0] == 2


def test_fail_closed_when_state_dir_unusable(env, monkeypatch):
    blocker = env / "afile"
    blocker.write_text("x")
    monkeypatch.setenv("SAFE_SHIP_STATE_DIR", str(blocker / "sub"))   # cannot mkdir under a file
    assert sh("git push")[0] == 2
    assert fire("pre", "str_replace", {"path": "a"})[0] == 2          # mapped EDIT also refused
    assert fire("pre", "read_file", {"path": "a"})[0] == 0            # unmapped still passes


def test_garbage_stdin_pre_blocks_post_passes(env):
    assert fire("pre", "x", {}, raw="not json")[0] == 2
    assert fire("pre", "x", {}, raw="[1,2]")[0] == 2
    assert fire("post", "x", {}, raw="not json")[0] == 0


def test_shell_without_command_string_is_refused(env):
    assert fire("pre", "execute_pwsh", {"cmd": "git push"})[0] == 2


def test_stale_lock_is_broken_and_busy_lock_fails_closed(env):
    import os, time
    edit()
    lock = state_file(env).with_suffix(".lock")
    lock.write_text("")
    old = time.time() - 120
    os.utime(lock, (old, old))
    assert sh("git push")[0] == 2                      # stale lock removed, then normal refusal (state EDITED)
    assert not lock.exists()


def test_concurrent_calls_leave_a_valid_state(env):
    green()
    with ThreadPoolExecutor(8) as ex:
        codes = list(ex.map(lambda i: edit()[0] if i % 2 else sh("git commit -m c")[0], range(16)))
    assert codes == [0] * 16
    assert json.loads(state_file(env).read_text())["state"] in ("EDITED", "TESTED")
    assert not state_file(env).with_suffix(".lock").exists()


def test_table_matches_verified_machine():
    from safeship.executor_table import TABLE
    assert TABLE["TESTED"]["PUSH"] == "TESTED" and "PUSH" not in TABLE["EDITED"] and "PUSH" not in TABLE["CLEAN"]