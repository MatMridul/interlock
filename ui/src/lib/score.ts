import type { BeatRecord } from "../state";
import type { LogEntry, Policy } from "../types";

export interface Score {
  proposed: number;
  allowed: number;
  blocked: number;
  human: number;
  sideEffects: number;
}

/**
 * Executed-log entries that no ACCEPT verdict explains. `accepted` is the symbols of every ACCEPT in
 * order (agent and human); `executed` is the server's executed log. We walk the log and match it
 * against the accepted sequence in order: an entry that matches nothing is an effect with no
 * allowing verdict, i.e. something a blocked proposal (or nothing at all) caused. It is 0 exactly
 * when every executed entry was allowed. It reads the real log, so it can be non-zero.
 */
export function unexplainedEffects(accepted: string[], executed: string[]): number {
  let i = 0, extra = 0;
  for (const sym of executed) {
    if (i < accepted.length && accepted[i] === sym) i++;
    else extra++;
  }
  return extra;
}

export function scoreboard(beats: BeatRecord[], proposed: number, log: LogEntry[]): Score {
  const agent = beats.filter((b) => b.kind === "agent");
  const accepted = beats.filter((b) => b.verdict === "ACCEPT").map((b) => b.symbol);
  return {
    proposed,
    allowed: agent.filter((b) => b.verdict === "ACCEPT").length,
    blocked: agent.filter((b) => b.verdict === "REJECT").length,
    human: beats.filter((b) => b.kind === "human" && b.verdict === "ACCEPT").length,
    sideEffects: unexplainedEffects(accepted, log.map((e) => e.symbol)),
  };
}

export interface Replay {
  inLanguage: boolean;
  state: string;
  failedAt?: number; // index of the first symbol with no live transition
}

/** Run the server's executed log through the /policy table: is it a word of L(M)? */
export function replayLog(policy: Policy, symbols: string[]): Replay {
  let q = policy.initial;
  for (let i = 0; i < symbols.length; i++) {
    const next = policy.transitions[q]?.[symbols[i]];
    if (!next || next === "SINK") return { inLanguage: false, state: "SINK", failedAt: i };
    q = next;
  }
  const accepting = (policy as Policy & { accepting?: string[] }).accepting;
  return { inLanguage: accepting ? accepting.includes(q) : true, state: q };
}
