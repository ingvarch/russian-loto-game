// Tests for public/static/js/stats-logic.js.
//
// Run with:  bun test tests/js/

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  PERIODS,
  isPeriod,
  periodSince,
  DEFAULT_PERIOD,
  splitHotCold,
} from "../../public/static/js/stats-logic.js";

const NOW = Date.parse("2026-09-07T12:00:00Z");
const DAY = 24 * 60 * 60 * 1000;

test("PERIODS: the panel offers exactly the spans the operator asked for", () => {
  assert.deepEqual(PERIODS.map((p) => p.id), ["month", "3m", "6m", "year", "all"]);
  assert.ok(PERIODS.every((p) => typeof p.label === "string" && p.label.length > 0));
});

test("periodSince: each span counts back from now", () => {
  assert.equal(periodSince("month", NOW), NOW - 30 * DAY);
  assert.equal(periodSince("3m", NOW), NOW - 90 * DAY);
  assert.equal(periodSince("6m", NOW), NOW - 180 * DAY);
  assert.equal(periodSince("year", NOW), NOW - 365 * DAY);
});

test("periodSince: all time has no cutoff at all", () => {
  assert.equal(periodSince("all", NOW), null);
});

test("periodSince: an unknown span falls back to the default rather than to everything", () => {
  assert.equal(periodSince("fortnight", NOW), periodSince(DEFAULT_PERIOD, NOW));
  assert.equal(periodSince(undefined, NOW), periodSince(DEFAULT_PERIOD, NOW));
});

test("isPeriod: only the offered spans are accepted", () => {
  assert.equal(isPeriod("month"), true);
  assert.equal(isPeriod("all"), true);
  assert.equal(isPeriod("fortnight"), false);
  assert.equal(isPeriod(null), false);
});

test("splitHotCold: the most and least drawn numbers, longest run first", () => {
  const counts = [
    { number: 5, count: 9 },
    { number: 7, count: 1 },
    { number: 3, count: 4 },
    { number: 9, count: 12 },
  ];
  const { hot, cold } = splitHotCold(counts, 2);
  assert.deepEqual(hot.map((n) => n.number), [9, 5]);
  assert.deepEqual(cold.map((n) => n.number), [7, 3]);
});

test("splitHotCold: a number never appears in both halves", () => {
  const counts = [
    { number: 1, count: 3 },
    { number: 2, count: 2 },
  ];
  const { hot, cold } = splitHotCold(counts, 5);
  const shared = hot.filter((h) => cold.some((c) => c.number === h.number));
  assert.deepEqual(shared, []);
});

test("splitHotCold: nothing drawn yet is not an error", () => {
  assert.deepEqual(splitHotCold([], 3), { hot: [], cold: [] });
});
