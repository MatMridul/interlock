import { useEffect, useMemo, useRef, useState } from "react";
import type { BeatRecord } from "../state";
import type { Replay } from "../lib/score";
import type { Policy } from "../types";

const PITCH = 96;
const LEFT = 20;
const LANE_TOP = 56;
const LANE = 14;
const BASE_H = 164; // tape body height the base spacing was drawn for

const latencyText = (b: { latency?: number; kind: string }) =>
  b.latency === undefined ? (b.kind === "human" ? "human approval, no latency measured" : "no latency reported by the server") : `decided in ${b.latency} ms (measured by the server)`;

interface Props {
  beats: BeatRecord[];
  policy: Policy;
  replay: Replay | null;
  logCount: number;
  /** replay position: number of executed cells shown, or null for the live state */
  scrub?: number | null;
  onScrub?: (n: number | null) => void;
  onShare?: () => void;
  collapsed?: boolean;
  onToggle?: () => void;
  /** a hovered or focused cell re-traces its step on the stage */
  onTrace?: (edge: string | null) => void;
  readOnly?: boolean;
}

/** The executed word w, written one symbol per cell. Blocked proposals hang above it as VOID stamps and never enter it. */
export function TraceTape({ beats, policy, replay, logCount, scrub = null, onScrub, onShare, collapsed = false, onToggle, onTrace, readOnly = false }: Props) {
  const accepted = useMemo(() => beats.filter((b) => b.verdict === "ACCEPT"), [beats]);
  const ghosts = useMemo(() => beats.filter((b) => b.verdict === "REJECT"), [beats]);
  const scroller = useRef<HTMLDivElement>(null);
  const live = useMemo(() => policy.states.filter((s) => s !== "SINK"), [policy]);
  const lanes = [...live].reverse(); // top lane = last state
  // taller tape: spread the lanes (up to 40 px apart) so the extra height is used, not left empty
  const [bodyH, setBodyH] = useState(BASE_H);
  useEffect(() => {
    const el = scroller.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => setBodyH(el.clientHeight || BASE_H));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const gaps = Math.max(1, lanes.length - 1);
  const lane = Math.min(40, LANE + Math.max(0, bodyH - BASE_H) / gaps);
  const cellTop = LANE_TOP + gaps * lane + 6;
  const level = (st: string) => LANE_TOP + lanes.indexOf(st) * lane;
  useEffect(() => {
    const el = scroller.current;
    if (el) el.scrollLeft = el.scrollWidth;
  }, [accepted.length, ghosts.length]);

  const cols = Math.max(accepted.length, ghosts.length ? Math.max(...ghosts.map((g) => g.tapeIndex)) + 1 : 0);
  const W = LEFT + (cols + 1 + ghosts.length) * PITCH + 40;
  // stepped chart-recorder trace: level over event index
  let d = `M0 ${level(policy.initial)}`;
  accepted.forEach((b, i) => { d += `H${LEFT + i * PITCH + 43}V${level(b.to)}`; });
  d += `H${LEFT + accepted.length * PITCH + 43}`;
  const slot: Record<number, number> = {};
  const pos = scrub ?? accepted.length;
  const trace = (e: string | null) => onTrace?.(e);

  return (
    <section className="tape" data-tour="tape" aria-labelledby="tape-h" data-collapsed={collapsed || undefined}>
      <div className="tape-h">
        <h2 id="tape-h">Trace tape</h2>
        {onToggle && <button type="button" className="tg" aria-expanded={!collapsed} aria-controls="tape-body" onClick={onToggle} title="Collapse the tape to one line or expand it">{collapsed ? "Expand" : "Collapse"}</button>}
        {collapsed ? <span className="tape-one" data-testid="tape-one">w = {accepted.length ? accepted.map((b) => b.symbol).join(" ") : "empty"} · {ghosts.length} blocked</span>
          : <span className="tape-note">executed word w · BLOCKED proposals hang above as VOID and are never written</span>}
        {!collapsed && accepted.length > 0 && onScrub && (
          <label className="scrub" data-testid="scrub">
            <span>{scrub === null ? "live" : "replay"}</span>
            <input type="range" min={0} max={accepted.length} step={1} value={pos} aria-label="Scrub through the executed log: arrow keys step, the stage shows that state (read-only)"
              aria-valuetext={pos === 0 ? `before any step, state ${policy.initial}` : `after step ${pos} of ${accepted.length}: ${accepted[pos - 1].symbol}, state ${accepted[pos - 1].to}`}
              onChange={(e) => { const n = Number(e.target.value); onScrub(n >= accepted.length ? null : n); }} />
            <span>{pos} of {accepted.length}</span>
            {scrub !== null && <button type="button" className="tg" onClick={() => onScrub(null)}>Back to live</button>}
          </label>
        )}
        {!collapsed && accepted.length > 0 && onShare && <button type="button" className="tg" onClick={onShare} title="Copies a link that replays this executed word without the server keeping anything">Share replay</button>}
        {readOnly && <span className="replay-flag" role="status">REPLAY · read only</span>}
        {replay && logCount > 0 && (
          <span className={`chk${replay.inLanguage ? "" : " bad"}`} role="status">
            executed trace {replay.inLanguage ? "is" : "is NOT"} in L(M)
            <span> (the server's executed log of {logCount}, replayed through GET /policy)</span>
          </span>
        )}
      </div>
      <div className="tapes" id="tape-body" ref={scroller} hidden={collapsed} tabIndex={0} aria-label="Trace tape, scrollable">
        <div className="lanes" aria-hidden="true">
          {lanes.map((l, i) => <div key={l} className="lane-lab" style={{ top: LANE_TOP - 7 + i * lane }}>{l}</div>)}
        </div>
        <div className="chart" style={{ width: W, marginLeft: 0 }}>
          <svg width={W} height={cellTop} aria-hidden="true">
            {lanes.map((l) => <line key={l} x1={0} x2={W} y1={level(l)} y2={level(l)} stroke="#1f2f29" strokeDasharray="2 4" />)}
            <path d={d} fill="none" stroke="#7dffb2" strokeWidth="1.6" style={{ filter: "drop-shadow(0 0 4px #7dffb2)" }} />
            {accepted.map((b, i) => <circle key={i} cx={LEFT + i * PITCH + 43} cy={level(b.to)} r="3.5" fill={b.kind === "human" ? "#ffb347" : "#7dffb2"} />)}
            {ghosts.map((g, i) => {
              const k = (slot[g.tapeIndex] = (slot[g.tapeIndex] ?? -1) + 1);
              const x = LEFT + g.tapeIndex * PITCH + k * PITCH + 38;
              return <g key={i} stroke="#ff6b5e"><line x1={x} x2={x} y1={46} y2={53} /><line x1={x - 7} x2={x + 7} y1={53} y2={53} strokeWidth="2" /></g>;
            })}
          </svg>
          {(() => {
            const s2: Record<number, number> = {};
            return ghosts.map((g, i) => {
              const k = (s2[g.tapeIndex] = (s2[g.tapeIndex] ?? -1) + 1);
              return (
                <div key={i} className="ghost" style={{ left: LEFT + g.tapeIndex * PITCH + k * PITCH }}>
                  <button type="button" className="cell-btn" onMouseEnter={() => trace(null)} aria-label={`Blocked ${g.symbol} in ${g.from}. ${g.reason ?? ""} Never written to the tape.`}>
                    <b>VOID {g.symbol}</b><em>in {g.from}</em>
                    <span className="tip" role="tooltip">{g.reason ?? "rejected"}<br />{latencyText(g)}</span>
                  </button>
                </div>
              );
            });
          })()}
          {accepted.map((b, i) => (
            <div key={i} className={`cell${b.kind === "human" ? " human" : ""}${scrub !== null && i === scrub - 1 ? " at" : ""}`} style={{ left: LEFT + i * PITCH, top: cellTop }}
              onMouseEnter={() => trace(`${b.from}>${b.to}`)} onMouseLeave={() => trace(null)} onFocus={() => trace(`${b.from}>${b.to}`)} onBlur={() => trace(null)}>
              <button type="button" className="cell-btn" aria-label={`Executed ${b.symbol}, led to ${b.to}. ${latencyText(b)}`}>
                <b>{b.symbol}</b><em>→ {b.to}{b.kind === "human" ? " · human" : ""}</em>
                <span className="tip" role="tooltip">{b.from} → {b.to}<br />{latencyText(b)}</span>
              </button>
            </div>
          ))}
          <div className="head-pen" aria-hidden="true" style={{ left: LEFT + accepted.length * PITCH + 43, top: LANE_TOP - 4, height: gaps * lane + 8 }} />
          {beats.length === 0 && (<p className="tape-empty">Empty tape. Every <b>allowed</b> action is written here as one cell, left to right, with the state it led to. A <b>blocked</b> proposal hangs above as a red VOID stamp and is never written.</p>)}
        </div>
      </div>
    </section>
  );
}
