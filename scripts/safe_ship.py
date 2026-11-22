"""Turn Safe Ship on or off for this checkout, without touching tracked files.

  python scripts/safe_ship.py enable   write .kiro/hooks/safe-ship.local.json (untracked, enabled)
  python scripts/safe_ship.py disable  delete that file
  python scripts/safe_ship.py status   say whether it is on
  python scripts/safe_ship.py reset    forget the saved per-session states (the next push needs a test run)

The committed .kiro/hooks/safe-ship.json stays `enabled: false`, so cloning the repo never blocks anyone.
The local copy uses absolute paths to this Python and this checkout's safeship/hook.py, which is why it is
not committed. `--root DIR` (for a scratch copy) uses DIR instead of the repo root.
"""
import json
import os
import shutil
import sys
import tempfile
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent


def local_path(root):
    return root / ".kiro" / "hooks" / "safe-ship.local.json"


def build(root):
    base = json.loads((root / ".kiro" / "hooks" / "safe-ship.json").read_text(encoding="utf-8"))
    hook = root / "safeship" / "hook.py"
    for h in base["hooks"]:
        h["name"] += "-local"
        h["enabled"] = True
        phase = "post" if h["name"].startswith("safe-ship-post") else "pre"
        h["action"]["command"] = f'"{sys.executable}" "{hook}" --phase {phase}'
        h["description"] = "Safe Ship, ON for this machine (written by scripts/safe_ship.py enable). " + h["description"]
    return base


def main(argv):
    root = Path(argv[argv.index("--root") + 1]).resolve() if "--root" in argv else REPO
    cmd = next((a for a in argv if a in ("enable", "disable", "status", "reset")), None)
    p = local_path(root)
    if cmd == "enable":
        p.write_text(json.dumps(build(root), indent=2) + "\n", encoding="utf-8")
        print(f"Safe Ship ON: wrote {p}\nStart a new Kiro session. Turn off with: python scripts/safe_ship.py disable")
    elif cmd == "disable":
        p.unlink(missing_ok=True)
        print("Safe Ship OFF: removed", p)
    elif cmd == "status":
        print("Safe Ship is", "ON" if p.exists() else "OFF", f"({p})")
    elif cmd == "reset":
        d = Path(os.environ.get("SAFE_SHIP_STATE_DIR") or Path(tempfile.gettempdir()) / "interlock-safe-ship")
        shutil.rmtree(d, ignore_errors=True)
        print("cleared", d)
    else:
        print(__doc__)
        return 2
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
