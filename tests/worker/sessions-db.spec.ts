// D1 access layer for the session mirror and the statistics tables.
//
// The mirror is advisory: the authoritative state lives in the GameRoom
// Durable Object. These tests pin the shape of what gets written, the
// point at which aggregates are materialised, and that re-recording the
// same game never duplicates rows.

import { beforeEach, describe, expect, it } from "vitest";
import { env } from "cloudflare:test";

import {
  createSession,
  drawRows,
  isGameFinished,
  listSessions,
  recordState,
  winRows,
} from "../../src/sessions-db.js";

// A game where every level has been confirmed, level 3 included, so the
// aggregates materialise.
function finishedState() {
  return {
    called: [7, 42, 13, 88],
    events: [
      { cid: "aaa", seq: 1, level: 1, callCount: 2, status: "confirmed" },
      { cid: "bbb", seq: 2, level: 2, callCount: 3, status: "confirmed" },
      { cid: "ccc", seq: 3, level: 3, callCount: 4, status: "confirmed" },
    ],
    jackpot: 5000,
  };
}

async function countRows(table: string, sessionId: string): Promise<number> {
  const row = await env.DB.prepare(
    `SELECT COUNT(*) AS n FROM ${table} WHERE game_id IN (SELECT id FROM games WHERE session_id = ?)`,
  )
    .bind(sessionId)
    .first<{ n: number }>();
  return row?.n ?? 0;
}

describe("pure row derivation", () => {
  it("drawRows maps state.called to chronological call_index", () => {
    expect(drawRows({ called: [7, 42, 13] })).toEqual([
      { callIndex: 0, number: 7 },
      { callIndex: 1, number: 42 },
      { callIndex: 2, number: 13 },
    ]);
  });

  it("drawRows returns nothing for a state with no called list", () => {
    expect(drawRows({})).toEqual([]);
    expect(drawRows(null)).toEqual([]);
    expect(drawRows("not a state")).toEqual([]);
  });

  it("winRows carries callCount, which winnersByLevel drops", () => {
    expect(winRows(finishedState())).toEqual([
      { level: 1, cid: "aaa", seq: 1, callCount: 2 },
      { level: 2, cid: "bbb", seq: 2, callCount: 3 },
      { level: 3, cid: "ccc", seq: 3, callCount: 4 },
    ]);
  });

  it("winRows skips levels that are only pending or absent", () => {
    const state = {
      events: [
        { cid: "aaa", seq: 1, level: 1, callCount: 2, status: "confirmed" },
        { cid: "bbb", seq: 2, level: 2, callCount: 3, status: "pending" },
        { cid: "ccc", seq: 3, level: 3, callCount: 4, status: "absent" },
      ],
    };
    expect(winRows(state)).toEqual([
      { level: 1, cid: "aaa", seq: 1, callCount: 2 },
    ]);
  });

  it("isGameFinished is true only once полное лото is confirmed", () => {
    expect(isGameFinished(finishedState())).toBe(true);
    expect(isGameFinished({ called: [1, 2], events: [] })).toBe(false);
    expect(
      isGameFinished({
        events: [
          { cid: "a", seq: 1, level: 3, callCount: 4, status: "pending" },
        ],
      }),
    ).toBe(false);
    expect(isGameFinished(null)).toBe(false);
  });
});

describe("sessions mirror", () => {
  beforeEach(async () => {
    await env.DB.prepare("DELETE FROM sessions").run();
  });

  it("createSession inserts a row with no state yet", async () => {
    await createSession(env.DB, "SESS0001", 1000);
    const rows = await listSessions(env.DB, {});
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id: "SESS0001",
      createdAt: 1000,
      updatedAt: 1000,
      finishedAt: null,
      state: null,
    });
  });

  it("recordState stores the snapshot and moves updated_at only", async () => {
    await createSession(env.DB, "SESS0002", 1000);
    const snapshot = { called: [5], events: [] };
    await recordState(env.DB, "SESS0002", snapshot, 2000);

    const rows = await listSessions(env.DB, {});
    expect(rows[0]).toMatchObject({
      id: "SESS0002",
      createdAt: 1000,
      updatedAt: 2000,
      finishedAt: null,
    });
    expect(rows[0]!.state).toEqual(snapshot);
  });

  it("recordState creates the row when creation was never mirrored", async () => {
    // A D1 outage during POST /api/session must not make the session
    // invisible forever -- the first state write repairs the gap.
    await recordState(env.DB, "SESS0003", { called: [], events: [] }, 3000);
    const rows = await listSessions(env.DB, {});
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ id: "SESS0003", createdAt: 3000 });
  });

  it("listSessions returns newest activity first", async () => {
    await createSession(env.DB, "OLD", 1000);
    await createSession(env.DB, "NEW", 1000);
    await recordState(env.DB, "OLD", { called: [] }, 2000);
    await recordState(env.DB, "NEW", { called: [] }, 5000);

    const rows = await listSessions(env.DB, {});
    expect(rows.map((r) => r.id)).toEqual(["NEW", "OLD"]);
  });

  it("listSessions filters by updatedAfter", async () => {
    await createSession(env.DB, "STALE", 1000);
    await createSession(env.DB, "LIVE", 9000);

    const rows = await listSessions(env.DB, { updatedAfter: 5000 });
    expect(rows.map((r) => r.id)).toEqual(["LIVE"]);
  });
});

describe("statistics materialisation", () => {
  beforeEach(async () => {
    await env.DB.prepare("DELETE FROM sessions").run();
  });

  it("writes nothing while the game is still running", async () => {
    await createSession(env.DB, "RUNNING", 1000);
    await recordState(
      env.DB,
      "RUNNING",
      { called: [1, 2, 3], events: [] },
      2000,
    );

    expect(await countRows("draws", "RUNNING")).toBe(0);
    expect(await countRows("wins", "RUNNING")).toBe(0);
    const rows = await listSessions(env.DB, {});
    expect(rows[0]!.finishedAt).toBeNull();
  });

  it("materialises draws and wins once полное лото is confirmed", async () => {
    await createSession(env.DB, "DONE", 1000);
    await recordState(env.DB, "DONE", finishedState(), 2000);

    const draws = await env.DB.prepare(
      "SELECT d.call_index, d.number FROM draws d JOIN games g ON g.id = d.game_id WHERE g.session_id = ? ORDER BY d.call_index",
    )
      .bind("DONE")
      .all<{ call_index: number; number: number }>();
    expect(draws.results).toEqual([
      { call_index: 0, number: 7 },
      { call_index: 1, number: 42 },
      { call_index: 2, number: 13 },
      { call_index: 3, number: 88 },
    ]);

    const wins = await env.DB.prepare(
      "SELECT w.level, w.cid, w.seq, w.call_count FROM wins w JOIN games g ON g.id = w.game_id WHERE g.session_id = ? ORDER BY w.level",
    )
      .bind("DONE")
      .all<{ level: number; cid: string; seq: number; call_count: number }>();
    expect(wins.results).toEqual([
      { level: 1, cid: "aaa", seq: 1, call_count: 2 },
      { level: 2, cid: "bbb", seq: 2, call_count: 3 },
      { level: 3, cid: "ccc", seq: 3, call_count: 4 },
    ]);

    const rows = await listSessions(env.DB, {});
    expect(rows[0]!.finishedAt).toBe(2000);
  });

  it("re-recording a finished game does not duplicate rows", async () => {
    await createSession(env.DB, "TWICE", 1000);
    await recordState(env.DB, "TWICE", finishedState(), 2000);
    await recordState(env.DB, "TWICE", finishedState(), 3000);

    expect(await countRows("draws", "TWICE")).toBe(4);
    expect(await countRows("wins", "TWICE")).toBe(3);
  });

  it("re-recording after an отжатие shrinks the draws back down", async () => {
    await createSession(env.DB, "UNDO", 1000);
    await recordState(env.DB, "UNDO", finishedState(), 2000);
    expect(await countRows("draws", "UNDO")).toBe(4);

    const shrunk = { ...finishedState(), called: [7, 42] };
    await recordState(env.DB, "UNDO", shrunk, 3000);
    expect(await countRows("draws", "UNDO")).toBe(2);
  });

  it("deleting a session cascades to its aggregates", async () => {
    await createSession(env.DB, "GONE", 1000);
    await recordState(env.DB, "GONE", finishedState(), 2000);
    expect(await countRows("draws", "GONE")).toBe(4);

    await env.DB.prepare("DELETE FROM sessions WHERE id = ?")
      .bind("GONE")
      .run();

    expect(await countRows("draws", "GONE")).toBe(0);
    expect(await countRows("wins", "GONE")).toBe(0);
  });
});
