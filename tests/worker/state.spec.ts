// Session-scoped state read/write. The admin POSTs the latest game
// snapshot to /s/<id>/api/state; anyone (typically the display page)
// can GET it back. Auth is added in a later step; this slice covers
// only the storage round-trip.

import { describe, expect, it } from "vitest";
import { SELF } from "cloudflare:test";

async function createSession(): Promise<{ sessionId: string; cookie: string }> {
  const res = await SELF.fetch("https://example.com/api/session", {
    method: "POST",
  });
  const setCookie = res.headers.get("Set-Cookie") ?? "";
  // Strip cookie attributes; we only want `owner_token=...` for the
  // request Cookie header on subsequent calls.
  const cookie = setCookie.split(";")[0] ?? "";
  const { sessionId } = (await res.json()) as { sessionId: string };
  return { sessionId, cookie };
}

describe("/s/<id>/api/state", () => {
  it("GET returns 404 for an unknown session", async () => {
    const res = await SELF.fetch(
      "https://example.com/s/UNKNOWN999/api/state",
    );
    expect(res.status).toBe(404);
  });

  it("GET returns null state right after session creation (nothing posted yet)", async () => {
    const { sessionId } = await createSession();
    const res = await SELF.fetch(
      `https://example.com/s/${sessionId}/api/state`,
    );
    expect(res.status).toBe(200);
    const data = (await res.json()) as { state: unknown };
    expect(data.state).toBeNull();
  });

  it("POST with the owner cookie stores a snapshot; GET returns it", async () => {
    const { sessionId, cookie } = await createSession();
    const snapshot = {
      called: [1, 2, 3],
      events: [],
      jackpot: 1000,
    };
    const post = await SELF.fetch(
      `https://example.com/s/${sessionId}/api/state`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: cookie },
        body: JSON.stringify(snapshot),
      },
    );
    expect(post.status).toBe(200);

    const get = await SELF.fetch(
      `https://example.com/s/${sessionId}/api/state`,
    );
    expect(get.status).toBe(200);
    const data = (await get.json()) as { state: unknown };
    expect(data.state).toEqual(snapshot);
  });

  it("POST without the owner cookie returns 401 and does not mutate state", async () => {
    const { sessionId } = await createSession();
    const res = await SELF.fetch(
      `https://example.com/s/${sessionId}/api/state`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ called: [1] }),
      },
    );
    expect(res.status).toBe(401);

    // State must still be the initial null -- the unauthorised write
    // didn't slip through.
    const get = await SELF.fetch(
      `https://example.com/s/${sessionId}/api/state`,
    );
    const data = (await get.json()) as { state: unknown };
    expect(data.state).toBeNull();
  });

  it("POST with a wrong owner cookie returns 401", async () => {
    const { sessionId } = await createSession();
    const res = await SELF.fetch(
      `https://example.com/s/${sessionId}/api/state`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: "owner_token=wrong-token-deadbeef",
        },
        body: JSON.stringify({ called: [1] }),
      },
    );
    expect(res.status).toBe(401);
  });

  it("POST with malformed JSON body returns 400", async () => {
    const { sessionId, cookie } = await createSession();
    const res = await SELF.fetch(
      `https://example.com/s/${sessionId}/api/state`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: cookie },
        body: "{not json",
      },
    );
    expect(res.status).toBe(400);
  });

  it("POST to an unknown session returns 404", async () => {
    const res = await SELF.fetch(
      "https://example.com/s/UNKNOWN999/api/state",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      },
    );
    expect(res.status).toBe(404);
  });

  it("GET does not require a cookie (display page is anonymous)", async () => {
    const { sessionId } = await createSession();
    const res = await SELF.fetch(
      `https://example.com/s/${sessionId}/api/state`,
    );
    expect(res.status).toBe(200);
  });
});
