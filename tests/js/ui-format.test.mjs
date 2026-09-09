// Tests for public/static/js/ui-format.js — the level vocabulary and the
// money formatting shared by the host UI surfaces.
//
// Run with:  bun test tests/js/

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  LEVEL_LABELS,
  LEVEL_LABELS_ACCUSATIVE,
  formatAmount,
} from "../../public/static/js/ui-format.js";

test("LEVEL_LABELS names all three levels", () => {
  assert.equal(LEVEL_LABELS[1], "одна линия");
  assert.equal(LEVEL_LABELS[2], "две линии");
  assert.equal(LEVEL_LABELS[3], "ПОЛНОЕ ЛОТО");
});

test("LEVEL_LABELS_ACCUSATIVE names all three levels", () => {
  assert.equal(LEVEL_LABELS_ACCUSATIVE[1], "одну линию");
  assert.equal(LEVEL_LABELS_ACCUSATIVE[2], "две линии");
  assert.equal(LEVEL_LABELS_ACCUSATIVE[3], "ПОЛНОЕ ЛОТО");
});

test("formatAmount: a missing amount reads as zero, never as blank or NaN", () => {
  assert.equal(formatAmount(0), "0");
  assert.equal(formatAmount(null), "0");
  assert.equal(formatAmount(undefined), "0");
  assert.equal(formatAmount(NaN), "0");
});

test("formatAmount: groups thousands without losing a digit", () => {
  assert.equal(formatAmount(500), "500");
  assert.equal(formatAmount(1234567).replace(/\D/g, ""), "1234567");
  assert.ok(/\D/.test(formatAmount(1234567)), "thousands are separated");
});
