-- iPhones install through TestFlight only: per-device registration and its profiles are gone.
DROP TABLE IF EXISTS enrolments;
DROP TABLE IF EXISTS profiles;
DROP TABLE IF EXISTS build_durations;
ALTER TABLE apps DROP COLUMN profile_name;
