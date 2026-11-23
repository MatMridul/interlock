import { useEffect, useRef } from "react";
import { SHORTCUTS } from "../lib/keymap";

/** Every shortcut in one list. Single keys do nothing while a text field has focus. */
export function HelpOverlay({ onClose }: { onClose: () => void }) {
  const btn = useRef<HTMLButtonElement>(null);
  const back = useRef<Element | null>(null);
  useEffect(() => {
    back.current = document.activeElement;
    btn.current?.focus();
    return () => { (back.current as HTMLElement | null)?.focus?.(); };
  }, []);
  return (
    <div className="modal-wrap" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal help" role="dialog" aria-modal="true" aria-labelledby="help-h"
        onKeyDown={(e) => { if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); onClose(); } else if (e.key === "Tab") { e.preventDefault(); btn.current?.focus(); } }}>
        <h2 id="help-h">Keyboard shortcuts</h2>
        <dl>
          {SHORTCUTS.map((s) => (<div key={s.keys}><dt><kbd>{s.keys}</kbd></dt><dd>{s.what}</dd></div>))}
        </dl>
        <p className="modal-foot">Single keys are ignored while you type in a field. Ctrl+K works everywhere.</p>
        <button type="button" className="btn-ghost" ref={btn} onClick={onClose}>Close (Esc)</button>
      </div>
    </div>
  );
}
