import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { SafeShipView, type SafeShipData } from "../components/SafeShipView";

const DATA: SafeShipData = {
  policy: {
    name: "safe_ship", states: ["CLEAN", "EDITED", "TESTED", "SINK"], symbols: ["EDIT", "TEST", "COMMIT", "PUSH", "DEPLOY"], initial: "CLEAN",
    letters: { EDIT: "E", TEST: "T", COMMIT: "C", PUSH: "P", DEPLOY: "D" }, accepting: ["CLEAN", "EDITED", "TESTED"],
    transitions: {
      CLEAN: { EDIT: "EDITED", TEST: "TESTED", COMMIT: "CLEAN", PUSH: "SINK", DEPLOY: "SINK" },
      EDITED: { EDIT: "EDITED", TEST: "TESTED", COMMIT: "EDITED", PUSH: "SINK", DEPLOY: "SINK" },
      TESTED: { EDIT: "EDITED", TEST: "TESTED", COMMIT: "TESTED", PUSH: "TESTED", DEPLOY: "TESTED" },
      SINK: { EDIT: "SINK", TEST: "SINK", COMMIT: "SINK", PUSH: "SINK", DEPLOY: "SINK" },
    },
  },
  recorded: {
    label: "recorded Kiro CLI 3.5.0 run, 2026-11-22", source: "docs/evidence/safe_ship_live_decisions.jsonl",
    steps: [
      { n: 1, symbol: "EDIT", action: "edit app.py", tool: "str_replace", refused: false, message: "", from: "CLEAN", to: "EDITED" },
      { n: 2, symbol: "PUSH", action: "push", tool: "execute_pwsh", refused: true, message: "PUSH refused in state EDITED", from: "EDITED", to: "EDITED" },
    ],
  },
};

beforeAll(() => { HTMLCanvasElement.prototype.getContext = (() => null) as never; });
beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(async (url: string) => (url.endsWith("/policies/safe_ship") ? Response.json(DATA) : new Response("{}", { status: 404 }))));
});
afterEach(() => vi.unstubAllGlobals());

describe("Safe Ship view (C7)", () => {
  it("draws the Safe Ship machine and labels the recorded run", async () => {
    const { container } = render(<SafeShipView reduced />);
    await waitFor(() => expect(screen.getByTestId("ss-label").textContent).toBe("recorded Kiro CLI 3.5.0 run, 2026-11-22"));
    expect([...container.querySelectorAll("[data-state]")].map((e) => e.getAttribute("data-state"))).toEqual(["CLEAN", "EDITED", "TESTED"]);
  });

  it("what-if over EDIT TEST COMMIT PUSH DEPLOY runs on the table in the browser", async () => {
    render(<SafeShipView reduced />);
    const box = await screen.findByTestId("ss-whatif");
    fireEvent.change(box, { target: { value: "EDIT PUSH" } });
    expect(screen.getByTestId("ss-whatif-result").textContent).toContain("Refused at step 2: PUSH is not allowed in EDITED");
    fireEvent.change(box, { target: { value: "EDIT TEST PUSH DEPLOY" } });
    expect(screen.getByTestId("ss-whatif-result").textContent).toContain("Accepted. Final state TESTED");
    fireEvent.change(box, { target: { value: "SHIP" } });
    expect(screen.getByTestId("ss-whatif-result").textContent).toContain("Unknown symbol");
  });

  it("replays Kiro's refused push from the recording", async () => {
    render(<SafeShipView reduced />);
    fireEvent.click(await screen.findByText("Step"));
    fireEvent.click(screen.getByText("Step"));
    const li = screen.getByTestId("ss-steps").querySelectorAll("li");
    expect(li).toHaveLength(2);
    expect(li[1].getAttribute("data-refused")).toBe("true");
    expect(li[1].textContent).toContain("REFUSED in EDITED");
  });
});
