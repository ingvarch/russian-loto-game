// Admin panel: HTTP Basic against ADMIN_PASSWORD, then a read-only
// listing of games. vitest.config.ts injects the password as a binding
// (never [vars]) so both the accept and the reject path are exercised.

import { describe, expect, it } from "vitest";
import { SELF, env } from "cloudflare:test";

const AUTH = `Basic ${btoa("admin:test-password")}`;
const WRONG = `Basic ${btoa("admin:not-the-password")}`;

interface AdminSession {
  id: string;
  createdAt: number;
  updatedAt: number;
  finishedAt: number | null;
  state: unknown;
}

async function createGame(): Promise<{ sessionId: string; cookie: string }> {
  const res = await SELF.fetch("https://example.com/api/session", {
    method: "POST",
  });
  const cookie = (res.headers.get("Set-Cookie") ?? "").split(";")[0] ?? "";
  const { sessionId } = (await res.json()) as { sessionId: string };
  return { sessionId, cookie };
}

async function listAdmin(query = ""): Promise<AdminSession[]> {
  const res = await SELF.fetch(
    `https://example.com/admin/api/sessions${query}`,
    { headers: { Authorization: AUTH } },
  );
  expect(res.status).toBe(200);
  return (await res.json()) as AdminSession[];
}

describe("admin auth", () => {
  it("challenges an unauthenticated request for the shell", async () => {
    const res = await SELF.fetch("https://example.com/admin");
    expect(res.status).toBe(401);
    expect(res.headers.get("WWW-Authenticate")).toMatch(/^Basic /);
  });

  it("challenges the trailing-slash form too", async () => {
    const res = await SELF.fetch("https://example.com/admin/");
    expect(res.status).toBe(401);
  });

  // /admin/* does not cover the bare asset path, so admin.html gets its
  // own run_worker_first entry. This also proves the Worker's own
  // ASSETS.fetch of that file does not loop back through the router.
  it("challenges the raw asset path", async () => {
    const res = await SELF.fetch("https://example.com/admin.html");
    expect(res.status).toBe(401);
  });

  it("rejects a wrong password", async () => {
    const res = await SELF.fetch("https://example.com/admin", {
      headers: { Authorization: WRONG },
    });
    expect(res.status).toBe(401);
  });

  it("rejects a malformed Authorization header", async () => {
    const res = await SELF.fetch("https://example.com/admin", {
      headers: { Authorization: "Bearer test-password" },
    });
    expect(res.status).toBe(401);
  });

  it("ignores the username, matching on password alone", async () => {
    const res = await SELF.fetch("https://example.com/admin", {
      headers: { Authorization: `Basic ${btoa("anyone:test-password")}` },
    });
    expect(res.status).toBe(200);
  });

  it("serves the shell HTML once authenticated", async () => {
    const res = await SELF.fetch("https://example.com/admin", {
      headers: { Authorization: AUTH },
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toMatch(/text\/html/);
    const html = await res.text();
    expect(html).toContain("main-admin.js");
  });

  it("guards the API as well as the page", async () => {
    const res = await SELF.fetch("https://example.com/admin/api/sessions");
    expect(res.status).toBe(401);
  });
});

describe("GET /admin/api/sessions", () => {
  it("lists a freshly created game with its state", async () => {
    const { sessionId, cookie } = await createGame();
    const snapshot = { called: [5, 9], events: [], jackpot: 100 };
    await SELF.fetch(`https://example.com/s/${sessionId}/api/state`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify(snapshot),
    });

    const rows = await listAdmin();
    const row = rows.find((r) => r.id === sessionId);
    expect(row).toBeDefined();
    expect(row!.state).toEqual(snapshot);
    expect(row!.finishedAt).toBeNull();
  });

  it("orders by most recent activity", async () => {
    const first = await createGame();
    const second = await createGame();

    const rows = await listAdmin();
    const ids = rows.map((r) => r.id);
    expect(ids.indexOf(second.sessionId)).toBeLessThan(
      ids.indexOf(first.sessionId),
    );
  });

  it("activeOnly=1 hides games untouched for over an hour", async () => {
    const { sessionId } = await createGame();
    const stale = Date.now() - 3 * 60 * 60 * 1000;
    await env.DB.prepare(
      "INSERT INTO sessions (id, created_at, updated_at) VALUES (?, ?, ?)",
    )
      .bind("STALE001", stale, stale)
      .run();

    const all = await listAdmin();
    expect(all.map((r) => r.id)).toContain("STALE001");

    const active = await listAdmin("?activeOnly=1");
    expect(active.map((r) => r.id)).toContain(sessionId);
    expect(active.map((r) => r.id)).not.toContain("STALE001");
  });

  it("returns an empty array when nothing has been played", async () => {
    await env.DB.prepare("DELETE FROM sessions").run();
    expect(await listAdmin()).toEqual([]);
  });

  it("rejects a write to the listing", async () => {
    const res = await SELF.fetch("https://example.com/admin/api/sessions", {
      method: "POST",
      headers: { Authorization: AUTH },
    });
    expect(res.status).toBe(405);
  });

  it("404s an unknown admin route, still behind auth", async () => {
    expect(
      (await SELF.fetch("https://example.com/admin/api/nope")).status,
    ).toBe(401);
    expect(
      (
        await SELF.fetch("https://example.com/admin/api/nope", {
          headers: { Authorization: AUTH },
        })
      ).status,
    ).toBe(404);
  });
});
