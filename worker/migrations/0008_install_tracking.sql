ALTER TABLE enrolments ADD COLUMN install_attempt_at TEXT;
ALTER TABLE enrolments ADD COLUMN install_started_at TEXT;
ALTER TABLE enrolments ADD COLUMN install_done_at TEXT;
ALTER TABLE enrolments ADD COLUMN installed_version TEXT;
