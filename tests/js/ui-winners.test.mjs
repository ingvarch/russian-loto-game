// Tests for public/static/js/ui-winners.js — the winner selection the two
// boards share. `decidedWinners` decides whether a level row is shown at all
// (host and /display must agree); `confirmedWinnersAt` picks the cards one
// specific call just confirmed, which is what the win overlay fires on.
//
// Run with:  bun test tests/js/

import { test } from "node:test";
import assert from "node:assert/strict";

import { decidedWinners, confirmedWinnersAt } from "../../public/static/js/ui-winners.js";

const card = (cid, seq) => ({ cid, seq, numbers: [], rows: [[], [], []] });
const CARDS = [card("a", 7), card("b", 3), card("c", 11)];

const event = (over) => ({
  ts: "12:00", cid: "a", seq: 7, level: 3, callCount: 40, status: "confirmed", ...over,
});

function state(events, over = {}) {
  return { called: [], events, split: true, tiebreakWinners: {}, ...over };
}

// ---- decidedWinners ------------------------------------------------------

test("decidedWinners: no events means the level row stays hidden", () => {
  assert.equal(decidedWinners(state([]), CARDS, 1), null);
});

test("decidedWinners: a pending event does not decide the level", () => {
  assert.equal(decidedWinners(state([event({ status: "pending" })]), CARDS, 3), null);
});

test("decidedWinners: a confirmed event decides the level", () => {
  const winners = decidedWinners(state([event()]), CARDS, 3);
  assert.deepEqual(winners.map((c) => c.cid), ["a"]);
});

test("decidedWinners: the earliest callCount wins, ties sorted by seq", () => {
  const events = [
    event({ cid: "c", seq: 11, callCount: 40 }),
    event({ cid: "b", seq: 3, callCount: 40 }),
    event({ cid: "a", seq: 7, callCount: 45 }),
  ];
  const winners = decidedWinners(state(events), CARDS, 3);
  assert.deepEqual(winners.map((c) => c.seq), [3, 11]);
});

test("decidedWinners: split=false leaves a tie undecided until the host picks", () => {
  const events = [
    event({ cid: "c", seq: 11 }),
    event({ cid: "b", seq: 3 }),
  ];
  assert.equal(decidedWinners(state(events, { split: false }), CARDS, 3), null);

  const picked = state(events, { split: false, tiebreakWinners: { "3:40": "c" } });
  assert.deepEqual(decidedWinners(picked, CARDS, 3).map((c) => c.cid), ["c"]);
});

test("decidedWinners: an event for a card outside the range leaves it hidden", () => {
  assert.equal(decidedWinners(state([event({ cid: "zzz" })]), CARDS, 3), null);
});

// ---- confirmedWinnersAt --------------------------------------------------

test("confirmedWinnersAt: picks the confirmed events of one level and call, by seq", () => {
  const events = [
    event({ cid: "c", seq: 11 }),
    event({ cid: "b", seq: 3 }),
    event({ cid: "a", seq: 7, callCount: 39 }),
    event({ cid: "a", seq: 7, level: 2 }),
  ];
  assert.deepEqual(confirmedWinnersAt(events, 3, 40).map((e) => e.seq), [3, 11]);
});

test("confirmedWinnersAt: pending and absent events are not winners", () => {
  const events = [event({ status: "pending" }), event({ cid: "b", seq: 3, status: "absent" })];
  assert.deepEqual(confirmedWinnersAt(events, 3, 40), []);
});

// state.recompute always stamps a status and loadState back-fills legacy
// events to "confirmed", so a status-less event never reaches this selector
// in play. Pinned because logic.js's own filter does accept `undefined`.
test("confirmedWinnersAt: an event with no status is not a winner", () => {
  assert.deepEqual(confirmedWinnersAt([event({ status: undefined })], 3, 40), []);
});

test("confirmedWinnersAt: a missing event list is empty, not a crash", () => {
  assert.deepEqual(confirmedWinnersAt(undefined, 3, 40), []);
});

test("confirmedWinnersAt: the caller's event list keeps its own order", () => {
  const events = [event({ cid: "c", seq: 11 }), event({ cid: "b", seq: 3 })];
  confirmedWinnersAt(events, 3, 40);
  assert.deepEqual(events.map((e) => e.seq), [11, 3]);
});
