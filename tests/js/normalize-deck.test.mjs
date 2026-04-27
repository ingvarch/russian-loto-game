// Tests for the upload-shape normaliser.

import { test } from "node:test";
import assert from "node:assert/strict";

import { normalizeDeck } from "../../public/static/js/normalize-deck.js";

const goodCard = (seq, cid) => ({
  seq,
  cid,
  numbers: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15],
  rows: [
    [1, 11, null, null, null, null, null, null, null],
    [2, 12, null, null, null, null, null, null, null],
    [3, 13, null, null, null, null, null, null, null],
  ],
});

test("array passes through unchanged", () => {
  const arr = [goodCard(1, "a"), goodCard(2, "b")];
  assert.equal(normalizeDeck(arr), arr);
});

test("{ cards: [...] } returns the inner array", () => {
  const arr = [goodCard(1, "a")];
  assert.equal(normalizeDeck({ cards: arr }), arr);
});

test("registry { cid: entry } is converted to array with cid lifted", () => {
  const reg = {
    aaa00001: { seq: 1, numbers: goodCard(1, "x").numbers, rows: goodCard(1, "x").rows, formats: ["pdf"] },
    bbb00002: { seq: 2, numbers: goodCard(2, "x").numbers, rows: goodCard(2, "x").rows, printed_at: "2026-04-09" },
  };
  const result = normalizeDeck(reg);
  assert.ok(Array.isArray(result));
  assert.equal(result.length, 2);
  const byCid = Object.fromEntries(result.map((c) => [c.cid, c]));
  assert.equal(byCid["aaa00001"].seq, 1);
  assert.equal(byCid["bbb00002"].seq, 2);
  // registry-only fields are NOT carried forward
  assert.equal(byCid["aaa00001"].formats, undefined);
  assert.equal(byCid["bbb00002"].printed_at, undefined);
});

test("returns null for non-array, non-object inputs", () => {
  assert.equal(normalizeDeck("nope"), null);
  assert.equal(normalizeDeck(42), null);
  assert.equal(normalizeDeck(null), null);
});

test("returns null for empty object (not a registry)", () => {
  assert.equal(normalizeDeck({}), null);
});

test("returns null when one entry is missing seq -- not a clean registry", () => {
  const reg = {
    aaa: { seq: 1, numbers: [], rows: [] },
    bbb: { numbers: [], rows: [] }, // missing seq
  };
  assert.equal(normalizeDeck(reg), null);
});

test("returns null for an object with arbitrary properties", () => {
  // Accidentally pasted some other JSON; should fail closed rather than
  // silently fabricate an empty card list.
  assert.equal(normalizeDeck({ name: "loto", date: "2026-04-27" }), null);
});
