import { useEffect } from "react";
import { FADE_MS, type NotifyState, type Toast } from "../lib/notify";

function Item({ t, onDismiss }: { t: Toast; onDismiss: (id: number) => void }) {
  useEffect(() => {
    if (t.persist) return;
    const h = setTimeout(() => onDismiss(t.id), FADE_MS);
    return () => clearTimeout(h);
  }, [t.id, t.persist, onDismiss]);
  return (
    <div className={`toast t-${t.kind}`} data-kind={t.kind}>
      <b className="t-kind">{t.label}</b>
      <span className="t-text">{t.text}</span>
      <button type="button" className="t-x" aria-label={`Dismiss ${t.label} notification`} onClick={() => onDismiss(t.id)}>Dismiss</button>
    </div>
  );
}

/** Visible stack (max 3). A separate live region carries the screen-reader announcement so it is read once. */
export function Toasts({ state, onDismiss }: { state: NotifyState; onDismiss: (id: number) => void }) {
  return (
    <>
      <div className="toasts">{state.toasts.map((t) => <Item key={t.id} t={t} onDismiss={onDismiss} />)}</div>
      <div className="sr" role="status" aria-live={state.live.priority} aria-atomic="true" data-testid="live">{state.live.text}</div>
    </>
  );
}
