ALTER TABLE api_keys ADD COLUMN scope TEXT NOT NULL DEFAULT 'manage';
ALTER TABLE api_keys ADD COLUMN expires_at TEXT;

CREATE TABLE audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  developer_id TEXT NOT NULL,
  event TEXT NOT NULL,
  detail TEXT NOT NULL DEFAULT '',
  country TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX audit_log_developer ON audit_log(developer_id, created_at);
