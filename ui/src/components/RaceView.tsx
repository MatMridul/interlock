import { useCallback, useEffect, useMemo, useState } from "react";
import * as api from "../api";
import { chips, tally, userText, type Arm, type RaceData, type RaceRun } from "../lib/race";

const STEP_MS = 520; // time between two events in a lane
const HOLD_MS = 900; // pause on a finished attack before the next one
const ARMS: Arm[] = ["prompt-only", "interlock"];
type Pair = Partial<Record<Arm, RaceRun>>;

function pairsOf(runs: RaceRun[]): Record<string, Pair> {
  const m: Record<string, Pair> = {};
  for (const r of runs) (m[r.attack_id] ??= {})[r.arm] = r;
  return m;
}

function Lane({ arm, run, step, tried, forbidden, total, ready }: { arm: Arm; run?: RaceRun; step: number; tried: number; forbidden: number; total: number; ready: boolean }) {
  const open = arm === "prompt-only";
  const list = run ? chips(run, step) : [];
  const done = !!run && step >= run.events.length;
  return (
    <section className={`rlane ${open ? "open" : "gated"}`} data-testid={`lane-${arm}`} aria-label={open ? "Prompt-only agent, unprotected" : "Interlock agent"}>
      <h2>{open ? "PROMPT-ONLY" : "INTERLOCK"}<span className="rlane-tag">{open ? "UNPROTECTED" : "GATE + HOOK"}</span></h2>
      <p className="rlane-sub">{open
        ? "Same model, same prompt, same five tools. No gate, no hook: only the prompt protects. Stub bank, no money moves."
        : "Same model, same prompt, same five tools. The state machine decides what may run."}</p>
      <div className="rstrip" aria-label="Executed log" data-testid={`strip-${arm}`}>
        {list.length === 0 && <span className="rstrip-empty">{ready ? "waiting" : "no run yet"}</span>}
        {list.map((c) => (
          <span key={c.key} className={`rchip ${c.kind}${c.forbidden ? " forbidden" : ""}`} title={c.detail} data-kind={c.kind} data-forbidden={c.forbidden || undefined}>
            {c.sym}{c.kind === "blocked" ? " blocked" : ""}{c.forbidden ? " FORBIDDEN" : ""}
          </span>
        ))}
      </div>
      <p className="rlane-note" aria-live="polite">
        {!run ? "" : !done ? "running" : run.violation ? "A forbidden action executed." : run.error ? `Run ended early (${run.error.split(":")[0]}). Nothing forbidden executed.` : "Nothing forbidden executed."}
      </p>
      <dl className="rlane-count">
        <div><dt>Attacks tried</dt><dd data-testid={`tried-${arm}`}>{tried}<small> of {total}</small></dd></div>
        <div className={forbidden > 0 ? "bad" : ""}><dt>Forbidden actions executed</dt><dd data-testid={`forbidden-${arm}`}>{forbidden}</dd></div>
      </dl>
    </section>
  );
}

/** C2 race mode: the same attack against both arms. Replay of the recorded run is the default and calls no model. */
export function RaceView({ onClose, modelOn, reduced }: { onClose: () => void; modelOn: boolean; reduced: boolean }) {
  const [data, setData] = useState<RaceData | null>(null);
  const [err, setErr] = useState("");
  const [live, setLive] = useState<{ label: string; pairs: Record<string, Pair> } | null>(null);
  const [sel, setSel] = useState("");
  const [queue, setQueue] = useState<string[]>([]);
  const [qi, setQi] = useState(0);
  const [step, setStep] = useState(0);
  const [played, setPlayed] = useState<string[]>([]);
  const [playing, setPlaying] = useState(false);
  const [shown, setShown] = useState<string | null>(null);
  const [busyLive, setBusyLive] = useState(false);
  const [note, setNote] = useState("");

  useEffect(() => {
    let alive = true;
    api.getRaceReplay().then((d) => { if (alive) { setData(d); setSel(d.attacks[0]?.id ?? ""); } })
      .catch(() => { if (alive) setErr("No recorded run on this server."); });
    return () => { alive = false; };
  }, []);

  const rec = useMemo(() => pairsOf(data?.runs ?? []), [data]);
  const pairs = live ? live.pairs : rec;
  const label = live ? live.label : data?.label ?? "";
  const ids = useMemo(() => (live ? Object.keys(live.pairs) : (data?.attacks ?? []).map((a) => a.id)), [live, data]);
  const cur = playing ? queue[qi] : shown;
  const pair = cur ? pairs[cur] : undefined;
  const len = Math.max(pair?.["prompt-only"]?.events.length ?? 0, pair?.interlock?.events.length ?? 0);

  useEffect(() => {
    if (!playing || !cur) return;
    let t: ReturnType<typeof setTimeout>;
    if (step < len) t = setTimeout(() => setStep((s) => s + 1), reduced ? 0 : STEP_MS);
    else t = setTimeout(() => {
      setPlayed((p) => (p.includes(cur) ? p : [...p, cur]));
      if (qi + 1 < queue.length) { setQi(qi + 1); setStep(0); setShown(queue[qi + 1]); } else setPlaying(false);
    }, reduced ? 0 : HOLD_MS);
    return () => clearTimeout(t);
  }, [playing, cur, step, len, qi, queue, reduced]);

  const start = useCallback((list: string[], fresh: boolean) => {
    if (fresh) setPlayed([]);
    setQueue(list); setQi(0); setStep(0); setShown(list[0] ?? null); setPlaying(list.length > 0);
  }, []);

  const runLive = async () => {
    if (!sel || busyLive) return;
    setBusyLive(true); setNote("Running both arms with the real model...");
    try {
      const r = await api.postRaceLive(sel);
      setLive({ label: r.label, pairs: { [sel]: pairsOf(r.runs)[sel] } });
      setNote(`${r.calls_left} live model calls left today on this server.`);
      setPlayed([]); setQueue([sel]); setQi(0); setStep(0); setShown(sel); setPlaying(true);
    } catch (e) {
      setNote(e instanceof api.ApiError ? e.message : "Cannot reach the server.");
    } finally { setBusyLive(false); }
  };
  const backToRecorded = () => { setLive(null); setPlayed([]); setPlaying(false); setShown(null); setNote(""); };

  const attacks = data?.attacks ?? [];
  const selAttack = attacks.find((a) => a.id === (cur ?? sel));
  const finished = (id: string) => played.includes(id);
  const totalFor = live ? 1 : attacks.length;
  const cnt = (arm: Arm) => tally(Object.fromEntries(Object.entries(pairs).map(([k, v]) => [k, v[arm]])), played);

  return (
    <div className="race" data-testid="race-view" role="region" aria-label="Race mode">
      <header className="race-top">
        <div className="mark">Inter<i>lock</i><small>Race mode</small></div>
        <span className="race-label" data-testid="race-label" data-source={live ? "live" : "recorded"}>{label || (err ? "" : "loading")}</span>
        <div className="sp" />
        <button type="button" className="tg" onClick={onClose}>Back to the gate</button>
      </header>
      {err && <p className="race-err" role="alert">{err}</p>}
      {data && (
        <>
          <div className="race-ctl">
            <label>Attack
              <select value={sel} onChange={(e) => setSel(e.target.value)} disabled={playing}>
                {attacks.map((a) => <option key={a.id} value={a.id}>{a.id} · {a.category}</option>)}
              </select>
            </label>
            <button type="button" className="tg" disabled={playing || !!live || !sel} onClick={() => start([sel], false)}>Replay this attack</button>
            <button type="button" className="tg" aria-pressed={playing && queue.length > 1} disabled={playing || !!live} onClick={() => start(ids, true)}>Replay all {attacks.length}</button>
            <button type="button" className="tg" disabled={playing && queue.length > 1} onClick={() => { setPlaying(false); setPlayed([]); setShown(null); setStep(0); }}>Reset</button>
            <span className="sp" />
            {live && <button type="button" className="tg" onClick={backToRecorded}>Back to recorded run</button>}
            <button type="button" className="tg" disabled={!modelOn || busyLive || playing} onClick={() => void runLive()}
              title={modelOn ? "Runs this one attack against both arms with the real model. Counts against the daily cap." : "The model is off on this server (INTERLOCK_MODEL=off). Live runs need it."}>
              {busyLive ? "Running live..." : "Run live (model)"}
            </button>
          </div>
          <p className="race-attack" data-testid="race-attack">
            {selAttack ? <><b>{selAttack.id}</b> {selAttack.category}. Forbidden outcome: {selAttack.forbidden}.</> : ""}
            {pair && step > 0 && <q>{userText(pair.interlock ?? pair["prompt-only"], step)}</q>}
          </p>
          <div className="rlanes">
            {ARMS.map((arm) => (
              <Lane key={arm} arm={arm} run={pair?.[arm]} step={pair ? step : 0} ready={playing} tried={cnt(arm).tried} forbidden={cnt(arm).forbidden} total={totalFor} />
            ))}
          </div>
          {note && <p className="race-note" role="status">{note}</p>}
          <table className="race-table" aria-label="Per-attack results">
            <thead><tr><th>Attack</th><th>Category</th><th>Prompt-only</th><th>Interlock</th></tr></thead>
            <tbody>
              {ids.map((id) => {
                const a = attacks.find((x) => x.id === id);
                return (
                  <tr key={id} data-current={cur === id || undefined} onClick={() => { if (!playing && !live) { setSel(id); start([id], false); } }}>
                    <td>{id}</td><td>{a?.category}</td>
                    {ARMS.map((arm) => {
                      const r = pairs[id]?.[arm];
                      return <td key={arm} className={finished(id) && r ? (r.violation ? "no" : "ok") : ""} data-arm={arm}>{finished(id) && r ? (r.violation ? "EXECUTED" : "held") : "·"}</td>;
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="race-fine">
            One run per attack, one model, no statistical claim. The Interlock count follows from the gate, whatever the model says. The prompt-only count depends on the model and can change on another run.
            Verdicts come from a checker that reads the executed log, not from the model's words.
          </p>
        </>
      )}
    </div>
  );
}
