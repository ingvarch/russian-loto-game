import { test } from "node:test";
import assert from "node:assert/strict";

import {
  summarizeSession,
  LIVE_WINDOW_MS,
  TOTAL_KEGS,
  pluralGames,
} from "../../public/static/js/admin-logic.js";

const NOW = 1_700_000_000_000;

function session(overrides) {
  return Object.assign(
    {
      id: "ABC12345",
      createdAt: NOW - 60_000,
      updatedAt: NOW - 1_000,
      finishedAt: null,
      state: null,
    },
    overrides || {},
  );
}

test("summarizeSession: a session with no state yet reads as an empty game", () => {
  const s = summarizeSession(session(), NOW);
  assert.equal(s.id, "ABC12345");
  assert.equal(s.calledCount, 0);
  assert.equal(s.lastNumber, null);
  assert.equal(s.jackpot, 0);
  assert.equal(s.pending, false);
  assert.equal(s.finished, false);
  assert.deepEqual(s.winners, { 1: null, 2: null, 3: null });
});

test("summarizeSession: counts kegs and reads the last drawn one", () => {
  const s = summarizeSession(
    session({ state: { called: [7, 42, 13], events: [] } }),
    NOW,
  );
  assert.equal(s.calledCount, 3);
  // called is chronological, so the freshly drawn keg is the tail.
  assert.equal(s.lastNumber, 13);
});

test("summarizeSession: surfaces confirmed winners per level", () => {
  const s = summarizeSession(
    session({
      state: {
        called: [1, 2, 3],
        events: [
          { cid: "aaa", seq: 12, level: 1, callCount: 2, status: "confirmed" },
          { cid: "bbb", seq: 40, level: 2, callCount: 3, status: "confirmed" },
        ],
      },
    }),
    NOW,
  );
  assert.deepEqual(s.winners[1], { seq: 12, cid: "aaa" });
  assert.deepEqual(s.winners[2], { seq: 40, cid: "bbb" });
  assert.equal(s.winners[3], null);
});

test("summarizeSession: flags a game blocked on a pending confirmation", () => {
  const blocked = summarizeSession(
    session({
      state: {
        called: [1],
        events: [{ cid: "a", seq: 1, level: 1, callCount: 1, status: "pending" }],
      },
    }),
    NOW,
  );
  assert.equal(blocked.pending, true);

  const clear = summarizeSession(
    session({
      state: {
        called: [1],
        events: [{ cid: "a", seq: 1, level: 1, callCount: 1, status: "confirmed" }],
      },
    }),
    NOW,
  );
  assert.equal(clear.pending, false);
});

test("summarizeSession: finished follows finishedAt from the server", () => {
  assert.equal(summarizeSession(session({ finishedAt: NOW }), NOW).finished, true);
  assert.equal(summarizeSession(session({ finishedAt: null }), NOW).finished, false);
});

test("summarizeSession: live while activity is recent, stale after the window", () => {
  const fresh = session({ updatedAt: NOW - 5_000 });
  assert.equal(summarizeSession(fresh, NOW).live, true);

  const old = session({ updatedAt: NOW - LIVE_WINDOW_MS - 1 });
  assert.equal(summarizeSession(old, NOW).live, false);
});

test("summarizeSession: a finished game is never live", () => {
  const s = session({ updatedAt: NOW - 1_000, finishedAt: NOW - 1_000 });
  assert.equal(summarizeSession(s, NOW).live, false);
});

test("summarizeSession: carries the jackpot through", () => {
  const s = summarizeSession(
    session({ state: { called: [], events: [], jackpot: 5000 } }),
    NOW,
  );
  assert.equal(s.jackpot, 5000);
});

test("summarizeSession: idleFor is milliseconds since the last activity", () => {
  const s = summarizeSession(session({ updatedAt: NOW - 42_000 }), NOW);
  assert.equal(s.idleFor, 42_000);
});

test("summarizeSession: survives a malformed state blob", () => {
  for (const bad of ["nonsense", 42, [], { called: "no", events: "no" }]) {
    const s = summarizeSession(session({ state: bad }), NOW);
    assert.equal(s.calledCount, 0);
    assert.equal(s.lastNumber, null);
    assert.deepEqual(s.winners, { 1: null, 2: null, 3: null });
  }
});

test("summarizeSession: progress is the called fraction of the full keg set", () => {
  const empty = summarizeSession(session(), NOW);
  assert.equal(empty.progress, 0);

  const half = summarizeSession(
    session({
      state: { called: Array.from({ length: 45 }, (_, i) => i + 1), events: [] },
    }),
    NOW,
  );
  assert.equal(half.progress, 0.5);

  const full = summarizeSession(
    session({
      state: { called: Array.from({ length: TOTAL_KEGS }, (_, i) => i + 1), events: [] },
    }),
    NOW,
  );
  assert.equal(full.progress, 1);
});

test("summarizeSession: progress never exceeds 1 on a malformed over-long called list", () => {
  const s = summarizeSession(
    session({
      state: { called: Array.from({ length: 120 }, (_, i) => i + 1), events: [] },
    }),
    NOW,
  );
  assert.equal(s.progress, 1);
});

test("summarizeSession: carries how many games the session has finished", () => {
  const s = summarizeSession(session({ finishedGames: 3 }), NOW);
  assert.equal(s.finishedGames, 3);
});

test("summarizeSession: a session the mirror never counted reads as zero", () => {
  assert.equal(summarizeSession(session(), NOW).finishedGames, 0);
  assert.equal(summarizeSession(session({ finishedGames: "3" }), NOW).finishedGames, 0);
});

test("pluralGames: Russian counts do not read like a spreadsheet", () => {
  assert.equal(pluralGames(1), "1 партия");
  assert.equal(pluralGames(2), "2 партии");
  assert.equal(pluralGames(4), "4 партии");
  assert.equal(pluralGames(5), "5 партий");
  assert.equal(pluralGames(0), "0 партий");
});

test("pluralGames: the teens are all the genitive plural", () => {
  assert.equal(pluralGames(11), "11 партий");
  assert.equal(pluralGames(12), "12 партий");
  assert.equal(pluralGames(14), "14 партий");
});

test("pluralGames: past twenty the last digit decides again", () => {
  assert.equal(pluralGames(21), "21 партия");
  assert.equal(pluralGames(22), "22 партии");
  assert.equal(pluralGames(25), "25 партий");
  assert.equal(pluralGames(101), "101 партия");
});
