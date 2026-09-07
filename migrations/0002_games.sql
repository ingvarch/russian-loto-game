-- One row per game, not per session.
--
-- A session outlives "Новая игра": the host keeps the URL and the board on
-- the wall, and plays again. The mirror used to key everything on the session,
-- so an evening of five games collapsed into one row carrying the last bank
-- and the last game's draws and wins. Every cross-game question -- average
-- bank over a period, how long games run, which cards win -- needs the games
-- themselves.
--
-- Game id is `<session id>:<started_at>`, or `<session id>:legacy` for games
-- that predate state.startedAt and cannot say when they began.

CREATE TABLE games (
  id          TEXT PRIMARY KEY,
  session_id  TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  started_at  INTEGER,
  updated_at  INTEGER NOT NULL,
  finished_at INTEGER,
  jackpot     INTEGER NOT NULL DEFAULT 0,
  called      INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX games_started_at ON games(started_at DESC);
CREATE INDEX games_session ON games(session_id);
CREATE INDEX games_finished_at ON games(finished_at DESC);

-- Existing sessions become one game each: that is all the old shape can say.
INSERT INTO games (id, session_id, started_at, updated_at, finished_at, jackpot, called)
SELECT
  s.id || ':' ||
    COALESCE(CAST(json_extract(s.state_json, '$.startedAt') AS TEXT), 'legacy'),
  s.id,
  json_extract(s.state_json, '$.startedAt'),
  s.updated_at,
  s.finished_at,
  COALESCE(json_extract(s.state_json, '$.jackpot'), 0),
  COALESCE(json_array_length(json_extract(s.state_json, '$.called')), 0)
FROM sessions s
WHERE s.state_json IS NOT NULL;

-- draws and wins move from the session to the game. SQLite cannot re-key a
-- table in place, so both are rebuilt and their rows carried across.

CREATE TABLE draws_v2 (
  game_id    TEXT NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  call_index INTEGER NOT NULL,
  number     INTEGER NOT NULL,
  PRIMARY KEY (game_id, call_index)
);

INSERT INTO draws_v2 (game_id, call_index, number)
SELECT g.id, d.call_index, d.number
FROM draws d
JOIN games g ON g.session_id = d.session_id;

DROP TABLE draws;
ALTER TABLE draws_v2 RENAME TO draws;
CREATE INDEX draws_number ON draws(number);

CREATE TABLE wins_v2 (
  game_id    TEXT NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  level      INTEGER NOT NULL,
  cid        TEXT NOT NULL,
  seq        INTEGER NOT NULL,
  call_count INTEGER NOT NULL,
  PRIMARY KEY (game_id, level)
);

INSERT INTO wins_v2 (game_id, level, cid, seq, call_count)
SELECT g.id, w.level, w.cid, w.seq, w.call_count
FROM wins w
JOIN games g ON g.session_id = w.session_id;

DROP TABLE wins;
ALTER TABLE wins_v2 RENAME TO wins;
CREATE INDEX wins_cid ON wins(cid);
CREATE INDEX wins_seq ON wins(seq);
