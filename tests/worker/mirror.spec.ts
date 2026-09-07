// The D1 mirror as the Worker drives it: a row appears when a session is
// created, follows every state POST, and grows aggregates once the game
// is over. The mirror must never be able to take the game down.

import { describe, expect, it } from "vitest";
import { SELF, env } from "cloudflare:test";

import { listSessions } from "../../src/sessions-db.js";

async function createSession(): Promise<{ sessionId: string; cookie: string }> {
  const res = await SELF.fetch("https://example.com/api/session", {
    method: "POST",
  });
  const cookie = (res.headers.get("Set-Cookie") ?? "").split(";")[0] ?? "";
  const { sessionId } = (await res.json()) as { sessionId: string };
  return { sessionId, cookie };
}

async function postState(
  sessionId: string,
  cookie: string,
  state: unknown,
): Promise<Response> {
  return SELF.fetch(`https://example.com/s/${sessionId}/api/state`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify(state),
  });
}

function finishedState() {
  return {
    called: [7, 42, 13, 88],
    events: [
      { cid: "aaa", seq: 1, level: 1, callCount: 2, status: "confirmed" },
      { cid: "bbb", seq: 2, level: 2, callCount: 3, status: "confirmed" },
      { cid: "ccc", seq: 3, level: 3, callCount: 4, status: "confirmed" },
    ],
  };
}

describe("D1 mirror", () => {
  it("POST /api/session records the session", async () => {
    const { sessionId } = await createSession();
    const rows = await listSessions(env.DB, {});
    const row = rows.find((r) => r.id === sessionId);
    expect(row).toBeDefined();
    expect(row!.createdAt).toBeGreaterThan(0);
    expect(row!.state).toBeNull();
    expect(row!.finishedAt).toBeNull();
  });

  it("POST state mirrors the snapshot", async () => {
    const { sessionId, cookie } = await createSession();
    const snapshot = { called: [5, 9], events: [], jackpot: 100 };
    expect((await postState(sessionId, cookie, snapshot)).status).toBe(200);

    const rows = await listSessions(env.DB, {});
    const row = rows.find((r) => r.id === sessionId);
    expect(row!.state).toEqual(snapshot);
    expect(row!.updatedAt).toBeGreaterThanOrEqual(row!.createdAt);
  });

  it("an unauthorised POST leaves the mirror untouched", async () => {
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

    const rows = await listSessions(env.DB, {});
    expect(rows.find((r) => r.id === sessionId)!.state).toBeNull();
  });

  it("a finished game materialises draws and wins", async () => {
    const { sessionId, cookie } = await createSession();
    await postState(sessionId, cookie, finishedState());

    const draws = await env.DB.prepare(
      "SELECT COUNT(*) AS n FROM draws WHERE game_id IN (SELECT id FROM games WHERE session_id = ?)",
    )
      .bind(sessionId)
      .first<{ n: number }>();
    expect(draws!.n).toBe(4);

    const wins = await env.DB.prepare(
      "SELECT COUNT(*) AS n FROM wins WHERE game_id IN (SELECT id FROM games WHERE session_id = ?)",
    )
      .bind(sessionId)
      .first<{ n: number }>();
    expect(wins!.n).toBe(3);

    const rows = await listSessions(env.DB, {});
    expect(rows.find((r) => r.id === sessionId)!.finishedAt).not.toBeNull();
  });

  it("a broken mirror does not stop the game", async () => {
    const { sessionId, cookie } = await createSession();

    // Stands in for D1 being unavailable mid-game. The setup file's
    // beforeEach re-applies the schema, so the drop does not leak into
    // the next test.
    await env.DB.prepare("DROP TABLE draws").run();
    await env.DB.prepare("DROP TABLE wins").run();
    await env.DB.prepare("DROP TABLE sessions").run();

    const res = await postState(sessionId, cookie, finishedState());
    expect(res.status).toBe(200);

    // The authoritative copy in the Durable Object is intact.
    const get = await SELF.fetch(
      `https://example.com/s/${sessionId}/api/state`,
    );
    const data = (await get.json()) as { state: unknown };
    expect(data.state).toEqual(finishedState());
  });

  it("a broken mirror does not stop session creation", async () => {
    await env.DB.prepare("DROP TABLE sessions").run();
    const res = await SELF.fetch("https://example.com/api/session", {
      method: "POST",
    });
    expect(res.status).toBe(201);
  });
});
