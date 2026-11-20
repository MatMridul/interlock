import type { Counters, LogEntry, StateView, Verdict } from "./types";

export const MAX_ITEMS = 200; // chat items kept in memory/rendered
export const MAX_LOG = 100; // executed-log rows rendered

export type ChatItem =
  | { id: number; kind: "user"; text: string }
  | { id: number; kind: "assistant"; text: string }
  | { id: number; kind: "proposed"; name: string }
  | { id: number; kind: "verdict"; v: Verdict }
  | { id: number; kind: "error"; text: string };

export interface BeatRecord {
  kind: "agent" | "human";
  symbol: string;
  verdict: "ACCEPT" | "REJECT";
  from: string;
  to: string;
  source?: string;
  reason?: string;
  latency?: number; // only when the server measured it (INV-10)
  tapeIndex: number; // number of executed cells already on the tape when this beat landed
}

export interface UiState {
  nextId: number;
  items: ChatItem[];
  machineState: string;
  running: boolean;
  /** last gate verdict exactly as the server sent it (INV-10: no fields are invented) */
  lastVerdict: Verdict | null;
  /** agent proposals whose token has been released (Proposed counter) */
  proposed: number;
  /** every beat that has landed, in order: the tape is the ACCEPTs, the ghosts are the REJECTs */
  beats: BeatRecord[];
  log: LogEntry[];
  counters: Counters | null;
  notice: string | null; // connection/session/409 message
}

export const initialUi = (initial = "START"): UiState => ({
  nextId: 1,
  items: [],
  machineState: initial,
  running: false,
  lastVerdict: null,
  proposed: 0,
  beats: [],
  log: [],
  counters: null,
  notice: null,
});

export type Action =
  | { type: "send_start" }
  | { type: "send_end" }
  | { type: "notice"; text: string | null }
  | { type: "sse"; name: string; data: unknown }
  | { type: "state_loaded"; view: StateView }
  | { type: "mfa_result"; verdict: string; state?: string; reason?: string }
  | { type: "reset"; initial: string }
  | { type: "beat_spawn" }
  | ({ type: "beat_record" } & Omit<BeatRecord, "tapeIndex">);

type NewItem = ChatItem extends infer T ? (T extends { id: number } ? Omit<T, "id"> : never) : never;

function push(s: UiState, item: NewItem): UiState {
  const items = [...s.items, { ...item, id: s.nextId } as ChatItem];
  return { ...s, nextId: s.nextId + 1, items: items.slice(-MAX_ITEMS) };
}

const isObj = (d: unknown): d is Record<string, unknown> => typeof d === "object" && d !== null;
const str = (v: unknown) => (typeof v === "string" ? v : undefined);

export function reducer(s: UiState, a: Action): UiState {
  switch (a.type) {
    case "send_start":
      return { ...s, running: true, notice: null };
    case "send_end":
      return { ...s, running: false };
    case "notice":
      return { ...s, notice: a.text };
    case "reset":
      return initialUi(a.initial);
    case "state_loaded":
      // the server's view is the source of truth for the log, counters and current state
      return { ...s, machineState: a.view.state, log: a.view.executed_log, counters: a.view.counters };
    case "beat_spawn":
      return { ...s, proposed: s.proposed + 1 };
    case "beat_record": {
      const { type: _t, ...r } = a;
      const tapeIndex = s.beats.filter((b) => b.verdict === "ACCEPT").length;
      return { ...s, beats: [...s.beats, { ...r, tapeIndex }] }; // shortcut: unbounded; a session locks after 5 rejects and 3 transfers
    }
    case "mfa_result": {
      const v: Verdict = { verdict: a.verdict === "ACCEPT" ? "ACCEPT" : "REJECT", symbol: "MFA", state: a.state, reason: a.reason, source: "human" };
      return v.verdict === "ACCEPT" ? { ...s, lastVerdict: v, machineState: a.state ?? s.machineState } : { ...s, lastVerdict: v };
    }
    case "sse":
      return onSse(s, a.name, a.data);
  }
}

function onSse(s: UiState, name: string, d: unknown): UiState {
  if (!isObj(d)) return s;
  switch (name) {
    case "user_message":
      return push(s, { kind: "user", text: str(d.text) ?? "" });
    case "assistant_text":
      return push(s, { kind: "assistant", text: str(d.text) ?? "" });
    case "tool_proposed":
      return push(s, { kind: "proposed", name: str(d.name) ?? "unknown" });
    case "error":
      return push(s, { kind: "error", text: str(d.message) ?? "error" });
    case "gate_verdict": {
      // copy only the fields the server defines; absent stays absent
      const v: Verdict = { verdict: d.verdict === "ACCEPT" ? "ACCEPT" : "REJECT" };
      for (const k of ["state", "symbol", "reason", "source", "actor", "engine"] as const) {
        const x = str(d[k]);
        if (x !== undefined) v[k] = x;
      }
      if (Array.isArray(d.expected_symbols)) v.expected_symbols = d.expected_symbols.filter((x) => typeof x === "string");
      if (typeof d.latency_ms === "number") v.latency_ms = d.latency_ms;
      return push({ ...s, lastVerdict: v }, { kind: "verdict", v });
    }
    case "state_change":
      return { ...s, machineState: str(d.to) ?? s.machineState };
    case "done":
      return { ...s, machineState: str(d.state) ?? s.machineState, running: false };
    default:
      return s;
  }
}


