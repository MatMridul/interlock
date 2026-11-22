import type { Policy } from "../types";

export interface WhyStep {
  from: string;
  symbol: string;
  to: string;
}

export interface Why {
  /** shortest run of allowed moves from `from` to a state where `symbol` is allowed; null = never allowed from here */
  path: WhyStep[] | null;
  sentence: string;
}

/** Symbols only a human can produce. The agent can never take these steps. */
const HUMAN = ["MFA"];

const live = (policy: Policy, from: string, sym: string): string | null => {
  const n = policy.transitions[from]?.[sym];
  return n && n !== "SINK" ? n : null;
};

/** BFS over the table (GET /policy): the shortest allowed path to a state where `symbol` is allowed. */
export function shortestPath(policy: Policy, from: string, symbol: string): WhyStep[] | null {
  if (from === "SINK" || !policy.symbols.includes(symbol)) return null;
  const seen = new Set([from]);
  let frontier: { at: string; steps: WhyStep[] }[] = [{ at: from, steps: [] }];
  while (frontier.length) {
    const next: typeof frontier = [];
    for (const { at, steps } of frontier) {
      if (live(policy, at, symbol)) return steps;
      for (const s of policy.symbols) {
        const to = live(policy, at, s);
        if (to && !seen.has(to)) { seen.add(to); next.push({ at: to, steps: [...steps, { from: at, symbol: s, to }] }); }
      }
    }
    frontier = next;
  }
  return null;
}

/** One plain sentence for a blocked proposal. `reason` is the server's reason, used when the table allows the move (argument guard). */
export function whyBlocked(policy: Policy, from: string, symbol: string, reason?: string): Why {
  if (!policy.symbols.includes(symbol)) return { path: null, sentence: `${symbol} is not a symbol of this machine, so it is never allowed.` };
  const path = shortestPath(policy, from, symbol);
  if (path === null) return { path, sentence: `${symbol} is never allowed from ${from}: no run of allowed moves leads to a state that accepts it.` };
  if (path.length === 0) return { path, sentence: `${symbol} is allowed in ${from} by the table; the gate refused it for another reason${reason ? `: ${reason}` : ""}.` };
  const need = path.map((p) => p.symbol);
  const human = path.some((p) => HUMAN.includes(p.symbol));
  const first = path[0];
  const what = human && path.length === 1
    ? `${from} is open, a human must approve.`
    : `from ${first.from}: ${need.join(", then ")}${human ? " (a human must do the MFA step)" : ""}.`;
  return { path, sentence: `${symbol} needs ${need.join(", ")} first: ${what}` };
}