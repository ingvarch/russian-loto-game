// Tests for public/static/js/ui-winners.js — the winner selection the two
// boards share. `decidedWinners` decides whether a level row is shown at all
// (host and /display must agree). The overlay's selector, `confirmedWinnersAt`,
// lives in logic.js; it is imported here only to pin that the two agree.
//
// Run with:  bun test tests/js/

import { test } from "node:test";
import assert from "node:assert/strict";

import { decidedWinners } from "../../public/static/js/ui-winners.js";
import { confirmedWinnersAt } from "../../public/static/js/logic.js";

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

// ---- the panel rule and the overlay rule ---------------------------------

// A state blob pushed by another admin (ui.js applyRemoteState) or fetched at
// boot (GET ./api/state) skips readState's legacy back-fill, so a status-less
// event reaches both rules unstamped. Whatever that shape means, the winners
// panel and the win overlay must mean the same thing by it.
test("a status-less event decides the level for the panel and the overlay alike", () => {
  const events = [event({ status: undefined })];
  assert.deepEqual(decidedWinners(state(events), CARDS, 3).map((c) => c.cid), ["a"]);
  assert.deepEqual(confirmedWinnersAt(events, 3, 40).map((e) => e.cid), ["a"]);
});
