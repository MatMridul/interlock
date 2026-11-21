/** First-run tour: the steps, the state machine, and the once-per-browser rule. No library. */
export const TOUR_KEY = "interlock.tour.v1";

export interface TourStep {
  id: string;
  /** value of the data-tour attribute on the element to light up */
  target: string;
  title: string;
  text: string;
}

export const TOUR_STEPS: TourStep[] = [
  { id: "machine", target: "machine", title: "The machine", text: "This is the policy as a state machine. The lit state is where the session is now, and the agent can only move along the arrows." },
  { id: "vectors", target: "vectors", title: "Attack vectors", text: "Each of the six sends a real message that tries to talk the agent past the gate. Press 1 to 6, or run Autoplay." },
  { id: "tape", target: "tape", title: "The trace tape", text: "Every allowed action is written here as one cell. A blocked proposal hangs above as a VOID stamp and is never written." },
  { id: "key", target: "key", title: "The human key", text: "Approval is the one move only a person can make. The agent has no tool, endpoint or button for it." },
  { id: "proof", target: "proof", title: "The proof drawer", text: "It lists the executed log, the last verdict as the server sent it, the invariants, and what is not guaranteed." },
  { id: "keys", target: "palette", title: "Keyboard and layout", text: "Press Ctrl+K for every action, ? for all shortcuts. Drag a panel edge, or focus it and use the arrow keys, to resize." },
];

export interface TourState { open: boolean; index: number }
export type TourAction = { type: "start" } | { type: "next" } | { type: "back" } | { type: "skip" } | { type: "finish" };

export const tourClosed: TourState = { open: false, index: 0 };

export function tourReducer(s: TourState, a: TourAction, n = TOUR_STEPS.length): TourState {
  switch (a.type) {
    case "start": return { open: true, index: 0 };
    case "next": return !s.open ? s : s.index >= n - 1 ? tourClosed : { open: true, index: s.index + 1 };
    case "back": return !s.open ? s : { open: true, index: Math.max(0, s.index - 1) };
    case "skip":
    case "finish": return tourClosed;
  }
}

type Store = Pick<Storage, "getItem" | "setItem">;

export const hasSeenTour = (st: Pick<Storage, "getItem"> | null): boolean => {
  try { return !!st && st.getItem(TOUR_KEY) === "seen"; } catch { return true; } // unreadable storage: do not nag on every load
};

export function markTourSeen(st: Pick<Storage, "setItem"> | null) {
  try { st?.setItem(TOUR_KEY, "seen"); } catch { /* not persisted: it may show again next visit */ }
}

/** The tour opens by itself exactly once per browser. Skipping, finishing or closing it all count as seen. */
export function shouldAutoStart(st: Store | null): boolean {
  return !hasSeenTour(st);
}
