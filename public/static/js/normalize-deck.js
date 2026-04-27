// Normalize an arbitrary parsed JSON value into the flat array of cards
// the validator expects.
//
// Accepts three forms a host might paste in:
//   1. raw array            [{seq, cid, numbers, rows}, ...]
//   2. wrapped              { cards: [{...}, ...] }
//   3. CLI registry         { "<cid>": {seq, numbers, rows, ...}, ... }
//      (the file at ~/.russian-loto/printed.json -- cid is the key,
//      so we lift it onto each entry).
//
// Returns the candidate array on success or null when the shape isn't
// recognised. The caller is expected to pass the result through
// validateCards() for the actual loto-invariant checks.

export function normalizeDeck(parsed) {
  if (Array.isArray(parsed)) return parsed;
  if (!parsed || typeof parsed !== "object") return null;
  if (Array.isArray(parsed.cards)) return parsed.cards;

  // Registry shape: an object whose values are card-like entries (seq +
  // numbers + rows). Strict so we don't false-positive on random
  // objects -- every entry must look like a card.
  const entries = Object.entries(parsed);
  if (entries.length === 0) return null;
  const looksLikeRegistry = entries.every(
    ([, v]) =>
      v
      && typeof v === "object"
      && typeof v.seq === "number"
      && Array.isArray(v.numbers)
      && Array.isArray(v.rows),
  );
  if (!looksLikeRegistry) return null;

  return entries.map(([cid, v]) => ({
    seq: v.seq,
    cid,
    numbers: v.numbers,
    rows: v.rows,
  }));
}
