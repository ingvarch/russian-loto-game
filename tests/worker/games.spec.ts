// One row per game, not per session.
//
// A session survives "Новая игра": the host keeps the same URL and the same
// board on the wall, and plays again. Before the games table that reset
// overwrote the mirror, so an evening of five games left one row carrying
// only the last bank -- and the draws and wins of only the last game.

import { describe, expect, it } from "vitest";
import { SELF, env } from "cloudflare:test";

async function createSession(): Promise<{ sessionId: string; cookie: string }> {
  const res = await SELF.fetch("https://example.com/api/session", {
    method: "POST",
  });
  const cookie = (res.headers.get("Set-Cookie") ?? "").split(";")[0] ?? "";
  const { sessionId } = (await res.json()) as { sessionId: string };
  return { sessionId, cookie };
}

function postState(sessionId: string, cookie: string, state: unknown) {
  return SELF.fetch(`https://example.com/s/${sessionId}/api/state`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify(state),
  });
}

function finishedGame(startedAt: number, jackpot: number, winnerSeq: number) {
  return {
    startedAt,
    jackpot,
    called: [7, 42, 13, 88],
    events: [
      { cid: "aaa", seq: 1, level: 1, callCount: 2, status: "confirmed" },
      { cid: "bbb", seq: 2, level: 2, callCount: 3, status: "confirmed" },
      {
        cid: "ccc",
        seq: winnerSeq,
        level: 3,
        callCount: 4,
        status: "confirmed",
      },
    ],
  };
}

async function gamesOf(sessionId: string) {
  const res = await env.DB.prepare(
    `SELECT id, started_at, finished_at, jackpot, called
       FROM games WHERE session_id = ? ORDER BY started_at`,
  )
    .bind(sessionId)
    .all<{
      id: string;
      started_at: number | null;
      finished_at: number | null;
      jackpot: number;
      called: number;
    }>();
  return res.results;
}

describe("games", () => {
  it("keeps every game an evening produced, with its own bank", async () => {
    const { sessionId, cookie } = await createSession();
    await postState(sessionId, cookie, finishedGame(1000, 5000, 11));
    await postState(sessionId, cookie, finishedGame(2000, 12000, 22));
    await postState(sessionId, cookie, finishedGame(3000, 30000, 33));

    const games = await gamesOf(sessionId);
    expect(games).toHaveLength(3);
    expect(games.map((g) => g.jackpot)).toEqual([5000, 12000, 30000]);
    expect(games.map((g) => g.started_at)).toEqual([1000, 2000, 3000]);
    expect(games.every((g) => g.finished_at !== null)).toBe(true);
    expect(games.map((g) => g.called)).toEqual([4, 4, 4]);
  });

  it("re-posting the same game updates its row rather than adding one", async () => {
    const { sessionId, cookie } = await createSession();
    await postState(sessionId, cookie, finishedGame(1000, 5000, 11));
    await postState(sessionId, cookie, finishedGame(1000, 7000, 11));

    const games = await gamesOf(sessionId);
    expect(games).toHaveLength(1);
    expect(games[0]!.jackpot).toBe(7000);
  });

  it("attaches draws and wins to the game, not to the session", async () => {
    const { sessionId, cookie } = await createSession();
    await postState(sessionId, cookie, finishedGame(1000, 5000, 11));
    await postState(sessionId, cookie, finishedGame(2000, 12000, 22));

    const games = await gamesOf(sessionId);
    expect(games).toHaveLength(2);

    for (const game of games) {
      const draws = await env.DB.prepare(
        "SELECT COUNT(*) AS n FROM draws WHERE game_id = ?",
      )
        .bind(game.id)
        .first<{ n: number }>();
      expect(draws?.n).toBe(4);
    }

    const seqs = await env.DB.prepare(
      `SELECT w.seq FROM wins w JOIN games g ON g.id = w.game_id
        WHERE g.session_id = ? AND w.level = 3 ORDER BY g.started_at`,
    )
      .bind(sessionId)
      .all<{ seq: number }>();
    expect(seqs.results.map((r) => r.seq)).toEqual([11, 22]);
  });

  it("goes away with the session the operator deleted", async () => {
    const { sessionId, cookie } = await createSession();
    await postState(sessionId, cookie, finishedGame(1000, 5000, 11));

    const res = await SELF.fetch(
      `https://example.com/admin/api/sessions/${sessionId}`,
      {
        method: "DELETE",
        headers: { Authorization: `Basic ${btoa("admin:test-password")}` },
      },
    );
    expect(res.status).toBe(204);
    expect(await gamesOf(sessionId)).toHaveLength(0);
  });
});

// The listing is a list of sessions; the count tells the operator how much
// history a delete would take with it.
describe("session listing carries its game count", () => {
  it("counts the games a session played to the end", async () => {
    const { sessionId, cookie } = await createSession();
    await postState(sessionId, cookie, finishedGame(1000, 5000, 11));
    await postState(sessionId, cookie, finishedGame(2000, 12000, 22));
    await postState(sessionId, cookie, finishedGame(3000, 30000, 33));

    const res = await SELF.fetch("https://example.com/admin/api/sessions", {
      headers: { Authorization: `Basic ${btoa("admin:test-password")}` },
    });
    const rows = (await res.json()) as { id: string; finishedGames: number }[];
    expect(rows.find((r) => r.id === sessionId)?.finishedGames).toBe(3);
  });

  it("does not count a game still in progress", async () => {
    const { sessionId, cookie } = await createSession();
    await postState(sessionId, cookie, {
      startedAt: 4000,
      jackpot: 1000,
      called: [7],
      events: [],
    });

    const res = await SELF.fetch("https://example.com/admin/api/sessions", {
      headers: { Authorization: `Basic ${btoa("admin:test-password")}` },
    });
    const rows = (await res.json()) as { id: string; finishedGames: number }[];
    expect(rows.find((r) => r.id === sessionId)?.finishedGames).toBe(0);
  });
});
