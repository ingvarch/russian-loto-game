// Tests for public/static/js/ui-sheet.js — the card bottom sheet.
// Only the star rating is pure; opening the sheet is DOM work.
//
// Run with:  bun test tests/js/

import { test } from "node:test";
import assert from "node:assert/strict";

import { renderStars } from "../../public/static/js/ui-sheet.js";

test("renderStars: always three stars, filled up to the level reached", () => {
  assert.equal(renderStars(0), "☆☆☆");
  assert.equal(renderStars(1), "★☆☆");
  assert.equal(renderStars(2), "★★☆");
  assert.equal(renderStars(3), "★★★");
});
