"""Build the Lambda deployment zip: pinned arm64 dependencies + app code + built UI.

Usage: python infra/build_zip.py [--deps-dir DIR] [--out PATH]
Cross-platform on purpose: zip files made by Windows tools lose Unix permissions, and the Web
Adapter needs run.sh to be executable (mode 755, LF line endings), so this sets them explicitly.
Needs ui/dist to exist (build.ps1 / build.sh build it first).
"""
import argparse
import os
import sys
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
APP_DIRS = ["server", "bank", "agent", "bench", "policy", "ui/dist"]  # ui/dist = the built UI
APP_FILES = ["docs/evidence/safe_ship_live_decisions.jsonl"]  # read by server/policies.py (Safe Ship replay)
SKIP_DIRS = {"__pycache__", ".pytest_cache"}
LIMIT_UNZIPPED = 262144000  # Lambda: 250 MB unzipped, including layers (the Web Adapter layer counts too)
LIMIT_ZIPPED = 52428800     # Lambda: 50 MB zipped when uploaded directly


def files(base: Path, prefix: str = ""):
    for dirpath, dirs, names in os.walk(base):
        dirs[:] = [d for d in dirs if d not in SKIP_DIRS]
        for n in names:
            if n.endswith(".pyc"):
                continue
            p = Path(dirpath) / n
            yield p, (Path(prefix) / p.relative_to(base)).as_posix()


def add(z, path: Path, arc: str, mode: int):
    info = zipfile.ZipInfo(arc, date_time=(2026, 1, 1, 0, 0, 0))  # fixed time: same input, same zip
    info.external_attr = (0o100000 | mode) << 16
    info.compress_type = zipfile.ZIP_DEFLATED
    z.writestr(info, path.read_bytes() if arc != "run.sh" else path.read_bytes().replace(b"\r\n", b"\n"))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--deps-dir", default=str(ROOT / "build" / "deps"))
    ap.add_argument("--out", default=str(ROOT / "build" / "interlock-lambda.zip"))
    a = ap.parse_args()
    deps, out = Path(a.deps_dir), Path(a.out)
    if not (ROOT / "ui" / "dist" / "index.html").is_file():
        sys.exit("ui/dist/index.html is missing: build the UI first (cd ui && npm ci && npm run build)")
    if not deps.is_dir():
        sys.exit(f"{deps} is missing: install the pinned dependencies first (see build.ps1 / build.sh)")
    out.parent.mkdir(parents=True, exist_ok=True)
    total = 0
    with zipfile.ZipFile(out, "w") as z:
        add(z, ROOT / "infra" / "run.sh", "run.sh", 0o755)
        for p, arc in files(deps):
            add(z, p, arc, 0o755 if p.suffix == ".so" or ".so." in p.name else 0o644)
        for d in APP_DIRS:
            for p, arc in files(ROOT / d, d):
                add(z, p, arc, 0o644)
        for f in APP_FILES:
            add(z, ROOT / f, f, 0o644)
        total = sum(i.file_size for i in z.infolist())
    zipped = out.stat().st_size
    print(f"{out}: {zipped / 1e6:.1f} MB zipped, {total / 1e6:.1f} MB unzipped "
          f"(limits: {LIMIT_ZIPPED / 1e6:.0f} MB direct upload, {LIMIT_UNZIPPED / 1e6:.0f} MB unzipped)")
    if total >= LIMIT_UNZIPPED - 30_000_000:  # leave room for the Web Adapter layer
        sys.exit("unzipped size is too close to the Lambda limit")
    if zipped >= LIMIT_ZIPPED:
        sys.exit("zip is over the direct-upload limit; upload through S3 instead")


if __name__ == "__main__":
    main()
