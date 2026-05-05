-- Per-user DB schema
-- Each user gets their own isolated database — no user_id column needed

CREATE TABLE IF NOT EXISTS api_keys (
  id         TEXT PRIMARY KEY,
  key_name   TEXT NOT NULL UNIQUE,
  ciphertext TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- Singleton row (always INSERT with id = 1, use ON CONFLICT to update)
CREATE TABLE IF NOT EXISTS settings (
  id            INTEGER PRIMARY KEY,
  language      TEXT    NOT NULL DEFAULT 'ja-JP',
  robot_size    INTEGER NOT NULL DEFAULT 300,
  default_apps  TEXT    NOT NULL DEFAULT '{}',
  skill_toggles TEXT    NOT NULL DEFAULT '{}',
  updated_at    TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS google_tokens (
  id         TEXT PRIMARY KEY,
  email      TEXT NOT NULL UNIQUE,
  ciphertext TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- Singleton row
CREATE TABLE IF NOT EXISTS memory (
  id               INTEGER PRIMARY KEY,
  facts            TEXT NOT NULL DEFAULT '[]',
  preferences      TEXT NOT NULL DEFAULT '[]',
  ongoing_topics   TEXT NOT NULL DEFAULT '[]',
  procedures       TEXT NOT NULL DEFAULT '[]',
  session_summaries TEXT NOT NULL DEFAULT '[]',
  updated_at       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- Singleton row
CREATE TABLE IF NOT EXISTS profile (
  id         INTEGER PRIMARY KEY,
  items      TEXT NOT NULL DEFAULT '{}',
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS conv_sessions (
  id         TEXT PRIMARY KEY,
  started_at TEXT NOT NULL,
  ended_at   TEXT,
  summarized INTEGER NOT NULL DEFAULT 0,
  log_file   TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS transcripts (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL REFERENCES conv_sessions(id),
  role       TEXT NOT NULL,
  text       TEXT NOT NULL,
  ts         TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_transcripts_session ON transcripts(session_id);
