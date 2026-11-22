# Build the Lambda zip (build/interlock-lambda.zip). Run from anywhere. Needs Python 3.12+, Node, no Docker.
# Dependencies are downloaded as arm64 Linux wheels, so a Windows machine can build them.
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$py = if ($env:PYTHON) { $env:PYTHON } else { "python" }
Set-Location $root
if (-not (Test-Path "ui/dist/index.html") -or $args -contains "-RebuildUi") {
    Push-Location ui; npm ci; npm run build; Pop-Location
}
$deps = Join-Path $root "build/deps"
if (Test-Path $deps) { Remove-Item $deps -Recurse -Force }
& $py -m pip install --quiet --no-deps --target $deps --platform manylinux2014_aarch64 --platform manylinux_2_17_aarch64 --platform manylinux_2_28_aarch64 --only-binary=:all: --python-version 3.12 --implementation cp -r infra/lambda-requirements.txt
if ($LASTEXITCODE) { throw "pip failed" }
& $py infra/build_zip.py --deps-dir $deps
if ($LASTEXITCODE) { throw "zip build failed" }
