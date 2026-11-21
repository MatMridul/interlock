import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { BIG_STEP, STEP, Separator } from "../components/Separator";
import { LAYOUT_KEY, boundsFor, clampPanel, defaultsFor, loadLayout, saveLayout } from "../lib/layout";
import { AIRLOCK, KEY_ZONE, buildEdges, cubicAt, orbPositions } from "../lib/geometry";
import type { Policy } from "../types";

const vp = { w: 1440, h: 900 };
const store = (v: string | null) => ({ getItem: () => v });

describe("layout persistence", () => {
  it("uses defaults when nothing is saved", () => {
    expect(loadLayout(vp, store(null))).toEqual(defaultsFor(vp));
  });
  it("falls back to defaults on corrupt JSON, wrong shapes and no storage", () => {
    for (const bad of ["{not json", "[]", "null", "42", '"x"']) expect(loadLayout(vp, store(bad))).toEqual(defaultsFor(vp));
    expect(loadLayout(vp, null)).toEqual(defaultsFor(vp));
    const throwing = { getItem: () => { throw new Error("denied"); } };
    expect(loadLayout(vp, throwing)).toEqual(defaultsFor(vp));
  });
  it("keeps valid fields, drops invalid ones and clamps out-of-range ones", () => {
    const l = loadLayout(vp, store(JSON.stringify({ tape: 9999, console: "wide", drawer: 400 })));
    expect(l.tape).toBe(boundsFor("tape", vp).max);
    expect(l.console).toBe(defaultsFor(vp).console);
    expect(l.drawer).toBe(400);
  });
  it("round-trips through the versioned key and ignores other versions", () => {
    const mem: Record<string, string> = {};
    const s = { getItem: (k: string) => mem[k] ?? null, setItem: (k: string, v: string) => { mem[k] = v; } };
    saveLayout({ tape: 300, console: 350, drawer: 500 }, s);
    expect(Object.keys(mem)).toEqual([LAYOUT_KEY]);
    expect(LAYOUT_KEY).toMatch(/\.v1$/);
    expect(loadLayout(vp, s)).toEqual({ tape: 300, console: 350, drawer: 500 });
    expect(loadLayout(vp, { getItem: (k) => (k === "interlock.layout.v0" ? mem[LAYOUT_KEY] : null) })).toEqual(defaultsFor(vp));
  });
  it("never lets the stage shrink below a usable height", () => {
    const small = { w: 1280, h: 720 };
    const b = boundsFor("tape", small);
    expect(small.h - 222 - b.max).toBeGreaterThanOrEqual(240);
    expect(clampPanel("tape", 10, small)).toBe(b.min);
  });
});

function Harness({ onReset = () => {}, initial = 300, growsToward = "left" as "left" | "up", orientation = "vertical" as "vertical" | "horizontal" }) {
  const [v, setV] = useState(initial);
  return <Separator orientation={orientation} growsToward={growsToward} label="Resize the thing" value={v} min={200} max={500} onChange={setV} onReset={() => { setV(300); onReset(); }} />;
}
const sep = () => screen.getByRole("separator", { name: "Resize the thing" });

describe("Separator", () => {
  it("is a focusable separator with value, bounds and orientation", () => {
    render(<Harness />);
    const s = sep();
    expect(s).toHaveAttribute("aria-orientation", "vertical");
    expect(s).toHaveAttribute("aria-valuenow", "300");
    expect(s).toHaveAttribute("aria-valuemin", "200");
    expect(s).toHaveAttribute("aria-valuemax", "500");
    expect(s).toHaveAttribute("tabindex", "0");
  });
  it("arrow keys resize by a step, Shift by a bigger step, in the growth direction", () => {
    render(<Harness />);
    const s = sep();
    fireEvent.keyDown(s, { key: "ArrowLeft" });
    expect(s).toHaveAttribute("aria-valuenow", String(300 + STEP));
    fireEvent.keyDown(s, { key: "ArrowRight", shiftKey: true });
    expect(s).toHaveAttribute("aria-valuenow", String(300 + STEP - BIG_STEP));
  });
  it("horizontal separators use up and down", () => {
    render(<Harness orientation="horizontal" growsToward="up" />);
    fireEvent.keyDown(sep(), { key: "ArrowUp" });
    expect(sep()).toHaveAttribute("aria-valuenow", String(300 + STEP));
    fireEvent.keyDown(sep(), { key: "ArrowLeft" });
    expect(sep()).toHaveAttribute("aria-valuenow", String(300 + STEP));
  });
  it("Home and End jump to the limits and arrows stop at them", () => {
    render(<Harness />);
    fireEvent.keyDown(sep(), { key: "End" });
    expect(sep()).toHaveAttribute("aria-valuenow", "500");
    fireEvent.keyDown(sep(), { key: "ArrowLeft", shiftKey: true });
    expect(sep()).toHaveAttribute("aria-valuenow", "500");
    fireEvent.keyDown(sep(), { key: "Home" });
    expect(sep()).toHaveAttribute("aria-valuenow", "200");
  });
  it("Enter and double click reset", () => {
    const reset = vi.fn();
    render(<Harness initial={450} onReset={reset} />);
    fireEvent.keyDown(sep(), { key: "Enter" });
    expect(reset).toHaveBeenCalledTimes(1);
    expect(sep()).toHaveAttribute("aria-valuenow", "300");
    fireEvent.keyDown(sep(), { key: "End" });
    fireEvent.doubleClick(sep());
    expect(reset).toHaveBeenCalledTimes(2);
  });
  it("drags with pointer capture, follows the pointer, clamps, and stops on release", () => {
    render(<Harness />);
    const s = sep();
    const set = vi.fn(), rel = vi.fn();
    Object.assign(s, { setPointerCapture: set, releasePointerCapture: rel, hasPointerCapture: () => true });
    const ptr = (type: string, x: number) => fireEvent(s, Object.assign(new MouseEvent(type, { bubbles: true, clientX: x, clientY: 0, button: 0 }), { pointerId: 7 }));
    ptr("pointerdown", 1000);
    expect(set).toHaveBeenCalledWith(7);
    ptr("pointermove", 960); // 40 px to the left makes the right-hand panel 40 px wider
    expect(s).toHaveAttribute("aria-valuenow", "340");
    ptr("pointermove", 100);
    expect(s).toHaveAttribute("aria-valuenow", "500");
    ptr("pointerup", 100);
    expect(rel).toHaveBeenCalledWith(7);
    ptr("pointermove", 1000); // after release the pointer no longer drags
    expect(s).toHaveAttribute("aria-valuenow", "500");
  });
  it("a cancelled pointer also ends the drag", () => {
    render(<Harness />);
    const s = sep();
    Object.assign(s, { setPointerCapture: () => {}, releasePointerCapture: () => {}, hasPointerCapture: () => false });
    const ptr = (type: string, x: number) => fireEvent(s, Object.assign(new MouseEvent(type, { bubbles: true, clientX: x, button: 0 }), { pointerId: 1 }));
    ptr("pointerdown", 500);
    ptr("pointercancel", 500);
    ptr("pointermove", 400);
    expect(s).toHaveAttribute("aria-valuenow", "300");
  });
});

describe("stage geometry keeps the key panel clear", () => {
  const policy: Policy = {
    name: "T", states: ["START", "AUTHED", "DRAFTED", "APPROVED", "SINK"], symbols: ["AUTH", "DRAFT", "MFA", "TRANSFER"], initial: "START",
    transitions: {
      START: { AUTH: "AUTHED" }, AUTHED: { DRAFT: "DRAFTED" }, DRAFTED: { MFA: "APPROVED", DRAFT: "DRAFTED" }, APPROVED: { TRANSFER: "AUTHED" },
    },
  };
  const pad = 12;
  const inside = (p: { x: number; y: number }) => p.x > KEY_ZONE.x - pad && p.x < KEY_ZONE.x + KEY_ZONE.w + pad && p.y > KEY_ZONE.y - pad && p.y < KEY_ZONE.y + KEY_ZONE.h + pad;
  it("no conduit sample or label falls inside the key zone, and the zone fits the stage", () => {
    const edges = buildEdges(policy, orbPositions(policy.states));
    expect(edges.length).toBeGreaterThan(3);
    for (const e of edges) {
      for (let i = 0; i <= 60; i++) expect(inside(cubicAt(e.curve, i / 60)), `${e.id} t=${i / 60}`).toBe(false);
      expect(inside(e.label), `${e.id} label`).toBe(false);
    }
    expect(KEY_ZONE.y + KEY_ZONE.h).toBeLessThanOrEqual(560);
    expect(KEY_ZONE.x + KEY_ZONE.w).toBeLessThanOrEqual(1000);
    expect(AIRLOCK.x).toBeLessThan(KEY_ZONE.x);
  });
});
