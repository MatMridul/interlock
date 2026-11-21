import { useEffect, useMemo, useRef, useState, type MutableRefObject, type ReactNode } from "react";
import { Fx } from "../lib/fx";
import { AGENT_PORT, AIRLOCK, ORB_R, SINK, VIEW, buildEdges, ledgerRows, orbPositions } from "../lib/geometry";
import type { Policy } from "../types";

/** Symbols only a human can produce (the table has no agent tool for them): their conduit is drawn amber. */
export const HUMAN_SYMBOLS = ["MFA"];

interface Props {
  policy: Policy;
  current: string;
  locked: boolean;
  fxRef: MutableRefObject<Fx | null>;
  /** the last accepted transition: keeps its ledger row lit */
  lastTaken: { from: string; symbol: string } | null;
  wordLength: number;
  lastDecision: string;
  dim?: boolean;
  children?: (m: { s: number; ox: number; oy: number }) => ReactNode;
}

export function Stage({ policy, current, locked, fxRef, lastTaken, wordLength, lastDecision, dim, children }: Props) {
  const wrap = useRef<HTMLDivElement>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [glow, setGlow] = useState<{ id: string; n: number } | null>(null);
  const [flash, setFlash] = useState<{ state: string; kind: "ok" | "bad"; n: number } | null>(null);
  const [map, setMap] = useState({ s: 1, ox: 0, oy: 0 });
  const orbEls = useRef<Record<string, SVGGElement | null>>({});

  const pos = useMemo(() => orbPositions(policy.states), [policy]);
  const edges = useMemo(() => buildEdges(policy, pos), [policy, pos]);
  const ledger = useMemo(() => ledgerRows(policy), [policy]);
  const live = policy.states.filter((s) => s !== "SINK");
  const humanEdge = (symbols: string[]) => symbols.every((s) => HUMAN_SYMBOLS.includes(s));

  useEffect(() => {
    const cv = canvas.current;
    if (!cv) return;
    const fx = new Fx(cv, {
      glow: (id) => setGlow((g) => ({ id, n: (g?.n ?? 0) + 1 })),
      shake: (state) => {
        const el = orbEls.current[state];
        if (el && typeof el.animate === "function") {
          el.animate(
            [{ transform: "translate(0,0)" }, { transform: "translate(-6px,1px)" }, { transform: "translate(5px,-1px)" }, { transform: "translate(-4px,0)" }, { transform: "translate(2px,0)" }, { transform: "translate(0,0)" }],
            { duration: 380, easing: "cubic-bezier(.16,1,.3,1)" },
          );
        }
      },
      flash: (state, kind) => setFlash((f) => ({ state, kind, n: (f?.n ?? 0) + 1 })),
    });
    fxRef.current = fx;
    const measure = () => {
      fx.resize();
      setMap(fx.mapping);
    };
    measure();
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(measure) : null;
    if (ro && wrap.current) ro.observe(wrap.current);
    const vis = () => document.documentElement.toggleAttribute("data-hidden", document.hidden);
    document.addEventListener("visibilitychange", vis);
    return () => {
      ro?.disconnect();
      document.removeEventListener("visibilitychange", vis);
      fxRef.current = null;
    };
  }, [fxRef]);

  useEffect(() => {
    if (fxRef.current) fxRef.current.geom = { orbs: pos, edges };
  }, [fxRef, pos, edges]);

  // on a narrow screen the stage scrolls sideways: keep the current state in view
  useEffect(() => {
    const sc = scroller.current, p = pos[current];
    if (!sc || !p || sc.scrollWidth <= sc.clientWidth + 2) return;
    const x = (p.x / VIEW.w) * sc.scrollWidth - sc.clientWidth / 2;
    if (typeof sc.scrollTo === "function") sc.scrollTo({ left: Math.max(0, x), behavior: "smooth" });
  }, [current, pos]);

  const arrow = (human: boolean) => `url(#${human ? "ahh" : "ah"})`;
  const nSym = policy.symbols.length;

  return (
    <section className="stage" ref={wrap} data-locked={locked || undefined} data-dim={dim || undefined} aria-label="The state machine">
      <div className="stage-scroll" ref={scroller}>
        <div className="stage-inner">
          <svg className="stage-svg" viewBox={`0 0 ${VIEW.w} ${VIEW.h}`} preserveAspectRatio="xMidYMid meet" role="img"
            aria-label={`State machine ${policy.name}. Current state ${current}. A rejected move never changes it.`}>
            <defs>
              <marker id="ah" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M1 1L9 5L1 9" fill="none" stroke="#5f8c78" strokeWidth="1.3" /></marker>
              <marker id="ahh" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M1 1L9 5L1 9" fill="none" stroke="#ffb347" strokeWidth="1.3" /></marker>
            </defs>

            <text x="24" y="30" className="silk title">M = (Q, Σ, δ, q₀, F)</text>
            <text x="24" y="50" className="silk">|Q| = {live.length} · |Σ| = {nSym} · q₀ = {policy.initial}</text>
            <text x="24" y="68" className="silk">q = <tspan className="b" fill="var(--ph)" fontWeight="600">{current}</tspan> · |w| = {wordLength} · last decision {lastDecision}</text>
            <g aria-hidden="true">
              {ledger.map((r, i) => {
                const on = lastTaken?.from === r.from && lastTaken.symbol === r.symbol;
                return <text key={r.key} x="24" y={96 + i * 16} className={`row${on ? " on" : ""}`} data-row={r.key}>{on ? "› " : "  "}{r.text}</text>;
              })}
            </g>

            {edges.map((e) => {
              const human = humanEdge(e.symbols);
              return (
                <g key={e.id} data-edge={e.id}>
                  <path d={e.d} className={`wire${human ? " human" : ""}`} markerEnd={arrow(human)} />
                  <path d={e.d} className={`glow${glow?.id === e.id ? " on" : ""}`} key={glow?.id === e.id ? glow.n : "off"} />
                  <text x={e.label.x} y={e.label.y} className={`elab${human ? " human" : ""}`}>{e.symbols.join(" / ")}{human ? "  (human)" : ""}</text>
                </g>
              );
            })}

            <path d={`M${pos[policy.initial].x - ORB_R - 62} ${pos[policy.initial].y}H${pos[policy.initial].x - ORB_R - 6}`} className="wire" markerEnd="url(#ah)" />
            <text x={pos[policy.initial].x - ORB_R - 62} y={pos[policy.initial].y - 9} className="elab" style={{ textAnchor: "start" }}>q₀</text>

            {live.map((s, i) => {
              const p = pos[s];
              const on = s === current;
              const fl = flash?.state === s ? `flash-${flash.kind} f${flash.n % 2}` : "";
              return (
                <g key={s} transform={`translate(${p.x} ${p.y})`} data-state={s}>
                  <g ref={(el) => { orbEls.current[s] = el; }} className={`orb${on ? " on" : ""} ${fl}`} aria-current={on ? "true" : undefined}>
                    <circle r={ORB_R} className="orb-bloom" />
                    <circle r={ORB_R} className="orb-ring" />
                    <circle r={ORB_R - 7} className="orb-acc" />
                    <circle r={ORB_R + 9} className="orb-lock" />
                    <text y="4" className="orb-name">{s}</text>
                    <text y={ORB_R + 20} className="orb-q">q{i}</text>
                    <text y={-ORB_R - 10} className="orb-cur">CURRENT</text>
                  </g>
                </g>
              );
            })}

            <circle cx={SINK.x} cy={SINK.y} r="40" className="sink-ring" />
            <circle cx={SINK.x} cy={SINK.y} r="22" className="sink-core" />
            <text x={SINK.x + 54} y={SINK.y - 12} className="sink-t">SINK · REJECTED</text>
            <text x={SINK.x + 54} y={SINK.y + 6} className="sink-n">rejected moves go nowhere;</text>
            <text x={SINK.x + 54} y={SINK.y + 22} className="sink-n">the state never changes</text>

            <circle cx={AGENT_PORT.x} cy={AGENT_PORT.y} r="5" fill="none" stroke="#8ea699" />
            <circle cx={AGENT_PORT.x} cy={AGENT_PORT.y} r="12" fill="none" stroke="#2f4a3f" />
            <text x={AGENT_PORT.x - 22} y={AGENT_PORT.y - 2} className="port-t">AGENT PORT</text>
            <text x={AGENT_PORT.x - 22} y={AGENT_PORT.y + 13} className="port-s">proposes, never decides</text>
            <circle cx={AIRLOCK.x} cy={AIRLOCK.y} r="4" fill="none" stroke="#7a5c26" />
            <text x={AIRLOCK.x - 10} y={AIRLOCK.y + 4} className="port-s">human port</text>
          </svg>
          <canvas className="stage-cv" ref={canvas} aria-hidden="true" />
          {children?.(map)}
        </div>
      </div>
    </section>
  );
}
