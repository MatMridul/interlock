import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Palette } from "../components/Palette";
import { Tour } from "../components/Tour";
import { ACTIONS, filterActions, fuzzyScore, isTyping, shortcutFor } from "../lib/keymap";
import { TOUR_KEY, TOUR_STEPS, hasSeenTour, markTourSeen, shouldAutoStart, tourClosed, tourReducer } from "../lib/tour";

describe("tour state machine", () => {
  it("walks forward and back, never below the first step, and closes after the last", () => {
    let s = tourReducer(tourClosed, { type: "start" });
    expect(s).toEqual({ open: true, index: 0 });
    s = tourReducer(s, { type: "back" });
    expect(s.index).toBe(0);
    for (let i = 1; i < TOUR_STEPS.length; i++) s = tourReducer(s, { type: "next" });
    expect(s).toEqual({ open: true, index: TOUR_STEPS.length - 1 });
    expect(tourReducer(s, { type: "next" })).toEqual(tourClosed);
  });
  it("skip closes from any step and next or back do nothing while closed", () => {
    expect(tourReducer({ open: true, index: 3 }, { type: "skip" })).toEqual(tourClosed);
    expect(tourReducer(tourClosed, { type: "next" })).toEqual(tourClosed);
    expect(tourReducer(tourClosed, { type: "back" })).toEqual(tourClosed);
  });
  it("has five to six steps, each one short sentence pair, none with claims the reports do not make", () => {
    expect(TOUR_STEPS.length).toBeGreaterThanOrEqual(5);
    expect(TOUR_STEPS.length).toBeLessThanOrEqual(6);
    const all = TOUR_STEPS.map((s) => s.text).join(" ").toLowerCase();
    for (const banned of ["hallucination", "mathematically", "jflap", "proven"]) expect(all).not.toContain(banned);
  });
});

describe("tour shows once per browser", () => {
  const mem = () => { const m: Record<string, string> = {}; return { m, st: { getItem: (k: string) => m[k] ?? null, setItem: (k: string, v: string) => { m[k] = v; } } }; };
  it("auto-starts until it is marked seen, under a versioned key", () => {
    const { m, st } = mem();
    expect(shouldAutoStart(st)).toBe(true);
    markTourSeen(st);
    expect(Object.keys(m)).toEqual([TOUR_KEY]);
    expect(TOUR_KEY).toMatch(/\.v1$/);
    expect(shouldAutoStart(st)).toBe(false);
    expect(hasSeenTour({ getItem: (k) => (k === "interlock.tour.v0" ? "seen" : null) })).toBe(false);
  });
  it("does not nag when storage throws", () => {
    expect(hasSeenTour({ getItem: () => { throw new Error("denied"); } })).toBe(true);
    expect(() => markTourSeen({ setItem: () => { throw new Error("full"); } })).not.toThrow();
  });
});

describe("Tour component", () => {
  it("shows the step, moves focus to Next, and Esc and arrow keys act", () => {
    const next = vi.fn(), back = vi.fn(), skip = vi.fn();
    render(<Tour state={{ open: true, index: 1 }} reduced={false} onNext={next} onBack={back} onSkip={skip} />);
    expect(screen.getByRole("dialog")).toHaveTextContent(TOUR_STEPS[1].title);
    expect(screen.getByText("Step 2 of 6")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Next" })).toHaveFocus();
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "ArrowRight" });
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "ArrowLeft" });
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect([next.mock.calls.length, back.mock.calls.length, skip.mock.calls.length]).toEqual([1, 1, 1]);
  });
  it("the last step says Done and Back is disabled on the first", () => {
    const { rerender } = render(<Tour state={{ open: true, index: 0 }} reduced onNext={() => {}} onBack={() => {}} onSkip={() => {}} />);
    expect(screen.getByRole("button", { name: "Back" })).toBeDisabled();
    rerender(<Tour state={{ open: true, index: TOUR_STEPS.length - 1 }} reduced onNext={() => {}} onBack={() => {}} onSkip={() => {}} />);
    expect(screen.getByRole("button", { name: "Done" })).toBeInTheDocument();
  });
});

describe("palette filtering", () => {
  it("lists every action with no query", () => {
    expect(filterActions("", ACTIONS)).toHaveLength(ACTIONS.length);
    expect(ACTIONS.filter((a) => a.id.startsWith("vec-"))).toHaveLength(6);
  });
  it("matches by subsequence, ranks tighter matches first, and returns nothing for nonsense", () => {
    expect(filterActions("tour", ACTIONS)[0].id).toBe("tour");
    expect(filterActions("rl", ACTIONS).map((a) => a.id)).toContain("reset-layout");
    expect(filterActions("fire 3", ACTIONS)[0].id).toBe("vec-3");
    expect(filterActions("zzzq", ACTIONS)).toEqual([]);
    expect(fuzzyScore("abc", "a b c")).not.toBeNull();
    expect(fuzzyScore("cba", "abc")).toBeNull();
  });
  it("runs the highlighted action on Enter, moves with arrows, and closes on Esc", () => {
    const run = vi.fn(), close = vi.fn();
    render(<Palette items={ACTIONS} onRun={run} onClose={close} />);
    const box = screen.getByRole("combobox");
    expect(box).toHaveFocus();
    fireEvent.change(box, { target: { value: "sound" } });
    fireEvent.keyDown(box, { key: "Enter" });
    expect(run).toHaveBeenCalledWith("toggle-sound");
    fireEvent.change(box, { target: { value: "" } });
    fireEvent.keyDown(box, { key: "ArrowDown" });
    fireEvent.keyDown(box, { key: "Enter" });
    expect(run).toHaveBeenLastCalledWith("vec-2");
    fireEvent.keyDown(box, { key: "Escape" });
    expect(close).toHaveBeenCalled();
  });
  it("does not run a disabled action", () => {
    const run = vi.fn();
    render(<Palette items={[{ id: "x", title: "Only action", disabled: true }]} onRun={run} onClose={() => {}} />);
    fireEvent.keyDown(screen.getByRole("combobox"), { key: "Enter" });
    expect(run).not.toHaveBeenCalled();
  });
});

describe("shortcut guard", () => {
  const on = (key: string, target: EventTarget | null = document.body, extra = {}) => shortcutFor({ key, target, ...extra });
  it("maps keys to actions", () => {
    expect(on("1")).toBe("vec-1");
    expect(on("6")).toBe("vec-6");
    expect(on("7")).toBeNull();
    expect(on("/")).toBe("palette");
    expect(on("k", document.body, { ctrlKey: true })).toBe("palette");
    expect(on("?")).toBe("help");
    expect(on("a")).toBe("autoplay");
    expect(on("c", document.body, { ctrlKey: true })).toBeNull(); // Ctrl+C is the browser's
  });
  it("stays silent while typing in an input, textarea, select, dialog or editable element", () => {
    const mk = (tag: string) => document.body.appendChild(document.createElement(tag));
    for (const tag of ["input", "textarea", "select", "dialog"]) expect(on("1", mk(tag)), tag).toBeNull();
    const ed = mk("div"); ed.setAttribute("contenteditable", "true");
    Object.defineProperty(ed, "isContentEditable", { value: true });
    expect(on("a", ed)).toBeNull();
    expect(isTyping(mk("button"))).toBe(false);
    // the palette key still works from inside the message box
    expect(on("k", mk("textarea"), { metaKey: true })).toBe("palette");
  });
});
