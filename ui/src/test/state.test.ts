import { describe, expect, it } from "vitest";
import { MAX_ITEMS, initialUi, reducer, type Action, type UiState } from "../state";

const sse = (name: string, data: unknown): Action => ({ type: "sse", name, data });
const run = (actions: Action[], s: UiState = initialUi()) => actions.reduce(reducer, s);

describe("reducer", () => {
  it("turns a rejected proposal into chips, a flash and a verdict, without moving the state", () => {
    const s = run([
      sse("user_message", { text: "wire it" }),
      sse("tool_proposed", { name: "execute_transfer", args: {} }),
      sse("gate_verdict", { verdict: "REJECT", state: "START", symbol: "TRANSFER", expected_symbols: ["AUTH"], reason: "TRANSFER not allowed in START", source: "hook" }),
      sse("done", { state: "START" }),
    ]);
    expect(s.items.map((i) => i.kind)).toEqual(["user", "proposed", "verdict"]);
    expect(s.machineState).toBe("START");
    expect(s.running).toBe(false);
    expect(s.lastVerdict?.reason).toBe("TRANSFER not allowed in START");
  });

  it("an accepted verdict is recorded, then state_change moves the state", () => {
    const s = run([
      sse("gate_verdict", { verdict: "ACCEPT", state: "AUTHED", symbol: "AUTH", source: "gate", latency_ms: 0.04, engine: "executor-table" }),
      sse("state_change", { from: "START", to: "AUTHED" }),
    ]);
    expect(s.lastVerdict).toMatchObject({ verdict: "ACCEPT", symbol: "AUTH" });
    expect(s.machineState).toBe("AUTHED");
  });

  it("INV-10: latency and engine are shown only when the server sent them", () => {
    const without = run([sse("gate_verdict", { verdict: "REJECT", symbol: "DRAFT", reason: "r", source: "hook" })]);
    expect(without.lastVerdict).not.toHaveProperty("latency_ms");
    expect(without.lastVerdict).not.toHaveProperty("engine");
    const withIt = run([sse("gate_verdict", { verdict: "ACCEPT", symbol: "AUTH", latency_ms: 0.5, engine: "executor-table" })]);
    expect(withIt.lastVerdict).toMatchObject({ latency_ms: 0.5, engine: "executor-table" });
  });

  it("keeps model text as plain data and ignores unknown or malformed events", () => {
    const s = run([sse("assistant_text", { text: "<img src=x onerror=alert(1)>" }), sse("weird", { a: 1 }), sse("assistant_text", 5)]);
    expect(s.items).toHaveLength(1);
    expect(s.items[0]).toMatchObject({ kind: "assistant", text: "<img src=x onerror=alert(1)>" });
  });

  it("caps the number of chat items", () => {
    const acts = Array.from({ length: MAX_ITEMS + 50 }, (_, i) => sse("assistant_text", { text: String(i) }));
    const s = run(acts);
    expect(s.items).toHaveLength(MAX_ITEMS);
    expect(s.items[s.items.length - 1]).toMatchObject({ text: String(MAX_ITEMS + 49) });
  });

  it("state_loaded takes log, counters and state from the server", () => {
    const counters = { transfers: 1, max_transfers: 3, consecutive_rejects: 0, max_consecutive_rejects: 5, locked: false, spend_cap: 5000 };
    const s = run([{ type: "state_loaded", view: { id: "x", state: "AUTHED", executed_log: [{ symbol: "AUTH", args: {} }], counters } }]);
    expect(s.machineState).toBe("AUTHED");
    expect(s.log).toHaveLength(1);
    expect(s.counters?.transfers).toBe(1);
  });

  it("MFA result: accept moves the state, reject leaves it", () => {
    const base = run([{ type: "state_loaded", view: { id: "x", state: "DRAFTED", executed_log: [], counters: null } }]);
    const ok = reducer(base, { type: "mfa_result", verdict: "ACCEPT", state: "APPROVED" });
    expect(ok.machineState).toBe("APPROVED");
    expect(ok.lastVerdict).toMatchObject({ verdict: "ACCEPT", symbol: "MFA", source: "human" });
    const bad = reducer(base, { type: "mfa_result", verdict: "REJECT", reason: "wrong code" });
    expect(bad.machineState).toBe("DRAFTED");
    expect(bad.lastVerdict).toMatchObject({ verdict: "REJECT", reason: "wrong code" });
  });

  it("reset clears everything", () => {
    const s = run([sse("assistant_text", { text: "x" }), { type: "reset", initial: "START" }]);
    expect(s.items).toHaveLength(0);
  });
});
