-- What the public invitation page says, when ourapps last asked the repository for a build, and the
-- developer's export compliance answer (1: no non-exempt encryption), applied to every build.
ALTER TABLE apps ADD COLUMN testflight_link_state TEXT;
ALTER TABLE apps ADD COLUMN testflight_checked_at TEXT;
ALTER TABLE apps ADD COLUMN build_requested_at TEXT;
ALTER TABLE apps ADD COLUMN build_request_error TEXT;
ALTER TABLE apps ADD COLUMN encryption_exempt INTEGER;

-- Each build followed through Apple's beta review until friends can install it.
ALTER TABLE testflight_builds ADD COLUMN apple_state TEXT;
ALTER TABLE testflight_builds ADD COLUMN submitted_at TEXT;
ALTER TABLE testflight_builds ADD COLUMN notified_at TEXT;
ALTER TABLE testflight_builds ADD COLUMN expires_at TEXT;
