import type { Policy } from "../types";

export interface WhatIfStep {
  symbol: string;
  from: string;
  to: string;
  ok: boolean;
}

export interface WhatIf {
  error?: string;
  steps: WhatIfStep[];
  accept: boolean;
  /** index of the first symbol with no live transition */
  failedAt?: number;
  finalState: string;
}

const MAX_SYMBOLS = 64;

/** Words ("AUTH draft mfa"), commas/arrows, or one letter string ("ADMT", letters from /policy). */
export function parseSequence(policy: Policy, text: string): { symbols: string[]; error?: string } {
  const toks = text.toUpperCase().split(/[\s,>→-]+/).filter(Boolean);
  const letters = policy.letters ?? {};
  const byLetter: Record<string, string> = {};
  for (const [sym, l] of Object.entries(letters)) byLetter[l.toUpperCase()] = sym;
  const out: string[] = [];
  for (const t of toks) {
    if (policy.symbols.includes(t)) out.push(t);
    else if ([...t].every((c) => byLetter[c])) out.push(...[...t].map((c) => byLetter[c]));
    else return { symbols: [], error: `Unknown symbol "${t.slice(0, 20)}". Use ${policy.symbols.join(", ")}.` };
    if (out.length > MAX_SYMBOLS) return { symbols: [], error: `At most ${MAX_SYMBOLS} symbols.` };
  }
  return { symbols: out };
}

/** Pure, client-side: runs the sequence through the table from /policy. Nothing is sent to the server. */
export function whatIf(policy: Policy, symbols: string[]): WhatIf {
  let q = policy.initial;
  const steps: WhatIfStep[] = [];
  for (let i = 0; i < symbols.length; i++) {
    const n = policy.transitions[q]?.[symbols[i]];
    if (!n || n === "SINK") {
      steps.push({ symbol: symbols[i], from: q, to: "SINK", ok: false });
      return { steps, accept: false, failedAt: i, finalState: "SINK" };
    }
    steps.push({ symbol: symbols[i], from: q, to: n, ok: true });
    q = n;
  }
  return { steps, accept: policy.accepting ? policy.accepting.includes(q) : true, finalState: q };
}