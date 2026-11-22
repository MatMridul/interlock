// Minimal text/event-stream parser. fetch() streams arbitrary byte chunks, so a frame can be
// split anywhere (even inside a UTF-8 character or between "\r" and "\n"). Feed chunks with
// push(); complete frames come back as events. Partial frames are held until more data arrives.
export interface SseEvent {
  event: string;
  data: string;
}

export class SseParser {
  private buf = "";

  push(chunk: string): SseEvent[] {
    this.buf += chunk;
    const out: SseEvent[] = [];
    // normalise line endings, but keep a trailing lone "\r" for the next chunk
    let text = this.buf.replace(/\r\n/g, "\n");
    const trailingCR = text.endsWith("\r");
    if (trailingCR) text = text.slice(0, -1);
    text = text.replace(/\r/g, "\n");
    let idx: number;
    while ((idx = text.indexOf("\n\n")) !== -1) {
      const frame = text.slice(0, idx);
      text = text.slice(idx + 2);
      const ev = parseFrame(frame);
      if (ev) out.push(ev);
    }
    this.buf = text + (trailingCR ? "\r" : "");
    return out;
  }
}

function parseFrame(frame: string): SseEvent | null {
  let event = "message";
  const data: string[] = [];
  for (const line of frame.split("\n")) {
    if (line === "" || line.startsWith(":")) continue; // blank or comment
    const c = line.indexOf(":");
    const field = c === -1 ? line : line.slice(0, c);
    let value = c === -1 ? "" : line.slice(c + 1);
    if (value.startsWith(" ")) value = value.slice(1);
    if (field === "event") event = value;
    else if (field === "data") data.push(value);
  }
  if (data.length === 0) return null;
  return { event, data: data.join("\n") };
}

/** Read a fetch Response body as SSE events. Uses a streaming TextDecoder so split UTF-8 is safe. */
export async function* readSse(body: ReadableStream<Uint8Array>): AsyncGenerator<SseEvent> {
  const reader = body.getReader();
  const dec = new TextDecoder();
  const p = new SseParser();
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      for (const ev of p.push(dec.decode(value, { stream: true }))) yield ev;
    }
    for (const ev of p.push(dec.decode() + "\n\n")) yield ev; // flush a final unterminated frame
  } finally {
    reader.releaseLock();
  }
}
