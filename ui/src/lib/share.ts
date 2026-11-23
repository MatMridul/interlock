import type { Policy } from "../types";

const PREFIX = "#replay=v1.";
export const MAX_REPLAY = 64;

/** The executed word as letters from /policy, in a URL fragment: it never reaches a server. */
export function encodeReplay(policy: Policy, symbols: string[]): string | null {
  const letters = policy.letters;
  if (!letters || symbols.length === 0 || symbols.length > MAX_REPLAY) return null;
  let s = "";
  for (const sym of symbols) { const l = letters[sym]; if (!l) return null; s += l; }
  return PREFIX + s;
}

/** Validates a fragment against the policy: letters only, bounded length, and every step must be a live transition. */
export function decodeReplay(policy: Policy, fragment: string): { symbols: string[] } | { error: string } {
  if (!fragment.startsWith(PREFIX)) return { error: "Not a replay link." };
  const body = fragment.slice(PREFIX.length);
  if (body.length === 0 || body.length > MAX_REPLAY) return { error: `A replay has 1 to ${MAX_REPLAY} steps.` };
  const bySym: Record<string, string> = {};
  for (const [sym, l] of Object.entries(policy.letters ?? {})) bySym[l] = sym;
  const symbols: string[] = [];
  let q = policy.initial;
  for (const c of body) {
    const sym = bySym[c];
    if (!sym) return { error: "The replay has a symbol this machine does not know." };
    const n = policy.transitions[q]?.[sym];
    if (!n || n === "SINK") return { error: `Step ${symbols.length + 1} (${sym}) is not allowed in ${q}. This is not an executed word.` };
    symbols.push(sym);
    q = n;
  }
  return { symbols };
}

export function states(policy: Policy, symbols: string[]): string[] {
  const out = [policy.initial];
  let q = policy.initial;
  for (const s of symbols) { q = policy.transitions[q]?.[s] ?? q; out.push(q); }
  return out;
}