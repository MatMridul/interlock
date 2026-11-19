import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)  # so `import bank` works with plain `pytest` too

import pytest

TEST_MFA_CODE = "135790"  # test-only value; the server has no default code


@pytest.fixture(autouse=True)
def _fixed_demo_mfa_code(monkeypatch):
    monkeypatch.setenv("DEMO_MFA_CODE", TEST_MFA_CODE)
