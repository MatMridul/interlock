import { useCallback, useEffect, useState } from "react";

/** Panel sizes in CSS pixels. The key is versioned: a layout saved by another shape is ignored, never half-applied. */
export const LAYOUT_KEY = "interlock.layout.v1";

export type PanelId = "tape" | "console" | "drawer";
export type Layout = Record<PanelId, number>;
export interface Bounds { min: number; max: number }
export type Viewport = { w: number; h: number };

/** Fixed chrome above the tape: header 44, scoreboard about 84, notification rail 78. The stage keeps at least STAGE_MIN. */
const CHROME_H = 190;
const STAGE_MIN_H = 240;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export function boundsFor(id: PanelId, vp: Viewport): Bounds {
  switch (id) {
    case "tape": return { min: 150, max: Math.max(150, Math.min(560, vp.h - CHROME_H - STAGE_MIN_H)) };
    case "console": return { min: 280, max: Math.max(280, Math.min(680, Math.round(vp.w * 0.5))) };
    case "drawer": return { min: 320, max: Math.max(320, Math.min(760, Math.round(vp.w * 0.8))) };
  }
}

export function defaultsFor(vp: Viewport): Layout {
  return {
    tape: clamp(220, boundsFor("tape", vp).min, boundsFor("tape", vp).max),
    console: clamp(Math.round(vp.w * 0.22), 300, 420),
    drawer: clamp(460, boundsFor("drawer", vp).min, boundsFor("drawer", vp).max),
  };
}

export function clampPanel(id: PanelId, v: number, vp: Viewport): number {
  const b = boundsFor(id, vp);
  return clamp(Math.round(v), b.min, b.max);
}

/** Reads the saved layout. Anything missing, non-numeric or unparsable falls back to the default for that panel. */
export function loadLayout(vp: Viewport, storage: Pick<Storage, "getItem"> | null = safeStorage()): Layout {
  const d = defaultsFor(vp);
  if (!storage) return d;
  let raw: unknown;
  try {
    const s = storage.getItem(LAYOUT_KEY);
    raw = s ? JSON.parse(s) : null;
  } catch {
    return d;
  }
  if (typeof raw !== "object" || raw === null) return d;
  const o = raw as Record<string, unknown>;
  const out = { ...d };
  for (const id of ["tape", "console", "drawer"] as PanelId[]) {
    const v = o[id];
    if (typeof v === "number" && Number.isFinite(v)) out[id] = clampPanel(id, v, vp);
  }
  return out;
}

export function saveLayout(l: Layout, storage: Pick<Storage, "setItem"> | null = safeStorage()) {
  try { storage?.setItem(LAYOUT_KEY, JSON.stringify(l)); } catch { /* private mode or full: the layout just does not persist */ }
}

export function safeStorage(): Storage | null {
  try { return typeof localStorage === "undefined" ? null : localStorage; } catch { return null; }
}

const viewport = (): Viewport => ({ w: typeof window === "undefined" ? 1440 : window.innerWidth, h: typeof window === "undefined" ? 900 : window.innerHeight });

/** Panel sizes, kept inside their bounds as the window changes, persisted on every change. */
export function useLayout() {
  const [vp, setVp] = useState<Viewport>(viewport);
  const [layout, setLayout] = useState<Layout>(() => loadLayout(viewport()));
  useEffect(() => {
    const f = () => setVp(viewport());
    window.addEventListener("resize", f);
    return () => window.removeEventListener("resize", f);
  }, []);
  // a window that shrank can leave a saved size out of bounds: pull it back (the saved value is kept until the user resizes)
  const shown: Layout = { tape: clampPanel("tape", layout.tape, vp), console: clampPanel("console", layout.console, vp), drawer: clampPanel("drawer", layout.drawer, vp) };
  const set = useCallback((id: PanelId, v: number) => setLayout((l) => { const n = { ...l, [id]: clampPanel(id, v, vp) }; saveLayout(n); return n; }), [vp]);
  const reset = useCallback((id: PanelId) => set(id, defaultsFor(vp)[id]), [set, vp]);
  const resetAll = useCallback(() => setLayout(() => { const d = defaultsFor(vp); saveLayout(d); return d; }), [vp]);
  const isDefault = (["tape", "console", "drawer"] as PanelId[]).every((id) => shown[id] === defaultsFor(vp)[id]);
  return { layout: shown, bounds: (id: PanelId) => boundsFor(id, vp), set, reset, resetAll, isDefault };
}
