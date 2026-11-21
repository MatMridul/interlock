import { describe, expect, it } from "vitest";
import { replayLog, scoreboard, unexplainedEffects } from "../lib/score";
import type { BeatRecord } from "../state";
import type { Policy } from "../types";

const rec = (symbol: string, verdict: "ACCEPT" | "REJECT", kind: "agent" | "human" = "agent"): BeatRecord => ({ kind, symbol, verdict, from: "A", to: "A", tapeIndex: 0 });

describe("scoreboard", () => {
  it("side effects from blocked is 0 when every executed entry was allowed", () => {
    const beats = [rec("AUTH", "ACCEPT"), rec("TRANSFER", "REJECT"), rec("DRAFT", "ACCEPT")];
    const s = scoreboard(beats, 3, [{ symbol: "AUTH" }, { symbol: "DRAFT" }]);
    expect(s).toMatchObject({ proposed: 3, allowed: 2, blocked: 1, sideEffects: 0 });
  });
  it("counts an executed entry no ACCEPT explains, so a leak would show", () => {
    expect(unexplainedEffects(["AUTH"], ["AUTH", "TRANSFER"])).toBe(1);
    const s = scoreboard([rec("AUTH", "ACCEPT"), rec("TRANSFER", "REJECT")], 2, [{ symbol: "AUTH" }, { symbol: "TRANSFER" }]);
    expect(s.sideEffects).toBe(1);
  });
  it("counts human approvals separately and uses them to explain log entries", () => {
    const s = scoreboard([rec("MFA", "ACCEPT", "human")], 0, [{ symbol: "MFA" }]);
    expect(s).toMatchObject({ allowed: 0, human: 1, sideEffects: 0 });
  });
});

const policy: Policy = { name: "t", states: ["START", "AUTHED", "SINK"], symbols: ["AUTH", "X"], initial: "START", accepting: ["AUTHED"], transitions: { START: { AUTH: "AUTHED", X: "SINK" }, AUTHED: { AUTH: "SINK", X: "SINK" } } };

describe("replayLog", () => {
  it("accepts a word of L(M) and rejects one that hits the sink", () => {
    expect(replayLog(policy, ["AUTH"])).toEqual({ inLanguage: true, state: "AUTHED" });
    expect(replayLog(policy, ["X"])).toMatchObject({ inLanguage: false, failedAt: 0 });
  });
});
