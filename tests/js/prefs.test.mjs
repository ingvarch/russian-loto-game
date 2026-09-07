// Tests for public/static/js/prefs.js — the per-device preferences blob.
//
// Run with:  bun test tests/js/

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  DEFAULT_PREFS,
  normalizePrefs,
  migrateDisplayTheme,
} from "../../public/static/js/prefs.js";

test("normalizePrefs: nothing stored yields the documented defaults", () => {
  assert.deepEqual(normalizePrefs(null), DEFAULT_PREFS);
  assert.deepEqual(normalizePrefs(undefined), DEFAULT_PREFS);
  assert.deepEqual(normalizePrefs({}), DEFAULT_PREFS);
});

test("normalizePrefs: the theme falls back to system unless it is a known value", () => {
  assert.equal(normalizePrefs({ theme: "dark" }).theme, "dark");
  assert.equal(normalizePrefs({ theme: "light" }).theme, "light");
  assert.equal(normalizePrefs({ theme: "system" }).theme, "system");
  assert.equal(normalizePrefs({ theme: "sepia" }).theme, "system");
  assert.equal(normalizePrefs({ theme: 42 }).theme, "system");
});

test("normalizePrefs: booleans only accept real booleans", () => {
  assert.equal(normalizePrefs({ keepAwake: true }).keepAwake, true);
  assert.equal(normalizePrefs({ keepAwake: "yes" }).keepAwake, DEFAULT_PREFS.keepAwake);
  assert.equal(normalizePrefs({ easterEggs: false }).easterEggs, false);
  assert.equal(normalizePrefs({ easterEggs: 0 }).easterEggs, DEFAULT_PREFS.easterEggs);
});

test("normalizePrefs: a corrupt blob does not take the app down", () => {
  assert.deepEqual(normalizePrefs("not an object"), DEFAULT_PREFS);
  assert.deepEqual(normalizePrefs([1, 2, 3]), DEFAULT_PREFS);
});

test("normalizePrefs: unknown keys are dropped rather than carried forward", () => {
  assert.deepEqual(normalizePrefs({ theme: "dark", nonsense: 1 }), {
    ...DEFAULT_PREFS,
    theme: "dark",
  });
});

test("migrateDisplayTheme: the old display-only key becomes an explicit theme", () => {
  assert.equal(migrateDisplayTheme(DEFAULT_PREFS, "light").theme, "light");
});

test("migrateDisplayTheme: anything else leaves the preferences alone", () => {
  assert.deepEqual(migrateDisplayTheme(DEFAULT_PREFS, null), DEFAULT_PREFS);
  assert.deepEqual(migrateDisplayTheme(DEFAULT_PREFS, "dark"), DEFAULT_PREFS);
});

test("migrateDisplayTheme: an explicit choice already made is never overwritten", () => {
  const chosen = { ...DEFAULT_PREFS, theme: "dark" };
  assert.deepEqual(migrateDisplayTheme(chosen, "light"), chosen);
});
