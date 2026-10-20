ALTER TABLE apps ADD COLUMN bundle_id TEXT NOT NULL DEFAULT '';

CREATE TABLE signing_certificates (
  developer_id TEXT PRIMARY KEY REFERENCES developers(id) ON DELETE CASCADE,
  certificate_id TEXT NOT NULL,
  name TEXT NOT NULL,
  serial_number TEXT NOT NULL,
  certificate_base64 TEXT NOT NULL,
  expiration_date TEXT,
  created_at TEXT NOT NULL
);
