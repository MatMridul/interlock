import { describe, expect, it } from "vitest";
import { SseParser, readSse } from "../sse";

const frame = (e: string, d: unknown) => `event: ${e}\ndata: ${JSON.stringify(d)}\n\n`;

describe("SseParser", () => {
  it("parses whole frames", () => {
    const evs = new SseParser().push(frame("a", { x: 1 }) + frame("b", { y: 2 }));
    expect(evs.map((e) => e.event)).toEqual(["a", "b"]);
    expect(JSON.parse(evs[1].data)).toEqual({ y: 2 });
  });

  it("holds a partial frame until it completes, at every split point", () => {
    const text = frame("gate_verdict", { verdict: "REJECT", reason: "a: b" }) + frame("done", { state: "START" });
    for (let i = 1; i < text.length; i++) {
      const p = new SseParser();
      const evs = [...p.push(text.slice(0, i)), ...p.push(text.slice(i))];
      expect(evs.map((e) => e.event)).toEqual(["gate_verdict", "done"]);
    }
  });

  it("joins multi-line data with newlines", () => {
    const evs = new SseParser().push("event: m\ndata: line1\ndata: line2\n\n");
    expect(evs).toEqual([{ event: "m", data: "line1\nline2" }]);
  });

  it("handles CRLF, even when split between CR and LF, and ignores comments", () => {
    const p = new SseParser();
    const a = p.push(": keepalive\r\nevent: x\r\ndata: 1\r\n\r");
    const b = p.push("\n");
    expect([...a, ...b]).toEqual([{ event: "x", data: "1" }]);
  });

  it("defaults the event name to message and drops frames without data", () => {
    const evs = new SseParser().push("data: hi\n\nevent: empty\n\n");
    expect(evs).toEqual([{ event: "message", data: "hi" }]);
  });

  it("keeps multi-byte characters intact across byte chunks (readSse)", async () => {
    const bytes = new TextEncoder().encode(frame("assistant_text", { text: "caf\u00e9 \u2713" }));
    const body = new ReadableStream<Uint8Array>({
      start(c) {
        for (let i = 0; i < bytes.length; i += 3) c.enqueue(bytes.slice(i, i + 3));
        c.close();
      },
    });
    const out = [];
    for await (const e of readSse(body)) out.push(e);
    expect(JSON.parse(out[0].data).text).toBe("caf\u00e9 \u2713");
  });
});
