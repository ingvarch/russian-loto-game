// Pure statistics helpers, shared by the Worker and the panel.
//
// The Worker turns a period into a cutoff for its SQL; the page uses the
// same list to render the switch, so the two can never offer different
// spans. Everything here is a pure function of its arguments.

const DAY_MS = 24 * 60 * 60 * 1000;

export const PERIODS = [
  { id: "month", label: "Месяц", days: 30 },
  { id: "3m", label: "3 месяца", days: 90 },
  { id: "6m", label: "6 месяцев", days: 180 },
  { id: "year", label: "Год", days: 365 },
  { id: "all", label: "Всё время", days: null },
];

export const DEFAULT_PERIOD = "month";

export function isPeriod(id) {
  return PERIODS.some((p) => p.id === id);
}

// Returns the timestamp the period starts at, or null for "all time".
// An unrecognised period falls back to the default rather than to
// everything: a typo should not quietly widen the query.
export function periodSince(id, now) {
  const period =
    PERIODS.find((p) => p.id === id) ??
    PERIODS.find((p) => p.id === DEFAULT_PERIOD);
  return period.days === null ? null : now - period.days * DAY_MS;
}

// The n most and least drawn numbers. Both halves come from one sorted
// pass, and the split point keeps a number out of both when there are
// fewer numbers than the panel has room for.
export function splitHotCold(counts, n) {
  const sorted = [...counts].sort((a, b) => b.count - a.count);
  const take = Math.min(n, Math.floor(sorted.length / 2));
  return {
    hot: sorted.slice(0, take),
    cold: sorted.slice(sorted.length - take).reverse(),
  };
}
