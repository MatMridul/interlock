import { useEffect, useRef, useState } from "react";

interface Props {
  /** code: the demo code the owner typed (kept in memory for this run only), or null to skip the human step */
  onStart: (code: string | null) => void;
  onCancel: () => void;
}

/** Shown before the no-model autoplay. The human key steps are the owner's; the code is never in the page source. */
export function AutoStart({ onStart, onCancel }: Props) {
  const [code, setCode] = useState("");
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => input.current?.focus(), []);
  return (
    <div className="autostart-wrap" onKeyDown={(e) => { if (e.key === "Escape") onCancel(); }}>
      <form className="autostart" role="dialog" aria-modal="true" aria-labelledby="as-h" data-testid="auto-start"
        onSubmit={(e) => { e.preventDefault(); if (code) onStart(code); }}>
        <h3 id="as-h">Autoplay: the human steps are yours</h3>
        <p>
          About 70 seconds, no model. A fixed script proposes actions to the real gate: one legitimate transfer, then three attacks.
          Two moments need the human key, and only a person can turn it. Enter the demo code once here. It stays in this tab's memory
          for this run, is never shown or sent to the agent, and is cleared when the run ends.
        </p>
        <label htmlFor="as-code" className="sr">Demo code</label>
        <input id="as-code" ref={input} type="password" autoComplete="off" maxLength={64} value={code} onChange={(e) => setCode(e.target.value)} placeholder="demo code" />
        <p className="dnote">Or skip the human step: nobody approves, and the gate refuses the transfer.</p>
        <div className="da">
          <button type="button" className="btn-ghost" onClick={onCancel}>Cancel</button>
          <button type="button" className="btn-ghost" onClick={() => onStart(null)}>Skip the human step</button>
          <button type="submit" className="btn-key" disabled={!code}>Start with the human key</button>
        </div>
      </form>
    </div>
  );
}
