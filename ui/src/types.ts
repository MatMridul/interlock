export interface Policy {
  name: string;
  states: string[];
  symbols: string[];
  initial: string;
  accepting?: string[];
  transitions: Record<string, Record<string, string>>;
}

export interface Verdict {
  verdict: "ACCEPT" | "REJECT";
  state?: string;
  symbol?: string;
  expected_symbols?: string[];
  reason?: string;
  source?: string;
  actor?: string;
  latency_ms?: number;
  engine?: string;
}

export interface Counters {
  transfers: number;
  max_transfers: number;
  consecutive_rejects: number;
  max_consecutive_rejects: number;
  locked: boolean;
  spend_cap: number;
}

export interface LogEntry {
  symbol: string;
  args?: Record<string, unknown>;
  source?: string;
}

export interface StateView {
  id: string;
  state: string;
  executed_log: LogEntry[];
  counters: Counters | null;
}

