// SSE fan-out: the display page subscribes to /s/<id>/api/events and
// receives every state mutation pushed by the admin via POST /api/state.

import { describe, expect, it } from "vitest";
import { SELF } from "cloudflare:test";

async function createSession(): Promise<{ sessionId: string; cookie: string }> {
  const res = await SELF.fetch("https://example.com/api/session", {
    method: "POST",
  });
  const setCookie = res.headers.get("Set-Cookie") ?? "";
  const cookie = setCookie.split(";")[0] ?? "";
  const { sessionId } = (await res.json()) as { sessionId: string };
  return { sessionId, cookie };
}

// Read chunks from an SSE stream until at least one full `data:` event
// has been received, then return its parsed JSON payload.
async function readNextDataEvent(
  reader: ReadableStreamDefaultReader<Uint8Array>,
): Promise<unknown> {
  const decoder = new TextDecoder();
  let buf = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) throw new Error("SSE stream closed before any data event");
    buf += decoder.decode(value, { stream: true });
    while (true) {
      const idx = buf.indexOf("\n\n");
      if (idx < 0) break;
      const event = buf.slice(0, idx);
      buf = buf.slice(idx + 2);
      const dataLines = event
        .split("\n")
        .filter((l) => l.startsWith("data: "))
        .map((l) => l.slice("data: ".length));
      if (dataLines.length > 0) {
        return JSON.parse(dataLines.join("\n"));
      }
      // event was a comment/heartbeat -- keep reading
    }
  }
}

describe("/s/<id>/api/events (SSE)", () => {
  it("returns 404 for an unknown session", async () => {
    const res = await SELF.fetch(
      "https://example.com/s/UNKNOWN999/api/events",
    );
    expect(res.status).toBe(404);
    // Drain to satisfy any internal cleanup
    await res.body?.cancel();
  });

  it("opens with text/event-stream and emits the current state immediately", async () => {
    const { sessionId } = await createSession();
    const res = await SELF.fetch(
      `https://example.com/s/${sessionId}/api/events`,
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toMatch(/^text\/event-stream/);
    expect(res.headers.get("Cache-Control")).toMatch(/no-cache/);

    const reader = res.body!.getReader();
    const initial = await readNextDataEvent(reader);
    // Fresh session has no posted state yet -- expect null.
    expect(initial).toEqual({ state: null });
    await reader.cancel();
  });

  it("delivers state updates pushed via POST /api/state", async () => {
    const { sessionId, cookie } = await createSession();

    const res = await SELF.fetch(
      `https://example.com/s/${sessionId}/api/events`,
    );
    const reader = res.body!.getReader();
    // consume the initial state event
    await readNextDataEvent(reader);

    const snapshot = { called: [7, 11, 42], jackpot: 500 };
    const post = await SELF.fetch(
      `https://example.com/s/${sessionId}/api/state`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: cookie },
        body: JSON.stringify(snapshot),
      },
    );
    expect(post.status).toBe(200);

    const next = await readNextDataEvent(reader);
    expect(next).toEqual({ state: snapshot });
    await reader.cancel();
  });
});
