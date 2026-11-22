import { Director, BeatBuilder, type Beat, type Player, type PlayOpts } from "../lib/director";
import { buildPhases, Timeline } from "../lib/timeline";
import { describe, expect, it } from "vitest";
import type { Action } from "../state";

const mkPlayer = (log: string[], opts: PlayOpts[] = []): (() => Player) => () => ({
  async play(b: Beat, o: PlayOpts) {
    opts.push(o);
    log.push(`play:${b.symbol}:${b.verdict}`);
    b.onSpawn(); b.onImpact(); b.onSettle();
    await Promise.resolve();
  },
});

function rig(reduced = false) {
  const log: string[] = [], opts: PlayOpts[] = [], actions: Action[] = [];
  const d = new Director(mkPlayer(log, opts), () => reduced);
  const dispatch = (a: Action) => { actions.push(a); log.push(a.type === "sse" ? `sse:${a.name}` : a.type); };
  const b = new BeatBuilder(d, dispatch, "START");
  return { d, b, log, opts, actions };
}

describe("event-to-animation queue", () => {
  it("plays beats in arrival order and releases chat lines after the beats before them", async () => {
    const { d, b, log } = rig();
    b.handle("user_message", { text: "go" });
    b.handle("tool_proposed", { name: "authenticate_user" });
    b.handle("gate_verdict", { verdict: "ACCEPT", symbol: "AUTH", state: "AUTHED" });
    b.handle("state_change", { from: "START", to: "AUTHED" });
    b.handle("tool_proposed", { name: "execute_transfer" });
    b.handle("gate_verdict", { verdict: "REJECT", symbol: "TRANSFER", state: "AUTHED", reason: "no" });
    b.handle("assistant_text", { text: "blocked" });
    b.handle("done", {});
    await d.idle();
    const plays = log.filter((l) => l.startsWith("play:"));
    expect(plays).toEqual(["play:AUTH:ACCEPT", "play:TRANSFER:REJECT"]);
    expect(log.indexOf("sse:assistant_text")).toBeGreaterThan(log.indexOf("play:TRANSFER:REJECT"));
    expect(log.indexOf("sse:done")).toBeGreaterThan(log.indexOf("sse:assistant_text"));
    // state_change is held for the beat's settle, never before the verdict
    expect(log.indexOf("sse:state_change")).toBeGreaterThan(log.indexOf("sse:gate_verdict"));
  });

  it("loses no event under a burst and speeds up a backlog", async () => {
    const { d, b, opts, actions } = rig();
    for (let i = 0; i < 8; i++) {
      b.handle("tool_proposed", { name: "edit_transfer_draft" });
      b.handle("gate_verdict", { verdict: "REJECT", symbol: "EDIT", state: "START", reason: "r" });
    }
    await d.idle();
    expect(opts).toHaveLength(8);
    expect(opts.some((o) => o.scale < 1)).toBe(true);
    expect(actions.filter((a) => a.type === "beat_record")).toHaveLength(8);
    expect(actions.filter((a) => a.type === "sse" && a.name === "gate_verdict")).toHaveLength(8);
  });

  it("a rejected beat never moves the machine state", async () => {
    const { d, b, actions } = rig();
    b.handle("gate_verdict", { verdict: "REJECT", symbol: "TRANSFER", state: "START" });
    await d.idle();
    const rec = actions.find((a) => a.type === "beat_record") as Extract<Action, { type: "beat_record" }>;
    expect(rec.from).toBe("START");
    expect(rec.to).toBe("START");
  });

  it("passes the reduced flag to the player and uses the short highlight timeline", async () => {
    const { d, b, opts } = rig(true);
    b.handle("gate_verdict", { verdict: "ACCEPT", symbol: "AUTH", state: "AUTHED" });
    await d.idle();
    expect(opts[0].reduced).toBe(true);
    const reduced = buildPhases("agent", "REJECT", true);
    expect(reduced.map((p) => p.name)).toEqual(["highlight", "fade"]);
    expect(reduced[0].hooks).toEqual(["spawn", "impact", "settle"]);
    expect(new Timeline(reduced).total).toBeLessThan(500);
  });

  it("a failing player still releases the outcome", async () => {
    const actions: Action[] = [];
    const d = new Director(() => ({ play: () => Promise.reject(new Error("draw")) }));
    const b = new BeatBuilder(d, (a) => actions.push(a), "START");
    b.handle("gate_verdict", { verdict: "REJECT", symbol: "EDIT", state: "START" });
    await d.idle();
    expect(actions.some((a) => a.type === "beat_record")).toBe(true);
  });
});

describe("timeline", () => {
  it("fires each hook once, in order, even when frames are skipped", () => {
    const tl = new Timeline(buildPhases("agent", "REJECT", false));
    const hooks: string[] = [];
    for (const t of [0, 5000]) tl.step(t).entered.forEach((p) => p.hooks?.forEach((h) => hooks.push(h)));
    expect(hooks).toEqual(["spawn", "impact", "settle"]);
  });
});
