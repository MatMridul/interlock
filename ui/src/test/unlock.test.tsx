import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import policyRaw from "../../../policy/finance_table.json?raw";
import { App } from "../App";

const policy = JSON.parse(policyRaw);
const RIGHT = "right-code-for-test";
let headers: Record<string, string>[] = [];
let chatReply: () => Response;
let config: Record<string, unknown>;

beforeEach(() => {
  headers = [];
  config = { model: "on", judge_code: true };
  HTMLCanvasElement.prototype.getContext = (() => null) as never;
  sessionStorage.clear();
  sessionStorage.setItem("interlock.coldopen", "1");
  localStorage.setItem("interlock.tour.v1", "seen");
  history.replaceState(null, "", "/");
  chatReply = () => Response.json({ detail: "The daily limit of real-model calls is used up (100 per UTC day, all visitors). It resets at 00:00 UTC. Use 'you' mode meanwhile." }, { status: 429 });
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    const h = (init?.headers ?? {}) as Record<string, string>;
    if (url.endsWith("/policy")) return Response.json(policy);
    if (url.endsWith("/config")) return Response.json(config);
    if (url.endsWith("/session")) return Response.json({ session_id: "s1" });
    if (url.includes("/state")) return Response.json({ id: "s1", state: "START", executed_log: [], counters: { transfers: 0, max_transfers: 3, consecutive_rejects: 0, max_consecutive_rejects: 5, locked: false, spend_cap: 5000 } });
    if (url.endsWith("/judge/unlock")) return h["X-Judge-Code"] === RIGHT ? Response.json({ ok: true }) : Response.json({ detail: "That judge access code is not right." }, { status: 403 });
    if (url.endsWith("/chat")) { headers.push(h); return chatReply(); }
    return new Response("{}", { status: 404 });
  }));
});
afterEach(() => { vi.unstubAllGlobals(); });

describe("public live model", () => {
  it("starts unlocked when the server says the public model is open, with a small Judge code button", async () => {
    config = { model: "on", judge_code: true, public_model: true };
    render(<App />);
    const btn = await screen.findByTestId("unlock-open");
    expect(btn.textContent).toBe("Judge code");
    expect(screen.getByRole("button", { name: "model" })).toBeEnabled();
  });

  it("a used-up public pool message falls back to 'you' mode and keeps the model switch enabled", async () => {
    config = { model: "on", judge_code: true, public_model: true };
    chatReply = () => Response.json({ detail: "The public live-model allowance for today (60 calls) is used up. It resets at 00:00 UTC. Judges can still unlock the live model with their access code; otherwise use 'you' mode." }, { status: 429 });
    render(<App />);
    await waitFor(() => expect(screen.getByRole("button", { name: "model" })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: "model" }));
    const box = await screen.findByPlaceholderText("Message the agent");
    fireEvent.change(box, { target: { value: "hello" } });
    fireEvent.keyDown(box, { key: "Enter" });
    await waitFor(() => expect(screen.getByRole("button", { name: "you" })).toHaveAttribute("aria-pressed", "true"));
    expect((await screen.findAllByText(/public live-model allowance/)).length).toBeGreaterThan(0);
  });
});

describe("judge unlock", () => {
  it("starts locked in 'you' mode, with the unlock control and the model switch disabled", async () => {
    render(<App />);
    await screen.findByTestId("unlock-open");
    expect(screen.getByRole("button", { name: "model" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "you" })).toHaveAttribute("aria-pressed", "true");
  });

  it("a wrong code shows the server message and stays locked; the right code unlocks and is kept in the tab only", async () => {
    render(<App />);
    fireEvent.click(await screen.findByTestId("unlock-open"));
    const input = screen.getByLabelText("Judge access code");
    fireEvent.change(input, { target: { value: "wrong" } });
    fireEvent.click(screen.getByRole("button", { name: "Unlock" }));
    expect((await screen.findByTestId("unlock-msg")).textContent).toContain("not right");
    expect(sessionStorage.getItem("interlock.judge")).toBeNull();
    fireEvent.change(input, { target: { value: RIGHT } });
    fireEvent.click(screen.getByRole("button", { name: "Unlock" }));
    await waitFor(() => expect(screen.queryByTestId("unlock")).toBeNull());
    expect(screen.getByRole("button", { name: "model" })).toBeEnabled();
    expect(sessionStorage.getItem("interlock.judge")).toBe(RIGHT);
    expect(localStorage.getItem("interlock.judge")).toBeNull();
    expect(document.body.textContent).not.toContain(RIGHT);
  });

  it("a cap message falls back to 'you' mode and says which limit", async () => {
    sessionStorage.setItem("interlock.judge", RIGHT);
    render(<App />);
    await waitFor(() => expect(screen.getByRole("button", { name: "model" })).toBeEnabled());
    const box = await screen.findByPlaceholderText("Message the agent");
    fireEvent.change(box, { target: { value: "hello" } });
    fireEvent.keyDown(box, { key: "Enter" });
    await waitFor(() => expect(screen.getByRole("button", { name: "you" })).toHaveAttribute("aria-pressed", "true"));
    expect(headers[0]["X-Judge-Code"]).toBe(RIGHT);
    expect((await screen.findAllByText(/daily limit of real-model calls/)).length).toBeGreaterThan(0);
  });
});
