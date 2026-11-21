"""M5: gate verdicts equal JFLAP simulate-batch verdicts (INV-3)."""
import itertools
import os
import random
import subprocess
import sys

from bank.executor_table import SYMBOLS
from bank.gate import Gate
from conftest import ROOT

JFLAP_CLI = os.environ.get("JFLAP_CLI", os.path.join(ROOT, "third_party", "jflap-cli", "jflap_cli.py"))
JFF = os.path.join(ROOT, "policy", "finance.jff")
LETTER = {"AUTH": "A", "DRAFT": "D", "EDIT": "E", "MFA": "M", "TRANSFER": "T", "CANCEL": "C"}
BY_LETTER = {v: k for k, v in LETTER.items()}


def gate_verdict(word):
    """Replay a letter string through a fresh gate. Returns (accepted, executed symbols).
    Stops at the first reject: later proposals are not part of the executed prefix."""
    g = Gate(guard=False)
    for ch in word:
        if g.run(BY_LETTER[ch], {}, source="human")["verdict"] == "REJECT":
            return False, [e["symbol"] for e in g.effects()]
    return True, [e["symbol"] for e in g.effects()]


def jflap_batch(words, tmp_path, name):
    f = tmp_path / name
    f.write_text("\n".join(words) + "\n")
    import json
    r = subprocess.run([sys.executable, JFLAP_CLI, "simulate-batch", JFF, "--inputs-file", str(f), "--json"],
                       capture_output=True, text=True, check=True)
    out = json.loads(r.stdout)
    assert out["total"] == len(words)
    return out["verdicts"]


def _compare(words, tmp_path, name):
    jv = jflap_batch(words, tmp_path, name)
    bad = []
    for w, j in zip(words, jv):
        ok, trace = gate_verdict(w)
        # executed prefix must be a prefix of w and itself accepted by JFLAP semantics
        assert "".join(LETTER[s] for s in trace) == w[:len(trace)]
        if ok != j:
            bad.append((w, ok, j))
    return bad


def test_replay_all_strings_up_to_length_6(tmp_path):
    words = ["".join(p) for n in range(1, 7) for p in itertools.product("ADEMTC", repeat=n)]
    assert len(words) == sum(6 ** n for n in range(1, 7))
    bad = _compare(words, tmp_path, "all6.txt")
    print(f"M5 exhaustive: {len(words)} strings (length 1-6), mismatches {len(bad)}")
    assert not bad, bad[:5]


def test_replay_1000_seeded_random_longer(tmp_path):
    rng = random.Random(20261120)
    words = []
    while len(words) < 1000:
        if rng.random() < 0.5:   # uniform
            words.append("".join(rng.choice("ADEMTC") for _ in range(rng.randint(7, 24))))
        else:                    # mostly-legal walk so long accepted strings occur
            from bank.executor_table import TABLE
            g_state, w = "START", []
            for _ in range(rng.randint(7, 24)):
                if rng.random() < 0.9 and TABLE[g_state]:
                    sym = rng.choice(sorted(TABLE[g_state]))
                    g_state = TABLE[g_state][sym]
                else:
                    sym = rng.choice(SYMBOLS)
                    g_state = TABLE.get(g_state, {}).get(sym, g_state)
                w.append(LETTER[sym])
            words.append("".join(w))
    bad = _compare(words, tmp_path, "rand.txt")
    accepted = sum(gate_verdict(w)[0] for w in words)
    print(f"M5 random: {len(words)} strings (length 7-24), accepted {accepted}, mismatches {len(bad)}")
    assert not bad, bad[:5]
    assert 100 < accepted < 900  # both verdicts are exercised
