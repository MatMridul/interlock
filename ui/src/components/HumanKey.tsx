import { useEffect, useRef, useState, type CSSProperties } from "react";

export interface CodeResult {
  ok: boolean;
  message: string;
}

interface Props {
  disabled: boolean;
  /** true while the human beat plays: the key turns */
  turning: boolean;
  /** briefly true when an approval is requested (highlight) */
  attention: boolean;
  /** briefly true after a refusal (one shake) */
  shake: boolean;
  result: CodeResult | null;
  onSubmit: (code: string) => Promise<CodeResult>;
  /** autoplay asks for the key: open the dialog straight away */
  requested: boolean;
  onCancelRequest: () => void;
  docked?: boolean;
  style?: CSSProperties;
}

/** The human's control. The only amber object, framed apart from the agent console. The code is never rendered or stored. */
export function HumanKey({ disabled, turning, attention, shake, result, onSubmit, requested, onCancelRequest, docked, style }: Props) {
  const dlg = useRef<HTMLDialogElement>(null);
  const [lifted, setLifted] = useState(false);
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<CodeResult | null>(null);

  useEffect(() => {
    if (requested) { setLifted(true); setOpen(true); }
  }, [requested]);

  useEffect(() => {
    const d = dlg.current;
    if (!d) return;
    if (open && !d.open) {
      setMsg(null);
      if (typeof d.showModal === "function") d.showModal(); else d.setAttribute("open", "");
    }
    if (!open && d.open) {
      if (typeof d.close === "function") d.close(); else d.removeAttribute("open");
    }
  }, [open]);

  const close = () => {
    setOpen(false);
    setCode("");
    if (requested) onCancelRequest();
  };

  const submit = async () => {
    if (!code || busy) return;
    setBusy(true);
    const r = await onSubmit(code);
    setBusy(false);
    setCode("");
    setMsg(r);
    if (r.ok) { setOpen(false); setLifted(false); }
  };

  return (
    <div className={`key${turning ? " turning" : ""}${lifted ? " lifted" : ""}${attention ? " attn" : ""}${shake ? " shake" : ""}${docked ? " docked" : ""}`} style={style} data-testid="human-key">
      <svg viewBox="0 0 46 46" aria-hidden="true">
        <rect x="2" y="2" width="42" height="42" className="k" />
        <g className="kh"><circle cx="23" cy="18" r="6" className="k" /><path d="M23 24v14M23 32h6M23 38h4" className="k" /></g>
        <g className="cover"><rect x="2" y="2" width="42" height="42" className="k" fill="rgba(255,179,71,.14)" /><path d="M2 2L44 44M44 2L2 44" className="k" strokeDasharray="3 3" /></g>
      </svg>
      <h2>Human key</h2>
      <p>HUMAN ONLY. The agent has no tool, endpoint or button for approval (MFA).</p>
      {!lifted ? (
        <button type="button" className="btn-key" disabled={disabled} aria-expanded="false" onClick={() => setLifted(true)}>Lift cover</button>
      ) : (
        <div style={{ display: "flex", gap: 6 }}>
          <button type="button" className="btn-key" disabled={disabled} onClick={() => setOpen(true)}>Enter code…</button>
          <button type="button" className="btn-ghost" onClick={() => setLifted(false)}>Close cover</button>
        </div>
      )}
      <div className={`res${result && !result.ok ? " bad" : ""}`} role="status" aria-live="polite">{result?.message ?? ""}</div>

      <dialog ref={dlg} aria-labelledby="key-h" onClose={() => { setOpen(false); setCode(""); if (requested) onCancelRequest(); }}>
        <form method="dialog" onSubmit={(e) => { e.preventDefault(); void submit(); }}>
          <h3 id="key-h">Turn the key</h3>
          <p className="dnote">Enter the demo code set by the server. It is never shown here and never sent to the agent.</p>
          <label htmlFor="key-code" className="sr">Demo code</label>
          <input id="key-code" type="password" autoComplete="off" value={code} maxLength={64} onChange={(e) => setCode(e.target.value)}
            style={{ width: "100%", background: "var(--void)", border: "1px solid var(--amber-dim)", color: "var(--amber)", padding: "6px 8px", font: "inherit" }} />
          <div className="dots" aria-hidden="true">{"•".repeat(Math.min(code.length, 24))}</div>
          <div className="keypad" role="group" aria-label="Keypad">
            {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => <button key={d} type="button" onClick={() => setCode((c) => (c + d).slice(0, 64))}>{d}</button>)}
            <button type="button" onClick={() => setCode("")} aria-label="Clear">CLR</button>
            <button type="button" onClick={() => setCode((c) => (c + "0").slice(0, 64))}>0</button>
            <button type="button" onClick={() => setCode((c) => c.slice(0, -1))} aria-label="Backspace">⌫</button>
          </div>
          <p className={`dmsg${msg && !msg.ok ? " bad" : ""}`} role="status" aria-live="polite">{msg && !msg.ok ? msg.message : ""}</p>
          <div className="da">
            <button type="button" className="btn-ghost" onClick={close}>Cancel</button>
            <button type="submit" className="btn-key" disabled={busy || !code}>{busy ? "Checking" : "Turn key"}</button>
          </div>
        </form>
      </dialog>
    </div>
  );
}
