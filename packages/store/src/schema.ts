/** SQLite schema for a workspace's context store. Idempotent; safe to run on every open. */
export const SCHEMA = `
-- Wait for another process (watcher, CLI) to finish writing instead of failing with SQLITE_BUSY.
PRAGMA busy_timeout = 5000;
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS meta (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
INSERT OR IGNORE INTO meta (key, value) VALUES ('schema_version', '1');

-- Source of truth: append-only facts.
CREATE TABLE IF NOT EXISTS events (
  seq         INTEGER PRIMARY KEY AUTOINCREMENT,
  type        TEXT NOT NULL,
  payload     TEXT NOT NULL,
  evidence    TEXT NOT NULL,
  source      TEXT NOT NULL,
  occurred_at TEXT NOT NULL,
  revision    TEXT
);

-- Layer 1: content-addressed, immutable objects.
CREATE TABLE IF NOT EXISTS objects (
  hash       TEXT PRIMARY KEY,
  kind       TEXT NOT NULL,
  body       TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- Layer 2: identity map (projection).
CREATE TABLE IF NOT EXISTS nodes (
  key        TEXT PRIMARY KEY,
  kind       TEXT NOT NULL,
  hash       TEXT,
  props      TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS nodes_by_kind ON nodes (kind);

CREATE TABLE IF NOT EXISTS node_history (
  key  TEXT NOT NULL REFERENCES nodes (key) ON DELETE CASCADE,
  seq  INTEGER NOT NULL,
  hash TEXT NOT NULL,
  PRIMARY KEY (key, seq)
);

-- Layer 3: typed edges between identities (projection).
CREATE TABLE IF NOT EXISTS edges (
  from_key TEXT NOT NULL REFERENCES nodes (key) ON DELETE CASCADE,
  type     TEXT NOT NULL,
  to_key   TEXT NOT NULL REFERENCES nodes (key) ON DELETE CASCADE,
  PRIMARY KEY (from_key, type, to_key)
);
CREATE INDEX IF NOT EXISTS edges_by_target ON edges (to_key, type);
`
