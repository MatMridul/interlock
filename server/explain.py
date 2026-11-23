"""The 'gate says' line for a rejected proposal, built only from the rejection fields and the policy table.

No model text goes in. The shortest-path search is a port of ui/src/lib/why.ts (shortestPath/whyBlocked),
so the console and the server agree. Pure functions: nothing here touches a gate or a session.
"""
from bank.executor_table import SYMBOLS, TABLE

HUMAN = ("MFA",)  # steps only the human can take; the agent has no tool for them


def shortest_path(table, symbols, state, symbol):
    """Shortest list of symbols that leads from `state` to a state where `symbol` is allowed.
    [] = already allowed by the table; None = never allowed from here (or unknown state/symbol)."""
    if state not in table or symbol not in symbols:
        return None
    seen = {state}
    frontier = [(state, [])]
    while frontier:
        nxt = []
        for at, steps in frontier:
            if symbol in table[at]:
                return steps
            for s in symbols:
                to = table[at].get(s)
                if to is not None and to not in seen:
                    seen.add(to)
                    nxt.append((to, steps + [s]))
        frontier = nxt
    return None


def _steps_text(steps):
    names = [("a human approval (MFA)" if s in HUMAN else s) for s in steps]
    return ", then ".join(names)


def explain(info, table=TABLE, symbols=SYMBOLS):
    """One plain sentence for a REJECT dict {state, symbol, expected_symbols, reason}; None for anything else."""
    if not isinstance(info, dict) or info.get("verdict") != "REJECT":
        return None
    state, symbol, reason = info.get("state"), info.get("symbol"), info.get("reason")
    allowed = [s for s in (info.get("expected_symbols") or []) if isinstance(s, str)]
    tail = f" Allowed now: {', '.join(allowed)}." if allowed else ""
    if reason == "session locked":
        return "Gate: this session is locked after repeated rejected proposals; nothing more is allowed."
    if symbol is None:  # a hook refusal with no symbol (unknown tool name, checker error)
        return f"Gate: the proposal was refused: {reason}."
    if not isinstance(symbol, str) or symbol not in symbols:
        return f"Gate: {symbol} is not a symbol of this machine, so it is never allowed.{tail}"
    path = shortest_path(table, symbols, state, symbol)
    if path is None:
        return f"Gate: {symbol} is never allowed from {state}: no run of allowed moves leads to a state that accepts it.{tail}"
    if not path:
        return f"Gate: {symbol} is allowed in {state} by the table, but it was refused: {reason}."
    human = any(s in HUMAN for s in path)
    who = " The human gives the approval with the human key; the agent cannot." if human else ""
    return f"Gate: {symbol} is not allowed in {state}. It needs {_steps_text(path)} first.{who}{tail}"
