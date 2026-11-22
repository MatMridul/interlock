"""Generated table: fresh, equal to the JSON source, equal to JFLAP export (cell by cell)."""
import importlib.util
import json
import os

import pytest

from conftest import ROOT

_spec = importlib.util.spec_from_file_location("gen_executor_table", os.path.join(ROOT, "scripts", "gen_executor_table.py"))
gen = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(gen)


@pytest.fixture(scope="module")
def export_text():
    return gen.export_table_text()


def test_generated_file_is_fresh(export_text):
    with open(gen.OUT) as f:  # text mode: tolerate CRLF checkouts
        on_disk = f.read()
    assert on_disk.startswith("# GENERATED, DO NOT EDIT."), "header missing"
    assert gen.render(export_text) == on_disk, "regenerating changes bank/executor_table.py"


def test_json_table_equals_jflap_export_cell_by_cell(export_text):
    states, initial, accepting, cells = gen.parse_export(export_text)
    with open(os.path.join(ROOT, "policy", "finance_table.json")) as f:
        j = json.load(f)
    assert states == j["states"] and initial == j["initial"] and accepting == j["accepting"]
    assert len(cells) == 30
    for s in j["states"]:
        for sym in j["symbols"]:
            assert cells[(s, sym)] == j["transitions"][s][sym], (s, sym)


def test_executor_table_equals_json_live_cells():
    from bank.executor_table import TABLE, INITIAL
    with open(os.path.join(ROOT, "policy", "finance_table.json")) as f:
        j = json.load(f)
    assert INITIAL == j["initial"]
    for s in j["states"]:
        if s == "SINK":
            assert s not in TABLE
            continue
        expect = {sym: t for sym, t in j["transitions"][s].items() if t != "SINK"}
        assert TABLE[s] == expect, s
