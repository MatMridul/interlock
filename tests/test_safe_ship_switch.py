"""The safety rule: the committed Safe Ship hook is off; `scripts/safe_ship.py enable` turns it on locally only."""
import json
import shutil
import subprocess
import sys

from conftest import ROOT
from pathlib import Path

SCRIPT = Path(ROOT) / "scripts" / "safe_ship.py"
COMMITTED = Path(ROOT) / ".kiro" / "hooks" / "safe-ship.json"


def sh(*args):
    return subprocess.run([sys.executable, str(SCRIPT), *args], capture_output=True, text=True)


def test_committed_hooks_are_disabled_and_use_pretooluse_posttooluse():
    hooks = json.loads(COMMITTED.read_text(encoding="utf-8"))["hooks"]
    assert [h["trigger"] for h in hooks] == ["PreToolUse", "PostToolUse"]
    assert all(h["enabled"] is False for h in hooks)


def test_committed_hook_json_is_not_overridden_by_a_tracked_local_file():
    assert "*.local.json" in (Path(ROOT) / ".gitignore").read_text(encoding="utf-8")


def test_enable_status_disable_in_a_scratch_root(tmp_path):
    (tmp_path / ".kiro" / "hooks").mkdir(parents=True)
    shutil.copy(COMMITTED, tmp_path / ".kiro" / "hooks" / "safe-ship.json")
    assert "OFF" in sh("status", "--root", str(tmp_path)).stdout
    assert sh("enable", "--root", str(tmp_path)).returncode == 0
    local = tmp_path / ".kiro" / "hooks" / "safe-ship.local.json"
    hooks = json.loads(local.read_text(encoding="utf-8"))["hooks"]
    assert all(h["enabled"] is True and h["name"].endswith("-local") for h in hooks)
    assert "--phase pre" in hooks[0]["action"]["command"] and "--phase post" in hooks[1]["action"]["command"]
    assert json.loads(COMMITTED.read_text(encoding="utf-8"))["hooks"][0]["enabled"] is False   # tracked file untouched
    assert "ON" in sh("status", "--root", str(tmp_path)).stdout
    assert sh("disable", "--root", str(tmp_path)).returncode == 0 and not local.exists()


def test_reset_clears_state_dir(tmp_path, monkeypatch):
    (tmp_path / "x.json").write_text("{}")
    monkeypatch.setenv("SAFE_SHIP_STATE_DIR", str(tmp_path))
    assert sh("reset").returncode == 0 and not tmp_path.exists()
