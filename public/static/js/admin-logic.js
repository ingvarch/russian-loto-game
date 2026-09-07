// Pure projection of an admin listing row into what a game card shows.
//
// The server sends the raw state blob and does no summarising, so the
// winner rule lives once in logic.js and is shared with the display page.
// Everything here is a pure function of (row, now) — no DOM, no fetch.

import { hasPendingEvents, winnersByLevel } from "./logic.js";

// A game whose host is mid-draw updates every few seconds. Two minutes of
// silence means they stepped away, not that the game ended.
export const LIVE_WINDOW_MS = 2 * 60 * 1000;

function stateOf(row) {
  const s = row.state;
  if (s === null || typeof s !== "object" || Array.isArray(s)) return {};
  return s;
}

export function summarizeSession(row, now) {
  const state = stateOf(row);
  const called = Array.isArray(state.called) ? state.called : [];
  const events = Array.isArray(state.events) ? state.events : [];
  const finished = row.finishedAt !== null && row.finishedAt !== undefined;
  const idleFor = now - row.updatedAt;

  return {
    id: row.id,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    idleFor,
    finished,
    live: !finished && idleFor <= LIVE_WINDOW_MS,
    calledCount: called.length,
    lastNumber: called.length > 0 ? called[called.length - 1] : null,
    winners: winnersByLevel(events),
    jackpot: typeof state.jackpot === "number" ? state.jackpot : 0,
    pending: hasPendingEvents({ events }),
  };
}
