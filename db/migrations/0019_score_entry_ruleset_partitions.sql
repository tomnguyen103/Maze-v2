-- Partition ordinary shared scores by exact Atlas Region and ruleset.
-- Apply with DATABASE_ADMIN_URL after migration 0018. Do not apply from app startup.

ALTER TABLE score_entries
  ADD COLUMN atlas_region_id VARCHAR(16),
  ADD COLUMN ruleset_revision VARCHAR(32);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM score_entries
    WHERE labyrinth_number NOT BETWEEN 1 AND 20
  ) THEN
    RAISE EXCEPTION
      'Invalid legacy score_entries.labyrinth_number outside 1-20';
  END IF;
END
$$;

UPDATE score_entries
SET
  atlas_region_id = CASE
    WHEN labyrinth_number BETWEEN 1 AND 4 THEN 'foundation'
    WHEN labyrinth_number BETWEEN 5 AND 8 THEN 'developing'
    WHEN labyrinth_number BETWEEN 9 AND 12 THEN 'capable'
    WHEN labyrinth_number BETWEEN 13 AND 16 THEN 'advanced'
    WHEN labyrinth_number BETWEEN 17 AND 20 THEN 'mastery'
  END,
  ruleset_revision = 'classic-v1'
WHERE atlas_region_id IS NULL
   OR ruleset_revision IS NULL;

ALTER TABLE score_entries
  ALTER COLUMN atlas_region_id SET NOT NULL,
  ALTER COLUMN ruleset_revision SET NOT NULL,
  ADD CONSTRAINT score_entries_region_labyrinth_check CHECK (
    (atlas_region_id = 'foundation' AND labyrinth_number BETWEEN 1 AND 4)
    OR (atlas_region_id = 'developing' AND labyrinth_number BETWEEN 5 AND 8)
    OR (atlas_region_id = 'capable' AND labyrinth_number BETWEEN 9 AND 12)
    OR (atlas_region_id = 'advanced' AND labyrinth_number BETWEEN 13 AND 16)
    OR (atlas_region_id = 'mastery' AND labyrinth_number BETWEEN 17 AND 20)
  ),
  ADD CONSTRAINT score_entries_ruleset_partition_check CHECK (
    (atlas_region_id = 'foundation' AND ruleset_revision IN (
      'classic-v1',
      'echo-hush-v1'
    ))
    OR (atlas_region_id = 'developing' AND ruleset_revision IN (
      'classic-v1',
      'windways-v1'
    ))
    OR (atlas_region_id = 'capable' AND ruleset_revision IN (
      'classic-v1',
      'echo-bridges-v1'
    ))
    OR (atlas_region_id = 'advanced' AND ruleset_revision IN (
      'classic-v1',
      'tide-doors-v1'
    ))
    OR (atlas_region_id = 'mastery' AND ruleset_revision IN (
      'classic-v1',
      'warden-bells-v1'
    ))
  );

CREATE INDEX score_entries_partition_ranking_idx
  ON score_entries (
    atlas_region_id,
    ruleset_revision,
    score DESC,
    labyrinth_number DESC,
    moves ASC,
    elapsed_ms ASC,
    created_at ASC
  )
  WHERE escaped = TRUE AND classroom_id IS NULL;
