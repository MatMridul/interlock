import { useEffect, useRef } from "react";
import type { Score } from "../lib/score";
import type { Counters } from "../types";

function Num({ v }: { v: number }) {
  const ref = useRef<HTMLElement>(null);
  const prev = useRef(v);
  useEffect(() => {
    if (prev.current !== v && ref.current && typeof ref.current.animate === "function" && !matchMedia("(prefers-reduced-motion: reduce)").matches) {
      ref.current.animate([{ transform: "translateY(-6px)", opacity: 0.3 }, { transform: "none", opacity: 1 }], { duration: 500, easing: "cubic-bezier(.16,1,.3,1)" });
    }
    prev.current = v;
  }, [v]);
  return <dd ref={ref as React.RefObject<HTMLDListElement & HTMLElement>}>{v}</dd>;
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
