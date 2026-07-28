-- Question content in Postgres, with the bundled bank as the floor.
--
-- Content changes today need a code deploy because the reviewed bank ships in
-- the client bundle. These tables give the bank a storage home so an editor can
-- draft a Warden Question and publish it separately; `server/question-service.js` reads
-- published rows and falls back to the bundled bank whenever the database is
-- unreachable, so a database outage degrades to yesterday's content, never to
-- no content.
--
-- Nothing child-facing is authored here. A row holds a reviewed Warden
-- Question, and the same validation the bundled bank passes still applies: the
-- service normalizes every row through `normalizeQuestion`, and checks the band
-- the content claims against the band the row is filed under, before a player
-- sees it.

CREATE TABLE questions (
  id TEXT PRIMARY KEY,
  -- The Quest Level and difficulty band a Warden Question belongs to. The service looks up
  -- exactly this pair, so it is the shape the index serves.
  level_id TEXT NOT NULL
    CHECK (level_id IN ('bright-start', 'trail-scout', 'maze-master')),
  difficulty_band TEXT NOT NULL
    CHECK (difficulty_band IN (
      'foundation', 'developing', 'capable', 'advanced', 'mastery'
    )),
  -- Exact position within the band's deck. Missing database ordinals fall back
  -- to the bundled generator, so a partial editorial overlay cannot repeat one
  -- published card across the rest of the deck.
  question_ordinal SMALLINT NOT NULL CHECK (question_ordinal >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (level_id, difficulty_band, question_ordinal)
);

-- Draft and published are versions of a Warden Question, not states of one row: publishing
-- must never destroy the text a player is currently being served.
CREATE TABLE question_versions (
  id BIGSERIAL PRIMARY KEY,
  question_id TEXT NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  version SMALLINT NOT NULL CHECK (version >= 1),
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'published')),
  -- The whole Warden Question, in the shape `normalizeQuestion` validates:
  -- prompt, three choices, answer, hint, explanation, band, rank, topic,
  -- objective.
  content JSONB NOT NULL,
  edited_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  published_at TIMESTAMPTZ,
  UNIQUE (question_id, version),
  -- A published version must record when, and an unpublished one must not
  -- claim to.
  CHECK ((status = 'published') = (published_at IS NOT NULL))
);

-- At most one published version per Warden Question. Without this a bad publish
-- could put two live texts behind one id and what a player saw would depend on
-- row order.
CREATE UNIQUE INDEX question_versions_published_idx
  ON question_versions (question_id)
  WHERE status = 'published';

-- The player read path — every published Warden Question for a level and band,
-- in deck order — is served by the UNIQUE constraint's index above; it leads on
-- exactly that column triple, so no second index is defined here.
