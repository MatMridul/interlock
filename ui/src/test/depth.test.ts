import policyRaw from "../../../policy/finance_table.json?raw";
import reportRaw from "../../../docs/reports/VERIFICATION_REPORT.md?raw";
import { describe, expect, it } from "vitest";
import { auditLines } from "../lib/audit";
import { decodeReplay, encodeReplay } from "../lib/share";
import { parseSequence, whatIf } from "../lib/whatif";
import { shortestPath, whyBlocked } from "../lib/why";
import type { Policy } from "../types";

const policy = JSON.parse(policyRaw) as Policy;

// every undefined live cell (16) and its shortest allowed path; null = never allowed from here
const EXPECT: Record<string, Record<string, string[] | null>> = {
  START: { DRAFT: ["AUTH"], EDIT: ["AUTH", "DRAFT"], MFA: ["AUTH", "DRAFT"], TRANSFER: ["AUTH", "DRAFT", "MFA"], CANCEL: ["AUTH", "DRAFT"] },
  AUTHED: { AUTH: null, EDIT: ["DRAFT"], MFA: ["DRAFT"], TRANSFER: ["DRAFT", "MFA"], CANCEL: ["DRAFT"] },
  DRAFTED: { AUTH: null, DRAFT: ["CANCEL"], TRANSFER: ["MFA"] },
  APPROVED: { AUTH: null, DRAFT: ["TRANSFER"], MFA: ["EDIT"] },
};

describe("why blocked (C3)", () => {
  const cells = Object.entries(EXPECT).flatMap(([from, row]) => Object.entries(row).map(([sym, p]) => [from, sym, p] as const));
  it("covers all 16 undefined live cells", () => {
    expect(cells.length).toBe(16);
    const undef = policy.states.filter((s) => s !== "SINK").flatMap((s) => policy.symbols.filter((y) => policy.transitions[s][y] === "SINK").map((y) => `${s}/${y}`));
    expect(undef.sort()).toEqual(cells.map(([f, s]) => `${f}/${s}`).sort());
  });
  it.each(cells)("%s + %s", (from, sym, expected) => {
    const path = shortestPath(policy, from, sym);
    expect(path === null ? null : path.map((p) => p.symbol)).toEqual(expected);
    const w = whyBlocked(policy, from, sym);
    if (expected === null) expect(w.sentence).toContain("never allowed from");
    else {
      expect(w.sentence).toContain(`${sym} needs ${expected.join(", ")} first`);
      // the path is a real walk: each step is a live transition and the last state allows the symbol
      let q = from;
      for (const s of path!) { expect(s.from).toBe(q); expect(policy.transitions[q][s.symbol]).toBe(s.to); q = s.to; }
      expect(policy.transitions[q][sym]).not.toBe("SINK");
    }
  });
  it("gives the plain sentence for TRANSFER in DRAFTED", () => {
    expect(whyBlocked(policy, "DRAFTED", "TRANSFER").sentence).toBe("TRANSFER needs MFA first: DRAFTED is open, a human must approve.");
  });
  it("an allowed cell blocked by a guard has an empty path", () => {
    const w = whyBlocked(policy, "AUTHED", "DRAFT", "amount above spend cap");
    expect(w.path).toEqual([]);
    expect(w.sentence).toContain("amount above spend cap");
  });
});

describe("what if (C4)", () => {
  const report = reportRaw;
  const rows = [...report.matchAll(/^\| (\d+) \| ([A-Z ]+?) \| [ADEMTC]+ \| (ACCEPT|REJECT) \|/gm)];
  it("reads all 21 documented traces", () => expect(rows.length).toBe(21));
  it.each(rows.map((r) => [r[1], r[2], r[3]]))("trace %s: %s", (_n, trace, expected) => {
    const { symbols, error } = parseSequence(policy, trace);
    expect(error).toBeUndefined();
    expect(whatIf(policy, symbols).accept).toBe(expected === "ACCEPT");
  });
  it("accepts letters and reports the first failing step", () => {
    const { symbols } = parseSequence(policy, "ADT");
    expect(symbols).toEqual(["AUTH", "DRAFT", "TRANSFER"]);
    const r = whatIf(policy, symbols);
    expect(r.accept).toBe(false);
    expect(r.failedAt).toBe(2);
    expect(r.steps[2]).toMatchObject({ from: "DRAFTED", symbol: "TRANSFER", ok: false });
  });
  it("rejects unknown symbols and over-long input", () => {
    expect(parseSequence(policy, "AUTH FOO").error).toMatch(/Unknown symbol/);
    expect(parseSequence(policy, "A".repeat(65)).error).toMatch(/At most/);
  });
});

describe("share replay (C5)", () => {
  it("round-trips an executed word", () => {
    const f = encodeReplay(policy, ["AUTH", "DRAFT", "MFA", "TRANSFER"])!;
    expect(f).toBe("#replay=v1.ADMT");
    expect(decodeReplay(policy, f)).toEqual({ symbols: ["AUTH", "DRAFT", "MFA", "TRANSFER"] });
  });
  it.each(["", "#replay=v1.", "#replay=v1.ZZ", "#replay=v1.DT", "#replay=v1.ADT", "#replay=v2.AD", "#replay=v1." + "A".repeat(65), "#replay=v1.<script>"])("rejects %s safely", (f) => {
    expect("error" in decodeReplay(policy, f)).toBe(true);
  });
  it("encodes nothing for an empty log", () => expect(encodeReplay(policy, [])).toBeNull());
});

describe("audit export (C6)", () => {
  it("writes one JSON object per line with only server-sent fields", () => {
    const out = auditLines("sid1", [{ symbol: "AUTH", source: "llm" }], [
      { kind: "agent", symbol: "AUTH", verdict: "ACCEPT", from: "START", to: "AUTHED", source: "gate", latency: 0.1, tapeIndex: 0 },
      { kind: "agent", symbol: "TRANSFER", verdict: "REJECT", from: "AUTHED", to: "AUTHED", reason: "TRANSFER not allowed in AUTHED", tapeIndex: 1 },
    ], new Date("2026-11-22T00:00:00Z"));
    const rows = out.trim().split("\n").map((l) => JSON.parse(l));
    expect(rows[0]).toMatchObject({ type: "session", schema: "interlock-audit/1", session_id: "sid1" });
    expect(rows[1]).toMatchObject({ type: "verdict", n: 1, verdict: "ACCEPT", latency_ms: 0.1, layer: "gate" });
    expect(rows[2]).not.toHaveProperty("latency_ms");
    expect(rows[3]).toEqual({ type: "executed", n: 1, symbol: "AUTH", source: "llm" });
  });
});