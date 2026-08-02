-- Publish the Number Trail revision whose focused Questions now carry the
-- reviewed Echo Lens pack. Keep the prior revision valid for existing Quest
-- and Class Expedition pins; apply with DATABASE_ADMIN_URL after migration
-- 0026. Do not apply from app startup.

BEGIN;

ALTER TABLE cloud_quest_progress
  DROP CONSTRAINT IF EXISTS cloud_quest_progress_learning_deck_check,
  ADD CONSTRAINT cloud_quest_progress_learning_deck_check CHECK (
    (
      learning_deck_id = 'mixed-trail'
      AND learning_deck_revision =
        'deck:mixed-trail:v1:d0647e88de6cbe1dea606b07e468ab92'
    )
    OR (
      learning_deck_id = 'number-trail'
      AND learning_deck_revision =
        'deck:number-trail:v1:67aa6e0169885d41ba784245b45a7105'
    )
    OR (
      learning_deck_id = 'number-trail'
      AND learning_deck_revision =
        'deck:number-trail:v1:d583663a8c0590f497042439ce82d2f7'
    )
  );

ALTER TABLE class_expeditions
  DROP CONSTRAINT IF EXISTS class_expeditions_learning_deck_check,
  ADD CONSTRAINT class_expeditions_learning_deck_check CHECK (
    (
      learning_deck_id = 'mixed-trail'
      AND learning_deck_revision =
        'deck:mixed-trail:v1:d0647e88de6cbe1dea606b07e468ab92'
    )
    OR (
      learning_deck_id = 'number-trail'
      AND learning_deck_revision =
        'deck:number-trail:v1:67aa6e0169885d41ba784245b45a7105'
    )
    OR (
      learning_deck_id = 'number-trail'
      AND learning_deck_revision =
        'deck:number-trail:v1:d583663a8c0590f497042439ce82d2f7'
    )
  );

COMMIT;
