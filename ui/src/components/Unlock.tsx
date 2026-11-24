import { useEffect, useRef, useState } from "react";
import * as api from "../api";

interface Props {
  onUnlocked: () => void;
  onCancel: () => void;
}

/** Judge access code, entered once per tab. The server checks it; the page never shows or logs it. */
export function Unlock({ onUnlocked, onCancel }: Props) {
  const [code, setCode] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => input.current?.focus(), []);
  const submit = async () => {
    if (!code || busy) return;
    setBusy(true);
    setMsg("");
    try {
      await api.unlock(code);
      setCode("");
      onUnlocked();
    } catch (e) {
      setMsg(e instanceof api.ApiError ? e.message : "Cannot reach the server.");
    } finally { setBusy(false); }
  };
  return (
    <div className="autostart-wrap" onKeyDown={(e) => { if (e.key === "Escape") onCancel(); }}>
      <form className="autostart" role="dialog" aria-modal="true" aria-labelledby="ul-h" data-testid="unlock"
        onSubmit={(e) => { e.preventDefault(); void submit(); }}>
        <h3 id="ul-h">Enter the judge code</h3>
        <p>
          The live model is open to everyone, with a shared daily allowance. Judges: the access code from the Devpost testing field
          uses a separate reserved share, so it still works when the public allowance is gone. The code stays in this tab only and is never shown.
        </p>
        <label htmlFor="ul-code" className="sr">Judge access code</label>
        <input id="ul-code" ref={input} type="password" autoComplete="off" maxLength={64} value={code} onChange={(e) => setCode(e.target.value)} placeholder="access code" />
        {msg && <p className="dnote" role="alert" data-testid="unlock-msg">{msg}</p>}
        <div className="da">
          <button type="button" className="btn-ghost" onClick={onCancel}>Cancel</button>
          <button type="submit" className="btn-key" disabled={!code || busy}>Unlock</button>
        </div>
      </form>
    </div>
  );
}
