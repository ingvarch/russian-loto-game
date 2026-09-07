// D1 access layer for the session mirror and the per-game statistics.
//
// The mirror is advisory. Authoritative state lives in the GameRoom
// Durable Object; a row here may lag or be missing entirely if a write
// failed. Consumers judge liveness by `updated_at`, never by existence.
//
// Only the Worker writes this. GameRoom keeps game state opaque -- it is
// a relay between admin and display and has no D1 binding -- so all
// knowledge of the state shape lives at this layer.

import { winningEvents } from "../public/static/js/logic.js";

export interface SessionListItem {
  id: string;
  createdAt: number;
  updatedAt: number;
  finishedAt: number | null;
  state: unknown;
}

export interface DrawRow {
  callIndex: number;
  number: number;
}

export interface WinRow {
  level: number;
  cid: string;
  seq: number;
  callCount: number;
}

interface GameEvent {
  cid: string;
  seq: number;
  level: number;
  callCount?: number;
  status?: string;
}

function asRecord(state: unknown): Record<string, unknown> | null {
  if (state === null || typeof state !== "object" || Array.isArray(state)) {
    return null;
  }
  return state as Record<string, unknown>;
}

// ---- Pure derivation -----------------------------------------------------

// state.called is chronological: applyCallNumber appends, and the display
// reads called[last] as the freshly drawn keg. So the array index is the
// draw order.
export function drawRows(state: unknown): DrawRow[] {
  const obj = asRecord(state);
  const called = obj?.["called"];
  if (!Array.isArray(called)) return [];
  const out: DrawRow[] = [];
  called.forEach((n, i) => {
    if (typeof n === "number") out.push({ callIndex: i, number: n });
  });
  return out;
}

// One row per decided level. The "first confirmed crossing wins" rule is
// not restated here -- winningEvents owns it, shared with the display's
// winnersByLevel.
export function winRows(state: unknown): WinRow[] {
  const obj = asRecord(state);
  const events = obj?.["events"];
  const won = winningEvents(events) as Record<number, GameEvent | null>;
  const out: WinRow[] = [];
  for (const level of [1, 2, 3]) {
    const e = won[level];
    if (!e) continue;
    out.push({
      level,
      cid: String(e.cid),
      seq: Number(e.seq),
      callCount: Number(e.callCount ?? 0),
    });
  }
  return out;
}

// A game is over once полное лото is confirmed. Aggregates are written at
// this point rather than on every ball: `called` also shrinks (отжатие),
// so an incremental append would need a read-compare first, and a full
// rewrite per ball costs ~4000 row writes per game.
export function isGameFinished(state: unknown): boolean {
  const obj = asRecord(state);
  const won = winningEvents(obj?.["events"]) as Record<number, GameEvent | null>;
  return won[3] != null;
}

// ---- D1 ------------------------------------------------------------------

const MAX_LIST = 200;

// Games that predate state.startedAt cannot say when they began. They keep
// one row per session under a "legacy" id, which is exactly what the old
// session-keyed shape recorded, and drop out of duration statistics.
export function makeGameId(sessionId: string, startedAt: number | null): string {
  return `${sessionId}:${startedAt ?? "legacy"}`;
}

export function gameStartedAt(state: unknown): number | null {
  const value = asRecord(state)?.["startedAt"];
  return typeof value === "number" ? value : null;
}

function jackpotOf(state: unknown): number {
  const value = asRecord(state)?.["jackpot"];
  return typeof value === "number" ? value : 0;
}

function calledCount(state: unknown): number {
  const value = asRecord(state)?.["called"];
  return Array.isArray(value) ? value.length : 0;
}

export async function createSession(
  db: D1Database,
  id: string,
  now: number,
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO sessions (id, created_at, updated_at)
       VALUES (?, ?, ?)
       ON CONFLICT(id) DO NOTHING`,
    )
    .bind(id, now, now)
    .run();
}

// Mirrors a state snapshot, and materialises the aggregates when the
// snapshot shows a finished game. Callers do not decide when that is.
export async function recordState(
  db: D1Database,
  id: string,
  state: unknown,
  now: number,
): Promise<void> {
  const finished = isGameFinished(state);
  const finishedAt = finished ? now : null;

  // ON CONFLICT repairs a missing row: if the D1 write during session
  // creation failed, the first state POST still makes the game visible.
  await db
    .prepare(
      `INSERT INTO sessions (id, created_at, updated_at, finished_at, state_json)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         updated_at  = excluded.updated_at,
         finished_at = excluded.finished_at,
         state_json  = excluded.state_json`,
    )
    .bind(id, now, now, finishedAt, JSON.stringify(state))
    .run();

  // The session row is one per URL; this is one per game, so "Новая игра"
  // starts a new row instead of overwriting the evening's history.
  const startedAt = gameStartedAt(state);
  const gameId = makeGameId(id, startedAt);
  const called = calledCount(state);

  await db
    .prepare(
      `INSERT INTO games (id, session_id, started_at, updated_at, finished_at, jackpot, called)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         updated_at  = excluded.updated_at,
         finished_at = excluded.finished_at,
         jackpot     = excluded.jackpot,
         called      = excluded.called`,
    )
    .bind(gameId, id, startedAt, now, finishedAt, jackpotOf(state), called)
    .run();

  if (!finished) return;

  // Delete-then-insert keeps this idempotent and correct after an
  // отжатие shrinks the draw list. One batch, one round trip.
  const statements: D1PreparedStatement[] = [
    db.prepare("DELETE FROM draws WHERE game_id = ?").bind(gameId),
    db.prepare("DELETE FROM wins WHERE game_id = ?").bind(gameId),
  ];
  const insertDraw = db.prepare(
    "INSERT INTO draws (game_id, call_index, number) VALUES (?, ?, ?)",
  );
  for (const d of drawRows(state)) {
    statements.push(insertDraw.bind(gameId, d.callIndex, d.number));
  }
  const insertWin = db.prepare(
    `INSERT INTO wins (game_id, level, cid, seq, call_count)
     VALUES (?, ?, ?, ?, ?)`,
  );
  for (const w of winRows(state)) {
    statements.push(insertWin.bind(gameId, w.level, w.cid, w.seq, w.callCount));
  }
  await db.batch(statements);
}

export async function listSessions(
  db: D1Database,
  opts: { updatedAfter?: number; limit?: number },
): Promise<SessionListItem[]> {
  const where = opts.updatedAfter === undefined ? "" : "WHERE updated_at >= ?";
  const binds: number[] = [];
  if (opts.updatedAfter !== undefined) binds.push(opts.updatedAfter);
  binds.push(Math.min(opts.limit ?? 100, MAX_LIST));

  const result = await db
    .prepare(
      `SELECT id, created_at, updated_at, finished_at, state_json
       FROM sessions ${where}
       ORDER BY updated_at DESC
       LIMIT ?`,
    )
    .bind(...binds)
    .all<{
      id: string;
      created_at: number;
      updated_at: number;
      finished_at: number | null;
      state_json: string | null;
    }>();

  return result.results.map((r) => ({
    id: r.id,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    finishedAt: r.finished_at,
    state: parseState(r.state_json),
  }));
}

function parseState(raw: string | null): unknown {
  if (raw === null) return null;
  try {
    return JSON.parse(raw);
  } catch {
    // A corrupt blob must not take the whole listing down; the admin
    // sees the session with no summary rather than a 500.
    return null;
  }
}

export async function sessionExists(
  db: D1Database,
  id: string,
): Promise<boolean> {
  const row = await db
    .prepare("SELECT id FROM sessions WHERE id = ?")
    .bind(id)
    .first<{ id: string }>();
  return row !== null;
}

// Unlike the mirror writes this is not advisory: an operator who pressed
// delete has to learn if it failed, so nothing here is swallowed.
//
// The children go explicitly rather than through ON DELETE CASCADE, because
// foreign-key enforcement is a per-connection pragma and a silently skipped
// cascade would leave orphan statistics behind for a game that no longer
// exists.
export async function deleteSession(db: D1Database, id: string): Promise<void> {
  await db.batch([
    db
      .prepare(
        "DELETE FROM draws WHERE game_id IN (SELECT id FROM games WHERE session_id = ?)",
      )
      .bind(id),
    db
      .prepare(
        "DELETE FROM wins WHERE game_id IN (SELECT id FROM games WHERE session_id = ?)",
      )
      .bind(id),
    db.prepare("DELETE FROM games WHERE session_id = ?").bind(id),
    db.prepare("DELETE FROM sessions WHERE id = ?").bind(id),
  ]);
}
