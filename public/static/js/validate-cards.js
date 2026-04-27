// Pure-JS validator for uploaded card decks. Same module is consumed
// by:
//   * landing.js -- to give the host friendly errors *before* the
//                   POST is made;
//   * the Worker -- via a TS twin (src/validate-cards.ts) that mirrors
//                   the same checks for defence in depth.
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

export function validateCards(input) {
  if (!Array.isArray(input)) {
    return err("ожидается массив карточек");
  }
  if (input.length === 0) {
    return err("колода не должна быть пустой");
  }

  for (let i = 0; i < input.length; i++) {
    const card = input[i];
    const where = `карта #${i + 1}`;

    if (!card || typeof card !== "object") {
      return err(`${where}: ожидается объект`);
    }
    if (!isPositiveInt(card.seq)) {
      return err(`${where}: поле seq должно быть положительным целым`);
    }
    if (typeof card.cid !== "string" || card.cid.length === 0) {
      return err(`${where}: поле cid должно быть непустой строкой`);
    }
    if (!Array.isArray(card.numbers) || card.numbers.length !== 15) {
      return err(`${where}: numbers должен быть массивом из 15 чисел`);
    }
    for (const n of card.numbers) {
      if (!Number.isInteger(n) || n < 1 || n > 90) {
        return err(`${where}: число ${n} вне диапазона 1..90`);
      }
    }
    if (!Array.isArray(card.rows) || card.rows.length !== 3) {
      return err(`${where}: rows должен быть массивом из 3 строк`);
    }

    const collected = [];
    for (let r = 0; r < 3; r++) {
      const row = card.rows[r];
      if (!Array.isArray(row) || row.length !== 9) {
        return err(`${where}: строка ${r + 1} должна содержать 9 ячеек`);
      }
      let countInRow = 0;
      for (let c = 0; c < 9; c++) {
        const v = row[c];
        if (v === null) continue;
        if (!Number.isInteger(v) || v < 1 || v > 90) {
          return err(`${where}: ячейка [${r + 1}][${c + 1}] вне диапазона 1..90`);
        }
        const [lo, hi] = colRange(c);
        if (v < lo || v > hi) {
          return err(`${where}: число ${v} в неверном столбце [${c + 1}]`);
        }
        countInRow++;
        collected.push(v);
      }
      if (countInRow !== 5) {
        return err(
          `${where}: строка ${r + 1} должна иметь 5 чисел, найдено ${countInRow}`,
        );
      }
    }

    // The multiset of cell values must equal the declared `numbers` list.
    collected.sort((a, b) => a - b);
    const declared = card.numbers.slice().sort((a, b) => a - b);
    for (let k = 0; k < 15; k++) {
      if (collected[k] !== declared[k]) {
        return err(`${where}: numbers не совпадает с числами в rows`);
      }
    }
  }

  return { ok: true, cards: input };
}
