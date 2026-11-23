"""Kill switch scripts in dry-run mode: only INTERLOCK_MODEL changes, the other variables are kept, no AWS call."""
import json
import shutil
import subprocess
from pathlib import Path

import pytest

INFRA = Path(__file__).resolve().parent.parent / "infra"
ENV = {"INTERLOCK_MODEL": "bedrock", "DUMMY_A": "value-a", "DUMMY_B": "value-b"}


def _check(out, tmp_path, new):
    assert f"bedrock -> {new}" in out.stdout and "dry run" in out.stdout
    assert "value-a" not in out.stdout and "value-b" not in out.stdout  # values are never printed
    body = json.loads((tmp_path / "out.json").read_text())
    assert body == {"Variables": {**ENV, "INTERLOCK_MODEL": new}}


@pytest.mark.skipif(not shutil.which("pwsh"), reason="PowerShell not installed")
@pytest.mark.parametrize("arg,new", [("off", "off"), ("on", "bedrock")])
def test_ps1_changes_only_the_model_variable(tmp_path, arg, new):
    (tmp_path / "env.json").write_text(json.dumps(ENV))
    out = subprocess.run(["pwsh", "-NoProfile", "-File", str(INFRA / "model_switch.ps1"), arg, "-DryRun",
                          "-EnvFile", str(tmp_path / "env.json"), "-OutFile", str(tmp_path / "out.json")],
                         capture_output=True, text=True, timeout=60)
    assert out.returncode == 0, out.stderr
    _check(out, tmp_path, new)


def test_ps1_refuses_an_empty_environment(tmp_path):
    if not shutil.which("pwsh"):
        pytest.skip("PowerShell not installed")
    (tmp_path / "env.json").write_text("{}")
    out = subprocess.run(["pwsh", "-NoProfile", "-File", str(INFRA / "model_switch.ps1"), "off", "-DryRun",
                          "-EnvFile", str(tmp_path / "env.json")], capture_output=True, text=True, timeout=60)
    assert out.returncode != 0


@pytest.mark.skipif(not (shutil.which("bash") and shutil.which("jq")), reason="bash and jq needed")
@pytest.mark.parametrize("arg,new", [("off", "off"), ("on", "bedrock")])
def test_sh_changes_only_the_model_variable(tmp_path, arg, new):
    (tmp_path / "env.json").write_text(json.dumps(ENV))
    out = subprocess.run(["bash", str(INFRA / "model_switch.sh"), arg, "--dry-run"], capture_output=True, text=True, timeout=60,
                         env={"PATH": __import__("os").environ["PATH"], "ENV_FILE": str(tmp_path / "env.json"),
                              "OUT_FILE": str(tmp_path / "out.json")})
    assert out.returncode == 0, out.stderr
    _check(out, tmp_path, new)
