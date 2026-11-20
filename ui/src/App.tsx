import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import * as api from "./api";
import { ColdOpen, shouldPlayColdOpen } from "./components/ColdOpen";
import { Console, VECTORS } from "./components/Console";
import { HumanKey, type CodeResult } from "./components/HumanKey";
import { ProofDrawer } from "./components/ProofDrawer";
import { Scoreboard } from "./components/Scoreboard";
import { HUMAN_SYMBOLS, Stage } from "./components/Stage";
import { Toasts } from "./components/Toasts";
import { TraceTape } from "./components/TraceTape";
import { AUTOPLAY_STEPS, runAutoplay } from "./lib/autoplay";
import { Haptics, Sound, prefersReducedMotion, type CueName } from "./lib/cues";
import { BeatBuilder, Director, type Beat } from "./lib/director";
import type { Fx } from "./lib/fx";
import { initialNotify, notifyReducer } from "./lib/notify";
import { replayLog, scoreboard } from "./lib/score";
import { initialUi, reducer } from "./state";
import type { Policy } from "./types";

export function describe(e: unknown): { text: string; kind: "lost" | "busy" | "invalid" | "server" | "down" } {
  if (e instanceof api.ApiError) {
    if (e.status === 404) return { kind: "lost", text: "Session lost: the server no longer knows this session. Start a new one." };
    if (e.status === 409) return { kind: "busy", text: "A turn is already running for this session. Wait for it to finish." };
    if (e.status === 422) return { kind: "invalid", text: "The server rejected that message (empty or over 2000 characters)." };
    return { kind: "server", text: `Server error: ${e.message}` };
  }
  return { kind: "down", text: "Cannot reach the server. Nothing was run. Retry." };
}

function useMedia(q: string) {
  const [m, setM] = useState(() => typeof matchMedia === "function" && matchMedia(q).matches);
  useEffect(() => {
    if (typeof matchMedia !== "function") return;
    const mq = matchMedia(q);
    const f = () => setM(mq.matches);
    mq.addEventListener("change", f);
    f();
    return () => mq.removeEventListener("change", f);
  }, [q]);
  return m;
}

export function App() {
  const [policy, setPolicy] = useState<Policy | null>(null);
  const [sid, setSid] = useState<string | null>(null);
  const [ui, dispatch] = useReducer(reducer, undefined, () => initialUi());
  const [nt, notify] = useReducer(notifyReducer, initialNotify);
  const [fault, setFault] = useState<{ text: string; kind: string } | null>(null);
  const [drawer, setDrawer] = useState(false);
  const [consoleClosed, setConsoleClosed] = useState(false);
  const [cold, setCold] = useState(() => shouldPlayColdOpen());
  const [soundOn, setSoundOn] = useState(false);
  const [hapticsOn, setHapticsOn] = useState(false);
  const [auto, setAuto] = useState({ on: false, label: "" });
  const [keyResult, setKeyResult] = useState<CodeResult | null>(null);
  const [keyTurning, setKeyTurning] = useState(false);
  const [keyAttn, setKeyAttn] = useState(false);
  const [keyShake, setKeyShake] = useState(false);
  const [keyRequested, setKeyRequested] = useState(false);
  const reduced = useMedia("(prefers-reduced-motion: reduce)");
  const narrow = useMedia("(max-width: 900px)");

  const fxRef = useRef<Fx | null>(null);
  const sound = useRef(new Sound());
  const haptics = useRef(new Haptics());
  const sidRef = useRef<string | null>(null);
  const queue = useRef<{ director: Director; builder: BeatBuilder; alive: { v: boolean } } | null>(null);
  const humanWait = useRef<((ok: boolean) => void) | null>(null);
  const autoStop = useRef({ stopped: false, wake: [] as (() => void)[] });
  const policyRef = useRef<Policy | null>(null);
  const counterLocked = useRef(false);

  const cue = useCallback((n: CueName) => { sound.current.play(n); haptics.current.play(n); }, []);
  const toast = useCallback((kind: "info" | "allowed" | "blocked" | "needs-human" | "error", text: string, label?: string) => notify({ type: "push", kind, text, label }), []);
  const pulse = (set: (v: boolean) => void, ms: number) => { set(true); setTimeout(() => set(false), ms); };

  const refresh = useCallback(async (id: string) => {
    try {
      const view = await api.getState(id);
      dispatch({ type: "state_loaded", view });
      return view;
    } catch (e) {
      const d = describe(e);
      setFault({ text: d.text, kind: d.kind });
      toast("error", d.text);
      return null;
    }
  }, [toast]);

  // ---- the three moments of a beat: this is where toasts, sound and haptics are decided (MOTION_GRAMMAR.md) ----
  const observe = useCallback((e: { hook: "spawn" | "impact" | "settle"; beat: Beat }) => {
    const { hook, beat } = e;
    const pol = policyRef.current;
    if (beat.kind === "agent") {
      if (hook === "spawn") notify({ type: "say", text: `Agent proposes ${beat.symbol}.` });
      if (hook === "impact" && beat.verdict === "ACCEPT") {
        if (beat.symbol !== "TRANSFER") toast("allowed", `Allowed: ${beat.symbol}. State is now ${beat.to}.`);
        cue(beat.symbol === "TRANSFER" ? "executed" : "allowed");
      }
      if (hook === "impact" && beat.verdict === "REJECT") {
        toast("blocked", `Blocked: ${beat.symbol} in ${beat.from}. State unchanged. ${beat.reason ?? `${beat.symbol} not allowed in ${beat.from}`}.`);
        cue("blocked");
      }
      if (hook === "settle" && beat.verdict === "ACCEPT") {
        if (beat.symbol === "TRANSFER" && sidRef.current) {
          void api.getState(sidRef.current).then((v) => {
            const t = [...v.executed_log].reverse().find((x) => x.symbol === "TRANSFER");
            const a = (t?.args ?? {}) as Record<string, unknown>;
            const used = v.counters ? ` Transfers used: ${v.counters.transfers} of ${v.counters.max_transfers}.` : "";
            toast("allowed", `Allowed: TRANSFER. ${a.amount !== undefined ? `${Number(a.amount).toFixed(2)} to ${String(a.payee ?? "?")} executed.` : "Executed."}${used}`, "Executed");
          }).catch(() => undefined);
        }
        const needsHuman = pol && HUMAN_SYMBOLS.some((h) => { const n = pol.transitions[beat.to]?.[h]; return !!n && n !== "SINK"; });
        if (needsHuman) {
          toast("needs-human", "Approval needed: a human must turn the key. The agent cannot.");
          cue("needs-human");
          pulse(setKeyAttn, 160);
        }
      }
    } else if (hook === "impact") {
      if (beat.verdict === "ACCEPT") {
        notify({ type: "dismiss_kind", kinds: ["needs-human"] });
        toast("allowed", `Human approved. State is now ${beat.to}.`, "Human approved");
        cue("approved");
      } else {
        toast("blocked", `Approval refused: ${beat.reason ?? "the gate rejected MFA"}. Nothing changed.`, "Refused");
        cue("blocked");
      }
    }
  }, [cue, toast]);

  const start = useCallback(async () => {
    try {
      queue.current && (queue.current.alive.v = false);
      queue.current?.director.clear();
      const p = policyRef.current ?? (await api.getPolicy());
      policyRef.current = p;
      setPolicy(p);
      const { session_id } = await api.createSession();
      sidRef.current = session_id;
      setSid(session_id);
      setFault(null);
      const alive = { v: true };
      const dispatchG: typeof dispatch = (a) => { if (alive.v) dispatch(a); };
      const director = new Director(() => fxRef.current ?? { play: (b) => { b.onSpawn(); b.onImpact(); b.onSettle(); return Promise.resolve(); } }, prefersReducedMotion);
      const builder = new BeatBuilder(director, dispatchG, p.initial, (e) => { if (alive.v) observe(e); });
      queue.current = { director, builder, alive };
      dispatch({ type: "reset", initial: p.initial });
      notify({ type: "clear" });
      counterLocked.current = false;
      setKeyResult(null);
      toast("info", `New session. State is ${p.initial}.`);
    } catch (e) {
      const d = describe(e);
      setFault({ text: d.text, kind: d.kind });
      toast("error", d.text);
      cue("error");
    }
  }, [observe, toast, cue]);

  useEffect(() => { void start(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  // locked session: announce once, from the server's counters
  useEffect(() => {
    const locked = !!ui.counters?.locked;
    if (locked && !counterLocked.current) {
      toast("blocked", `Session locked after ${ui.counters?.max_consecutive_rejects ?? 5} rejected proposals in a row. The gate refuses everything. Reset to continue.`, "Session locked");
      cue("locked");
    }
    counterLocked.current = locked;
  }, [ui.counters?.locked, ui.counters?.max_consecutive_rejects, toast, cue]);

  const sendMessage = useCallback(async (text: string) => {
    const id = sidRef.current, q = queue.current;
    if (!id || !q) return;
    dispatch({ type: "send_start" });
    try {
      for await (const ev of api.chat(id, text)) {
        let data: unknown = null;
        try { data = JSON.parse(ev.data); } catch { continue; } // a malformed frame is skipped, never fatal
        q.builder.handle(ev.event, data);
      }
    } catch (e) {
      const d = describe(e);
      dispatch({ type: "notice", text: d.text });
      toast("error", d.text);
      cue("error");
      if (d.kind === "lost" || d.kind === "down") setFault({ text: d.text, kind: d.kind });
    } finally {
      await q.director.idle();
      dispatch({ type: "send_end" });
      await refresh(id);
    }
  }, [refresh, toast, cue]);

  const submitKey = useCallback(async (code: string): Promise<CodeResult> => {
    const id = sidRef.current, q = queue.current;
    if (!id || !q) return { ok: false, message: "No session." };
    let r: CodeResult;
    try {
      const res = await api.postMfa(id, code);
      const ok = res.verdict === "ACCEPT";
      setKeyTurning(true);
      q.builder.human(ok ? "ACCEPT" : "REJECT", res.state, res.reason);
      r = ok ? { ok: true, message: `Approved by a human. State is now ${res.state}.` } : { ok: false, message: `The gate rejected MFA${res.reason ? `: ${res.reason}` : ""}. Nothing changed.` };
      await q.director.idle();
      setKeyTurning(false);
      await refresh(id);
    } catch (e) {
      if (e instanceof api.ApiError && e.status === 403) {
        // nothing reached the gate: no stage animation
        pulse(setKeyShake, 380);
        toast("blocked", "Approval refused: wrong code. Nothing changed.", "Refused");
        cue("blocked");
        r = { ok: false, message: "403: wrong code. Nothing changed." };
      } else {
        const d = describe(e);
        toast("error", d.text);
        r = { ok: false, message: d.text };
      }
    }
    setKeyResult(r);
    if (humanWait.current && (r.ok || !r.ok)) {
      // autoplay waits for a clear outcome: approved resolves true; a refusal leaves the dialog open for another try
      if (r.ok) { humanWait.current(true); humanWait.current = null; setKeyRequested(false); }
    }
    return r;
  }, [refresh, toast, cue]);

  // ---- autoplay ----
  const stopAutoplay = useCallback(() => {
    const s = autoStop.current;
    s.stopped = true;
    s.wake.forEach((w) => w());
    humanWait.current?.(false);
    humanWait.current = null;
    setKeyRequested(false);
  }, []);

  const startAutoplay = useCallback(async () => {
    const s = autoStop.current;
    s.stopped = false;
    s.wake = [];
    setAuto({ on: true, label: "" });
    await start();
    toast("info", `Autoplay started: ${AUTOPLAY_STEPS.length} steps, about 70 s. Press Esc or Stop to end.`, "Autoplay");
    const res = await runAutoplay(AUTOPLAY_STEPS, {
      isStopped: () => s.stopped,
      sleep: (ms) => new Promise<void>((r) => { const h = setTimeout(r, ms); s.wake.push(() => { clearTimeout(h); r(); }); }),
      onStep: (i, n, label) => setAuto({ on: true, label: `${i + 1} of ${n}: ${label}` }),
      chat: (m) => sendMessage(m),
      human: () => new Promise<boolean>((resolve) => {
        humanWait.current = resolve;
        setKeyRequested(true);
        toast("needs-human", "Approval needed: a human must turn the key. The agent cannot. Enter the demo code to continue.");
        cue("needs-human");
      }),
    });
    setAuto({ on: false, label: "" });
    setKeyRequested(false);
    toast("info", res.completed ? "Autoplay finished." : `Autoplay stopped at step ${Math.min(res.stoppedAt + 1, res.total)} of ${res.total}.`, "Autoplay");
  }, [start, toast, sendMessage, cue]);

  // ---- keyboard: 1 to 6 fire the attack vectors, Esc stops autoplay or closes the drawer ----
  const busy = ui.running || !sid || auto.on || !!fault;
  const keyHandler = useRef<(e: KeyboardEvent) => void>(() => {});
  keyHandler.current = (e) => {
    const t = e.target as HTMLElement | null;
    if (e.key === "Escape") {
      if (auto.on) stopAutoplay(); else if (drawer) setDrawer(false);
      return;
    }
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (t && (t.closest?.("input,textarea,dialog,select") || t.isContentEditable)) return;
    const v = VECTORS.find((x) => x.key === e.key);
    if (v && !busy) void sendMessage(v.message);
  };
  useEffect(() => {
    const f = (e: KeyboardEvent) => keyHandler.current(e);
    window.addEventListener("keydown", f);
    return () => window.removeEventListener("keydown", f);
  }, []);

  const score = useMemo(() => scoreboard(ui.beats, ui.proposed, ui.log), [ui.beats, ui.proposed, ui.log]);
  const replay = useMemo(() => (policy ? replayLog(policy, ui.log.map((l) => l.symbol)) : null), [policy, ui.log]);
  const lastAccepted = [...ui.beats].reverse().find((b) => b.verdict === "ACCEPT") ?? null;
  const lastWithLatency = [...ui.beats].reverse().find((b) => b.latency !== undefined);
  const locked = !!ui.counters?.locked;
  const status = `${ui.machineState} · ${ui.running ? "turn running" : "idle"}`;

  const toggleSound = () => { const on = sound.current.enable(!sound.current.on); setSoundOn(on); if (on) sound.current.play("allowed"); };
  const toggleHaptics = () => { haptics.current.on = !haptics.current.on; setHapticsOn(haptics.current.on); haptics.current.play("allowed"); };

  const keyEl = (style?: React.CSSProperties, docked?: boolean) => (
    <HumanKey disabled={!sid || ui.running || locked} turning={keyTurning} attention={keyAttn} shake={keyShake} result={keyResult}
      onSubmit={submitKey} requested={keyRequested} onCancelRequest={() => { humanWait.current?.(false); humanWait.current = null; setKeyRequested(false); stopAutoplay(); }}
      docked={docked} style={style} />
  );

  return (
    <div className="app" data-console={consoleClosed ? "closed" : "open"} data-testid="app">
      <header className="top">
        <div className="mark">Inter<i>lock</i><small>The Chimeric Automaton</small></div>
        <div className="sub">M = (Q, Σ, δ, q₀, F) · the agent proposes, the gate decides</div>
        <div className="sp" />
        <button type="button" className="tg" aria-pressed={soundOn} onClick={toggleSound} title="Synthesised cues, off by default. Starts only after this click.">{soundOn ? "Sound on" : "Sound off"}</button>
        {Haptics.supported() && (
          <button type="button" className="tg" aria-pressed={hapticsOn} onClick={toggleHaptics} title="Vibration works only on supporting Android browsers (Chrome, Firefox). iOS Safari and most desktops ignore it.">{hapticsOn ? "Haptics on" : "Haptics off"}</button>
        )}
        <button type="button" className="tg" aria-expanded={drawer} aria-controls="drawer" onClick={() => setDrawer((v) => !v)}>Proof</button>
      </header>

      <Scoreboard score={score} counters={ui.counters} logLoaded={ui.counters !== null} />

      {policy ? (
        <Stage policy={policy} current={ui.machineState} locked={locked} fxRef={fxRef} lastTaken={lastAccepted ? { from: lastAccepted.from, symbol: lastAccepted.symbol } : null}
          wordLength={score.allowed + score.human} lastDecision={lastWithLatency?.latency !== undefined ? `${lastWithLatency.latency} ms` : "n/a"} dim={!!fault}>
          {(m) => (
            <>
              <Toasts state={nt} onDismiss={(id) => notify({ type: "dismiss", id })} />
              {locked && <div className="locked" role="status"><div>Session locked</div><span>{ui.counters?.max_consecutive_rejects} rejected proposals in a row. The gate refuses everything. Reset to continue.</span></div>}
              {fault && (
                <div className="fault" role="alert">
                  <b>Error</b>{fault.text}
                  <div><button type="button" onClick={() => void start()}>{fault.kind === "lost" ? "New session" : "Retry"}</button></div>
                </div>
              )}
              {!narrow && keyEl({ left: m.ox + 770 * m.s, bottom: 6, transformOrigin: "bottom left", transform: `scale(${m.s})` })}
            </>
          )}
        </Stage>
      ) : (
        <section className="stage" aria-label="The state machine">
          {fault ? <div className="fault" role="alert"><b>Error</b>{fault.text}<div><button type="button" onClick={() => void start()}>Retry</button></div></div>
            : <p style={{ padding: 20 }}>Loading the machine from GET /policy.</p>}
        </section>
      )}
      {narrow && keyEl(undefined, true)}

      {policy && <TraceTape beats={ui.beats} policy={policy} replay={replay} logCount={ui.log.length} />}

      <Console items={ui.items} running={ui.running} disabled={!sid || !!fault} reduced={reduced} closed={consoleClosed} autoplay={auto} status={status}
        onToggle={() => setConsoleClosed((v) => !v)} onSend={(t) => void sendMessage(t)}
        onAutoplay={() => void startAutoplay()} onStopAutoplay={stopAutoplay} onReset={() => void start()} />

      <ProofDrawer open={drawer} onClose={() => setDrawer(false)} log={ui.log} counters={ui.counters} verdict={ui.lastVerdict} />
      {cold && <ColdOpen onDone={() => setCold(false)} />}
    </div>
  );
}
