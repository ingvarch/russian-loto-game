// Pure-JS validator for uploaded card decks. Same module is consumed
// by:
//   * landing.js -- to give the host friendly errors *before* the
//                   POST is made;
//   * the Worker -- via src/validate-cards.ts, a typed door onto this
//                   module, so the server runs the same checks on
//                   every upload for defence in depth.
//
// Loto card invariants enforced here:
//   - 15 numbers per card, each in 1..90
//   - rows is 3x9; each cell is null or a number in its column range:
//       col 0 -> 1..9
//       col 1 -> 10..19
//       col 2 -> 20..29
//       ...
//       col 7 -> 70..79
//       col 8 -> 80..90
//   - exactly 5 numbers per row (rest null)
//   - the multiset of numbers across rows equals the declared `numbers`

function isPositiveInt(v) {
  return typeof v === "number" && Number.isInteger(v) && v >= 1;
}

function colRange(c) {
  if (c === 0) return [1, 9];
  if (c === 8) return [80, 90];
  return [c * 10, c * 10 + 9];
}

function err(error) {
  return { ok: false, error };
}

// Each of the checks below returns an error message, or null when the
// rule holds.

function declaredNumbersError(numbers, where) {
  if (!Array.isArray(numbers) || numbers.length !== 15) {
    return `${where}: numbers должен быть массивом из 15 чисел`;
  }
  for (const n of numbers) {
    if (!Number.isInteger(n) || n < 1 || n > 90) {
      return `${where}: число ${n} вне диапазона 1..90`;
    }
  }
  return null;
}

// One row of 9 cells: each is null or a number inside its column's
// range, and exactly 5 are filled. Yields the filled values so the
// caller can compare them against the declared `numbers`.
function readRow(row, r, where) {
  if (!Array.isArray(row) || row.length !== 9) {
    return { error: `${where}: строка ${r + 1} должна содержать 9 ячеек` };
  }
  const values = [];
  for (let c = 0; c < 9; c++) {
    const v = row[c];
    if (v === null) continue;
    if (!Number.isInteger(v) || v < 1 || v > 90) {
      return { error: `${where}: ячейка [${r + 1}][${c + 1}] вне диапазона 1..90` };
    }
    const [lo, hi] = colRange(c);
    if (v < lo || v > hi) {
      return { error: `${where}: число ${v} в неверном столбце [${c + 1}]` };
    }
    values.push(v);
  }
  if (values.length !== 5) {
    return {
      error: `${where}: строка ${r + 1} должна иметь 5 чисел, найдено ${values.length}`,
    };
  }
  return { values };
}

// The multiset of cell values must equal the declared `numbers` list.
function multisetError(collected, numbers, where) {
  const found = collected.slice().sort((a, b) => a - b);
  const declared = numbers.slice().sort((a, b) => a - b);
  for (let k = 0; k < 15; k++) {
    if (found[k] !== declared[k]) {
      return `${where}: numbers не совпадает с числами в rows`;
    }
  }
  return null;
}

function cardError(card, where) {
  if (!card || typeof card !== "object") {
    return `${where}: ожидается объект`;
  }
  if (!isPositiveInt(card.seq)) {
    return `${where}: поле seq должно быть положительным целым`;
  }
  if (typeof card.cid !== "string" || card.cid.length === 0) {
    return `${where}: поле cid должно быть непустой строкой`;
  }
  const badNumbers = declaredNumbersError(card.numbers, where);
  if (badNumbers) return badNumbers;
  if (!Array.isArray(card.rows) || card.rows.length !== 3) {
    return `${where}: rows должен быть массивом из 3 строк`;
  }

  const collected = [];
  for (let r = 0; r < 3; r++) {
    const row = readRow(card.rows[r], r, where);
    if (row.error) return row.error;
    collected.push(...row.values);
  }
  return multisetError(collected, card.numbers, where);
}

export function validateCards(input) {
  if (!Array.isArray(input)) {
    return err("ожидается массив карточек");
  }
  if (input.length === 0) {
    return err("колода не должна быть пустой");
  }

  for (let i = 0; i < input.length; i++) {
    const error = cardError(input[i], `карта #${i + 1}`);
    if (error) return err(error);
  }

  return { ok: true, cards: input };
}
