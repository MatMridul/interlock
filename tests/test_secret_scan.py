import importlib.util
import os

from conftest import ROOT

_spec = importlib.util.spec_from_file_location("secret_scan", os.path.join(ROOT, "scripts", "secret_scan.py"))
ss = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(ss)


def rules_for(tmp_path, text):
    f = tmp_path / "x.txt"
    f.write_text(text)
    return {r for _, _, r in ss.scan(str(f))}


def test_detects_each_rule_without_real_secrets(tmp_path):
    fake_key = "AKIA" + "A" * 16
    fake_arn = "arn:aws:iam::" + "1" * 12 + ":role/x"
    assert rules_for(tmp_path, fake_key) == {"aws-access-key-id"}
    assert rules_for(tmp_path, fake_arn) == {"aws-arn-account-id"}
    assert rules_for(tmp_path, "-----BEGIN RSA PRIVATE KEY-----") == {"private-key"}
    assert rules_for(tmp_path, 'api_key = "abcdefghijklmnop"') == {"generic-secret"}
    assert rules_for(tmp_path, "DEMO_MFA_CODE=123456") == {"demo-mfa-literal"}


def test_clean_and_ignored_lines_pass(tmp_path):
    assert rules_for(tmp_path, "DEMO_MFA_CODE is read from the environment") == set()
    assert rules_for(tmp_path, "DEMO_MFA_CODE=123456  # secret-scan: ignore") == set()
