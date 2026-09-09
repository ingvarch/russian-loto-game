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
  applyUncallNumber,
  freshState,
  loadState,
  readState,
  recompute,
  saveState,
  setSession,
  STORAGE_KEY,
  writeState,
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

test("freshState: easterEggs default to enabled", () => {
  const s = freshState();
  assert.equal(s.easterEggs, true);
});

test("freshState: easterEggs override is kept", () => {
  const s = freshState({ easterEggs: false });
  assert.equal(s.easterEggs, false);
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
  applyCallNumber(s, 5, cards);
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


// ---- applyUncallNumber ---------------------------------------------------

test("applyUncallNumber: mutates in place -- drops the number, its level and its event", () => {
  const s = freshState();
  const cards = [cardA];
  for (const n of [1, 2, 3, 4, 5]) applyCallNumber(s, n, cards);
  assert.equal(s.events.length, 1);

  applyUncallNumber(s, 5, cards);
  assert.deepEqual(s.called, [1, 2, 3, 4]);
  assert.equal(s.events.length, 0);
  assert.equal(s.cardLevel["aaa"], 0);
});

test("applyUncallNumber: a number that was never called is a no-op", () => {
  const s = freshState();
  const cards = [cardA];
  applyCallNumber(s, 1, cards);
  applyUncallNumber(s, 90, cards);
  assert.deepEqual(s.called, [1]);
});

test("freshState: stamps the moment the game started", () => {
  const before = Date.now();
  const s = freshState();
  const after = Date.now();
  assert.ok(typeof s.startedAt === "number", "startedAt should be a number");
  assert.ok(s.startedAt >= before && s.startedAt <= after);
});

test("readState: a save from before the timer existed reports no start time", () => {
  const storage = fakeStorage();
  const saved = freshState();
  delete saved.startedAt;
  storage.store.set(STORAGE_KEY, JSON.stringify(saved));

  assert.equal(readState(storage, null).startedAt, null);
});


// ---- persistence ---------------------------------------------------------
//
// Pins every rule read/write carry today: the session namespacing of the key,
// the back-fill of fields added after old saves were written, and the silent
// degradation when storage throws or is missing.

function fakeStorage(entries) {
  const store = new Map(entries || []);
  return {
    store,
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
  };
}

test("writeState/readState: round-trip under the bare key with no session", () => {
  const storage = fakeStorage();
  const s = freshState();
  s.called = [7];
  writeState(storage, null, s);
  assert.ok(storage.store.has(STORAGE_KEY));
  assert.deepEqual(readState(storage, null).called, [7]);
});

test("writeState/readState: a session namespaces the key", () => {
  const storage = fakeStorage();
  const s = freshState();
  s.called = [7];
  writeState(storage, "ABC123", s);
  assert.ok(storage.store.has(`${STORAGE_KEY}:ABC123`));
  assert.ok(!storage.store.has(STORAGE_KEY));
  assert.equal(readState(storage, "XYZ789"), null);
  assert.deepEqual(readState(storage, "ABC123").called, [7]);
});

test("readState: back-fills every field added after an old save was written", () => {
  const storage = fakeStorage();
  storage.store.set(STORAGE_KEY, JSON.stringify({ called: [1], events: [], cardLevel: {} }));
  const s = readState(storage, null);
  assert.equal(s.jackpot, 0);
  assert.deepEqual(s.percentages, [10, 25, 65]);
  assert.equal(s.split, true);
  assert.equal(s.musicPause, null);
  assert.equal(s.easterEggs, true);
  assert.equal(s.cardRange, null);
  assert.equal(s.startedAt, null);
  assert.deepEqual(s.tiebreakWinners, {});
});

test("readState: derives levelAutoConfirm from the confirmed events of an old save", () => {
  const storage = fakeStorage();
  storage.store.set(STORAGE_KEY, JSON.stringify({
    called: [1],
    events: [
      { cid: "aaa", level: 1, callCount: 5, status: "confirmed" },
      { cid: "bbb", level: 2, callCount: 9, status: "absent" },
    ],
  }));
  assert.deepEqual(readState(storage, null).levelAutoConfirm, { 1: true, 2: false, 3: false });
});

test("readState: confirms status-less legacy events and drops tiebreakResolutions", () => {
  const storage = fakeStorage();
  storage.store.set(STORAGE_KEY, JSON.stringify({
    called: [1],
    events: [{ cid: "aaa", level: 1, callCount: 5 }],
    tiebreakResolutions: { "1:5": "aaa" },
  }));
  const s = readState(storage, null);
  assert.equal(s.events[0].status, "confirmed");
  assert.equal("tiebreakResolutions" in s, false);
});

test("readState: null for nothing saved, malformed JSON, or a blob without `called`", () => {
  const storage = fakeStorage();
  assert.equal(readState(storage, null), null);
  storage.store.set(STORAGE_KEY, "{not json");
  assert.equal(readState(storage, null), null);
  storage.store.set(STORAGE_KEY, JSON.stringify({ events: [] }));
  assert.equal(readState(storage, null), null);
});

test("readState/writeState: storage that throws degrades silently", () => {
  const throwing = {
    getItem() { throw new Error("denied"); },
    setItem() { throw new Error("quota"); },
  };
  assert.equal(readState(throwing, null), null);
  assert.doesNotThrow(() => writeState(throwing, null, freshState()));
});

test("readState/writeState: no storage at all degrades silently", () => {
  assert.equal(readState(undefined, null), null);
  assert.doesNotThrow(() => writeState(undefined, null, freshState()));
});

// loadState/saveState are the thin wrappers the pages call: they bind the
// browser's localStorage and whatever setSession() last recorded.

test("loadState/saveState: bind localStorage and the active session", () => {
  const storage = fakeStorage();
  globalThis.localStorage = storage;
  try {
    setSession("ABC123");
    const s = freshState();
    s.called = [7];
    saveState(s);
    assert.ok(storage.store.has(`${STORAGE_KEY}:ABC123`));
    assert.deepEqual(loadState().called, [7]);

    setSession(null);
    assert.equal(loadState(), null);
  } finally {
    delete globalThis.localStorage;
    setSession(null);
  }
});

test("loadState/saveState: a browser without localStorage degrades silently", () => {
  delete globalThis.localStorage;
  setSession(null);
  assert.equal(loadState(), null);
  assert.doesNotThrow(() => saveState(freshState()));
});
