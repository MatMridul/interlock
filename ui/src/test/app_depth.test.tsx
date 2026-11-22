import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import policyRaw from "../../../policy/finance_table.json?raw";
import { App, FaultPanel } from "../App";

const policy = JSON.parse(policyRaw);
const enc = new TextEncoder();
const sse = (events: [string, unknown][]) =>
  new Response(new ReadableStream({ start(c) { events.forEach(([n, d]) => c.enqueue(enc.encode(`event: ${n}\ndata: ${JSON.stringify(d)}\n\n`))); c.close(); } }), { status: 200 });

let calls: { url: string; body?: unknown }[] = [];
let modelOff = true;
let state = "START";

function mockFetch() {
  calls = [];
  state = "START";
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    calls.push({ url, body });
    if (url.endsWith("/policy")) return Response.json(policy);
    if (url.endsWith("/config")) return Response.json({ model: modelOff ? "off" : "on" });
    if (url.endsWith("/session")) return Response.json({ session_id: "s1" });
    if (url.includes("/state")) return Response.json({ id: "s1", state, executed_log: [], counters: { transfers: 0, max_transfers: 3, consecutive_rejects: 0, max_consecutive_rejects: 5, locked: false, spend_cap: 5000 } });
    if (url.endsWith("/propose")) {
      const tool = body.actions[0].tool;
      if (tool === "authenticate_user") { state = "AUTHED"; return sse([["tool_proposed", { name: tool }], ["gate_verdict", { verdict: "ACCEPT", state: "AUTHED", symbol: "AUTH", latency_ms: 0.01, engine: "executor-table", source: "gate", actor: "llm" }], ["state_change", { from: "START", to: "AUTHED" }], ["done", { state: "AUTHED" }]]); }
      return sse([["tool_proposed", { name: tool }], ["gate_verdict", { verdict: "REJECT", state, symbol: "TRANSFER", reason: `TRANSFER not allowed in ${state}`, expected_symbols: ["DRAFT"], latency_ms: 0.02, engine: "executor-table", source: "gate", actor: "llm" }], ["done", { state }]]);
    }
    return new Response("{}", { status: 404 });
  }));
}

beforeEach(() => {
  HTMLCanvasElement.prototype.getContext = (() => null) as never;
  sessionStorage.setItem("interlock.coldopen", "1");
  localStorage.setItem("interlock.tour.v1", "seen");
  history.replaceState(null, "", "/");
  modelOff = true;
  mockFetch();
});
afterEach(() => { vi.unstubAllGlobals(); });

describe("you-are-the-agent mode (C1)", () => {
  it("is the default when the server reports the model off, and the model switch is disabled", async () => {
    render(<App />);
    await screen.findByTestId("you-panel");
    expect(screen.getByRole("button", { name: "you" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "model" })).toBeDisabled();
    expect(screen.queryByLabelText("Message to the agent")).toBeNull();
    expect(screen.getByText("scripted")).toBeInTheDocument();
  });
  it("sends one proposal to /propose, never to /chat, and shows the gate's verdict with a receipt", async () => {
    render(<App />);
    await screen.findByTestId("you-panel");
    await waitFor(() => expect(calls.some((c) => c.url.endsWith("/session"))).toBe(true));
    fireEvent.click(screen.getByRole("button", { name: "Propose TRANSFER" }));
    const chip = await screen.findByRole("button", { name: /BLOCKED TRANSFER/ }, { timeout: 8000 });
    expect(calls.some((c) => c.url.endsWith("/chat"))).toBe(false);
    expect(calls.find((c) => c.url.endsWith("/propose"))?.body).toEqual({ actions: [{ tool: "execute_transfer" }] });
    fireEvent.click(chip);
    const rc = within(await screen.findByTestId("receipt"));
    expect(rc.getByText("δ(START, TRANSFER) = undefined")).toBeInTheDocument();
    expect(rc.getByText("0.02 ms")).toBeInTheDocument();
    expect(rc.getByText("executor-table")).toBeInTheDocument();
    // why-blocked: ghost path on the stage and one sentence in the drawer
    expect(await screen.findByTestId("why-cap")).toHaveTextContent("TRANSFER needs AUTH, DRAFT, MFA first");
    expect(document.querySelectorAll("[data-ghost]").length).toBe(3);
    expect(document.querySelector('[data-row="undefined"]')).toHaveTextContent("δ(START, TRANSFER) = undefined");
  }, 15000);
  it("a scripted vector goes through /propose with no chat call", async () => {
    render(<App />);
    await screen.findByTestId("you-panel");
    await waitFor(() => expect(calls.some((c) => c.url.endsWith("/session"))).toBe(true));
    fireEvent.click(screen.getByTitle(/Scripted: Prompt injection/));
    await waitFor(() => expect(calls.some((c) => c.url.endsWith("/propose"))).toBe(true));
    expect(calls.find((c) => c.url.endsWith("/propose"))?.body).toEqual({ actions: [{ tool: "execute_transfer" }] });
    expect(calls.some((c) => c.url.endsWith("/chat"))).toBe(false);
  });
  it("model mode shows the chat box and lets you switch to you", async () => {
    modelOff = false;
    render(<App />);
    await screen.findByLabelText("Message to the agent");
    expect(screen.getByRole("button", { name: "model" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: "you" }));
    expect(screen.getByTestId("you-panel")).toBeInTheDocument();
  });
});

describe("what-if box (C4) in the drawer", () => {
  it("shows ACCEPT or REJECT and the first failing step", async () => {
    render(<App />);
    await screen.findByTestId("you-panel");
    fireEvent.click(screen.getByRole("button", { name: "Proof" }));
    const box = within(await screen.findByTestId("whatif"));
    fireEvent.change(box.getByLabelText("Symbol sequence to test"), { target: { value: "AUTH DRAFT TRANSFER" } });
    expect(box.getByTestId("whatif-verdict")).toHaveTextContent("REJECT");
    expect(box.getByText(/at step 3: TRANSFER is not allowed in DRAFTED/)).toBeInTheDocument();
    fireEvent.change(box.getByLabelText("Symbol sequence to test"), { target: { value: "ADMT" } });
    expect(box.getByTestId("whatif-verdict")).toHaveTextContent("ACCEPT");
  });
});

describe("replay link (C5)", () => {
  it("loads a valid fragment read-only without creating a session, and rejects a bad one safely", async () => {
    history.replaceState(null, "", "/#replay=v1.ADMT");
    const { unmount } = render(<App />);
    expect(await screen.findByTestId("replay-tag")).toHaveTextContent("REPLAY · read only");
    expect(calls.some((c) => c.url.endsWith("/session"))).toBe(false);
    const slider = screen.getByRole("slider");
    fireEvent.change(slider, { target: { value: "2" } });
    expect(screen.getByTestId("replay-tag")).toHaveTextContent("step 2 of 4");
    unmount();
    history.replaceState(null, "", "/#replay=v1.ADT");
    calls = [];
    render(<App />);
    await waitFor(() => expect(calls.some((c) => c.url.endsWith("/session"))).toBe(true));
    expect((await screen.findAllByText(/Replay link rejected/)).length).toBeGreaterThan(0);
  });
});

describe("instrument fault panel", () => {
  it("says NO SIGNAL and offers Retry", () => {
    const retry = vi.fn();
    render(<FaultPanel fault={{ kind: "down", text: "Cannot reach the server." }} onRetry={retry} />);
    expect(screen.getByRole("alert")).toHaveTextContent("NO SIGNAL from gate. Retry.");
    act(() => { fireEvent.click(screen.getByRole("button", { name: "Retry" })); });
    expect(retry).toHaveBeenCalled();
  });
});