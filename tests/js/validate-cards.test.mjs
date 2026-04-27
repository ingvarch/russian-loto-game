// Validation for uploaded card decks. Lives in public/static/js so the
// landing page can use the same checks the Worker does -- defence in
// depth, with friendly errors for the host instead of an opaque 400.

import { test } from "node:test";
import assert from "node:assert/strict";

import { validateCards } from "../../public/static/js/validate-cards.js";

// Build a syntactically valid loto card. All column ranges respected
// (col 0 -> 1..9, col c in 1..7 -> c*10..c*10+9, col 8 -> 80..90),
// exactly 5 numbers per row, `numbers` matches the multiset from rows.
function realCard() {
  const rows = [
    [1,    11,   24,   30,   null, null, null, null, 80],
    [2,    null, 25,   null, 40,   50,   null, 70,   null],
    [null, 12,   null, 31,   null, 51,   null, 71,   81],
  ];
  const flat = rows.flat().filter((v) => v !== null);
  return {
    seq: 1,
    cid: "abcdef01",
    numbers: flat.slice().sort((a, b) => a - b),
    rows,
  };
}

test("rejects non-array input", () => {
  const r = validateCards("not an array");
  assert.equal(r.ok, false);
  assert.match(r.error, /массив/);
});

test("rejects empty array", () => {
  const r = validateCards([]);
  assert.equal(r.ok, false);
});

test("rejects card missing seq", () => {
  const c = realCard();
  delete c.seq;
  const r = validateCards([c]);
  assert.equal(r.ok, false);
  assert.match(r.error, /seq/);
});

test("rejects card with non-integer seq", () => {
  const c = realCard();
  c.seq = 1.5;
  const r = validateCards([c]);
  assert.equal(r.ok, false);
});

test("rejects card with empty cid", () => {
  const c = realCard();
  c.cid = "";
  const r = validateCards([c]);
  assert.equal(r.ok, false);
  assert.match(r.error, /cid/);
});

test("rejects card whose numbers length is not 15", () => {
  const c = realCard();
  c.numbers = c.numbers.slice(0, 14);
  const r = validateCards([c]);
  assert.equal(r.ok, false);
  assert.match(r.error, /15/);
});

test("rejects card with a number out of 1..90", () => {
  const c = realCard();
  c.numbers[0] = 91;
  const r = validateCards([c]);
  assert.equal(r.ok, false);
});

test("rejects card with rows not 3x9", () => {
  const c = realCard();
  c.rows = [c.rows[0], c.rows[1]];
  const r = validateCards([c]);
  assert.equal(r.ok, false);
});

test("rejects card with row that has not exactly 5 numbers", () => {
  const c = realCard();
  // Replace row 0 with only 4 numbers + 5 nulls
  c.rows[0] = [1, 11, 24, 34, null, null, null, null, null];
  const r = validateCards([c]);
  assert.equal(r.ok, false);
  assert.match(r.error, /5/);
});

test("rejects card with a number in the wrong column", () => {
  const c = realCard();
  // Put 50 (col 5) into col 0 slot of row 0; row 0 keeps 5 entries
  c.rows[0] = [50, 11, 24, 34, null, null, null, null, 80];
  const r = validateCards([c]);
  assert.equal(r.ok, false);
  assert.match(r.error, /столб/);
});

test("rejects card whose `numbers` doesn't match what's in `rows`", () => {
  const c = realCard();
  c.numbers[0] = 89;  // single value diverges from the row contents
  const r = validateCards([c]);
  assert.equal(r.ok, false);
});

test("accepts a valid card and returns the same array", () => {
  const c = realCard();
  const r = validateCards([c]);
  assert.equal(r.ok, true);
  assert.equal(r.cards.length, 1);
  assert.equal(r.cards[0].cid, c.cid);
});

test("returns the index of the offending card in the error", () => {
  // Two cards: first valid, second with bad seq
  const ok = realCard();
  const bad = realCard();
  bad.seq = -1;
  const r = validateCards([ok, bad]);
  assert.equal(r.ok, false);
  assert.match(r.error, /#2/);
});
