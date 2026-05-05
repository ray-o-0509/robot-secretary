-- Robot Secretary user database schema
-- Applied to: robot-secretary Turso DB

CREATE TABLE IF NOT EXISTS users (
  id            TEXT PRIMARY KEY,
  google_id     TEXT NOT NULL UNIQUE,
  email         TEXT NOT NULL UNIQUE,
  display_name  TEXT,
  avatar_url    TEXT,
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  last_seen_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS api_keys (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id),
  key_name    TEXT NOT NULL,
  ciphertext  TEXT NOT NULL,
  updated_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE(user_id, key_name)
);

CREATE TABLE IF NOT EXISTS settings (
  user_id       TEXT PRIMARY KEY REFERENCES users(id),
  language      TEXT NOT NULL DEFAULT 'ja-JP',
  robot_size    INTEGER NOT NULL DEFAULT 300,
  default_apps  TEXT NOT NULL DEFAULT '{}',
  skill_toggles TEXT NOT NULL DEFAULT '{}',
  updated_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS google_tokens (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id),
  email       TEXT NOT NULL,
  ciphertext  TEXT NOT NULL,
  updated_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE(user_id, email)
);

CREATE TABLE IF NOT EXISTS memory (
  user_id           TEXT PRIMARY KEY REFERENCES users(id),
  facts             TEXT NOT NULL DEFAULT '[]',
  preferences       TEXT NOT NULL DEFAULT '[]',
  ongoing_topics    TEXT NOT NULL DEFAULT '[]',
  procedures        TEXT NOT NULL DEFAULT '[]',
  session_summaries TEXT NOT NULL DEFAULT '[]',
  updated_at        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS profile (
  user_id    TEXT PRIMARY KEY REFERENCES users(id),
  items      TEXT NOT NULL DEFAULT '{}',
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS conv_sessions (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id),
  started_at  TEXT NOT NULL,
  ended_at    TEXT,
  summarized  INTEGER NOT NULL DEFAULT 0,
  log_file    TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS transcripts (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL REFERENCES conv_sessions(id),
  user_id    TEXT NOT NULL REFERENCES users(id),
  role       TEXT NOT NULL,
  text       TEXT NOT NULL,
  ts         TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_transcripts_session ON transcripts(session_id);
CREATE INDEX IF NOT EXISTS idx_transcripts_user    ON transcripts(user_id);
CREATE INDEX IF NOT EXISTS idx_conv_sessions_user  ON conv_sessions(user_id);
