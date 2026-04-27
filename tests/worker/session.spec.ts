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
