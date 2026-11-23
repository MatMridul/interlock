import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Console } from "../components/Console";
import { initialUi, reducer, type Action } from "../state";

const sse = (name: string, data: unknown): Action => ({ type: "sse", name, data });
const LINE = "Gate: TRANSFER is not allowed in DRAFTED. It needs a human approval (MFA) first.";

describe("gate line", () => {
  it("gate_explain becomes a gate item after the model's text, not an assistant item", () => {
    const s = [sse("user_message", { text: "pay" }), sse("assistant_text", { text: "Done, I sent it." }), sse("gate_explain", { text: LINE })].reduce(reducer, initialUi());
    expect(s.items.map((i) => i.kind)).toEqual(["user", "assistant", "gate"]);
    expect(s.items[2]).toMatchObject({ kind: "gate", text: LINE });
  });

  it("the console labels it 'gate' under the agent's text, and the agent line keeps its own label", () => {
    const s = [sse("assistant_text", { text: "Done, I sent it." }), sse("gate_explain", { text: LINE })].reduce(reducer, initialUi());
    const noop = () => {};
    render(<Console items={s.items} running={false} disabled={false} reduced closed={false} autoplay={{ on: false, label: "" }} status="" onToggle={noop} onSend={noop} onAutoplay={noop} onStopAutoplay={noop} onReset={noop} />);
    const gate = screen.getByTestId("gate-line");
    expect(gate).toHaveTextContent(LINE);
    expect(gate.querySelector(".w")?.textContent).toBe("gate");
    const agent = document.querySelector(".ln.agent")!;
    expect(agent.querySelector(".w")?.textContent).toMatch(/^agent/);
    expect(agent.compareDocumentPosition(gate) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("text arrives as plain text, never as HTML", () => {
    const s = [sse("gate_explain", { text: "<img src=x onerror=alert(1)>" })].reduce(reducer, initialUi());
    const noop = () => {};
    render(<Console items={s.items} running={false} disabled={false} reduced closed={false} autoplay={{ on: false, label: "" }} status="" onToggle={noop} onSend={noop} onAutoplay={noop} onStopAutoplay={noop} onReset={noop} />);
    expect(document.querySelector("img")).toBeNull();
  });
});
