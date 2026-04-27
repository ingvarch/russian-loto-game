// Server-side validator for uploaded card decks. Mirror of the canonical
// JS validator at public/static/js/validate-cards.js -- the two are
// kept in lockstep on purpose so the host gets the same friendly error
// from the landing page that the Worker would have produced.
//
// Loto card invariants enforced here:
//   - 15 numbers per card, each in 1..90
//   - rows is 3x9; each cell is null or a number in its column range
//       col 0 -> 1..9
//       col c in 1..7 -> c*10..c*10+9
//       col 8 -> 80..90
//   - exactly 5 numbers per row (rest null)
//   - the multiset of numbers across rows equals the declared `numbers`

import type { Card } from "./default-cards.js";

export type ValidateResult =
  | { ok: true; cards: Card[] }
  | { ok: false; error: string };

function isPositiveInt(v: unknown): v is number {
  return typeof v === "number" && Number.isInteger(v) && v >= 1;
}

function colRange(c: number): [number, number] {
  if (c === 0) return [1, 9];
  if (c === 8) return [80, 90];
  return [c * 10, c * 10 + 9];
}

function err(error: string): ValidateResult {
  return { ok: false, error };
}

export function validateCards(input: unknown): ValidateResult {
  if (!Array.isArray(input)) {
    return err("ожидается массив карточек");
  }
  if (input.length === 0) {
    return err("колода не должна быть пустой");
  }

  for (let i = 0; i < input.length; i++) {
    const card = input[i] as Record<string, unknown> | null | undefined;
    const where = `карта #${i + 1}`;

    if (!card || typeof card !== "object") {
      return err(`${where}: ожидается объект`);
    }
    if (!isPositiveInt(card["seq"])) {
      return err(`${where}: поле seq должно быть положительным целым`);
    }
    const cid = card["cid"];
    if (typeof cid !== "string" || cid.length === 0) {
      return err(`${where}: поле cid должно быть непустой строкой`);
    }
    const numbers = card["numbers"];
    if (!Array.isArray(numbers) || numbers.length !== 15) {
      return err(`${where}: numbers должен быть массивом из 15 чисел`);
    }
    for (const n of numbers) {
      if (!Number.isInteger(n) || (n as number) < 1 || (n as number) > 90) {
        return err(`${where}: число ${n} вне диапазона 1..90`);
      }
    }
    const rows = card["rows"];
    if (!Array.isArray(rows) || rows.length !== 3) {
      return err(`${where}: rows должен быть массивом из 3 строк`);
    }

    const collected: number[] = [];
    for (let r = 0; r < 3; r++) {
      const row = rows[r];
      if (!Array.isArray(row) || row.length !== 9) {
        return err(`${where}: строка ${r + 1} должна содержать 9 ячеек`);
      }
      let countInRow = 0;
      for (let c = 0; c < 9; c++) {
        const v = row[c];
        if (v === null) continue;
        if (!Number.isInteger(v) || (v as number) < 1 || (v as number) > 90) {
          return err(`${where}: ячейка [${r + 1}][${c + 1}] вне диапазона 1..90`);
        }
        const [lo, hi] = colRange(c);
        if ((v as number) < lo || (v as number) > hi) {
          return err(`${where}: число ${v} в неверном столбце [${c + 1}]`);
        }
        countInRow++;
        collected.push(v as number);
      }
      if (countInRow !== 5) {
        return err(
          `${where}: строка ${r + 1} должна иметь 5 чисел, найдено ${countInRow}`,
        );
      }
    }

    collected.sort((a, b) => a - b);
    const declared = (numbers as number[]).slice().sort((a, b) => a - b);
    for (let k = 0; k < 15; k++) {
      if (collected[k] !== declared[k]) {
        return err(`${where}: numbers не совпадает с числами в rows`);
      }
    }
  }

  return { ok: true, cards: input as Card[] };
}
