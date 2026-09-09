// Tests for public/static/js/ui-grid.js — which keg sits in which cell of the
// 9x11 board. Every number must keep its semantically correct column.
//
// Run with:  bun test tests/js/

import { test } from "node:test";
import assert from "node:assert/strict";

import { GRID_ROWS, GRID_COLS, numberAt } from "../../public/static/js/ui-grid.js";

test("the board is 9 columns by 11 rows", () => {
  assert.equal(GRID_COLS, 9);
  assert.equal(GRID_ROWS, 11);
});

test("numberAt: the first column holds 1..9 and two placeholders", () => {
  assert.equal(numberAt(0, 0), 1);
  assert.equal(numberAt(0, 8), 9);
  assert.equal(numberAt(0, 9), null);
  assert.equal(numberAt(0, 10), null);
});

test("numberAt: the last column holds all eleven of 80..90", () => {
  assert.equal(numberAt(8, 0), 80);
  assert.equal(numberAt(8, 10), 90);
});

test("numberAt: middle columns hold ten numbers and one placeholder", () => {
  assert.equal(numberAt(1, 0), 10);
  assert.equal(numberAt(1, 9), 19);
  assert.equal(numberAt(1, 10), null);
  assert.equal(numberAt(7, 0), 70);
  assert.equal(numberAt(7, 9), 79);
  assert.equal(numberAt(7, 10), null);
});

test("numberAt: the whole board covers 1..90 exactly once", () => {
  const seen = [];
  for (let r = 0; r < GRID_ROWS; r++) {
    for (let c = 0; c < GRID_COLS; c++) {
      const value = numberAt(c, r);
      if (value !== null) seen.push(value);
    }
  }
  seen.sort((a, b) => a - b);
  assert.deepEqual(seen, Array.from({ length: 90 }, (_, i) => i + 1));
});
