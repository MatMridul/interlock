import { VECTORS } from "../components/Console";

export interface ActionDef {
  id: string;
  title: string;
  /** shortcut shown beside the action, if it has one */
  keys?: string;
}

/** Every action the palette can run. Ids are what the shell switches on. */
export const ACTIONS: ActionDef[] = [
  ...VECTORS.map((v) => ({ id: `vec-${v.key}`, title: `Fire attack vector ${v.key}: ${v.name}`, keys: v.key })),
  { id: "autoplay", title: "Start or stop autoplay", keys: "A" },
  { id: "reset-session", title: "Reset session" },
  { id: "toggle-console", title: "Toggle agent console", keys: "C" },
  { id: "toggle-drawer", title: "Toggle proof drawer", keys: "P" },
  { id: "toggle-sound", title: "Toggle sound", keys: "S" },
  { id: "toggle-haptics", title: "Toggle haptics" },
  { id: "reset-layout", title: "Reset layout" },
  { id: "tour", title: "Start the tour", keys: "T" },
  { id: "help", title: "Show keyboard shortcuts", keys: "?" },
];

/** What the help overlay lists. Keep in step with `shortcutFor` below. */
export const SHORTCUTS: { keys: string; what: string }[] = [
  { keys: "1 to 6", what: "Fire attack vector 1 to 6" },
  { keys: "A", what: "Start or stop autoplay" },
  { keys: "C", what: "Toggle the agent console" },
  { keys: "P", what: "Toggle the proof drawer" },
  { keys: "S", what: "Toggle sound" },
  { keys: "T", what: "Start the tour" },
  { keys: "Ctrl+K or /", what: "Open the command palette" },
  { keys: "?", what: "Show this list" },
  { keys: "Esc", what: "Close a dialog or the drawer, or stop autoplay" },
  { keys: "Tab, Shift+Tab", what: "Move between controls" },
  { keys: "Arrows on a panel edge", what: "Resize it (Shift for bigger steps, Home or End for the limits, Enter to reset)" },
];

/** True when the keystroke belongs to a text field, a dialog or an editable element: shortcuts must stay silent there. */
export function isTyping(t: EventTarget | null): boolean {
  const el = t as HTMLElement | null;
  if (!el || typeof el.closest !== "function") return false;
  return !!el.closest("input,textarea,select,dialog,[aria-modal=true],[role=separator]") || el.isContentEditable === true;
}

export interface KeyLike { key: string; ctrlKey?: boolean; metaKey?: boolean; altKey?: boolean; target: EventTarget | null }

/** Maps a keystroke to an action id, or null. Single keys never fire while typing; Ctrl/Cmd+K opens the palette from anywhere. */
export function shortcutFor(e: KeyLike): string | null {
  if ((e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === "k") return "palette";
  if (e.ctrlKey || e.metaKey || e.altKey) return null;
  if (isTyping(e.target)) return null;
  if (/^[1-6]$/.test(e.key)) return `vec-${e.key}`;
  switch (e.key) {
    case "/": return "palette";
    case "?": return "help";
    case "a": case "A": return "autoplay";
    case "c": case "C": return "toggle-console";
    case "p": case "P": return "toggle-drawer";
    case "s": case "S": return "toggle-sound";
    case "t": case "T": return "tour";
    default: return null;
  }
}

/** Subsequence match: every query letter must appear in order. Earlier and contiguous matches score higher; no match is null. */
export function fuzzyScore(query: string, text: string): number | null {
  const q = query.toLowerCase().replace(/\s+/g, "");
  if (!q) return 0;
  const t = text.toLowerCase();
  let ti = 0, score = 0, run = 0;
  for (const ch of q) {
    const at = t.indexOf(ch, ti);
    if (at < 0) return null;
    run = at === ti ? run + 1 : 0;
    score += 10 + run * 5 - Math.min(at - ti, 8) + (at === 0 || t[at - 1] === " " ? 6 : 0);
    ti = at + 1;
  }
  return score;
}

export function filterActions<T extends { title: string }>(query: string, items: T[]): T[] {
  if (!query.trim()) return items;
  return items
    .map((it, i) => ({ it, i, s: fuzzyScore(query, it.title) }))
    .filter((x): x is { it: T; i: number; s: number } => x.s !== null)
    .sort((a, b) => b.s - a.s || a.i - b.i)
    .map((x) => x.it);
}
