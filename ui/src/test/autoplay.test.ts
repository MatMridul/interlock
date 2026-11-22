import policyRaw from "../../../policy/finance_table.json?raw";
import { describe, expect, it } from "vitest";
import { runAutoplay, SCRIPTED_STEPS, type AutoDeps } from "../lib/autoplay";

const TABLE = JSON.parse(policyRaw) as { initial: string; transitions: Record<string, Record<string, string>> };
const SYM: Record<string, string> = { authenticate_user: "AUTH", create_transfer_draft: "DRAFT", edit_transfer_draft: "EDIT", execute_transfer: "TRANSFER", cancel_transfer_draft: "CANCEL" };

/** A stand-in for the server: the same table the gate uses. The only way to MFA is human(). */
function harness(opts: { human: "approved" | "skipped" | "stopped"; stopAfter?: number }) {
  let state = TABLE.initial;
  let stopped = false;
  const log: string[] = [];
  const verdicts: { label: string; tool: string; ok: boolean }[] = [];
  let label = "";
  const step = (sym: string) => {
    const to = TABLE.transitions[state][sym];
    const ok = to !== undefined && to !== "SINK";
    if (ok) state = to;
    return ok;
  };
  const d: AutoDeps = {
    chat: async () => { throw new Error("the no-model sequence sends no chat"); },
    propose: async (actions) => { for (const a of actions) verdicts.push({ label, tool: a.tool, ok: step(SYM[a.tool]) }); },
    human: async () => { log.push("human"); if (opts.human === "approved") step("MFA"); return opts.human; },
    sleep: async () => {},
    onStep: (i, _n, l) => { label = l; log.push(`step ${i}`); if (opts.stopAfter !== undefined && i >= opts.stopAfter) stopped = true; },
    isStopped: () => stopped,
  };
  return { d, log, verdicts, state: () => state };
}

describe("scripted autoplay (no model)", () => {
  it("runs in the planned order: legit transfer, human key, three attacks, final state", () => {
    expect(SCRIPTED_STEPS.map((s) => s.kind)).toEqual(["propose", "propose", "human", "propose", "propose", "propose", "human", "propose", "final"]);
    expect(SCRIPTED_STEPS.map((s) => s.label.split(":")[0])).toEqual(["a legitimate request", "a legitimate request", "the human turns the key (only a person can)", "a legitimate request", "attack", "attack", "the human approves the new draft", "attack", "final state"]);
  });
  it("no step bypasses the gate: only the five agent tools are proposed, never MFA, and no step carries a code", () => {
    const tools = SCRIPTED_STEPS.flatMap((s) => (s.kind === "propose" ? s.actions.map((a) => a.tool) : []));
    expect(tools.length).toBeGreaterThan(0);
    for (const t of tools) expect(Object.keys(SYM)).toContain(t);
    expect(tools.some((t) => /mfa/i.test(t))).toBe(false);
    for (const s of SCRIPTED_STEPS) expect(JSON.stringify(s)).not.toMatch(/code|mfa_tool|\b\d{6}\b/i);
  });
  it("with the human key turned: the legit transfer runs and every attack is blocked by the real table", async () => {
    const h = harness({ human: "approved" });
    const r = await runAutoplay(SCRIPTED_STEPS, h.d);
    expect(r.completed).toBe(true);
    const by = (p: string) => h.verdicts.filter((v) => v.label.startsWith(p));
    expect(by("a legitimate").map((v) => v.ok)).toEqual([true, true, true]);
    expect(by("attack: double spend").map((v) => v.ok)).toEqual([false]);
    expect(by("attack: skip the MFA").map((v) => v.ok)).toEqual([true, false]); // the draft is fine, the transfer is not
    expect(by("attack: edit").map((v) => v.ok)).toEqual([true, false]); // the edit is allowed, and it drops the approval
    expect(h.log.filter((x) => x === "human")).toHaveLength(2);
  });
  it("with the human step skipped: nobody approves, so the transfer is refused", async () => {
    const h = harness({ human: "skipped" });
    const r = await runAutoplay(SCRIPTED_STEPS, h.d);
    expect(r.completed).toBe(true);
    const exec = h.verdicts.filter((v) => v.label.startsWith("a legitimate request: execute"));
    expect(exec.map((v) => v.ok)).toEqual([false]);
    expect(h.verdicts.filter((v) => v.tool === "execute_transfer").every((v) => !v.ok)).toBe(true);
  });
  it("stops at once when cancelled at the human step or by the owner", async () => {
    const a = harness({ human: "stopped" });
    expect(await runAutoplay(SCRIPTED_STEPS, a.d)).toMatchObject({ completed: false, stoppedAt: 2 });
    const b = harness({ human: "approved", stopAfter: 1 });
    const r = await runAutoplay(SCRIPTED_STEPS, b.d);
    expect(r.completed).toBe(false);
    expect(b.verdicts).toHaveLength(1); // step 1 never ran
  });
});