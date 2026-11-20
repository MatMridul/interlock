import { render } from "@testing-library/react";
import { createRef } from "react";
import { describe, expect, it, beforeAll } from "vitest";
import { Stage } from "../components/Stage";
import type { Fx } from "../lib/fx";
import type { Policy } from "../types";

const policy: Policy = {
  name: "Test", states: ["START", "AUTHED", "DRAFTED", "SINK"], symbols: ["AUTH", "DRAFT"], initial: "START",
  transitions: { START: { AUTH: "AUTHED", DRAFT: "SINK" }, AUTHED: { AUTH: "SINK", DRAFT: "DRAFTED" }, DRAFTED: { AUTH: "SINK", DRAFT: "SINK" } },
};

beforeAll(() => {
  // jsdom has no canvas: the stage must still render its SVG
  HTMLCanvasElement.prototype.getContext = (() => null) as never;
});

const mount = (current: string) =>
  render(<Stage policy={policy} current={current} locked={false} fxRef={createRef<Fx | null>() as never} lastTaken={null} wordLength={0} lastDecision="" />);

describe("Stage", () => {
  it("draws one orb per live state and one conduit per policy transition", () => {
    const { container } = mount("START");
    expect([...container.querySelectorAll("[data-state]")].map((e) => e.getAttribute("data-state"))).toEqual(["START", "AUTHED", "DRAFTED"]);
    expect([...container.querySelectorAll("[data-edge]")].map((e) => e.getAttribute("data-edge")).sort()).toEqual(["AUTHED>DRAFTED", "START>AUTHED"]);
  });
  it("marks only the current state from the policy, and follows it", () => {
    const { container, rerender } = mount("AUTHED");
    const cur = () => [...container.querySelectorAll('[aria-current="true"]')].map((e) => e.parentElement?.getAttribute("data-state"));
    expect(cur()).toEqual(["AUTHED"]);
    rerender(<Stage policy={policy} current="DRAFTED" locked={false} fxRef={createRef<Fx | null>() as never} lastTaken={null} wordLength={0} lastDecision="" />);
    expect(cur()).toEqual(["DRAFTED"]);
  });
});
