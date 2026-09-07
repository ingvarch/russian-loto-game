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

// Deleting a game is the one write the panel can make, so it is guarded the
// same way the listing is and has to reach both stores: the D1 mirror and
// the Durable Object that actually holds the game. Removing only the row
// would leave the session playable, and the next state POST would mirror it
// straight back.
describe("DELETE /admin/api/sessions/<id>", () => {
  async function pushState(sessionId: string, cookie: string): Promise<void> {
    const res = await SELF.fetch(
      `https://example.com/s/${sessionId}/api/state`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: cookie },
        body: JSON.stringify({ called: [7], events: [] }),
      },
    );
    expect(res.status).toBe(200);
  }

  function del(sessionId: string, auth: string | null = AUTH): Promise<Response> {
    return SELF.fetch(`https://example.com/admin/api/sessions/${sessionId}`, {
      method: "DELETE",
      ...(auth === null ? {} : { headers: { Authorization: auth } }),
    });
  }

  it("challenges an unauthenticated delete", async () => {
    const { sessionId, cookie } = await createGame();
    await pushState(sessionId, cookie);

    const res = await del(sessionId, null);
    expect(res.status).toBe(401);

    const still = await listAdmin();
    expect(still.some((s) => s.id === sessionId)).toBe(true);
  });

  it("rejects a wrong password", async () => {
    const { sessionId, cookie } = await createGame();
    await pushState(sessionId, cookie);
    expect((await del(sessionId, WRONG)).status).toBe(401);
  });

  it("drops the game from the listing", async () => {
    const { sessionId, cookie } = await createGame();
    await pushState(sessionId, cookie);
    expect((await listAdmin()).some((s) => s.id === sessionId)).toBe(true);

    const res = await del(sessionId);
    expect(res.status).toBe(204);

    expect((await listAdmin()).some((s) => s.id === sessionId)).toBe(false);
  });

  it("wipes the durable object, so the session stops answering", async () => {
    const { sessionId, cookie } = await createGame();
    await pushState(sessionId, cookie);
    expect((await SELF.fetch(`https://example.com/s/${sessionId}/`)).status).toBe(200);

    expect((await del(sessionId)).status).toBe(204);

    expect((await SELF.fetch(`https://example.com/s/${sessionId}/`)).status).toBe(404);
    expect(
      (await SELF.fetch(`https://example.com/s/${sessionId}/display`)).status,
    ).toBe(404);
  });

  it("takes the statistics rows with it", async () => {
    const { sessionId, cookie } = await createGame();
    await pushState(sessionId, cookie);
    await env.DB.prepare(
      "INSERT INTO draws (session_id, call_index, number) VALUES (?, 0, 7)",
    ).bind(sessionId).run();
    await env.DB.prepare(
      "INSERT INTO wins (session_id, level, cid, seq, call_count) VALUES (?, 1, 'abc', 4, 21)",
    ).bind(sessionId).run();

    expect((await del(sessionId)).status).toBe(204);

    const draws = await env.DB.prepare(
      "SELECT COUNT(*) AS n FROM draws WHERE session_id = ?",
    ).bind(sessionId).first<{ n: number }>();
    const wins = await env.DB.prepare(
      "SELECT COUNT(*) AS n FROM wins WHERE session_id = ?",
    ).bind(sessionId).first<{ n: number }>();
    expect(draws?.n).toBe(0);
    expect(wins?.n).toBe(0);
  });

  it("reports an unknown game rather than pretending to delete it", async () => {
    expect((await del("NOSUCHGAME")).status).toBe(404);
  });

  it("refuses a method the item route does not offer", async () => {
    const { sessionId, cookie } = await createGame();
    await pushState(sessionId, cookie);
    const res = await SELF.fetch(
      `https://example.com/admin/api/sessions/${sessionId}`,
      { method: "GET", headers: { Authorization: AUTH } },
    );
    expect(res.status).toBe(405);
    expect(res.headers.get("Allow")).toBe("DELETE");
  });
});
