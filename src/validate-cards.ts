// The Worker's typed door onto the deck validator. The rules live once,
// in public/static/js/validate-cards.js, which the landing page imports
// too -- so the host cannot get one message from the landing page and a
// different one from the Worker. Sharing the implementation does not
// move the trust boundary: this call still runs server-side on every
// upload, and the client copy stays convenience, never evidence.
//
// Loto card invariants enforced there:
//   - 15 numbers per card, each in 1..90
//   - rows is 3x9; each cell is null or a number in its column range
//       col 0 -> 1..9
//       col c in 1..7 -> c*10..c*10+9
//       col 8 -> 80..90
//   - exactly 5 numbers per row (rest null)
//   - the multiset of numbers across rows equals the declared `numbers`

import { validateCards as validateCardsJs } from "../public/static/js/validate-cards.js";

import type { Card } from "./default-cards.js";

export type ValidateResult =
  | { ok: true; cards: Card[] }
  | { ok: false; error: string };

export function validateCards(input: unknown): ValidateResult {
  return validateCardsJs(input) as ValidateResult;
}
