// Tests for public/static/js/ui-new-game.js — validation of the new-game
// form. The DOM reading and writing around it is not covered here; this is
// the decision of whether the host may start the game, and with which cards.
//
// Run with:  bun test tests/js/

import { test } from "node:test";
import assert from "node:assert/strict";

import { validateForm } from "../../public/static/js/ui-new-game.js";

const CARDS = Array.from({ length: 30 }, (_, i) => ({ seq: i + 1, cid: "c" + (i + 1) }));

function form(over) {
  return {
    jackpot: 10000,
    percentages: [10, 25, 65],
    split: false,
    musicPause: null,
    easterEggs: true,
    cardRange: null,
    ...over,
  };
}

test("validateForm: a default form passes and keeps an empty range", () => {
  const result = validateForm(form(), CARDS);
  assert.equal(result.error, undefined);
  assert.equal(result.form.cardRange, null);
  assert.equal(result.form.jackpot, 10000);
});

test("validateForm: a negative bank is rejected", () => {
  assert.equal(validateForm(form({ jackpot: -1 }), CARDS).error, "Банк должен быть 0 или больше.");
});

test("validateForm: a zero bank is allowed", () => {
  assert.equal(validateForm(form({ jackpot: 0 }), CARDS).error, undefined);
});

test("validateForm: percentages must each be within 0..100", () => {
  const message = "Проценты должны быть от 0 до 100.";
  assert.equal(validateForm(form({ percentages: [-1, 50, 51] }), CARDS).error, message);
  assert.equal(validateForm(form({ percentages: [101, 0, -1] }), CARDS).error, message);
  assert.equal(validateForm(form({ percentages: [NaN, 25, 65] }), CARDS).error, message);
});

test("validateForm: percentages must add up to exactly 100, and the error says the sum", () => {
  assert.equal(
    validateForm(form({ percentages: [10, 25, 64] }), CARDS).error,
    "Сумма процентов должна быть ровно 100 (сейчас 99).",
  );
});

test("validateForm: the musical-pause keg must be a real keg", () => {
  const message = "Число музыкальной паузы — от 1 до 90.";
  assert.equal(validateForm(form({ musicPause: { number: 0, done: false } }), CARDS).error, message);
  assert.equal(validateForm(form({ musicPause: { number: 91, done: false } }), CARDS).error, message);
  assert.equal(validateForm(form({ musicPause: { number: NaN, done: false } }), CARDS).error, message);
  assert.equal(validateForm(form({ musicPause: { number: 42, done: false } }), CARDS).error, undefined);
});

test("validateForm: a range becomes a pair of numbers", () => {
  assert.deepEqual(validateForm(form({ cardRange: "1-25" }), CARDS).form.cardRange, [1, 25]);
  assert.deepEqual(validateForm(form({ cardRange: "1 - 5" }), CARDS).form.cardRange, [1, 5]);
});

test("validateForm: a single card number becomes a one-card range", () => {
  assert.deepEqual(validateForm(form({ cardRange: "7" }), CARDS).form.cardRange, [7, 7]);
});

test("validateForm: a backwards or zero-based range is rejected", () => {
  assert.equal(validateForm(form({ cardRange: "25-1" }), CARDS).error, "Неверный диапазон карт.");
  assert.equal(validateForm(form({ cardRange: "0-5" }), CARDS).error, "Неверный диапазон карт.");
  assert.equal(validateForm(form({ cardRange: "0" }), CARDS).error, "Номер карты должен быть >= 1.");
});

test("validateForm: an unparseable range is rejected", () => {
  const message = "Формат диапазона: 1-25 или одно число.";
  assert.equal(validateForm(form({ cardRange: "abc" }), CARDS).error, message);
  assert.equal(validateForm(form({ cardRange: "1-2-3" }), CARDS).error, message);
});

test("validateForm: a range holding none of the loaded cards is rejected", () => {
  assert.equal(
    validateForm(form({ cardRange: "100-200" }), CARDS).error,
    "Ни одной загруженной карты в этом диапазоне.",
  );
});

test("validateForm: a range partially overlapping the deck is accepted", () => {
  assert.deepEqual(validateForm(form({ cardRange: "25-100" }), CARDS).form.cardRange, [25, 100]);
});

test("validateForm: an accepted form carries every other field through unchanged", () => {
  const musicPause = { number: 42, done: false };
  const result = validateForm(
    form({ cardRange: "3-9", split: true, musicPause, easterEggs: false }),
    CARDS,
  );
  assert.equal(result.error, undefined);
  assert.deepEqual(result.form.cardRange, [3, 9]);
  assert.equal(result.form.jackpot, 10000);
  assert.deepEqual(result.form.percentages, [10, 25, 65]);
  assert.equal(result.form.split, true);
  assert.equal(result.form.musicPause, musicPause);
  assert.equal(result.form.easterEggs, false);
});
