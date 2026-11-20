import { useEffect, useState } from "react";

const KEY = "interlock.coldopen";

/** 2.5 s title card, skippable with any key or a click, shown once per browser session, never under reduced motion. */
export function shouldPlayColdOpen(): boolean {
  try {
    if (typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches) return false;
    if (sessionStorage.getItem(KEY)) return false;
  } catch {
    /* storage blocked: play it once per page load */
  }
  return true;
}

export function ColdOpen({ onDone }: { onDone: () => void }) {
  const [gone, setGone] = useState(false);
  useEffect(() => {
    try { sessionStorage.setItem(KEY, "1"); } catch { /* ignore */ }
    const finish = () => { setGone(true); onDone(); };
    const t = setTimeout(finish, 3000);
    const key = () => finish();
    window.addEventListener("keydown", key);
    return () => { clearTimeout(t); window.removeEventListener("keydown", key); };
  }, [onDone]);
  if (gone) return null;
  return (
    <div className="cold" role="presentation" onClick={() => { setGone(true); onDone(); }} data-testid="cold-open">
      <div>
        <div className="t">INTER<i>LOCK</i></div>
        <div className="ln-pw" />
        <div className="s">The Chimeric Automaton</div>
        <div className="g">An AI agent proposes. A small, checkable state machine decides what actually runs.</div>
        <div className="k">any key or click to skip</div>
      </div>
    </div>
  );
}
