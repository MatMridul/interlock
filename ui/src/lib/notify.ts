/** Notification model from docs/ui-v2/MOTION_GRAMMAR.md: at most 3 stacked, blocked and needs-human stay. */
export type ToastKind = "info" | "allowed" | "blocked" | "needs-human" | "error";

export interface Toast {
  id: number;
  kind: ToastKind;
  label: string;
  text: string;
  persist: boolean;
  priority: "polite" | "assertive";
}

export interface NotifyState {
  toasts: Toast[];
  nextId: number;
  /** text for the screen-reader live region; `n` changes on every message so repeats are announced */
  live: { text: string; priority: "polite" | "assertive"; n: number };
}

export const MAX_TOASTS = 3;
export const FADE_MS = 4200;

export const initialNotify: NotifyState = { toasts: [], nextId: 1, live: { text: "", priority: "polite", n: 0 } };

export type NotifyAction =
  | { type: "push"; kind: ToastKind; text: string; label?: string }
  | { type: "say"; text: string }
  | { type: "dismiss"; id: number }
  | { type: "dismiss_kind"; kinds: ToastKind[] }
  | { type: "clear" };

const LABEL: Record<ToastKind, string> = { info: "Info", allowed: "Allowed", blocked: "Blocked", "needs-human": "Needs a human", error: "Error" };
const PERSIST: Record<ToastKind, boolean> = { info: false, allowed: false, blocked: true, "needs-human": true, error: true };
const PRIORITY: Record<ToastKind, "polite" | "assertive"> = { info: "polite", allowed: "polite", blocked: "assertive", "needs-human": "assertive", error: "assertive" };

export function notifyReducer(s: NotifyState, a: NotifyAction): NotifyState {
  switch (a.type) {
    case "say":
      return { ...s, live: { text: a.text, priority: "polite", n: s.live.n + 1 } };
    case "dismiss":
      return { ...s, toasts: s.toasts.filter((t) => t.id !== a.id) };
    case "dismiss_kind":
      return { ...s, toasts: s.toasts.filter((t) => !a.kinds.includes(t.kind)) };
    case "clear":
      return { ...s, toasts: [] };
    case "push": {
      const persist = PERSIST[a.kind];
      // a newer persistent toast of the same kind supersedes the older one
      let toasts = persist ? s.toasts.filter((t) => t.kind !== a.kind) : [...s.toasts];
      toasts.push({ id: s.nextId, kind: a.kind, label: a.label ?? LABEL[a.kind], text: a.text, persist, priority: PRIORITY[a.kind] });
      while (toasts.length > MAX_TOASTS) {
        const i = toasts.findIndex((t) => !t.persist);
        toasts = toasts.filter((_, k) => k !== (i === -1 ? 0 : i));
      }
      return { toasts, nextId: s.nextId + 1, live: { text: a.text, priority: PRIORITY[a.kind], n: s.live.n + 1 } };
    }
  }
}
