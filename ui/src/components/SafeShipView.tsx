import { useEffect, useMemo, useRef, useState } from "react";
import * as api from "../api";
import type { Fx } from "../lib/fx";
import { parseSequence, whatIf } from "../lib/whatif";
import type { Policy } from "../types";
import { Stage } from "./Stage";

export interface RecordedStep {
  n: number;
  symbol: string;
  action: string;
  tool: string;
  refused: boolean;
  message: string;
  from: string;
  to: string;
}
export interface SafeShipData {
  policy: Policy;
  recorded: { label: string; source: string; steps: RecordedStep[] };
}

const STEP_MS = 900;

/** C7: the Safe Ship machine on the same stage. Read-only: a what-if over the table and a replay of the recorded
 *  Kiro CLI run. No hook, no model and no session runs in the browser. */
export function SafeShipView({ reduced }: { reduced: boolean }) {
  const [data, setData] = useState<SafeShipData | null>(null);
  const [err, setErr] = useState("");
  const [shown, setShown] = useState(0); // recorded steps revealed so far
  const [playing, setPlaying] = useState(false);
  const [text, setText] = useState("EDIT PUSH");
  const fxRef = useRef<Fx | null>(null);

  useEffect(() => {
    let alive = true;
    api.getPolicyData("safe_ship").then((d) => { if (alive) setData(d as SafeShipData); })
      .catch(() => { if (alive) setErr("Cannot load the Safe Ship machine from this server."); });
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    if (!playing || !data) return;
    if (shown >= data.recorded.steps.length) { setPlaying(false); return; }
    const t = setTimeout(() => setShown((s) => s + 1), reduced ? 0 : STEP_MS);
    return () => clearTimeout(t);
  }, [playing, shown, data, reduced]);

  const steps = data?.recorded.steps ?? [];
  const last = shown > 0 ? steps[shown - 1] : null;
  const current = last ? last.to : data?.policy.initial ?? "CLEAN";
  const seq = useMemo(() => (data ? parseSequence(data.policy, text) : { symbols: [] as string[] }), [data, text]);
  const wi = useMemo(() => (data && !seq.error ? whatIf(data.policy, seq.symbols) : null), [data, seq]);

  return (
    <div className="ssv" data-testid="safeship-view" role="region" aria-label="Safe Ship policy">
      {err && <p className="race-err" role="alert">{err}</p>}
      {data && (
        <>
          <p className="ssv-intro">
            Safe Ship: an agent may PUSH or DEPLOY only after a passing TEST that follows its last EDIT. Same gate, a second machine. The picture is
            the generated table, read-only.
          </p>
          <div className="ssv-stage">
            <Stage policy={data.policy} current={current} locked={false} fxRef={fxRef} wordLength={shown} lastDecision="n/a"
              lastTaken={last && !last.refused ? { from: last.from, symbol: last.symbol } : null}
              replayLabel={last ? data.recorded.label : null} />
          </div>
          <section className="ssv-box" aria-label="What if">
            <h2>What if</h2>
            <label>Sequence over {data.policy.symbols.join(" ")}
              <input value={text} onChange={(e) => setText(e.target.value)} spellCheck={false} aria-label="What-if sequence" data-testid="ss-whatif" />
            </label>
            <p role="status" data-testid="ss-whatif-result">
              {seq.error ?? (wi
                ? wi.accept ? `Accepted. Final state ${wi.finalState}.`
                  : `Refused at step ${(wi.failedAt ?? 0) + 1}: ${wi.steps[wi.failedAt ?? 0].symbol} is not allowed in ${wi.steps[wi.failedAt ?? 0].from}.`
                : "")}
            </p>
          </section>
          <section className="ssv-box" aria-label="Recorded run">
            <h2>Kiro's own run <span className="race-label" data-testid="ss-label">{data.recorded.label}</span></h2>
            <p className="race-fine">Replay of {data.recorded.source}. Nothing runs here: these are the hook's recorded decisions.</p>
            <div className="ssv-ctl">
              <button type="button" className="tg" disabled={playing} onClick={() => { setShown(0); setPlaying(true); }}>Replay the recorded run</button>
              <button type="button" className="tg" disabled={playing || shown >= steps.length} onClick={() => setShown((s) => s + 1)}>Step</button>
              <button type="button" className="tg" onClick={() => { setPlaying(false); setShown(0); }}>Reset</button>
            </div>
            <ol className="ssv-steps" data-testid="ss-steps">
              {steps.slice(0, shown).map((s) => (
                <li key={s.n} data-refused={s.refused || undefined}>
                  <b>{s.symbol}</b> <code>{s.action}</code>{" "}
                  {s.refused ? <span className="no">REFUSED in {s.from}. {s.message}</span> : <span className="ok">allowed, state {s.to}</span>}
                </li>
              ))}
            </ol>
          </section>
        </>
      )}
    </div>
  );
}
