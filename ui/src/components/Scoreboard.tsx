import { useEffect, useRef, useState } from "react";
import type { Score } from "../lib/score";
import type { Counters } from "../types";

/** A counter that rolls through the numbers between old and new like an instrument (about 0.4 s). Reduced motion: it just shows the value. */
function Num({ v }: { v: number }) {
  const [shown, setShown] = useState(v);
  const from = useRef(v);
  useEffect(() => {
    const reduced = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced || from.current === v || typeof requestAnimationFrame !== "function") { from.current = v; setShown(v); return; }
    const start = from.current, t0 = performance.now(), D = 400;
    let id = 0;
    const tick = (now: number) => {
      const k = Math.min(1, (now - t0) / D);
      setShown(Math.round(start + (v - start) * (1 - Math.pow(1 - k, 3))));
      if (k < 1) id = requestAnimationFrame(tick); else from.current = v;
    };
    id = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(id); from.current = v; };
  }, [v]);
  return <dd data-value={v}>{shown}</dd>;
}
/** Counts come from the beats that were actually played, and the side-effect figure from the server's executed log. */
export function Scoreboard({ score, counters, logLoaded }: { score: Score; counters: Counters | null; logLoaded: boolean }) {
  return (
    <dl className="read" aria-label="Scoreboard">
      <div className="ro"><dt>Proposed</dt><Num v={score.proposed} /><small>by the agent</small></div>
      <div className="ro g"><dt>Allowed</dt><Num v={score.allowed} /><small>ran</small></div>
      <div className="ro r"><dt>Blocked</dt><Num v={score.blocked} /><small>BLOCKED, did not run</small></div>
      <div className={`ro g side${score.sideEffects > 0 ? " bad" : ""}`}>
        <dt>Side effects from blocked</dt><Num v={score.sideEffects} />
        <small>{logLoaded ? "executed-log entries no ALLOW explains" : "waiting for the executed log"}</small>
      </div>
      <div className="lim">
        {counters ? (
          <>
            transfers <b>{counters.transfers} of {counters.max_transfers}</b> · rejects in a row <b>{counters.consecutive_rejects} of {counters.max_consecutive_rejects}</b><br />
            spend cap <b>{counters.spend_cap}</b>{score.human > 0 ? <> · human approvals <b>{score.human}</b></> : null}
          </>
        ) : (
          <>transfers <b>0 of 3</b> · rejects in a row <b>0 of 5</b><br />spend cap <b>5000</b></>
        )}
      </div>
    </dl>
  );
}
