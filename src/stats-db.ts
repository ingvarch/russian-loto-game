// Cross-game statistics, read straight out of D1.
//
// Only games that reached полное лото count. An abandoned game has no draws
// and no winners, and its duration is unknowable, so letting it into the
// averages would quietly bend every number the panel shows.
//
// Every query is scoped by the same cutoff, computed once from the period so
// the four answers always describe the same span.

import { periodSince } from "../public/static/js/stats-logic.js";

export interface StatsTotals {
  games: number;
  jackpotSum: number;
  jackpotAvg: number;
  durationAvgMs: number | null;
  durationMinMs: number | null;
  durationMaxMs: number | null;
  calledAvg: number | null;
}

export interface NumberCount {
  number: number;
  count: number;
}

export interface WinnerCount {
  seq: number;
  wins: number;
  byLevel: Record<string, number>;
}

export interface Stats {
  period: string;
  since: number | null;
  totals: StatsTotals;
  numbers: NumberCount[];
  winners: WinnerCount[];
}

const WINNERS_LIMIT = 20;

// `finished_at IS NOT NULL` is the "played to the end" filter; the cutoff is
// applied to the same column so a game belongs to the period it ended in.
function scope(since: number | null): { clause: string; params: number[] } {
  return since === null
    ? { clause: "g.finished_at IS NOT NULL", params: [] }
    : { clause: "g.finished_at IS NOT NULL AND g.finished_at >= ?", params: [since] };
}

export async function readStats(
  db: D1Database,
  period: string,
  now: number,
): Promise<Stats> {
  const since = periodSince(period, now);
  const { clause, params } = scope(since);

  const totalsRow = await db
    .prepare(
      `SELECT
         COUNT(*)                                            AS games,
         COALESCE(SUM(g.jackpot), 0)                         AS jackpot_sum,
         AVG(g.jackpot)                                      AS jackpot_avg,
         AVG(CASE WHEN g.started_at IS NOT NULL
                  THEN g.finished_at - g.started_at END)     AS duration_avg,
         MIN(CASE WHEN g.started_at IS NOT NULL
                  THEN g.finished_at - g.started_at END)     AS duration_min,
         MAX(CASE WHEN g.started_at IS NOT NULL
                  THEN g.finished_at - g.started_at END)     AS duration_max,
         AVG(g.called)                                       AS called_avg
       FROM games g
       WHERE ${clause}`,
    )
    .bind(...params)
    .first<{
      games: number;
      jackpot_sum: number;
      jackpot_avg: number | null;
      duration_avg: number | null;
      duration_min: number | null;
      duration_max: number | null;
      called_avg: number | null;
    }>();

  const numbers = await db
    .prepare(
      `SELECT d.number AS number, COUNT(*) AS count
         FROM draws d JOIN games g ON g.id = d.game_id
        WHERE ${clause}
        GROUP BY d.number
        ORDER BY count DESC, number ASC`,
    )
    .bind(...params)
    .all<NumberCount>();

  const winners = await db
    .prepare(
      // Grouped by the printed number alone: that is what a host reads out
      // and what the operator recognises. A cid is an identity inside one
      // deck, and the same number reprinted later would otherwise split the
      // card into two rows that look like a bug.
      `SELECT w.seq AS seq,
              COUNT(*) AS wins,
              SUM(CASE WHEN w.level = 1 THEN 1 ELSE 0 END) AS level1,
              SUM(CASE WHEN w.level = 2 THEN 1 ELSE 0 END) AS level2,
              SUM(CASE WHEN w.level = 3 THEN 1 ELSE 0 END) AS level3
         FROM wins w JOIN games g ON g.id = w.game_id
        WHERE ${clause}
        GROUP BY w.seq
        ORDER BY wins DESC, seq ASC
        LIMIT ${WINNERS_LIMIT}`,
    )
    .bind(...params)
    .all<{
      seq: number;
      wins: number;
      level1: number;
      level2: number;
      level3: number;
    }>();

  const games = totalsRow?.games ?? 0;

  return {
    period,
    since,
    totals: {
      games,
      jackpotSum: totalsRow?.jackpot_sum ?? 0,
      // An average over nothing is nothing, not NaN.
      jackpotAvg: games === 0 ? 0 : Math.round(totalsRow?.jackpot_avg ?? 0),
      durationAvgMs: round(totalsRow?.duration_avg),
      durationMinMs: round(totalsRow?.duration_min),
      durationMaxMs: round(totalsRow?.duration_max),
      calledAvg: totalsRow?.called_avg == null
        ? null
        : Math.round(totalsRow.called_avg * 10) / 10,
    },
    numbers: numbers.results,
    winners: winners.results.map((r) => ({
      seq: r.seq,
      wins: r.wins,
      byLevel: { "1": r.level1, "2": r.level2, "3": r.level3 },
    })),
  };
}

function round(value: number | null | undefined): number | null {
  return value == null ? null : Math.round(value);
}
