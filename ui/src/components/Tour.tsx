import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { TOUR_STEPS, type TourState } from "../lib/tour";

interface Props {
  state: TourState;
  reduced: boolean;
  onNext: () => void;
  onBack: () => void;
  onSkip: () => void;
}

interface Box { x: number; y: number; w: number; h: number }
const PAD = 6;
const CALL_W = 340;

/** Spotlight plus callout. Esc skips, Left/Right move, focus goes to Next and returns to where it was. */
export function Tour({ state, reduced, onNext, onBack, onSkip }: Props) {
  const step = TOUR_STEPS[state.index];
  const [box, setBox] = useState<Box | null>(null);
  const next = useRef<HTMLButtonElement>(null);
  const back = useRef<Element | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const last = state.index === TOUR_STEPS.length - 1;

  useEffect(() => {
    back.current = document.activeElement;
    return () => { (back.current as HTMLElement | null)?.focus?.(); };
  }, []);

  useLayoutEffect(() => {
    const measure = () => {
      const el = document.querySelector(`[data-tour="${step.target}"]`);
      const r = el?.getBoundingClientRect();
      setBox(r && r.width > 0 ? { x: r.left, y: r.top, w: r.width, h: r.height } : null);
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [step]);

  useEffect(() => { next.current?.focus(); }, [state.index]);

  const vw = typeof window === "undefined" ? 1280 : window.innerWidth;
  const vh = typeof window === "undefined" ? 800 : window.innerHeight;
  // callout: below the target if there is room, else above, else centred
  let cx = vw / 2 - CALL_W / 2, cy = vh / 2 - 80;
  if (box) {
    cx = Math.min(Math.max(12, box.x + box.w / 2 - CALL_W / 2), vw - CALL_W - 12);
    if (box.y + box.h + 190 < vh) cy = box.y + box.h + PAD + 12;
    else if (box.y > 200) cy = box.y - 190;
    else cy = Math.min(vh - 200, box.y + 24);
  }

  return (
    <div className="tour" ref={root} data-reduced={reduced || undefined}
      onKeyDown={(e) => {
        if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); onSkip(); }
        else if (e.key === "ArrowRight") { e.preventDefault(); onNext(); }
        else if (e.key === "ArrowLeft") { e.preventDefault(); onBack(); }
        else if (e.key === "Tab") {
          const f = [...root.current!.querySelectorAll<HTMLElement>("button:not(:disabled)")];
          const i = f.indexOf(document.activeElement as HTMLElement);
          const n = e.shiftKey ? (i <= 0 ? f.length - 1 : i - 1) : (i + 1) % f.length;
          e.preventDefault();
          f[n]?.focus();
        }
      }}>
      {box ? <div className="tour-spot" style={{ left: box.x - PAD, top: box.y - PAD, width: box.w + PAD * 2, height: box.h + PAD * 2 }} /> : <div className="tour-dim" />}
      <div className="tour-call" role="dialog" aria-modal="true" aria-labelledby="tour-h" aria-describedby="tour-t" style={{ left: cx, top: cy, width: CALL_W }}>
        <p className="tour-n">Step {state.index + 1} of {TOUR_STEPS.length}</p>
        <h2 id="tour-h">{step.title}</h2>
        <p id="tour-t">{step.text}</p>
        <div className="tour-a">
          <button type="button" className="btn-ghost" onClick={onSkip}>Skip (Esc)</button>
          <span className="sp" />
          <button type="button" className="btn-ghost" onClick={onBack} disabled={state.index === 0}>Back</button>
          <button type="button" className="btn-play" ref={next} onClick={onNext}>{last ? "Done" : "Next"}</button>
        </div>
      </div>
    </div>
  );
}
