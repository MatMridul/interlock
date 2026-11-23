import type { Action } from "../state";

/** One animated step: a proposal (or a human approval) and the verdict that decided it. */
export interface Beat {
  id: number;
  kind: "agent" | "human";
  symbol: string; // label on the token: the gate's symbol, or the tool name when the tool is unknown
  verdict: "ACCEPT" | "REJECT";
  from: string; // machine state when the proposal landed
  to: string; // equals `from` for REJECT: a rejected move never changes the state
  reason?: string; // the server's reason, only for REJECT
  latency?: number; // ms, only when the server measured it
  onSpawn: () => void; // token appears (chat proposal chip, Proposed + 1)
  onImpact: () => void; // verdict becomes visible (chat verdict chip, last verdict, live announcement)
  onSettle: () => void; // outcome lands (ACCEPT: state moves, tape cell; REJECT: ghost cell, Blocked + 1)
}

export type QueueItem = { t: "pass"; run: () => void } | { t: "beat"; beat: Beat };

export interface PlayOpts {
  scale: number; // time compression, 1 = normal, < 1 = faster (applied when a backlog builds up)
  reduced: boolean;
}

export interface Player {
  play(beat: Beat, opts: PlayOpts): Promise<void>;
}

/** Backlog above this many waiting items plays at BACKLOG_SCALE: faster, never dropped. */
export const BACKLOG_LIMIT = 3;
export const BACKLOG_SCALE = 0.55;

/**
 * FIFO queue that plays beats one at a time. Pass-through items (chat lines, text, done) are released
 * in order, after the beats queued before them. Nothing is dropped; a backlog only plays faster.
 */
export class Director {
  private q: QueueItem[] = [];
  private running = false;
  private waiters: (() => void)[] = [];
  constructor(private player: () => Player, private reduced: () => boolean = () => false) {}

  get pending() {
    return this.q.length + (this.running ? 1 : 0);
  }

  push(item: QueueItem) {
    this.q.push(item);
    void this.drain();
  }

  /** Resolves when the queue is empty and nothing is playing. */
  idle(): Promise<void> {
    return this.pending === 0 ? Promise.resolve() : new Promise((r) => this.waiters.push(r));
  }

  /** Drop everything that has not played (used when the session is reset). */
  clear() {
    this.q = [];
  }

  private async drain() {
    if (this.running) return;
    this.running = true;
    try {
      while (this.q.length) {
        const it = this.q.shift()!;
        if (it.t === "pass") it.run();
        else {
          const opts: PlayOpts = { scale: this.q.length >= BACKLOG_LIMIT ? BACKLOG_SCALE : 1, reduced: this.reduced() };
          try {
            await this.player().play(it.beat, opts);
          } catch {
            // a drawing failure must never lose the outcome: still release the state changes in order
            it.beat.onSpawn();
            it.beat.onImpact();
            it.beat.onSettle();
          }
        }
      }
    } finally {
      this.running = false;
      const w = this.waiters;
      this.waiters = [];
      w.forEach((r) => r());
    }
  }
}

type Dispatch = (a: Action) => void;

/** Tells the shell (toasts, sound, haptics) when a beat reaches one of its three moments. */
export type BeatObserver = (e: { hook: "spawn" | "impact" | "settle"; beat: Beat }) => void;

const isObj = (d: unknown): d is Record<string, unknown> => typeof d === "object" && d !== null;
const str = (v: unknown) => (typeof v === "string" ? v : undefined);

/** Tool name -> gate symbol, for the token label only. The gate's own verdict symbol always wins. */
const TOOL_SYMBOL: Record<string, string> = {
  authenticate_user: "AUTH",
  create_transfer_draft: "DRAFT",
  edit_transfer_draft: "EDIT",
  execute_transfer: "TRANSFER",
  cancel_transfer_draft: "CANCEL",
};
export const toolLabel = (name: string) => TOOL_SYMBOL[name] ?? name.toUpperCase();

/** Turns the raw SSE stream into queue items. It never invents an event: every beat is a real proposal + verdict. */
export class BeatBuilder {
  private pending: { name: string; action: Action }[] = [];
  private cur: string;
  private nextId = 1;
  private last: { beat: Beat; settled: boolean; state?: Action } | null = null;

  constructor(private director: Director, private dispatch: Dispatch, initial: string, private observe: BeatObserver = () => {}) {
    this.cur = initial;
  }

  reset(initial: string) {
    this.cur = initial;
    this.pending = [];
    this.last = null;
  }

  private pass(a: Action) {
    this.director.push({ t: "pass", run: () => this.dispatch(a) });
  }

  private flushPending() {
    for (const p of this.pending) this.pass(p.action);
    this.pending = [];
  }

  /** Feed one parsed SSE event. */
  handle(name: string, data: unknown) {
    const action: Action = { type: "sse", name, data };
    if (!isObj(data)) return;
    switch (name) {
      case "tool_proposed":
        this.pending.push({ name: str(data.name) ?? "unknown", action });
        return;
      case "gate_verdict": {
        const p = this.pending.shift();
        const accept = data.verdict === "ACCEPT";
        const to = accept ? str(data.state) ?? this.cur : this.cur;
        const symbol = str(data.symbol) ?? toolLabel(p?.name ?? "?");
        const from = this.cur;
        const record: Action = { type: "beat_record", symbol, verdict: accept ? "ACCEPT" : "REJECT", from, to, source: str(data.source), reason: str(data.reason), latency: typeof data.latency_ms === "number" ? data.latency_ms : undefined, kind: "agent" };
        const beat: Beat = {
          id: this.nextId++, kind: "agent", symbol, verdict: accept ? "ACCEPT" : "REJECT", from, to,
          reason: str(data.reason), latency: typeof data.latency_ms === "number" ? data.latency_ms : undefined,
          onSpawn: () => { if (p) this.dispatch(p.action); this.dispatch({ type: "beat_spawn" }); this.observe({ hook: "spawn", beat }); },
          onImpact: () => { this.dispatch(action); this.observe({ hook: "impact", beat }); },
          onSettle: () => {
            const l = this.last;
            if (l && l.beat.id === beat.id) { l.settled = true; if (l.state) this.dispatch(l.state); }
            this.dispatch(record);
            this.observe({ hook: "settle", beat });
          },
        };
        this.cur = to;
        this.last = { beat, settled: false };
        this.director.push({ t: "beat", beat });
        return;
      }
      case "state_change": {
        const l = this.last;
        if (l && !l.settled) l.state = action; // released together with the beat's outcome
        else this.pass(action);
        return;
      }
      case "user_message":
      case "assistant_text":
      case "gate_explain":
      case "error":
      case "done":
        this.flushPending(); // a proposal without a verdict is shown as a chip, never as an animation
        this.pass(action);
        return;
      default:
        return;
    }
  }

  /** The human approval (POST /mfa): the same queue, an amber beat that starts at the airlock. */
  human(verdict: "ACCEPT" | "REJECT", state: string | undefined, reason: string | undefined) {
    const accept = verdict === "ACCEPT";
    const from = this.cur;
    const to = accept ? state ?? this.cur : this.cur;
    const result: Action = { type: "mfa_result", verdict, state, reason };
    const beat: Beat = {
      id: this.nextId++, kind: "human", symbol: "MFA", verdict, from, to, reason,
      onSpawn: () => this.observe({ hook: "spawn", beat }),
      onImpact: () => this.observe({ hook: "impact", beat }),
      onSettle: () => {
        this.dispatch(result);
        this.dispatch({ type: "beat_record", symbol: "MFA", verdict, from, to, reason, kind: "human" });
        this.observe({ hook: "settle", beat });
      },
    };
    this.cur = to;
    this.last = null;
    this.director.push({ t: "beat", beat });
  }
}

