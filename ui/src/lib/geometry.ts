import type { Policy } from "../types";

/** Stage coordinate system (SVG viewBox and canvas share it). */
export const VIEW = { w: 1000, h: 560 };
export const ORB_R = 50;
export const AGENT_PORT: Pt = { x: 956, y: 84 };
export const SINK: Pt = { x: 92, y: 488 };
export const AIRLOCK: Pt = { x: 754, y: 492 };
/** Where the human key panel sits, in stage units. Nothing else (conduit, label, port text) may be drawn inside it. */
export const KEY_ZONE = { x: 770, y: 428, w: 228, h: 126 };

export interface Pt {
  x: number;
  y: number;
}

// Layout positions per state NAME live here; the transitions themselves come from GET /policy.
const LAYOUT: Record<string, Pt> = {
  START: { x: 124, y: 300 },
  AUTHED: { x: 376, y: 300 },
  DRAFTED: { x: 630, y: 300 },
  APPROVED: { x: 872, y: 300 },
  // Safe Ship (second policy): shifted right so the 11-row table at the left never meets a loop label
  CLEAN: { x: 370, y: 300 },
  EDITED: { x: 610, y: 300 },
  TESTED: { x: 860, y: 300 },
};

export function orbPositions(states: string[]): Record<string, Pt> {
  const out: Record<string, Pt> = {};
  let extra = 0;
  for (const s of states) {
    if (s === "SINK") continue;
    // shortcut: unknown states fall back to a row at the bottom, upgrade when the machine grows
    out[s] = LAYOUT[s] ?? { x: 118 + 190 * extra++, y: 440 };
  }
  return out;
}

const sub = (a: Pt, b: Pt): Pt => ({ x: a.x - b.x, y: a.y - b.y });
const len = (a: Pt) => Math.hypot(a.x, a.y);
const norm = (a: Pt): Pt => {
  const l = len(a) || 1;
  return { x: a.x / l, y: a.y / l };
};
const add = (a: Pt, b: Pt, k = 1): Pt => ({ x: a.x + b.x * k, y: a.y + b.y * k });

/** A cubic bezier; every conduit, loop and flight path is one of these. */
export interface Curve {
  p0: Pt;
  c1: Pt;
  c2: Pt;
  p1: Pt;
}

export function cubicAt(c: Curve, t: number): Pt {
  const u = 1 - t;
  const a = u * u * u, b = 3 * u * u * t, d = 3 * u * t * t, e = t * t * t;
  return {
    x: a * c.p0.x + b * c.c1.x + d * c.c2.x + e * c.p1.x,
    y: a * c.p0.y + b * c.c1.y + d * c.c2.y + e * c.p1.y,
  };
}

export const curveD = (c: Curve) =>
  `M${c.p0.x.toFixed(1)} ${c.p0.y.toFixed(1)}C${c.c1.x.toFixed(1)} ${c.c1.y.toFixed(1)} ${c.c2.x.toFixed(1)} ${c.c2.y.toFixed(1)} ${c.p1.x.toFixed(1)} ${c.p1.y.toFixed(1)}`;

function quad(p0: Pt, q: Pt, p1: Pt): Curve {
  return { p0, c1: add(p0, sub(q, p0), 2 / 3), c2: add(p1, sub(q, p1), 2 / 3), p1 };
}

export interface Edge {
  id: string; // "FROM>TO"
  from: string;
  to: string;
  symbols: string[];
  curve: Curve;
  d: string;
  label: Pt;
  loop: boolean;
}

/** Conduits for every non-SINK transition of the policy table, parallel symbols merged. */
export function buildEdges(policy: Policy, pos: Record<string, Pt>): Edge[] {
  const groups = new Map<string, { from: string; to: string; symbols: string[] }>();
  for (const from of policy.states) {
    if (from === "SINK") continue;
    for (const sym of policy.symbols) {
      const to = policy.transitions[from]?.[sym];
      if (!to || to === "SINK") continue;
      const id = `${from}>${to}`;
      const g = groups.get(id) ?? { from, to, symbols: [] };
      g.symbols.push(sym);
      groups.set(id, g);
    }
  }
  const has = (a: string, b: string) => groups.has(`${a}>${b}`);
  const edges: Edge[] = [];
  for (const g of groups.values()) {
    const A = pos[g.from], B = pos[g.to];
    if (!A || !B) continue;
    let curve: Curve, label: Pt;
    if (g.from === g.to) {
      curve = {
        p0: { x: A.x - 20, y: A.y - ORB_R + 2 },
        c1: { x: A.x - 74, y: A.y - ORB_R - 104 },
        c2: { x: A.x + 74, y: A.y - ORB_R - 104 },
        p1: { x: A.x + 20, y: A.y - ORB_R + 2 },
      };
      label = { x: A.x, y: A.y - ORB_R - 92 };
    } else {
      const u = norm(sub(B, A));
      const n = { x: -u.y, y: u.x };
      const dist = len(sub(B, A));
      let bow = 0;
      if (dist > 330) bow = (n.y >= 0 ? 1 : -1) * 105; // long return conduit swings below the row, but stays above the key panel
      else if (has(g.to, g.from)) bow = 34; // antiparallel pair: each bends to its own side
      const mid = add({ x: (A.x + B.x) / 2, y: (A.y + B.y) / 2 }, n, bow * 2);
      const p0 = add(A, norm(sub(mid, A)), ORB_R + 3);
      const p1 = add(B, norm(sub(mid, B)), ORB_R + 6);
      curve = quad(p0, mid, p1);
      const m = cubicAt(curve, 0.5);
      label = add(m, n, bow === 0 ? -14 : Math.sign(bow) * 15);
    }
    edges.push({ id: `${g.from}>${g.to}`, ...g, curve, d: curveD(curve), label, loop: g.from === g.to });
  }
  return edges;
}

export const findEdge = (edges: Edge[], from: string, to: string) => edges.find((e) => e.id === `${from}>${to}`);

/** Where a proposed token stops in front of an orb: on its gate ring, facing the agent port. */
export function gatePoint(orb: Pt): Pt {
  return add(orb, norm(sub(AGENT_PORT, orb)), ORB_R + 20);
}

/** Flight path from the agent port (or the airlock) to a gate point. */
export function flightCurve(start: Pt, gate: Pt): Curve {
  const mid = { x: (start.x + gate.x) / 2, y: (start.y + gate.y) / 2 };
  const d = sub(gate, start);
  const n = norm({ x: -d.y, y: d.x });
  return quad(start, add(mid, n, 70 * (start.y < gate.y ? -1 : 1)), gate);
}

/** Curve that carries the particles of a shattered token into the sink void. */
export function suckCurve(from: Pt): Curve {
  const mid = { x: (from.x + SINK.x) / 2, y: Math.max(from.y, SINK.y) + 60 };
  return quad(from, mid, SINK);
}

/** The delta ledger shown in the margin: every non-SINK row of the table, read from the policy. */
export function ledgerRows(policy: Policy): { key: string; text: string; from: string; symbol: string }[] {
  const rows: { key: string; text: string; from: string; symbol: string }[] = [];
  for (const from of policy.states) {
    if (from === "SINK") continue;
    for (const sym of policy.symbols) {
      const to = policy.transitions[from]?.[sym];
      if (to && to !== "SINK") rows.push({ key: `${from}/${sym}`, from, symbol: sym, text: `δ(${from}, ${sym}) = ${to}` });
    }
  }
  return rows;
}
