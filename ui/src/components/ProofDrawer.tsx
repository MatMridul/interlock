import { useEffect, useRef } from "react";
import { MAX_LOG } from "../state";
import type { Counters, LogEntry, Verdict } from "../types";

export const INVARIANTS: { id: string; text: string; where: string }[] = [
  { id: "INV-1", text: "Every executed action sequence is a word of the machine's language.", where: "EXECUTOR_REPORT.md" },
  { id: "INV-2", text: "A move with no defined transition is rejected and nothing changes.", where: "EXECUTOR_REPORT.md" },
  { id: "INV-3", text: "The running table and the verified model give the same verdicts.", where: "EXECUTOR_REPORT.md" },
  { id: "INV-4", text: "A tool that is not in the closed list cannot run.", where: "EXECUTOR_REPORT.md" },
  { id: "INV-5", text: "The model reaches real tools only through the gate.", where: "STRANDS_REPORT.md" },
  { id: "INV-6", text: "Session state changes only through accepted transitions.", where: "EXECUTOR_REPORT.md" },
  { id: "INV-7", text: "The model has no dead or unreachable state except the named SINK.", where: "VERIFICATION_REPORT.md" },
  { id: "INV-8", text: "Every rejection carries a reason.", where: "EXECUTOR_REPORT.md" },
  { id: "INV-9", text: "Argument limits hold: amount cap, transfer count, retry limit.", where: "EXECUTOR_REPORT.md, STRANDS_REPORT.md" },
  { id: "INV-10", text: "A shown latency was measured; if there is no measurement, nothing is shown.", where: "BACKEND_REPORT.md" },
  { id: "INV-11", text: "The model cannot produce the human MFA step.", where: "EXECUTOR_REPORT.md" },
  { id: "INV-12", text: "A checker or hook failure never lets a tool run.", where: "STRANDS_REPORT.md" },
];

export const NON_GUARANTEES = [
  "The model's own sentences are not checked. It can say something false about what it did; that is why this drawer shows the executed log.",
  "Argument correctness beyond the limits above is not checked: a state machine cannot see arguments (payee allow-list, spend cap and transfer count are separate guards).",
  "A policy that is wrong but well formed is enforced faithfully.",
];

interface Props {
  open: boolean;
  onClose: () => void;
  log: LogEntry[];
  counters: Counters | null;
  verdict: Verdict | null;
  engineNote?: string;
}

/** Slide-over with the evidence. The executed log is the source of truth, not the chat. */
export function ProofDrawer({ open, onClose, log, counters, verdict }: Props) {
  const closeBtn = useRef<HTMLButtonElement>(null);
  useEffect(() => { if (open) closeBtn.current?.focus(); }, [open]);
  const shown = log.slice(-MAX_LOG);
  return (
    <aside className={`drawer${open ? " open" : ""}`} id="drawer" role="dialog" aria-labelledby="dr-h" aria-hidden={!open} {...(open ? {} : { inert: true })}>
      <div className="dh">
        <h2 id="dr-h">Proof</h2>
        <button type="button" className="btn-ghost" ref={closeBtn} onClick={onClose}>Close (Esc)</button>
      </div>
      <div className="db">
        <h3>Executed log (source of truth)</h3>
        <p>Entries the gate actually ran, in order, read from the server. It is not the model's text.</p>
        <ol className="scroll" aria-label="Executed log">
          {shown.length === 0 && <li>nothing executed yet</li>}
          {shown.map((e, i) => <li key={i}>{e.symbol}{e.source ? <span className="ptr"> ({e.source})</span> : null}</li>)}
        </ol>

        <h3>Counters</h3>
        {counters ? (
          <dl>
            <dt>transfers</dt><dd>{counters.transfers} of {counters.max_transfers}</dd>
            <dt>rejects in a row</dt><dd>{counters.consecutive_rejects} of {counters.max_consecutive_rejects}</dd>
            <dt>spend cap</dt><dd>{counters.spend_cap}</dd>
            <dt>session</dt><dd className={counters.locked ? "bad" : ""}>{counters.locked ? "LOCKED" : "open"}</dd>
          </dl>
        ) : <p>No server counters yet.</p>}

        <h3>Last gate verdict (exactly as sent)</h3>
        {verdict ? (
          <dl data-testid="last-verdict">
            <dt>verdict</dt><dd className={verdict.verdict === "REJECT" ? "bad" : ""}>{verdict.verdict}</dd>
            <dt>state</dt><dd>{verdict.state}</dd>
            <dt>symbol</dt><dd>{verdict.symbol}</dd>
            <dt>expected symbols</dt><dd>{verdict.expected_symbols?.join(", ")}</dd>
            <dt>reason</dt><dd>{verdict.reason}</dd>
            <dt>latency</dt><dd>{verdict.latency_ms !== undefined ? `${verdict.latency_ms} ms` : ""}</dd>
            <dt>engine</dt><dd>{verdict.engine}</dd>
          </dl>
        ) : <p>none yet</p>}

        <h3>The 12 invariants</h3>
        <ol>
          {INVARIANTS.map((v) => <li key={v.id}>{v.text} <span className="ptr">{v.id}, see {v.where}</span></li>)}
        </ol>

        <h3>Not guaranteed</h3>
        <ul>{NON_GUARANTEES.map((t) => <li key={t}>{t}</li>)}</ul>
      </div>
    </aside>
  );
}
