import type { BeatRecord } from "../state";
import type { LogEntry } from "../types";

/** One JSON object per line. Schema: docs/AUDIT_FORMAT.md. Only fields the server sent are written. */
export function auditLines(sessionId: string, log: LogEntry[], beats: BeatRecord[], exportedAt = new Date()): string {
  const lines: object[] = [{ type: "session", schema: "interlock-audit/1", session_id: sessionId, exported_at: exportedAt.toISOString() }];
  beats.forEach((b, i) => {
    const row: Record<string, unknown> = { type: "verdict", n: i + 1, actor: b.kind === "human" ? "human" : "agent", symbol: b.symbol, verdict: b.verdict, state_before: b.from, state_after: b.to };
    if (b.reason !== undefined) row.reason = b.reason;
    if (b.source !== undefined) row.layer = b.source;
    if (b.latency !== undefined) row.latency_ms = b.latency;
    lines.push(row);
  });
  log.forEach((e, i) => {
    const row: Record<string, unknown> = { type: "executed", n: i + 1, symbol: e.symbol };
    if (e.args !== undefined) row.args = e.args;
    if (e.source !== undefined) row.source = e.source;
    lines.push(row);
  });
  return lines.map((l) => JSON.stringify(l)).join("\n") + "\n";
}