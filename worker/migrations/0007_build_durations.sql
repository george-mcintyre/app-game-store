CREATE TABLE build_durations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  app_id TEXT NOT NULL REFERENCES apps(id) ON DELETE CASCADE,
  seconds INTEGER NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX build_durations_app ON build_durations(app_id, id);
