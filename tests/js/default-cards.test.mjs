// Default deck bundled with the Worker.
//
// The deck source is the Python CLI's printed.json registry (one entry
// per card, keyed by cid). default-cards.ts transforms it into the
// Worker's flat card shape: { seq, cid, numbers, rows }. These tests
// guard against a regression that would silently ship an empty deck or
// drop fields the client UI relies on.

import { test } from "node:test";
import assert from "node:assert/strict";

import { DEFAULT_CARDS } from "../../src/default-cards.js";

test("DEFAULT_CARDS is a non-empty array", () => {
  assert.ok(Array.isArray(DEFAULT_CARDS));
  assert.ok(DEFAULT_CARDS.length > 0, "expected at least one default card");
});

test("each card has the four fields the client UI needs", () => {
  for (const card of DEFAULT_CARDS) {
    assert.equal(typeof card.seq, "number", `seq on ${card.cid}`);
    assert.equal(typeof card.cid, "string", `cid on seq ${card.seq}`);
    assert.ok(Array.isArray(card.numbers), `numbers on ${card.cid}`);
    assert.equal(card.numbers.length, 15, `15 numbers on ${card.cid}`);
    assert.ok(Array.isArray(card.rows), `rows on ${card.cid}`);
    assert.equal(card.rows.length, 3, `3 rows on ${card.cid}`);
    for (const row of card.rows) {
      assert.equal(row.length, 9, `9 cells per row on ${card.cid}`);
    }
  }
});

test("cards are sorted by seq ascending", () => {
  for (let i = 1; i < DEFAULT_CARDS.length; i++) {
    assert.ok(
      DEFAULT_CARDS[i - 1].seq < DEFAULT_CARDS[i].seq,
      `seq must be strictly ascending; broke at index ${i}`,
    );
  }
});

test("registry-only fields are stripped (printed_at, formats, recovered)", () => {
  for (const card of DEFAULT_CARDS) {
    assert.equal(card.printed_at, undefined);
    assert.equal(card.formats, undefined);
    assert.equal(card.recovered, undefined);
  }
});

test("deck covers seq 1..150 with no gaps", () => {
  assert.equal(DEFAULT_CARDS.length, 150);
  DEFAULT_CARDS.forEach((card, i) => {
    assert.equal(card.seq, i + 1, `gap at index ${i}`);
  });
});

test("cids are unique", () => {
  const cids = new Set(DEFAULT_CARDS.map((c) => c.cid));
  assert.equal(cids.size, DEFAULT_CARDS.length);
});
