-- Bootstrap DB schema (robot-secretary DB)
-- Stores only the user registry: google_id → per-user DB mapping

CREATE TABLE IF NOT EXISTS user_registry (
  id                  TEXT PRIMARY KEY,
  google_id           TEXT NOT NULL UNIQUE,
  email               TEXT NOT NULL UNIQUE,
  display_name        TEXT,
  avatar_url          TEXT,
  db_name             TEXT NOT NULL,
  db_url              TEXT NOT NULL,
  db_token_ciphertext TEXT NOT NULL,
  created_at          TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  last_seen_at        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
