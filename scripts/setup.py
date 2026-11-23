"""One-command local setup (Windows, macOS, Linux). Standard library only.

    python scripts/setup.py              # venv + Python deps + UI build
    python scripts/setup.py --no-ui      # skip the UI (API and tests only)

It creates .venv, installs requirements.txt, runs `npm ci` and `npm run build` in ui/ when
npm is on PATH, and checks for Java (needed only for the JFLAP-based checks and tests).
It never writes secrets. Run it from any directory.
"""
import os
import shutil
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
VENV = os.path.join(ROOT, ".venv")
IS_WIN = os.name == "nt"
VENV_PY = os.path.join(VENV, "Scripts" if IS_WIN else "bin", "python.exe" if IS_WIN else "python")


def run(cmd, cwd=ROOT):
    print("+", " ".join(cmd), flush=True)
    subprocess.run(cmd, cwd=cwd, check=True)


def main():
    if sys.version_info < (3, 10):
        sys.exit("Python 3.10 or newer is required (3.12 is what CI uses).")
    if not os.path.exists(VENV_PY):
        run([sys.executable, "-m", "venv", VENV])
    run([VENV_PY, "-m", "pip", "install", "--quiet", "-r", "requirements.txt"])

    if "--no-ui" not in sys.argv:
        npm = shutil.which("npm")
        if npm:
            run([npm, "ci"], cwd=os.path.join(ROOT, "ui"))
            run([npm, "run", "build"], cwd=os.path.join(ROOT, "ui"))
        else:
            print("npm not found: skipping the UI build (install Node 20+ and re-run, or use --no-ui).")

    if shutil.which("java") and shutil.which("javac"):
        print("Java found: JFLAP checks and the replay/mutation tests can run.")
    else:
        print("Java (JDK 11+) not found: the JFLAP-based checks and tests will not run.")

    py = r".venv\Scripts\python" if IS_WIN else ".venv/bin/python"
    serve = f"-m uvicorn server.app:app --host 127.0.0.1 --port 8000"
    print("\nSetup done. Start the server (STUB=1 uses a canned model, no AWS needed):")
    if IS_WIN:
        print(f'  $env:STUB = "1"; {py} {serve}')
    else:
        print(f"  STUB=1 {py} {serve}")
    print("Then open http://127.0.0.1:8000 . The human approval code is printed on the server console.")


if __name__ == "__main__":
    main()
