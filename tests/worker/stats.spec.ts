// The statistics the operator panel asks for, over a period.
//
// Rows are inserted directly: the point under test is the aggregation, not
// the mirror that fills the tables (games.spec.ts covers that). Only games
// that reached полное лото count, which is what the panel promises.

import { describe, expect, it, beforeEach } from "vitest";
import { SELF, env } from "cloudflare:test";

const AUTH = `Basic ${btoa("admin:test-password")}`;
const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.now();

interface Stats {
  period: string;
  since: number | null;
  totals: {
    games: number;
    jackpotSum: number;
    jackpotAvg: number;
    durationAvgMs: number | null;
    calledAvg: number | null;
  };
  numbers: { number: number; count: number }[];
  winners: { seq: number; wins: number; byLevel: Record<string, number> }[];
}

async function addGame(opts: {
  id: string;
  finishedAt: number | null;
  startedAt?: number | null;
  jackpot?: number;
  called?: number[];
  wins?: { level: number; cid: string; seq: number; callCount: number }[];
}): Promise<void> {
  const sessionId = `S${opts.id}`;
  const started = opts.startedAt === undefined ? opts.finishedAt : opts.startedAt;
  await env.DB.prepare(
    "INSERT INTO sessions (id, created_at, updated_at) VALUES (?, ?, ?)",
  ).bind(sessionId, started ?? NOW, NOW).run();
  await env.DB.prepare(
    `INSERT INTO games (id, session_id, started_at, updated_at, finished_at, jackpot, called)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      opts.id,
      sessionId,
      started,
      NOW,
      opts.finishedAt,
      opts.jackpot ?? 0,
      (opts.called ?? []).length,
    )
    .run();

  for (const [i, number] of (opts.called ?? []).entries()) {
    await env.DB.prepare(
      "INSERT INTO draws (game_id, call_index, number) VALUES (?, ?, ?)",
    ).bind(opts.id, i, number).run();
  }
  for (const w of opts.wins ?? []) {
    await env.DB.prepare(
      `INSERT INTO wins (game_id, level, cid, seq, call_count) VALUES (?, ?, ?, ?, ?)`,
    ).bind(opts.id, w.level, w.cid, w.seq, w.callCount).run();
  }
}

async function stats(query = ""): Promise<Stats> {
  const res = await SELF.fetch(`https://example.com/admin/api/stats${query}`, {
    headers: { Authorization: AUTH },
  });
  expect(res.status).toBe(200);
  return (await res.json()) as Stats;
}

beforeEach(async () => {
  // Rows leak between tests in a file now that isolatedStorage is gone.
  await env.DB.exec("DELETE FROM draws");
  await env.DB.exec("DELETE FROM wins");
  await env.DB.exec("DELETE FROM games");
  await env.DB.exec("DELETE FROM sessions");
});

describe("GET /admin/api/stats", () => {
  it("is behind the same password as the rest of the panel", async () => {
    const res = await SELF.fetch("https://example.com/admin/api/stats");
    expect(res.status).toBe(401);
  });

  it("averages the bank across the games of a period", async () => {
    await addGame({ id: "g1", finishedAt: NOW - DAY, jackpot: 5000 });
    await addGame({ id: "g2", finishedAt: NOW - 2 * DAY, jackpot: 12000 });
    await addGame({ id: "g3", finishedAt: NOW - 3 * DAY, jackpot: 25000 });

    const s = await stats("?period=month");
    expect(s.totals.games).toBe(3);
    expect(s.totals.jackpotSum).toBe(42000);
    expect(s.totals.jackpotAvg).toBe(14000);
  });

  it("leaves out games that never finished", async () => {
    await addGame({ id: "done", finishedAt: NOW - DAY, jackpot: 5000 });
    await addGame({ id: "abandoned", finishedAt: null, jackpot: 99000 });

    const s = await stats("?period=month");
    expect(s.totals.games).toBe(1);
    expect(s.totals.jackpotSum).toBe(5000);
  });

  it("honours the period boundary", async () => {
    await addGame({ id: "recent", finishedAt: NOW - 10 * DAY, jackpot: 1000 });
    await addGame({ id: "old", finishedAt: NOW - 200 * DAY, jackpot: 9000 });

    expect((await stats("?period=month")).totals.games).toBe(1);
    expect((await stats("?period=year")).totals.games).toBe(2);

    const all = await stats("?period=all");
    expect(all.totals.games).toBe(2);
    expect(all.since).toBeNull();
  });

  it("measures how long games run, ignoring games that cannot say", async () => {
    await addGame({
      id: "timed",
      startedAt: NOW - DAY - 30 * 60 * 1000,
      finishedAt: NOW - DAY,
      jackpot: 0,
    });
    await addGame({
      id: "legacy",
      startedAt: null,
      finishedAt: NOW - DAY,
      jackpot: 0,
    });

    const s = await stats("?period=month");
    expect(s.totals.games).toBe(2);
    expect(s.totals.durationAvgMs).toBe(30 * 60 * 1000);
  });

  it("counts how often each number is drawn", async () => {
    await addGame({ id: "a", finishedAt: NOW - DAY, called: [7, 42, 7] });
    await addGame({ id: "b", finishedAt: NOW - DAY, called: [7, 13] });

    const s = await stats("?period=month");
    const byNumber = Object.fromEntries(s.numbers.map((n) => [n.number, n.count]));
    expect(byNumber[7]).toBe(3);
    expect(byNumber[42]).toBe(1);
    expect(byNumber[13]).toBe(1);
    expect(s.numbers[0]!.number).toBe(7);
  });

  it("ranks the cards that win, split by level", async () => {
    await addGame({
      id: "a",
      finishedAt: NOW - DAY,
      wins: [
        { level: 1, cid: "c17", seq: 17, callCount: 20 },
        { level: 3, cid: "c17", seq: 17, callCount: 80 },
      ],
    });
    await addGame({
      id: "b",
      finishedAt: NOW - DAY,
      wins: [{ level: 1, cid: "reprinted-17", seq: 17, callCount: 22 }],
    });
    await addGame({
      id: "c",
      finishedAt: NOW - DAY,
      wins: [{ level: 2, cid: "c04", seq: 4, callCount: 40 }],
    });

    const s = await stats("?period=month");
    expect(s.winners[0]!.seq).toBe(17);
    expect(s.winners[0]!.wins).toBe(3);
    // One row per printed number, even when the deck was reprinted and the
    // same number carries a different cid.
    expect(s.winners.filter((w) => w.seq === 17)).toHaveLength(1);
    expect(s.winners[0]!.byLevel["1"]).toBe(2);
    expect(s.winners[0]!.byLevel["3"]).toBe(1);
    expect(s.winners[1]!.seq).toBe(4);
  });

  it("falls back to the default period rather than widening on a typo", async () => {
    await addGame({ id: "old", finishedAt: NOW - 200 * DAY, jackpot: 9000 });
    const s = await stats("?period=fortnight");
    expect(s.period).toBe("month");
    expect(s.totals.games).toBe(0);
  });

  it("says nothing happened rather than dividing by zero", async () => {
    const s = await stats("?period=month");
    expect(s.totals.games).toBe(0);
    expect(s.totals.jackpotAvg).toBe(0);
    expect(s.totals.durationAvgMs).toBeNull();
    expect(s.numbers).toEqual([]);
    expect(s.winners).toEqual([]);
  });
});

describe("GET /admin/stats", () => {
  it("challenges an unauthenticated request for the page", async () => {
    const res = await SELF.fetch("https://example.com/admin/stats");
    expect(res.status).toBe(401);
  });

  it("serves the page to the operator", async () => {
    const res = await SELF.fetch("https://example.com/admin/stats", {
      headers: { Authorization: AUTH },
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toMatch(/text\/html/);
  });

  // The shell sits under /admin/, which run_worker_first claims, so the
  // assets binding never gets the chance to hand it out unauthenticated.
  it("is not reachable as a static file past the password", async () => {
    const res = await SELF.fetch("https://example.com/admin/stats.html");
    expect(res.status).toBe(401);
  });
});
