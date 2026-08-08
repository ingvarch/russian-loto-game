// Tests for public/static/js/state.js.
//
// Run with:  bun test tests/js/

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  applyCallNumber,
  applyMusicPauseContinue,
  applyReopenEvent,
  applyResolveEvent,
  applyResolveTiebreak,
  freshState,
  recompute,
} from "../../public/static/js/state.js";


// A 3x9 card literal helper. Any number in `called` closes the matching row.
function card(seq, cid, grid) {
  const rows = grid.map((row) => row.map((v) => (v === "_" ? null : v)));
  const numbers = [];
  for (const row of rows) for (const n of row) if (n !== null) numbers.push(n);
  numbers.sort((a, b) => a - b);
  return { seq, cid, numbers, rows };
}

// Two cards with DIFFERENT first-row numbers so we can trigger level-1
// crossings independently. Card A closes row 0 with {1,2,3,4,5};
// Card B closes row 0 with {6,7,8,9,50}.
const cardA = card(1, "aaa", [
  [1, 2, 3, 4, 5, "_", "_", "_", "_"],
  ["_", "_", "_", "_", "_", 51, 61, 71, 81],
  ["_", "_", "_", "_", "_", 52, 62, 72, 82],
]);
const cardB = card(2, "bbb", [
  [6, 7, 8, 9, "_", 50, "_", "_", "_"],
  ["_", "_", "_", "_", "_", 53, 63, 73, 83],
  ["_", "_", "_", "_", "_", 54, 64, 74, 84],
]);


// ---- freshState / default values ----------------------------------------

test("freshState: includes levelAutoConfirm for all three levels, all false", () => {
  const s = freshState();
  assert.deepEqual(s.levelAutoConfirm, { 1: false, 2: false, 3: false });
});

test("freshState: includes empty tiebreakWinners object", () => {
  const s = freshState();
  assert.deepEqual(s.tiebreakWinners, {});
});

test("freshState: split defaults to false (host picks tie winners)", () => {
  const s = freshState();
  assert.equal(s.split, false);
});

test("freshState: musicPause defaults to null", () => {
  const s = freshState();
  assert.equal(s.musicPause, null);
});

test("freshState: musicPause override is kept", () => {
  const s = freshState({ musicPause: { number: 42, done: false } });
  assert.deepEqual(s.musicPause, { number: 42, done: false });
});

test("applyMusicPauseContinue: marks the pause done", () => {
  const s = freshState({ musicPause: { number: 42, done: false } });
  applyMusicPauseContinue(s);
  assert.deepEqual(s.musicPause, { number: 42, done: true });
});

test("applyMusicPauseContinue: no-op when musicPause is null", () => {
  const s = freshState();
  applyMusicPauseContinue(s);
  assert.equal(s.musicPause, null);
});


// ---- recompute: pending vs auto-confirm ---------------------------------

test("recompute: first crossing at level 1 with autoConfirm=false -> pending", () => {
  const s = freshState();
  s.called = [1, 2, 3, 4, 5];
  recompute(s, [cardA], "10:00");
  assert.equal(s.events.length, 1);
  assert.equal(s.events[0].status, "pending");
  assert.equal(s.events[0].level, 1);
  assert.equal(s.events[0].cid, "aaa");
});

test("recompute: crossing at level 1 with levelAutoConfirm[1]=true -> confirmed directly", () => {
  const s = freshState();
  s.levelAutoConfirm = { 1: true, 2: false, 3: false };
  s.called = [1, 2, 3, 4, 5];
  recompute(s, [cardA], "10:00");
  assert.equal(s.events.length, 1);
  assert.equal(s.events[0].status, "confirmed");
});

test("recompute: levelAutoConfirm is per-level — level-2 crossing still pending when only level-1 auto", () => {
  // Build state where cardA has already crossed level 1 (event confirmed) and
  // we call enough numbers to close its row 1 too.
  const s = freshState();
  s.levelAutoConfirm = { 1: true, 2: false, 3: false };
  s.called = [1, 2, 3, 4, 5];
  recompute(s, [cardA], "10:00");
  s.called = [1, 2, 3, 4, 5, 51, 61, 71, 81];
  recompute(s, [cardA], "10:01");
  // Two events now: the original confirmed level-1, plus a new pending level-2
  const level2 = s.events.find((e) => e.level === 2);
  assert.ok(level2, "expected a level-2 event");
  assert.equal(level2.status, "pending");
});


// ---- applyResolveEvent: side effect on levelAutoConfirm -----------------

test("applyResolveEvent('confirmed'): sets levelAutoConfirm[level] = true", () => {
  const s = freshState();
  s.called = [1, 2, 3, 4, 5];
  recompute(s, [cardA], "10:00");
  const ev = s.events[0];
  applyResolveEvent(s, { cid: ev.cid, level: ev.level, callCount: ev.callCount }, "confirmed");
  assert.equal(s.levelAutoConfirm[1], true);
});

test("applyResolveEvent('absent'): does NOT flip levelAutoConfirm", () => {
  const s = freshState();
  s.called = [1, 2, 3, 4, 5];
  recompute(s, [cardA], "10:00");
  const ev = s.events[0];
  applyResolveEvent(s, { cid: ev.cid, level: ev.level, callCount: ev.callCount }, "absent");
  assert.equal(s.levelAutoConfirm[1], false);
});

test("applyResolveEvent: confirming level 2 does not auto-confirm levels 1 or 3", () => {
  const s = freshState();
  // Fake a pending level-2 event
  s.events = [{ cid: "aaa", seq: 1, level: 2, callCount: 10, status: "pending" }];
  applyResolveEvent(s, { cid: "aaa", level: 2, callCount: 10 }, "confirmed");
  assert.deepEqual(s.levelAutoConfirm, { 1: false, 2: true, 3: false });
});


// ---- applyReopenEvent: revert a resolved event back to pending ----------

test("applyReopenEvent: confirmed event -> pending", () => {
  const s = freshState();
  s.called = [1, 2, 3, 4, 5];
  recompute(s, [cardA], "10:00");
  const ev = s.events[0];
  applyResolveEvent(s, { cid: ev.cid, level: ev.level, callCount: ev.callCount }, "confirmed");
  applyReopenEvent(s, { cid: ev.cid, level: ev.level, callCount: ev.callCount });
  assert.equal(s.events[0].status, "pending");
});

test("applyReopenEvent: absent event -> pending", () => {
  const s = freshState();
  s.called = [1, 2, 3, 4, 5];
  recompute(s, [cardA], "10:00");
  const ev = s.events[0];
  applyResolveEvent(s, { cid: ev.cid, level: ev.level, callCount: ev.callCount }, "absent");
  applyReopenEvent(s, { cid: ev.cid, level: ev.level, callCount: ev.callCount });
  assert.equal(s.events[0].status, "pending");
});

test("applyReopenEvent: reopening the only confirmed event at a level clears levelAutoConfirm", () => {
  const s = freshState();
  s.called = [1, 2, 3, 4, 5];
  recompute(s, [cardA], "10:00");
  const ev = s.events[0];
  applyResolveEvent(s, { cid: ev.cid, level: ev.level, callCount: ev.callCount }, "confirmed");
  applyReopenEvent(s, { cid: ev.cid, level: ev.level, callCount: ev.callCount });
  assert.equal(s.levelAutoConfirm[1], false);
});

test("applyReopenEvent: another confirmed event at the level keeps levelAutoConfirm true", () => {
  const s = freshState();
  // Two confirmed level-1 events; reopen one, the other still holds the level.
  s.events = [
    { cid: "aaa", seq: 1, level: 1, callCount: 5, status: "confirmed" },
    { cid: "bbb", seq: 2, level: 1, callCount: 5, status: "confirmed" },
  ];
  s.levelAutoConfirm = { 1: true, 2: false, 3: false };
  applyReopenEvent(s, { cid: "aaa", level: 1, callCount: 5 });
  assert.equal(s.levelAutoConfirm[1], true);
});

test("applyReopenEvent: only the addressed event flips", () => {
  const s = freshState();
  s.events = [
    { cid: "aaa", seq: 1, level: 1, callCount: 5, status: "absent" },
    { cid: "bbb", seq: 2, level: 1, callCount: 5, status: "absent" },
  ];
  applyReopenEvent(s, { cid: "aaa", level: 1, callCount: 5 });
  assert.equal(s.events[0].status, "pending");
  assert.equal(s.events[1].status, "absent");
});

test("applyReopenEvent: pending event is left untouched (no-op)", () => {
  const s = freshState();
  s.events = [{ cid: "aaa", seq: 1, level: 1, callCount: 5, status: "pending" }];
  applyReopenEvent(s, { cid: "aaa", level: 1, callCount: 5 });
  assert.equal(s.events[0].status, "pending");
});


// ---- End-to-end: second crossing auto-confirms --------------------------

test("end-to-end: after first level-1 confirm, second card's level-1 crossing is auto-confirmed", () => {
  const s = freshState();
  const cards = [cardA, cardB];

  // Call A's row 0 numbers: level-1 crossing on cardA -> pending
  s.called = [1, 2, 3, 4, 5];
  recompute(s, cards, "10:00");
  const firstEv = s.events.find((e) => e.cid === "aaa" && e.level === 1);
  assert.equal(firstEv.status, "pending");

  // Admin confirms: cardA plays
  applyResolveEvent(s, { cid: "aaa", level: 1, callCount: 5 }, "confirmed");
  assert.equal(s.levelAutoConfirm[1], true);

  // Now call B's row 0 numbers: level-1 crossing on cardB should auto-confirm
  s.called = [1, 2, 3, 4, 5, 6, 7, 8, 9, 50];
  recompute(s, cards, "10:01");
  const bEv = s.events.find((e) => e.cid === "bbb" && e.level === 1);
  assert.ok(bEv, "cardB should have emitted a level-1 event");
  assert.equal(bEv.status, "confirmed");
});

test("end-to-end: after first level-1 marked absent, second card still pending (not auto-confirmed)", () => {
  const s = freshState();
  const cards = [cardA, cardB];

  s.called = [1, 2, 3, 4, 5];
  recompute(s, cards, "10:00");
  applyResolveEvent(s, { cid: "aaa", level: 1, callCount: 5 }, "absent");
  assert.equal(s.levelAutoConfirm[1], false);

  s.called = [1, 2, 3, 4, 5, 6, 7, 8, 9, 50];
  recompute(s, cards, "10:01");
  const bEv = s.events.find((e) => e.cid === "bbb" && e.level === 1);
  assert.equal(bEv.status, "pending");
});


// ---- applyResolveTiebreak -----------------------------------------------

test("applyResolveTiebreak: stores the winner cid under '<level>:<callCount>'", () => {
  const s = freshState();
  applyResolveTiebreak(s, { level: 1, callCount: 10 }, "picked-cid");
  assert.equal(s.tiebreakWinners["1:10"], "picked-cid");
});

test("applyResolveTiebreak: overwrites a previous entry for same key", () => {
  const s = freshState();
  s.tiebreakWinners = { "1:10": "old" };
  applyResolveTiebreak(s, { level: 1, callCount: 10 }, "new");
  assert.equal(s.tiebreakWinners["1:10"], "new");
});


// ---- applyCallNumber integrates with auto-confirm -----------------------

test("applyCallNumber: fifth call that closes a line emits confirmed event when autoConfirm set", () => {
  const s = freshState();
  s.levelAutoConfirm = { 1: true, 2: false, 3: false };
  const cards = [cardA];
  applyCallNumber(s, 1, cards);
  applyCallNumber(s, 2, cards);
  applyCallNumber(s, 3, cards);
  applyCallNumber(s, 4, cards);
  const result = applyCallNumber(s, 5, cards);
  assert.equal(result.newPending, false);
  assert.equal(s.events.length, 1);
  assert.equal(s.events[0].status, "confirmed");
});


// ---- applyCallNumber preserves chronological order ----------------------
//
// The /display page reads `called[last]` as "the most recently drawn keg" and
// `recentCalled` slices the tail to show the last five. Both rely on the
// array staying in call order. Sorting state.called by value breaks this:
// calling 50, then 8 would surface 50 (the largest) as "current" instead of 8.

test("applyCallNumber: preserves chronological order regardless of value", () => {
  const s = freshState();
  const cards = [cardA];
  applyCallNumber(s, 50, cards);
  applyCallNumber(s, 8, cards);
  applyCallNumber(s, 25, cards);
  assert.deepEqual(s.called, [50, 8, 25]);
  assert.equal(s.called[s.called.length - 1], 25);
});
