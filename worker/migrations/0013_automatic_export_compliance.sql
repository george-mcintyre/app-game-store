-- Every TestFlight build gets the export compliance answer "no non-exempt encryption" automatically.
UPDATE testflight_builds SET state = 'processing', message = NULL WHERE state = 'needs-compliance';
ALTER TABLE apps DROP COLUMN encryption_exempt;
