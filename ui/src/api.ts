import type { Policy, StateView } from "./types";
import { readSse, type SseEvent } from "./sse";
import { judgeHeaders, setJudgeCode } from "./lib/judge";

// Same origin in production (FastAPI serves ui/dist). In dev, Vite proxies to 127.0.0.1:8000.
const BASE = (import.meta.env.VITE_API_BASE as string | undefined) ?? "";

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

async function json<T>(r: Response): Promise<T> {
  if (!r.ok) {
    let msg = `HTTP ${r.status}`;
    try {
      const b = await r.json();
      if (typeof b?.detail === "string") msg = b.detail;
    } catch {
      /* keep the status text */
    }
    throw new ApiError(r.status, msg);
  }
  return r.json() as Promise<T>;
}

export const getPolicy = () => fetch(`${BASE}/policy`).then((r) => json<Policy>(r));
export const createSession = () =>
  fetch(`${BASE}/session`, { method: "POST" }).then((r) => json<{ session_id: string }>(r));
export const getState = (sid: string) => fetch(`${BASE}/session/${sid}/state`).then((r) => json<StateView>(r));
export const postMfa = (sid: string, code: string) =>
  fetch(`${BASE}/session/${sid}/mfa`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code }),
  }).then((r) => json<{ verdict: string; state: string; reason?: string }>(r));

export type ProposeAction = { tool: string; payee?: string; amount?: number };
export const getConfig = () =>
  fetch(`${BASE}/config`).then((r) => json<{ model: "on" | "off"; judge_code?: boolean }>(r)).catch((): { model: "on" | "off"; judge_code?: boolean } => ({ model: "on" }));

/** Check the judge access code with the server (wrong codes count toward a lockout). Keeps it for this tab only when right. */
export async function unlock(code: string): Promise<void> {
  await json(await fetch(`${BASE}/judge/unlock`, { method: "POST", headers: { "X-Judge-Code": code } }));
  setJudgeCode(code);
}

/** C1: propose actions by hand. Same SSE events as chat; the server runs each through the real gate. */
export async function* propose(sid: string, actions: ProposeAction[]): AsyncGenerator<SseEvent> {
  const r = await fetch(`${BASE}/session/${sid}/propose`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ actions }),
  });
  if (!r.ok || !r.body) {
    await json(r);
    throw new ApiError(r.status, "no response body");
  }
  yield* readSse(r.body);
}

/** POST a chat message and yield SSE events. Throws ApiError for 404/409/422 before streaming. */
export async function* chat(sid: string, message: string): AsyncGenerator<SseEvent> {
  const r = await fetch(`${BASE}/session/${sid}/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...judgeHeaders() },
    body: JSON.stringify({ message }),
  });
  if (!r.ok || !r.body) {
    await json(r); // throws ApiError with the server's detail
    throw new ApiError(r.status, "no response body");
  }
  yield* readSse(r.body);
}

/** C2 race mode. Replay is a plain GET of the recorded run (no model). Live needs the model on. */
export const getRaceReplay = () => fetch(`${BASE}/race/replay`).then((r) => json<import("./lib/race").RaceData>(r));
export const postRaceLive = (attack_id: string) =>
  fetch(`${BASE}/race/live`, { method: "POST", headers: { "Content-Type": "application/json", ...judgeHeaders() }, body: JSON.stringify({ attack_id }) })
    .then((r) => json<import("./lib/race").RaceLive>(r));

/** C7: read-only machine table for a named policy; safe_ship also carries the recorded Kiro CLI run. */
export const getPolicyData = (name: "finance" | "safe_ship") => fetch(`${BASE}/policies/${name}`).then((r) => json<{ policy: Policy; recorded?: unknown }>(r));
