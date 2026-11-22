import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import * as api from "./api";
import { ColdOpen, shouldPlayColdOpen } from "./components/ColdOpen";
import { Console, VECTORS, type AgentMode } from "./components/Console";
import type { StageWhy } from "./components/Stage";
import { whyBlocked } from "./lib/why";
import { SCRIPTS } from "./lib/scripted";
import { auditLines } from "./lib/audit";
import { decodeReplay, encodeReplay, states as replayStates } from "./lib/share";
import { HumanKey, type CodeResult } from "./components/HumanKey";
import { ProofDrawer } from "./components/ProofDrawer";
import { Scoreboard } from "./components/Scoreboard";
import { Separator } from "./components/Separator";
import { Stage, HUMAN_SYMBOLS } from "./components/Stage";
import { Toasts } from "./components/Toasts";
import { TraceTape } from "./components/TraceTape";
import { AUTOPLAY_STEPS, runAutoplay } from "./lib/autoplay";
import { Haptics, Sound, prefersReducedMotion, type CueName } from "./lib/cues";
import { BeatBuilder, Director, type Beat } from "./lib/director";
import type { Fx } from "./lib/fx";
import { useLayout } from "./lib/layout";
import { ACTIONS, shortcutFor } from "./lib/keymap";
import { markTourSeen, shouldAutoStart, tourClosed, tourReducer, type TourAction, type TourState } from "./lib/tour";
import { safeStorage } from "./lib/layout";
import { HelpOverlay } from "./components/HelpOverlay";
import { Palette } from "./components/Palette";
import { Tour } from "./components/Tour";
import { RaceView } from "./components/RaceView";
import { initialNotify, notifyReducer } from "./lib/notify";
import { replayLog, scoreboard } from "./lib/score";
import { initialUi, reducer } from "./state";
import { KEY_ZONE } from "./lib/geometry";
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

/** F: an instrument fault, not a generic error toast. */
export function FaultPanel({ fault, onRetry }: { fault: { text: string; kind: string }; onRetry: () => void }) {
  const title = fault.kind === "down" ? "NO SIGNAL from gate. Retry." : fault.kind === "lost" ? "SESSION LOST. The gate no longer knows this session." : "GATE FAULT";
  return (
    <div className="fault" role="alert" data-testid="fault">
      <b>{title}</b>
      <span className="fault-d">{fault.text}</span>
      <div><button type="button" onClick={onRetry}>{fault.kind === "lost" ? "New session" : "Retry"}</button></div>
    </div>
  );
}

export function App() {
  const [policy, setPolicy] = useState<Policy | null>(null);
  const [sid, setSid] = useState<string | null>(null);
  const [ui, dispatch] = useReducer(reducer, undefined, () => initialUi());
  const [nt, notify] = useReducer(notifyReducer, initialNotify);
  const [fault, setFault] = useState<{ text: string; kind: string } | null>(null);
  const [drawer, setDrawer] = useState(false);
  const [consoleClosed, setConsoleClosed] = useState(() => typeof window !== "undefined" && window.innerWidth <= 900); // narrow screens start with the console sheet down
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
  const lay = useLayout();
  const [dragging, setDragging] = useState(false);
  const [mode, setMode] = useState<AgentMode>("model");
  const [modelOff, setModelOff] = useState(false);
  const [why, setWhy] = useState<StageWhy | null>(null);
  const [scrub, setScrub] = useState<number | null>(null);
  const [tapeCollapsed, setTapeCollapsed] = useState(false);
  const [traceEdge, setTraceEdge] = useState<string | null>(null);
  const [replayOnly, setReplayOnly] = useState(false);
  const [race, setRace] = useState(false);
  const configRead = useRef(false);

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
  const toast = useCallback((kind: "info" | "allowed" | "blocked" | "needs-human" | "error", text: string, label?: string, live?: string) => notify({ type: "push", kind, text, label, live }), []);
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
      if (hook === "spawn") { setWhy(null); notify({ type: "say", text: `Agent proposes ${beat.symbol}.` }); }
      if (hook === "impact" && beat.verdict === "ACCEPT") {
        if (beat.symbol !== "TRANSFER") toast("allowed", `Allowed: ${beat.symbol}. State is now ${beat.to}.`, undefined, `Agent proposed ${beat.symbol}. Allowed. State is now ${beat.to}.`);
        cue(beat.symbol === "TRANSFER" ? "executed" : "allowed");
      }
      if (hook === "impact" && beat.verdict === "REJECT") {
        const w = pol ? whyBlocked(pol, beat.from, beat.symbol, beat.reason) : null;
        if (w) setWhy({ from: beat.from, symbol: beat.symbol, path: w.path, sentence: w.sentence });
        toast("blocked", `Blocked: ${beat.reason ?? `${beat.symbol} not allowed in ${beat.from}`}. State unchanged. ${w?.sentence ?? ""}`.trim(),
          undefined, `Agent proposed ${beat.symbol}. Blocked: ${beat.reason ?? `${beat.symbol} not allowed in ${beat.from}`}. State unchanged. ${w?.sentence ?? ""}`.trim());
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
      let rejectedReplay: string | null = null;
      const p = policyRef.current ?? (await api.getPolicy());
      policyRef.current = p;
      setPolicy(p);
      if (!configRead.current) {
        configRead.current = true;
        const cfg = await api.getConfig();
        if (cfg.model === "off") { setModelOff(true); setMode("you"); }
        const frag = typeof location !== "undefined" ? location.hash : "";
        if (frag.startsWith("#replay=")) {
          const r = decodeReplay(p, frag);
          if ("symbols" in r) {
            // a shared replay: no session, no server state. The tape and stage are built from the word alone.
            const sts = replayStates(p, r.symbols);
            dispatch({ type: "reset", initial: p.initial });
            r.symbols.forEach((symbol, i) => dispatch({ type: "beat_record", symbol, verdict: "ACCEPT", from: sts[i], to: sts[i + 1], kind: symbol === "MFA" ? "human" : "agent" }));
            dispatch({ type: "state_loaded", view: { id: "replay", state: sts[sts.length - 1], executed_log: r.symbols.map((symbol) => ({ symbol })), counters: null } });
            setReplayOnly(true);
            setFault(null);
            toast("info", `Replay loaded: ${r.symbols.length} steps. Drag the scrubber or use the arrow keys. Read only.`, "Replay");
            return;
          }
          rejectedReplay = `Replay link rejected. ${r.error}`; // shown after the new-session reset below
        }
      }
      setReplayOnly(false);
      setScrub(null);
      setWhy(null);
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
      if (rejectedReplay) toast("error", rejectedReplay, "Replay");
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

  const proposeActions = useCallback(async (actions: api.ProposeAction[]) => {
    const id = sidRef.current, q = queue.current;
    if (!id || !q) return;
    dispatch({ type: "send_start" });
    try {
      for await (const ev of api.propose(id, actions)) {
        let data: unknown = null;
        try { data = JSON.parse(ev.data); } catch { continue; }
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
  const runScript = useCallback((id: string) => { const s = SCRIPTS[id]; if (s) void proposeActions(s); }, [proposeActions]);

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

  // ---- keyboard: see lib/keymap.ts. Esc stops autoplay or closes the drawer; single keys stay silent while typing ----
  const busy = ui.running || !sid || auto.on || !!fault;
  const [tour, tourDispatch] = useReducer((s: TourState, a: TourAction) => tourReducer(s, a), tourClosed);
  const [palette, setPalette] = useState(false);
  const [help, setHelp] = useState(false);
  const modal = tour.open || palette || help;
  const closeTour = useCallback((a: TourAction) => { tourDispatch(a); markTourSeen(safeStorage()); }, []);
  const keyHandler = useRef<(e: KeyboardEvent) => void>(() => {});
  const score = useMemo(() => scoreboard(ui.beats, ui.proposed, ui.log), [ui.beats, ui.proposed, ui.log]);
  const replay = useMemo(() => (policy ? replayLog(policy, ui.log.map((l) => l.symbol)) : null), [policy, ui.log]);
  const lastAccepted = [...ui.beats].reverse().find((b) => b.verdict === "ACCEPT") ?? null;
  const lastWithLatency = [...ui.beats].reverse().find((b) => b.latency !== undefined);
  const locked = !!ui.counters?.locked;
  const acceptedBeats = useMemo(() => ui.beats.filter((b) => b.verdict === "ACCEPT"), [ui.beats]);
  const scrubStates = useMemo(() => (policy ? [policy.initial, ...acceptedBeats.map((b) => b.to)] : []), [policy, acceptedBeats]);
  const scrubbing = scrub !== null && scrub < acceptedBeats.length;
  const shownState = scrubbing ? scrubStates[scrub] ?? ui.machineState : ui.machineState;
  const replayLabel = replayOnly ? `REPLAY · read only${scrubbing ? ` · step ${scrub} of ${acceptedBeats.length}` : ""}` : scrubbing ? `REPLAY · step ${scrub} of ${acceptedBeats.length} · read only` : null;
  const shareReplay = async () => {
    if (!policy) return;
    const frag = encodeReplay(policy, ui.log.map((l) => l.symbol));
    if (!frag) { toast("error", "Nothing to share yet: no step has run."); return; }
    const url = `${location.origin}${location.pathname}${frag}`;
    try { await navigator.clipboard.writeText(url); toast("info", "Replay link copied. It holds the executed word only; nobody needs your session.", "Replay"); }
    catch { location.hash = frag; toast("info", "Replay link is in the address bar. Copy it from there.", "Replay"); }
  };
  const exportAudit = () => {
    const body = auditLines(sid ?? "none", ui.log, ui.beats);
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([body], { type: "application/x-ndjson" }));
    a.download = `interlock-audit-${(sid ?? "session").slice(0, 8)}.jsonl`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    toast("info", `Audit log downloaded: ${ui.log.length} executed, ${ui.beats.length} verdicts.`, "Export");
  };
  const exitReplay = () => { history.replaceState(null, "", location.pathname + location.search); setReplayOnly(false); setScrub(null); void start(); };
  const status = `${ui.machineState} · ${ui.running ? "turn running" : "idle"}`;

  const toggleSound = () => { const on = sound.current.enable(!sound.current.on); setSoundOn(on); if (on) sound.current.play("allowed"); };
  const toggleHaptics = () => { haptics.current.on = !haptics.current.on; setHapticsOn(haptics.current.on); haptics.current.play("allowed"); };

  const runAction = (id: string) => {
    if (id.startsWith("vec-")) { const v = VECTORS.find((x) => `vec-${x.key}` === id); if (v && !busy) { if (mode === "you") runScript(v.id); else void sendMessage(v.message); } return; }
    switch (id) {
      case "autoplay": if (auto.on) stopAutoplay(); else if (!ui.running && !fault && sid) void startAutoplay(); break;
      case "reset-session": if (!ui.running) void start(); break;
      case "toggle-console": setConsoleClosed((v) => !v); break;
      case "toggle-drawer": setDrawer((v) => !v); break;
      case "toggle-sound": toggleSound(); break;
      case "toggle-haptics": if (Haptics.supported()) toggleHaptics(); break;
      case "reset-layout": lay.resetAll(); setConsoleClosed(false); break;
      case "tour": tourDispatch({ type: "start" }); break;
      case "help": setHelp(true); break;
      case "palette": setPalette(true); break;
    }
  };
  keyHandler.current = (e) => {
    if (e.key === "Escape") {
      if (modal) return; // the dialog closes itself
      if (auto.on) stopAutoplay(); else if (drawer) setDrawer(false);
      return;
    }
    if (modal) return;
    const id = shortcutFor(e);
    if (!id) return;
    if (id === "palette" || id === "help") e.preventDefault();
    runAction(id);
  };
  useEffect(() => {
    const f = (e: KeyboardEvent) => keyHandler.current(e);
    window.addEventListener("keydown", f);
    return () => window.removeEventListener("keydown", f);
  }, []);
  // the tour opens by itself once per browser, after the cold open has gone
  useEffect(() => {
    if (!cold && shouldAutoStart(safeStorage())) { tourDispatch({ type: "start" }); markTourSeen(safeStorage()); }
  }, [cold]);
  const paletteItems = ACTIONS.filter((a) => a.id !== "toggle-haptics" || Haptics.supported()).map((a) => ({
    ...a,
    disabled: (a.id.startsWith("vec-") && busy) || (a.id === "autoplay" && !auto.on && (ui.running || !!fault || !sid)) || (a.id === "reset-session" && ui.running),
  }));

  const keyEl = (style?: React.CSSProperties, docked?: boolean) => (
    <HumanKey disabled={!sid || ui.running || locked} turning={keyTurning} attention={keyAttn} shake={keyShake} result={keyResult}
      onSubmit={submitKey} requested={keyRequested} onCancelRequest={() => { humanWait.current?.(false); humanWait.current = null; setKeyRequested(false); stopAutoplay(); }}
      docked={docked} style={style} />
  );

  return (
    <div className="app" data-console={consoleClosed ? "closed" : "open"} data-dragging={dragging || undefined} data-testid="app" data-rail={nt.toasts.length === 0 ? "empty" : undefined}
      style={{ "--console-w": `${consoleClosed ? 46 : lay.layout.console}px`, "--tape-h": `${tapeCollapsed ? 34 : lay.layout.tape}px`, "--drawer-w": `${lay.layout.drawer}px` } as React.CSSProperties}>
      <header className="top">
        <div className="mark">Inter<i>lock</i><small>The Chimeric Automaton</small></div>
        <div className="sub">M = (Q, Σ, δ, q₀, F) · the agent proposes, the gate decides</div>
        <div className="sp" />
        <div className="seg" role="group" aria-label="Who proposes actions">
          <span className="seg-l">Agent:</span>
          <button type="button" className="tg" aria-pressed={mode === "model"} disabled={modelOff || replayOnly} onClick={() => setMode("model")}
            title={modelOff ? "The model is off on this server (INTERLOCK_MODEL=off)" : "A model proposes actions"}>model</button>
          <button type="button" className="tg" aria-pressed={mode === "you"} onClick={() => setMode("you")} title="You propose actions by hand; the real gate decides; no model runs">you</button>
        </div>
        {replayOnly && <button type="button" className="tg" onClick={exitReplay}>Exit replay</button>}
        <button type="button" className="tg" aria-pressed={soundOn} onClick={toggleSound} title="Synthesised cues, off by default. Starts only after this click.">{soundOn ? "Sound on" : "Sound off"}</button>
        {Haptics.supported() && (
          <button type="button" className="tg wide-only" aria-pressed={hapticsOn} onClick={toggleHaptics} title="Vibration works only on supporting Android browsers (Chrome, Firefox). iOS Safari and most desktops ignore it.">{hapticsOn ? "Haptics on" : "Haptics off"}</button>
        )}
        <button type="button" className="tg wide-only" onClick={lay.resetAll} disabled={lay.isDefault && !consoleClosed} title="Put the tape, console and drawer back to their default sizes">Reset layout</button>
        <button type="button" className="tg" data-tour="palette" aria-keyshortcuts="Control+K" onClick={() => setPalette(true)} title="Every action in one list (Ctrl+K or /)">Commands</button>
        <button type="button" className="tg wide-only" aria-keyshortcuts="?" onClick={() => setHelp(true)} title="Every keyboard shortcut (?)">Keys</button>
        <button type="button" className="tg wide-only" onClick={() => tourDispatch({ type: "start" })} title="Replay the 30-second tour (T)">Help</button>
        <button type="button" className="tg" aria-pressed={race} onClick={() => setRace(true)} title="The same attacks against a prompt-only agent and against Interlock, side by side">Race</button>
        <button type="button" className="tg" data-tour="proof" aria-expanded={drawer} aria-controls="drawer" onClick={() => setDrawer((v) => !v)}>Proof</button>
      </header>

      <Scoreboard score={score} counters={ui.counters} logLoaded={ui.counters !== null} />

      <div className="rail" aria-label="Notifications" data-empty={nt.toasts.length === 0 || undefined}>
        <Toasts state={nt} onDismiss={(id) => notify({ type: "dismiss", id })} />
      </div>

      {policy ? (
        <Stage policy={policy} current={shownState} locked={locked} fxRef={fxRef} why={scrubbing ? null : why} traceEdge={traceEdge} replayLabel={replayLabel} lastTaken={lastAccepted ? { from: lastAccepted.from, symbol: lastAccepted.symbol } : null}
          wordLength={score.allowed + score.human} lastDecision={lastWithLatency?.latency !== undefined ? `${lastWithLatency.latency} ms` : "n/a"} dim={!!fault}>
          {(m) => (
            <>
              {locked && <div className="locked" role="status"><div>Session locked</div><span>{ui.counters?.max_consecutive_rejects} rejected proposals in a row. The gate refuses everything. Reset to continue.</span></div>}
              {fault && <FaultPanel fault={fault} onRetry={() => void start()} />}
              {!narrow && keyEl({ left: m.ox + KEY_ZONE.x * m.s, top: m.oy + KEY_ZONE.y * m.s, transformOrigin: "top left", transform: `scale(${m.s})` })}
            </>
          )}
        </Stage>
      ) : (
        <section className="stage" aria-label="The state machine">
          {fault ? <FaultPanel fault={fault} onRetry={() => void start()} />
            : <p style={{ padding: 20 }}>Loading the machine from GET /policy.</p>}
        </section>
      )}
      {narrow && keyEl(undefined, true)}

      {policy && <TraceTape beats={ui.beats} policy={policy} replay={replay} logCount={ui.log.length} scrub={scrubbing ? scrub : null} onScrub={setScrub} onShare={() => void shareReplay()}
        collapsed={tapeCollapsed} onToggle={() => setTapeCollapsed((v) => !v)} onTrace={setTraceEdge} readOnly={replayOnly} />}

      <Console items={ui.items} running={ui.running} disabled={!sid || !!fault} reduced={reduced} closed={consoleClosed} autoplay={auto} status={status}
        onToggle={() => setConsoleClosed((v) => !v)} onSend={(t) => void sendMessage(t)}
        mode={mode} policy={policy} onPropose={(a) => void proposeActions(a)} onScript={runScript}
        onAutoplay={() => void startAutoplay()} onStopAutoplay={stopAutoplay} onReset={() => void start()} />

      <ProofDrawer open={drawer} onClose={() => setDrawer(false)} log={ui.log} counters={ui.counters} verdict={ui.lastVerdict} policy={policy} why={why?.sentence ?? null} onExport={exportAudit}
        resizer={!narrow && (
          <Separator orientation="vertical" growsToward="left" label="Resize the proof drawer" className="sep-drawer" controls="drawer" value={lay.layout.drawer}
            {...lay.bounds("drawer")} onChange={(v) => lay.set("drawer", v)} onReset={() => lay.reset("drawer")} onDragging={setDragging} />
        )} />
      {!narrow && (
        <Separator orientation="horizontal" growsToward="up" label="Resize the trace tape" className="sep-tape" value={lay.layout.tape}
          {...lay.bounds("tape")} onChange={(v) => lay.set("tape", v)} onReset={() => lay.reset("tape")} onDragging={setDragging} />
      )}
      {!narrow && !consoleClosed && (
        <Separator orientation="vertical" growsToward="left" label="Resize the agent console" className="sep-console" value={lay.layout.console}
          {...lay.bounds("console")} onChange={(v) => lay.set("console", v)} onReset={() => lay.reset("console")} onDragging={setDragging} />
      )}
      {race && <RaceView onClose={() => setRace(false)} modelOn={!modelOff} reduced={reduced} />}
      {cold && <ColdOpen onDone={() => setCold(false)} />}
      {palette && <Palette items={paletteItems} onRun={runAction} onClose={() => setPalette(false)} />}
      {help && <HelpOverlay onClose={() => setHelp(false)} />}
      {tour.open && <Tour state={tour} reduced={reduced} onNext={() => closeTour({ type: "next" })} onBack={() => tourDispatch({ type: "back" })} onSkip={() => closeTour({ type: "skip" })} />}
    </div>
  );
}
