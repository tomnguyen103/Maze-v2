-- Milestone 4: six-field Explorer Access Settings (ADR 0031).
-- Apply with DATABASE_ADMIN_URL after migration 0021. Do not apply from app startup.
--
-- Existing four-field records migrate deterministically: Trail Compass Off
-- and Standard narration pace. Reset restores all six defaults.

-- Online-safe, alongside 0019 and 0020 (A+ audit DB-03).
-- `explorer_access_settings` is created in applied migration 0011, so it has
-- rows: a CHECK added without NOT VALID scans every one of them under ACCESS
-- EXCLUSIVE. Not one transaction, for the same reason — see
-- docs/migration-safety.md — so every statement is written to survive a
-- re-run.

SET lock_timeout = '3s';

-- Migration 0011 pins CHECK (schema_version = 1) inline, so it has to go
-- before the backfill writes version 2.
ALTER TABLE explorer_access_settings
  ADD COLUMN IF NOT EXISTS trail_compass_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS narration_pace TEXT NOT NULL DEFAULT 'standard',
  DROP CONSTRAINT IF EXISTS explorer_access_settings_schema_version_check;

DO $$
DECLARE
  touched INTEGER;
BEGIN
  LOOP
    UPDATE explorer_access_settings
    SET schema_version = 2
    WHERE clerk_user_id IN (
      SELECT clerk_user_id
      FROM explorer_access_settings
      WHERE schema_version = 1
      LIMIT 10000
    );
    GET DIAGNOSTICS touched = ROW_COUNT;
    EXIT WHEN touched = 0;
    COMMIT;
  END LOOP;
END
$$;

ALTER TABLE explorer_access_settings
  ALTER COLUMN schema_version SET DEFAULT 2,
  DROP CONSTRAINT IF EXISTS explorer_access_settings_schema_version_check,
  ADD CONSTRAINT explorer_access_settings_schema_version_check
    CHECK (schema_version IN (1, 2)) NOT VALID,
  DROP CONSTRAINT IF EXISTS explorer_access_settings_narration_pace_check,
  ADD CONSTRAINT explorer_access_settings_narration_pace_check
    CHECK (narration_pace IN ('standard', 'slower', 'faster')) NOT VALID;

ALTER TABLE explorer_access_settings
  VALIDATE CONSTRAINT explorer_access_settings_schema_version_check;
ALTER TABLE explorer_access_settings
  VALIDATE CONSTRAINT explorer_access_settings_narration_pace_check;

RESET lock_timeout;
