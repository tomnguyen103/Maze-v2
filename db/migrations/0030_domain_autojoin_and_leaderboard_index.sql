-- A+ audit run 1 remediation: TM-13, TM-01v, SG-13.
-- Apply with DATABASE_ADMIN_URL after migration 0029.
--
-- Forward-only on purpose. Migrations 0001 through 0017 are applied to the
-- live database and are never edited; 0018 through 0029 are not yet applied.
-- Every fix below lands in one of the applied migrations' objects, so it is
-- made here rather than in place.
--
-- DO NOT wrap this file in an explicit transaction. The index below is built
-- CONCURRENTLY, which PostgreSQL refuses inside a transaction block, and
-- `score_entries` is a live table serving an anonymous public route.

-- ---------------------------------------------------------------------------
-- TM-13 — auto-join is a decision, not a default
--
-- `register_classroom_domain` wrote `auto_join_enabled = TRUE` as a literal on
-- both the INSERT and the ON CONFLICT branch, so registering a domain silently
-- armed auto-join and re-registering re-armed it. ADR 0023 says the opposite:
-- "auto-join must be explicitly enabled". Combined with TM-01v — a public
-- provider slipping through the denylist — that is silent non-consensual
-- enrolment of an Explorer into somebody else's Classroom.
--
-- The value is a parameter now, defaulting to FALSE. The three-argument form
-- is dropped so no caller can keep the old behaviour by accident.
-- ---------------------------------------------------------------------------

-- Fail rather than queue behind a long transaction: every ALTER below takes
-- ACCESS EXCLUSIVE on a live object. See docs/migration-safety.md.
SET lock_timeout = '3s';

CREATE OR REPLACE FUNCTION register_classroom_domain(
  p_classroom_id TEXT,
  p_teacher_id TEXT,
  p_domain TEXT,
  p_auto_join_enabled BOOLEAN DEFAULT NULL
)
RETURNS TABLE (domain TEXT, auto_join_enabled BOOLEAN)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF p_domain <> lower(p_domain)
     OR char_length(p_domain) NOT BETWEEN 4 AND 253
     OR p_domain !~
       '^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$'
     OR EXISTS (
       SELECT 1
       FROM public.public_email_domains AS public_domain
       WHERE public_domain.domain = p_domain
     ) THEN
    RAISE EXCEPTION 'Invalid school email domain.'
      USING ERRCODE = '22023';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.classroom_memberships AS membership
    WHERE membership.classroom_id = p_classroom_id
      AND membership.clerk_user_id = p_teacher_id
      AND membership.role = 'teacher'
  ) THEN
    RAISE EXCEPTION 'Teacher Classroom Membership is required.'
      USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.org_domains (
    domain,
    classroom_id,
    registered_by,
    auto_join_enabled
  )
  VALUES (
    p_domain,
    p_classroom_id,
    p_teacher_id,
    -- A first registration defaults to off. ADR 0023: "auto-join must be
    -- explicitly enabled".
    COALESCE(p_auto_join_enabled, FALSE)
  )
  ON CONFLICT (classroom_id) DO UPDATE SET
    domain = EXCLUDED.domain,
    registered_by = EXCLUDED.registered_by,
    -- NULL means "the caller said nothing about auto-join", which must leave
    -- an armed Classroom armed. Re-registering a domain is not a decision
    -- about auto-join, and treating it as one silently disarmed the feature.
    auto_join_enabled = COALESCE(
      p_auto_join_enabled,
      public.org_domains.auto_join_enabled
    ),
    updated_at = now();

  RETURN QUERY
  SELECT stored.domain, stored.auto_join_enabled
  FROM public.org_domains AS stored
  WHERE stored.classroom_id = p_classroom_id;
END
$$;

DROP FUNCTION IF EXISTS register_classroom_domain(TEXT, TEXT, TEXT);

-- The column default was TRUE as well, so any insert that omits the column
-- arms auto-join. One decision, one place, and it defaults to off.
ALTER TABLE org_domains
  ALTER COLUMN auto_join_enabled SET DEFAULT FALSE;

ALTER FUNCTION register_classroom_domain(TEXT, TEXT, TEXT, BOOLEAN)
  OWNER TO echo_maze_tenant_owner;

REVOKE ALL ON FUNCTION register_classroom_domain(TEXT, TEXT, TEXT, BOOLEAN)
  FROM PUBLIC;
-- Granted to the group role, matching every sibling grant in 0017: a second
-- runtime login must inherit this by joining the role, not by being named.
GRANT EXECUTE ON FUNCTION register_classroom_domain(TEXT, TEXT, TEXT, BOOLEAN)
  TO echo_maze_runtime;

-- ---------------------------------------------------------------------------
-- TM-01v — a free mailbox must not be able to claim a school domain
--
-- Tuta (formerly Tutanota) serves free mailboxes on tuta.com. Only tuta.io was
-- in the vendored snapshot, so tuta.com was registrable as a Verified
-- Classroom Domain — and `org_domains` has a PRIMARY KEY on the domain, so the
-- first Classroom to claim it squats it for everyone.
--
-- The generated block in migration 0017 is not edited; these are appended as
-- reviewed supplements, matching the runtime list in
-- `data/public-email-domains.json`.
-- ---------------------------------------------------------------------------

INSERT INTO public_email_domains (domain)
VALUES
  ('tuta.com'),
  ('tutamail.com'),
  ('tutanota.com'),
  ('tutanota.de')
ON CONFLICT (domain) DO NOTHING;

-- ---------------------------------------------------------------------------
-- SG-13 — the leaderboard's per-player ranking needs an index it can lead on
--
-- `getLeaderboard` reads `score_entries` filtered by partition and then ranks
-- with `ROW_NUMBER() OVER (PARTITION BY player_id ...)`. The existing partial
-- index matches the WHERE clause exactly, but nothing leads with `player_id`,
-- so the window function sorts the whole matching partition on every read —
-- and that route is anonymous and unmetered, with a partition an attacker can
-- grow by submitting more Runs.
--
-- CONCURRENTLY because `score_entries` is live and this route is public. It
-- takes longer and can leave an INVALID index behind if it is interrupted;
-- see docs/migration-safety.md for how to check for and drop one.
-- ---------------------------------------------------------------------------

-- `CONCURRENTLY` cannot hold a lock_timeout across its whole build.
RESET lock_timeout;

CREATE INDEX CONCURRENTLY IF NOT EXISTS score_entries_player_partition_idx
  ON score_entries (
    player_id,
    atlas_region_id,
    ruleset_revision,
    score DESC,
    labyrinth_number DESC,
    moves ASC,
    elapsed_ms ASC,
    created_at ASC
  )
  WHERE escaped = TRUE AND classroom_id IS NULL;
