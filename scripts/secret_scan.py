"""Repository secret scan. Standard library only, no licence key, no network.

    python scripts/secret_scan.py          # scans git-tracked text files, exit 1 on any finding

Rules (regexes, each documented here):
  aws-access-key-id   AKIA/ASIA followed by 16 upper-case letters or digits
  aws-arn-account-id  an ARN that carries a 12-digit AWS account id
  private-key         a PEM private key header
  github-token        ghp_/gho_/ghu_/ghs_/ghr_ followed by 36+ token characters
  slack-token         xox[abprs]- tokens
  generic-secret      secret/password/token/api key assigned a quoted literal of 12+ characters
  demo-mfa-literal    DEMO_MFA_CODE (or MFA code) assigned a literal digit string of 4+ digits
Findings print as file:line:rule only, never the matched text, so the log cannot leak a secret.
Test files may use fake values for demo-mfa-literal and generic-secret (see ALLOW_IN_TESTS).
Suppress one line with the marker `secret-scan: ignore` on it.
"""
import re
import subprocess
import sys

RULES = {
    "aws-access-key-id": re.compile(r"\b(?:AKIA|ASIA)[0-9A-Z]{16}\b"),
    "aws-arn-account-id": re.compile(r"arn:aws[a-z-]*:[a-z0-9-]+:[a-z0-9-]*:\d{12}:"),
    "private-key": re.compile(r"-----BEGIN (?:[A-Z]+ )?PRIVATE KEY-----"),
    "github-token": re.compile(r"\bgh[pousr]_[A-Za-z0-9]{36,}\b"),
    "slack-token": re.compile(r"\bxox[abprs]-[A-Za-z0-9-]{10,}"),
    "generic-secret": re.compile(r"(?i)(?:secret|passw(?:or)?d|token|api[_-]?key)\w*\s*[:=]\s*['\"][^'\"\s]{12,}['\"]"),
    "demo-mfa-literal": re.compile(r"(?i)(?:DEMO_MFA_CODE|MFA_CODE)\w*\s*[:=]\s*['\"]?\d{4,}"),
}
ALLOW_IN_TESTS = {"generic-secret", "demo-mfa-literal"}
SKIP_SUFFIX = (".png", ".jpg", ".jpeg", ".gif", ".woff2", ".woff", ".jar", ".zip", ".pdf", ".ico", ".lock")
SKIP_NAMES = ("package-lock.json",)  # integrity hashes look like secrets


def tracked_files():
    out = subprocess.run(["git", "ls-files", "-z"], capture_output=True, check=True).stdout
    return [f for f in out.decode("utf-8").split("\0") if f]


def scan(path):
    if path.lower().endswith(SKIP_SUFFIX) or path.rsplit("/", 1)[-1] in SKIP_NAMES:
        return []
    try:
        with open(path, "rb") as f:
            data = f.read()
    except OSError:
        return []
    if b"\0" in data:
        return []
    is_test = path.startswith("tests/") or "/test/" in path or path.endswith((".test.ts", ".test.tsx"))
    found = []
    for n, line in enumerate(data.decode("utf-8", "replace").splitlines(), 1):
        if "secret-scan: ignore" in line:
            continue
        for rule, rx in RULES.items():
            if rx.search(line) and not (is_test and rule in ALLOW_IN_TESTS):
                found.append((path, n, rule))
    return found


def main():
    findings = [x for p in tracked_files() for x in scan(p)]
    for path, n, rule in findings:
        print(f"{path}:{n}: {rule}")
    print(f"secret scan: {len(findings)} finding(s)")
    return 1 if findings else 0


if __name__ == "__main__":
    sys.exit(main())
