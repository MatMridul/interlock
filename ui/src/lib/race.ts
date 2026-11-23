export type Arm = "prompt-only" | "interlock";
export interface RaceEvent {
  kind: "setup" | "tool" | "human_mfa" | "user";
  tool?: string;
  args?: Record<string, unknown> | null;
  state_before?: string | null;
  outcome?: "executed" | "blocked";
  text?: string;
}
export interface RaceRun {
  attack_id: string;
  category: string;
  arm: Arm;
  events: RaceEvent[];
  executed_log: { symbol: string; args?: Record<string, unknown> }[];
  violation: boolean;
  rules_fired: Record<string, string>;
  model_calls: number;
  error: string | null;
  assistant_text?: string[];
}
export interface RaceAttack { id: string; category: string; forbidden: string; rules: string[] }
export interface RaceData {
  label: string;
  model: string;
  attacks: RaceAttack[];
  runs: RaceRun[];
  summary?: { arms: Record<Arm, { attacks_run: number; violations: number; errors: number; model_calls: number }> };
}
export interface RaceLive { label: string; model: string; attack: RaceAttack; runs: RaceRun[]; calls_left: number }

const SYM: Record<string, string> = {
  authenticate_user: "AUTH", create_transfer_draft: "DRAFT", edit_transfer_draft: "EDIT",
  execute_transfer: "TRANSFER", cancel_transfer_draft: "CANCEL",
};

export interface Chip { key: string; sym: string; kind: "executed" | "blocked" | "human"; forbidden: boolean; detail: string }

/** The lane strip: one chip per proposed or scripted step, the first `upto` events only. User turns are not chips. */
export function chips(run: RaceRun, upto: number): Chip[] {
  // the forbidden chip is the last executed TRANSFER of a run the checker judged a violation
  let bad = -1;
  if (run.violation) run.events.forEach((e, i) => { if (e.kind === "tool" && SYM[e.tool ?? ""] === "TRANSFER" && e.outcome === "executed") bad = i; });
  const out: Chip[] = [];
  run.events.slice(0, upto).forEach((e, i) => {
    if (e.kind === "user") return;
    if (e.kind === "human_mfa") { out.push({ key: `${i}`, sym: "HUMAN MFA", kind: e.outcome === "executed" ? "human" : "blocked", forbidden: false, detail: "scripted human approval" }); return; }
    const sym = e.kind === "setup" ? (e.tool ?? "?") : (SYM[e.tool ?? ""] ?? e.tool ?? "?");
    const a = e.args && Object.keys(e.args).length ? ` ${JSON.stringify(e.args)}` : "";
    out.push({ key: `${i}`, sym, kind: e.outcome === "blocked" ? "blocked" : "executed", forbidden: i === bad,
      detail: `${e.kind === "setup" ? "setup (no model)" : "model proposed"}${a}${e.state_before && e.state_before.indexOf("n/a") < 0 ? `, state ${e.state_before}` : ""}` });
  });
  return out;
}

/** The text of the last user turn shown so far (the attack message). */
export function userText(run: RaceRun | undefined, upto: number): string {
  if (!run) return "";
  const u = run.events.slice(0, Math.max(upto, 1)).filter((e) => e.kind === "user");
  return u.length ? (u[u.length - 1].text ?? "") : (run.events.find((e) => e.kind === "user")?.text ?? "");
}

export function tally(runs: Record<string, RaceRun | undefined>, played: string[]): { tried: number; forbidden: number } {
  return { tried: played.length, forbidden: played.filter((id) => runs[id]?.violation).length };
}
