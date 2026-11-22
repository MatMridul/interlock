"""Safe Ship machine verified with the same rigour as the finance machine:
exhaustive check against an independent rule scan, single-cell mutants, generated-table freshness,
and the JFLAP checks (inspect, minimize, equivalence) through third_party/jflap-cli."""
import copy
import importlib.util
import json
import os
import shutil
import subprocess
import sys

import pytest

import sm_safe_ship as x
from conftest import ROOT

DELTA, START, ACCEPTING = x.load_table()
LIVE = [s for s in DELTA if s != "SINK"]
MUTANTS = [(s, ch, t) for s in LIVE for ch in x.LETTERS for t in DELTA if t != DELTA[s][ch]]
JFLAP_CLI = os.path.join(ROOT, "third_party", "jflap-cli", "jflap_cli.py")
JFF = os.path.join(ROOT, "policy", "safe_ship.jff")
# CLEAN and EDITED are language-equivalent in this policy, so these mutants cannot change the language.
EQUIVALENT_MUTANTS = {("CLEAN", "E", "CLEAN"), ("CLEAN", "C", "EDITED"), ("EDITED", "E", "CLEAN"),
                      ("EDITED", "C", "CLEAN"), ("TESTED", "E", "CLEAN")}

_spec = importlib.util.spec_from_file_location("gen_executor_table", os.path.join(ROOT, "scripts", "gen_executor_table.py"))
gen = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(gen)
needs_java = pytest.mark.skipif(shutil.which("java") is None, reason="java not installed")


def test_table_shape():
    assert START == "CLEAN" and ACCEPTING == {"CLEAN", "EDITED", "TESTED"}
    assert set(DELTA) == {"CLEAN", "EDITED", "TESTED", "SINK"}
    assert sum(len(r) for r in DELTA.values()) == 20
    for row in DELTA.values():
        assert set(row) == set(x.LETTERS) and set(row.values()) <= set(DELTA)


def test_exhaustive_up_to_length_8():
    n, mism, accepted, first = x.check_all(DELTA, START, ACCEPTING, 8)
    print(f"\nSAFE_SHIP EXHAUSTIVE total={n} accepted={accepted} mismatches={mism}")
    assert mism == 0, first
    assert n == sum(5 ** k for k in range(9)) == 488_281
    assert accepted == 93_241


def test_mutant_count():
    assert len(MUTANTS) == 45    # 15 live cells x 3 other targets


def test_mutants_all_killed_or_proven_equivalent():
    killed, equivalent, survivors = 0, set(), []
    for s, ch, t in MUTANTS:
        m = copy.deepcopy(DELTA)
        m[s][ch] = t
        if x.check_all(m, START, ACCEPTING, 8, stop_at_first=True)[1]:
            killed += 1
        elif x.equivalent(DELTA, m, START, ACCEPTING):
            equivalent.add((s, ch, t))
        else:
            survivors.append((s, ch, t))
    print(f"\nSAFE_SHIP MUTANTS killed={killed} equivalent={len(equivalent)} survivors={len(survivors)}")
    assert not survivors, f"SURVIVORS (test gap): {survivors}"
    assert equivalent == EQUIVALENT_MUTANTS
    assert killed == 40


def test_generated_file_is_fresh_and_matches_json():
    text = gen.render(policy="safe_ship")
    with open(gen._abs("safe_ship", 2)) as f:
        assert f.read() == text, "regenerating changes safeship/executor_table.py"
    states, initial, accepting, cells = gen.parse_export(gen.export_table_text(gen._abs("safe_ship", 0)), "safe_ship")
    with open(gen._abs("safe_ship", 1)) as f:
        j = json.load(f)
    assert states == j["states"] and initial == j["initial"] and accepting == j["accepting"]
    assert len(cells) == 20
    for s in j["states"]:
        for sym in j["symbols"]:
            assert cells[(s, sym)] == j["transitions"][s][sym], (s, sym)


def test_jff_is_generated_from_json(tmp_path):
    out = tmp_path / "x.jff"
    subprocess.run([sys.executable, os.path.join(ROOT, "scripts", "gen_jff.py"),
                    os.path.join(ROOT, "policy", "safe_ship_table.json"), str(out)], check=True, capture_output=True)
    with open(JFF, encoding="utf-8") as a:
        assert a.read().replace("\r\n", "\n") == out.read_text(encoding="utf-8").replace("\r\n", "\n")


def _jflap(*args):
    r = subprocess.run([sys.executable, JFLAP_CLI, *args], capture_output=True, text=True, check=True)
    return json.loads(r.stdout)


@needs_java
def test_jflap_inspect():
    d = _jflap("inspect", "--json", JFF)
    assert d["isDeterministic"] is True and d["isComplete"] is True
    assert d["alphabet"] == sorted(x.LETTERS) and d["unreachableStates"] == []
    assert len(d["deadStates"]) == 1     # SINK only


@needs_java
def test_jflap_minimize_is_equivalent_and_smaller(tmp_path):
    mini = tmp_path / "min.jff"
    _jflap("fsa", "minimize", "--json", JFF, str(mini))
    assert _jflap("equivalence-check", "--json", JFF, str(mini))["equivalent"] is True
    assert len(_jflap("inspect", "--json", str(mini))["states"]) == 3     # 4 states to 3 (CLEAN and EDITED merge)


@needs_java
def test_jflap_distinguishes_a_real_mutant(tmp_path):
    """EDIT after TEST no longer invalidates: not equivalent, shortest witness TED (also what the rule scan says)."""
    t = json.load(open(os.path.join(ROOT, "policy", "safe_ship_table.json")))
    t["transitions"]["TESTED"]["EDIT"] = "TESTED"
    src, out = tmp_path / "mut.json", tmp_path / "mut.jff"
    src.write_text(json.dumps(t), encoding="utf-8")
    subprocess.run([sys.executable, os.path.join(ROOT, "scripts", "gen_jff.py"), str(src), str(out)], check=True, capture_output=True)
    r = _jflap("equivalence-check", "--json", JFF, str(out))
    assert r["equivalent"] is False and r["shortest_distinguishing_string"] == "TED"
    assert x.rules_verdict("TED") is False
