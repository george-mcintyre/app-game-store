CREATE TABLE developers (
  id TEXT PRIMARY KEY,
  github_id INTEGER NOT NULL UNIQUE,
  github_login TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE developer_secrets (
  developer_id TEXT PRIMARY KEY REFERENCES developers(id) ON DELETE CASCADE,
  blob TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  developer_id TEXT NOT NULL REFERENCES developers(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL
);

CREATE TABLE apps (
  id TEXT PRIMARY KEY,
  developer_id TEXT NOT NULL REFERENCES developers(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  tagline TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  whats_new TEXT NOT NULL DEFAULT '',
  size TEXT NOT NULL DEFAULT '',
  min_os TEXT NOT NULL DEFAULT '',
  age_note TEXT NOT NULL DEFAULT '',
  privacy_summary TEXT NOT NULL DEFAULT '',
  icon_url TEXT NOT NULL DEFAULT '',
  screenshots TEXT NOT NULL DEFAULT '[]',
  repo TEXT NOT NULL,
  manifest_url TEXT NOT NULL DEFAULT '',
  profile_name TEXT NOT NULL DEFAULT '',
  show_on_page INTEGER NOT NULL DEFAULT 0,
  build_token_hash TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX apps_developer ON apps(developer_id);

CREATE TABLE links (
  id TEXT PRIMARY KEY,
  app_id TEXT NOT NULL REFERENCES apps(id) ON DELETE CASCADE,
  developer_id TEXT NOT NULL,
  label TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  expires_at TEXT,
  revoked_at TEXT
);
CREATE INDEX links_app ON links(app_id);

CREATE TABLE enrolments (
  id TEXT PRIMARY KEY,
  app_id TEXT NOT NULL REFERENCES apps(id) ON DELETE CASCADE,
  developer_id TEXT NOT NULL,
  link_id TEXT NOT NULL,
  name TEXT NOT NULL,
  state TEXT NOT NULL,
  udid TEXT,
  product TEXT,
  apple_device_id TEXT,
  profile_uuid TEXT,
  manifest_url TEXT,
  message TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX enrolments_app ON enrolments(app_id);
CREATE INDEX enrolments_developer ON enrolments(developer_id);

CREATE TABLE profiles (
  app_id TEXT NOT NULL REFERENCES apps(id) ON DELETE CASCADE,
  uuid TEXT NOT NULL,
  profile_id TEXT NOT NULL,
  profile_name TEXT NOT NULL,
  profile_base64 TEXT NOT NULL,
  udids TEXT NOT NULL,
  expiration_date TEXT,
  created_at TEXT NOT NULL,
  PRIMARY KEY (app_id, uuid)
);
