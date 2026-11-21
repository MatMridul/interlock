import { useRef, type KeyboardEvent, type PointerEvent } from "react";

export const STEP = 16;
export const BIG_STEP = 64;

interface Props {
  /** "vertical" is a vertical line that changes a width; "horizontal" is a horizontal line that changes a height */
  orientation: "vertical" | "horizontal";
  label: string;
  value: number;
  min: number;
  max: number;
  /** which way the pointer moves to make the panel bigger: the console and drawer grow leftwards, the tape grows upwards */
  growsToward: "left" | "up";
  onChange: (v: number) => void;
  onReset: () => void;
  className?: string;
  controls?: string;
  onDragging?: (on: boolean) => void;
}

/** A real window splitter: focusable, keyboard and pointer, with pointer capture so a drag never sticks. */
export function Separator({ orientation, label, value, min, max, growsToward, onChange, onReset, className, controls, onDragging }: Props) {
  const drag = useRef<{ id: number; start: number; from: number } | null>(null);
  const axis = (e: { clientX: number; clientY: number }) => (orientation === "vertical" ? e.clientX : e.clientY);
  const sign = growsToward === "left" || growsToward === "up" ? -1 : 1;

  const end = (e: PointerEvent<HTMLDivElement>) => {
    if (!drag.current) return;
    const id = drag.current.id;
    drag.current = null;
    try { if (e.currentTarget.hasPointerCapture?.(id)) e.currentTarget.releasePointerCapture(id); } catch { /* already released */ }
    onDragging?.(false);
  };

  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const step = e.shiftKey ? BIG_STEP : STEP;
    // the arrow along the drag axis that points toward the growth side makes it bigger
    const bigger = orientation === "vertical" ? "ArrowLeft" : "ArrowUp";
    const smaller = orientation === "vertical" ? "ArrowRight" : "ArrowDown";
    let next: number | null = null;
    if (e.key === bigger) next = value + step;
    else if (e.key === smaller) next = value - step;
    else if (e.key === "Home") next = min;
    else if (e.key === "End") next = max;
    else if (e.key === "Enter") { e.preventDefault(); onReset(); return; }
    if (next === null) return;
    e.preventDefault();
    onChange(Math.min(max, Math.max(min, next)));
  };

  return (
    <div
      role="separator" tabIndex={0} className={`sep sep-${orientation}${className ? ` ${className}` : ""}`}
      aria-orientation={orientation} aria-label={label} aria-controls={controls}
      aria-valuenow={Math.round(value)} aria-valuemin={min} aria-valuemax={max}
      aria-keyshortcuts="ArrowLeft ArrowRight ArrowUp ArrowDown Shift+Arrow Home End Enter"
      title={`${label}. Drag, or use the arrow keys (Shift for bigger steps). Double click or Enter resets.`}
      onPointerDown={(e) => {
        if (e.button !== undefined && e.button !== 0) return;
        e.preventDefault();
        drag.current = { id: e.pointerId, start: axis(e), from: value };
        try { e.currentTarget.setPointerCapture?.(e.pointerId); } catch { /* synthetic pointer: no capture, moves still arrive */ }
        onDragging?.(true);
      }}
      onPointerMove={(e) => {
        const d = drag.current;
        if (!d) return;
        onChange(Math.min(max, Math.max(min, d.from + sign * (axis(e) - d.start))));
      }}
      onPointerUp={end}
      onPointerCancel={end}
      onLostPointerCapture={end}
      onDoubleClick={onReset}
      onKeyDown={onKey}
    />
  );
}
