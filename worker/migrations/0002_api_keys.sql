CREATE TABLE api_keys (
  id TEXT PRIMARY KEY,
  developer_id TEXT NOT NULL REFERENCES developers(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  prefix TEXT NOT NULL,
  key_hash TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  last_used_at TEXT,
  revoked_at TEXT
);
CREATE INDEX api_keys_developer ON api_keys(developer_id);
