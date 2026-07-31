-- Milestone 4: six-field Explorer Access Settings (ADR 0031).
-- Apply with DATABASE_ADMIN_URL after migration 0021. Do not apply from app startup.
--
-- Existing four-field records migrate deterministically: Trail Compass Off
-- and Standard narration pace. Reset restores all six defaults.

BEGIN;

-- Migration 0011 pins CHECK (schema_version = 1) inline, so it has to go
-- before the backfill writes version 2.
ALTER TABLE explorer_access_settings
  ADD COLUMN IF NOT EXISTS trail_compass_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS narration_pace TEXT NOT NULL DEFAULT 'standard',
  DROP CONSTRAINT IF EXISTS explorer_access_settings_schema_version_check;

UPDATE explorer_access_settings
SET schema_version = 2
WHERE schema_version = 1;

ALTER TABLE explorer_access_settings
  ALTER COLUMN schema_version SET DEFAULT 2,
  ADD CONSTRAINT explorer_access_settings_schema_version_check
    CHECK (schema_version IN (1, 2)),
  DROP CONSTRAINT IF EXISTS explorer_access_settings_narration_pace_check,
  ADD CONSTRAINT explorer_access_settings_narration_pace_check
    CHECK (narration_pace IN ('standard', 'slower', 'faster'));

COMMIT;
