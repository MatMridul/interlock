#!/usr/bin/env bash
# Build the Lambda zip (build/interlock-lambda.zip). Needs Python 3.12+, Node, no Docker.
# Dependencies are downloaded as arm64 Linux wheels, so any OS can build them.
set -euo pipefail
cd "$(dirname "$0")/.."
PY="${PYTHON:-python3}"
if [ ! -f ui/dist/index.html ] || [ "${1:-}" = "--rebuild-ui" ]; then
  (cd ui && npm ci && npm run build)
fi
rm -rf build/deps
"$PY" -m pip install --quiet --no-deps --target build/deps \
  --platform manylinux2014_aarch64 --platform manylinux_2_17_aarch64 --platform manylinux_2_28_aarch64 \
  --only-binary=:all: --python-version 3.12 --implementation cp -r infra/lambda-requirements.txt
"$PY" infra/build_zip.py --deps-dir build/deps