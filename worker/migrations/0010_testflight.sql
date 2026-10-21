-- The App Store Connect app, its external beta group and public link, and the App Store profile.
ALTER TABLE apps ADD COLUMN asc_app_id TEXT;
ALTER TABLE apps ADD COLUMN beta_group_id TEXT;
ALTER TABLE apps ADD COLUMN testflight_url TEXT;
ALTER TABLE apps ADD COLUMN store_profile_id TEXT;
ALTER TABLE apps ADD COLUMN store_profile_uuid TEXT;
ALTER TABLE apps ADD COLUMN store_profile_name TEXT;
ALTER TABLE apps ADD COLUMN store_profile_base64 TEXT;

-- Who Apple's beta review contacts, once per developer.
ALTER TABLE developers ADD COLUMN review_first_name TEXT;
ALTER TABLE developers ADD COLUMN review_last_name TEXT;
ALTER TABLE developers ADD COLUMN review_email TEXT;
ALTER TABLE developers ADD COLUMN review_phone TEXT;

-- Each build a workflow uploads through ourapps, until it is in the beta group and sent for review.
CREATE TABLE testflight_builds (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  app_id TEXT NOT NULL REFERENCES apps(id) ON DELETE CASCADE,
  version TEXT NOT NULL,
  build_number TEXT NOT NULL,
  upload_id TEXT,
  upload_file_id TEXT,
  build_id TEXT,
  whats_new TEXT,
  state TEXT NOT NULL,
  message TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX testflight_builds_app ON testflight_builds(app_id, id);
