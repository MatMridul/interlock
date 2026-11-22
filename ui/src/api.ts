import type { Policy, StateView } from "./types";
import { readSse, type SseEvent } from "./sse";

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

/** POST a chat message and yield SSE events. Throws ApiError for 404/409/422 before streaming. */
export async function* chat(sid: string, message: string): AsyncGenerator<SseEvent> {
  const r = await fetch(`${BASE}/session/${sid}/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message }),
  });
  if (!r.ok || !r.body) {
    await json(r); // throws ApiError with the server's detail
    throw new ApiError(r.status, "no response body");
  }
  yield* readSse(r.body);
}
