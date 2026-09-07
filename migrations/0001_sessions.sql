-- Session mirror and game statistics.
--
-- `sessions` is written on every state POST and drives the admin list.
-- `draws` and `wins` are materialised once a game reaches полное лото;
-- they exist so cross-game questions ("which numbers come up most often",
-- "which cards win") are plain SQL rather than a scan of every blob.
--
-- The mirror is advisory: the authoritative state lives in the GameRoom
-- Durable Object. A row may lag or be missing if a D1 write failed.

CREATE TABLE sessions (
  id          TEXT PRIMARY KEY,
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL,
  finished_at INTEGER,
  state_json  TEXT
);

CREATE INDEX sessions_updated_at ON sessions(updated_at DESC);

-- One row per keg drawn. `call_index` is the position in state.called,
-- which is chronological (applyCallNumber appends).
CREATE TABLE draws (
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  call_index INTEGER NOT NULL,
  number     INTEGER NOT NULL,
  PRIMARY KEY (session_id, call_index)
);

CREATE INDEX draws_number ON draws(number);

-- One row per decided level (1, 2, 3). `call_count` is how many kegs had
-- been drawn when the card crossed, so "how fast was this won" is a query.
CREATE TABLE wins (
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  level      INTEGER NOT NULL,
  cid        TEXT NOT NULL,
  seq        INTEGER NOT NULL,
  call_count INTEGER NOT NULL,
  PRIMARY KEY (session_id, level)
);

CREATE INDEX wins_cid ON wins(cid);
