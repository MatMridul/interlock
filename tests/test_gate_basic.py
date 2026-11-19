"""Import graph, INV-2, INV-4, INV-6, INV-8, INV-11, INV-12 and a liveness check."""
import ast
import os

import pytest

from bank.executor_table import SYMBOLS, STATES, TABLE
from bank.gate import Gate, TOOL_TO_SYMBOL, symbol_for_tool
from conftest import ROOT

# shortest legal prefix reaching each live state
PATH = {"START": [], "AUTHED": ["AUTH"], "DRAFTED": ["AUTH", "DRAFT"], "APPROVED": ["AUTH", "DRAFT", "MFA"]}


def gate_in(state):
    g = Gate(guard=False)
    for s in PATH[state]:
        assert g.run(s, {}, source="human")["verdict"] == "ACCEPT"
    assert g.state == state
    return g


# (a) import graph -----------------------------------------------------------
def _py_files():
    for d, dirs, files in os.walk(ROOT):
        dirs[:] = [x for x in dirs if x not in (".venv", ".git", "__pycache__", ".pytest_cache", "node_modules")]
        for f in files:
            if f.endswith(".py"):
                yield os.path.join(d, f)


def _imports_real_tools(path):
    tree = ast.parse(open(path, encoding="utf-8").read())
    for n in ast.walk(tree):
        if isinstance(n, ast.Import) and any(a.name.split(".")[:2] == ["bank", "real_tools"] for a in n.names):
            return True
        if isinstance(n, ast.ImportFrom):
            mod = n.module or ""
            names = [a.name for a in n.names]
            if mod == "bank.real_tools" or mod.startswith("bank.real_tools."):
                return True
            if mod == "bank" and "real_tools" in names:
                return True
            if n.level and (mod == "real_tools" or (mod == "" and "real_tools" in names)):
                return True
        if isinstance(n, ast.Call) and getattr(n.func, "id", getattr(n.func, "attr", "")) in ("import_module", "__import__"):
            if any(isinstance(a, ast.Constant) and "real_tools" in str(a.value) for a in n.args):
                return True
    return False


def test_only_gate_imports_real_tools():
    offenders = [os.path.relpath(p, ROOT) for p in _py_files() if _imports_real_tools(p)]
    assert offenders == [os.path.join("bank", "gate.py")], offenders


def test_import_detector_detects(tmp_path):
    for src in ("import bank.real_tools", "from bank import real_tools", "from bank.real_tools import x",
                "from . import real_tools", "import importlib; importlib.import_module('bank.real_tools')"):
        p = tmp_path / "x.py"
        p.write_text(src)
        assert _imports_real_tools(str(p)), src
    p.write_text("import bank.gate")
    assert not _imports_real_tools(str(p))


# (b) INV-2 ------------------------------------------------------------------
UNDEFINED = [(s, sym) for s in STATES for sym in SYMBOLS if sym not in TABLE[s]]


def test_there_are_16_undefined_live_cells():
    assert len(UNDEFINED) == 16


@pytest.mark.parametrize("state,symbol", UNDEFINED)
def test_inv2_undefined_cell_rejects_and_is_noop(state, symbol):
    g = gate_in(state)
    before_log = g.effects()
    r = g.run(symbol, {}, source="human")  # human so MFA is rejected by the table, not by the source rule
    assert r["verdict"] == "REJECT"
    assert g.state == state and g.effects() == before_log
    # (d) INV-8: four fields, state = unchanged state, expected = the defined cells
    assert {"verdict", "state", "symbol", "expected_symbols"} <= set(r)
    assert r["state"] == state and r["symbol"] == symbol
    assert r["expected_symbols"] == [s for s in SYMBOLS if s in TABLE[state]]
    ok, info = g.peek(symbol, source="human")
    assert not ok and {"verdict", "state", "symbol", "expected_symbols"} <= set(info)
    assert g.state == state and g.effects() == before_log


class Boom(dict):
    def __getitem__(self, k):
        raise RuntimeError("injected")


def test_inv2_inv12_exception_in_lookup_rejects_nothing_runs():
    g = Gate(table=Boom(), guard=False)
    r = g.run("AUTH", {})
    assert r["verdict"] == "REJECT" and g.state == "START" and g.effects() == ()
    assert {"verdict", "state", "symbol", "expected_symbols"} <= set(r)
    ok, info = g.peek("AUTH")
    assert not ok and info["verdict"] == "REJECT"


def test_inv12_tool_exception_rejects_state_unchanged():
    def bad(args, log):
        raise RuntimeError("tool blew up")
    from bank.gate import DEFAULT_TOOLS
    g = Gate(tools={**DEFAULT_TOOLS, "AUTH": bad}, guard=False)
    r = g.run("AUTH", {})
    assert r["verdict"] == "REJECT" and g.state == "START" and g.effects() == ()


def test_bad_args_reject():
    g = Gate(guard=False)
    for bad in ("x", 5, ["a"]):
        assert g.run("AUTH", bad)["verdict"] == "REJECT"
    assert g.state == "START" and g.effects() == ()


# (c) INV-4 ------------------------------------------------------------------
BAD_SYMBOLS = ["auth", "Auth", "AUTH ", " AUTH", "AUTHH", "AUT", "SINK", "", "add_payee", "execute_transfer",
               "\u0410UTH", "AUT\u041d", "TRANSF\u0415R", "AUTH\u200b", "\uff21UTH", None, 7, b"AUTH", ["AUTH"]]


@pytest.mark.parametrize("sym", BAD_SYMBOLS, ids=repr)
def test_inv4_bad_symbol_rejects(sym):
    g = Gate(guard=False)
    r = g.run(sym, {}, source="human")
    assert r["verdict"] == "REJECT" and g.state == "START" and g.effects() == ()
    assert {"verdict", "state", "symbol", "expected_symbols"} <= set(r)
    assert g.peek(sym, source="human")[0] is False


BAD_TOOLS = ["execute_transfer ", "Execute_transfer", "execut\u0435_transfer", "execute_transfer\u200b", "add_payee",
             "raise_limit", "mfa", "MFA", "record_mfa_human", "", None, 3, "authenticate_user\n"]


@pytest.mark.parametrize("name", BAD_TOOLS, ids=repr)
def test_inv4_unknown_tool_name_has_no_symbol(name):
    assert symbol_for_tool(name) is None


def test_inv4_tool_map_is_closed_and_has_no_mfa():
    assert set(TOOL_TO_SYMBOL.values()) == set(SYMBOLS) - {"MFA"}
    for n, s in TOOL_TO_SYMBOL.items():
        assert symbol_for_tool(n) == s


# (e) INV-11 -----------------------------------------------------------------
@pytest.mark.parametrize("state", list(PATH))
@pytest.mark.parametrize("source", ["llm", "", None, "HUMAN", "human ", "admin", 1])
def test_inv11_mfa_non_human_rejected_everywhere(state, source):
    g = gate_in(state)
    log = g.effects()
    r = g.run("MFA", {}, source=source)
    assert r["verdict"] == "REJECT" and g.state == state and g.effects() == log
    assert "MFA" not in r["expected_symbols"]
    assert g.peek("MFA", source=source)[0] is False


def test_inv11_default_source_is_llm():
    g = gate_in("DRAFTED")
    assert g.run("MFA", {})["verdict"] == "REJECT"


@pytest.mark.parametrize("state", list(PATH))
def test_inv11_mfa_human_accepted_only_in_drafted(state):
    g = gate_in(state)
    r = g.run("MFA", {"code": "123456"}, source="human")
    assert (r["verdict"] == "ACCEPT") == (state == "DRAFTED")
    assert g.state == ("APPROVED" if state == "DRAFTED" else state)


# INV-6 ----------------------------------------------------------------------
def test_inv6_state_written_only_in_commit_and_init():
    tree = ast.parse(open(os.path.join(ROOT, "bank", "gate.py"), encoding="utf-8").read())
    writers = set()
    for fn in ast.walk(tree):
        if isinstance(fn, ast.FunctionDef):
            for n in ast.walk(fn):
                targets = n.targets if isinstance(n, ast.Assign) else [n.target] if isinstance(n, (ast.AugAssign, ast.AnnAssign)) else []
                for t in targets:
                    if isinstance(t, ast.Attribute) and t.attr == "_state":
                        writers.add(fn.name)
    assert writers == {"__init__", "_commit"}, writers


def test_inv6_state_property_is_read_only():
    g = Gate(guard=False)
    with pytest.raises(AttributeError):
        g.state = "APPROVED"
    g.run("DRAFT", {"state": "APPROVED", "_state": "APPROVED"})
    assert g.state == "START"


# peek is read-only ------------------------------------------------------------
def test_peek_changes_nothing():
    g = gate_in("DRAFTED")
    for s in SYMBOLS:
        g.peek(s, "human")
    assert g.state == "DRAFTED" and g.effects() == tuple({"symbol": s, "args": {}, **({"source": "human"} if s == "MFA" else {})} for s in ["AUTH", "DRAFT"])
    assert g.peek("EDIT")[0] is True


# liveness: the happy path really executes (spec 4.7 trace 4) ------------------
def test_happy_path_executes_all_four():
    g = Gate(guard=False)
    for s in ["AUTH", "DRAFT", "MFA", "TRANSFER"]:
        assert g.run(s, {}, source="human")["verdict"] == "ACCEPT"
    assert [e["symbol"] for e in g.effects()] == ["AUTH", "DRAFT", "MFA", "TRANSFER"] and g.state == "AUTHED"
