// Session creation: POST /api/session returns a fresh sessionId and an
// owner cookie scoped to that session's path. The body of the response
// is a JSON object the admin client uses to know its session id.

import { describe, expect, it } from "vitest";
import { SELF } from "cloudflare:test";

describe("POST /api/session", () => {
  it("returns 201 with a sessionId in the body", async () => {
    const res = await SELF.fetch("https://example.com/api/session", {
      method: "POST",
    });
    expect(res.status).toBe(201);
    const data = (await res.json()) as { sessionId: string };
    expect(typeof data.sessionId).toBe("string");
    expect(data.sessionId.length).toBeGreaterThanOrEqual(8);
  });

  it("sets an HttpOnly owner cookie scoped to the session path", async () => {
    const res = await SELF.fetch("https://example.com/api/session", {
      method: "POST",
    });
    const setCookie = res.headers.get("Set-Cookie");
    expect(setCookie).not.toBeNull();
    expect(setCookie!).toMatch(/owner_token=/);
    expect(setCookie!).toMatch(/HttpOnly/i);
    expect(setCookie!).toMatch(/SameSite=Strict/i);
    const data = (await res.json()) as { sessionId: string };
    expect(setCookie!).toContain(`Path=/s/${data.sessionId}/`);
  });

  it("generates a different sessionId for each call", async () => {
    const a = await (
      await SELF.fetch("https://example.com/api/session", { method: "POST" })
    ).json() as { sessionId: string };
    const b = await (
      await SELF.fetch("https://example.com/api/session", { method: "POST" })
    ).json() as { sessionId: string };
    expect(a.sessionId).not.toBe(b.sessionId);
  });

  it("rejects GET on /api/session with 405", async () => {
    const res = await SELF.fetch("https://example.com/api/session", {
      method: "GET",
    });
    expect(res.status).toBe(405);
  });
});

describe("POST /api/session with custom cards", () => {
  // A real loto card: 5 numbers per row across 3 rows, each in its
  // column range, `numbers` matches the multiset from `rows`.
  function realCard(seq: number, cid: string) {
    const rows = [
      [1, 11, 24, 30, null, null, null, null, 80],
      [2, null, 25, null, 40, 50, null, 70, null],
      [null, 12, null, 31, null, 51, null, 71, 81],
    ];
    const flat = rows.flat().filter((v): v is number => v !== null);
    return {
      seq,
      cid,
      numbers: flat.slice().sort((a, b) => a - b),
      rows,
    };
  }
  const validDeck = [realCard(1, "aaa00001"), realCard(2, "bbb00002")];

  it("uses uploaded cards when body has a `cards` array", async () => {
    const create = await SELF.fetch("https://example.com/api/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cards: validDeck }),
    });
    expect(create.status).toBe(201);
    const { sessionId } = (await create.json()) as { sessionId: string };

    const page = await SELF.fetch(`https://example.com/s/${sessionId}/`);
    const html = await page.text();
    const re = /<script[^>]*id="cards-data"[^>]*>([\s\S]*?)<\/script>/;
    const m = html.match(re);
    expect(m).not.toBeNull();
    const injected = JSON.parse(m![1]!);
    expect(injected).toEqual(validDeck);
  });

  it("falls back to default cards when body is empty", async () => {
    const res = await SELF.fetch("https://example.com/api/session", {
      method: "POST",
    });
    expect(res.status).toBe(201);
    // Default deck is currently empty; the test in page.spec.ts already
    // asserts the array shape. Here we just confirm the no-body path
    // doesn't 400.
  });

  it("rejects body with non-array `cards` with 400", async () => {
    const res = await SELF.fetch("https://example.com/api/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cards: "not an array" }),
    });
    expect(res.status).toBe(400);
  });

  it("rejects body with malformed JSON with 400", async () => {
    const res = await SELF.fetch("https://example.com/api/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{not json",
    });
    expect(res.status).toBe(400);
  });

  it("rejects a deck whose cards fail loto invariants with 400", async () => {
    // numbers length is 14 instead of 15 -- caught by validateCards.
    const broken = [{
      seq: 1,
      cid: "deadbeef",
      numbers: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14],
      rows: [
        [1, 11, null, null, null, null, null, null, 80],
        [2, null, 25, null, 40, 50, null, 70, null],
        [null, 12, null, 31, null, 51, null, 71, 81],
      ],
    }];
    const res = await SELF.fetch("https://example.com/api/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cards: broken }),
    });
    expect(res.status).toBe(400);
  });

  it("rejects body larger than 1 MB with 413", async () => {
    // A custom deck of 60-card scale tops out around 30-40 KB in JSON.
    // Anything beyond a megabyte is either a bug or an attack.
    const oversized = "x".repeat(1024 * 1024 + 1);
    const res = await SELF.fetch("https://example.com/api/session", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Content-Length": String(oversized.length) },
      body: oversized,
    });
    expect(res.status).toBe(413);
  });
});
