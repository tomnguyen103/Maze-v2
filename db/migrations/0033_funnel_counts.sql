-- 0033: Funnel Counts. One daily total per funnel step, Campaign Code and
-- Billing Mode. A count holds no person, address, cookie, URL or free text.
--
-- Triggers count the account, activation and Checkout steps from the row
-- change that makes each step true, so a step counts once with no
-- deduplication table. A counter failure never fails the write that fired it.
--
-- One transaction. The trigger on run_access_grants locks Grant inserts until
-- the first_run_grant_at backfill commits, so no Grant falls between the two.
-- Every statement survives a re-run. The file backfills no counter.
--
-- Rollback: drop the three triggers, the five functions, funnel_counts and
-- player_access.first_run_grant_at.

BEGIN;

SET LOCAL lock_timeout = '3s';

CREATE TABLE IF NOT EXISTS funnel_counts (
  day DATE NOT NULL,
  metric TEXT NOT NULL CHECK (
    metric IN (
      'adult_offer_visit',
      'account_created',
      'personal_run_activated',
      'checkout_created'
    )
  ),
  -- A Campaign Code from shared/campaign-codes.js, or '' for none.
  campaign TEXT NOT NULL DEFAULT '' CHECK (campaign ~ '^[a-z0-9-]{0,32}$'),
  mode TEXT NOT NULL DEFAULT '' CHECK (mode IN ('', 'test', 'live')),
  count BIGINT NOT NULL CHECK (count >= 0),
  PRIMARY KEY (day, metric, campaign, mode)
);

ALTER TABLE funnel_counts OWNER TO echo_maze_tenant_owner;
REVOKE ALL ON TABLE funnel_counts FROM PUBLIC, echo_maze_runtime;
-- The admin export reads the counts. Only the functions below write them.
GRANT SELECT ON TABLE funnel_counts TO echo_maze_runtime;

ALTER TABLE player_access
  ADD COLUMN IF NOT EXISTS first_run_grant_at TIMESTAMPTZ;
GRANT UPDATE (first_run_grant_at) ON TABLE player_access
  TO echo_maze_tenant_owner;

-- The one counter write. The inner block swallows a failure, so analytics
-- never blocks an account, a Run Grant, a Checkout or a visit.
CREATE OR REPLACE FUNCTION bump_funnel_count(
  p_metric TEXT,
  p_campaign TEXT,
  p_mode TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  BEGIN
    INSERT INTO public.funnel_counts (day, metric, campaign, mode, count)
    VALUES ((now() AT TIME ZONE 'UTC')::date, p_metric, p_campaign, p_mode, 1)
    ON CONFLICT (day, metric, campaign, mode)
      DO UPDATE SET count = public.funnel_counts.count + 1;
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;
END
$$;

-- A new player_access row is a new account. A conflicting insert adds no row
-- and fires no row trigger.
CREATE OR REPLACE FUNCTION count_account_created()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  PERFORM public.bump_funnel_count('account_created', '', '');
  RETURN NULL;
END
$$;

-- The first Personal Run Grant activates an Explorer. The update sits outside
-- the swallowed block: the row change is the dedup, so the count follows it.
CREATE OR REPLACE FUNCTION activate_personal_run()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  UPDATE public.player_access
  SET first_run_grant_at = NEW.created_at
  WHERE clerk_user_id = NEW.player_id
    AND first_run_grant_at IS NULL;
  IF FOUND THEN
    PERFORM public.bump_funnel_count('personal_run_activated', '', '');
  END IF;
  RETURN NULL;
END
$$;

-- A Checkout is created when the first Stripe Session attaches to a
-- purchase. A reused Session and a refused reservation attach nothing.
CREATE OR REPLACE FUNCTION count_checkout_created()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NEW.billing_mode IN ('test', 'live') THEN
    PERFORM public.bump_funnel_count('checkout_created', '', NEW.billing_mode);
  END IF;
  RETURN NULL;
END
$$;

-- The visit route calls this with an allowlisted Campaign Code or ''.
CREATE OR REPLACE FUNCTION count_adult_offer_visit(p_campaign TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  PERFORM public.bump_funnel_count('adult_offer_visit', p_campaign, '');
END
$$;

ALTER FUNCTION bump_funnel_count(TEXT, TEXT, TEXT) OWNER TO echo_maze_tenant_owner;
ALTER FUNCTION count_account_created() OWNER TO echo_maze_tenant_owner;
ALTER FUNCTION activate_personal_run() OWNER TO echo_maze_tenant_owner;
ALTER FUNCTION count_checkout_created() OWNER TO echo_maze_tenant_owner;
ALTER FUNCTION count_adult_offer_visit(TEXT) OWNER TO echo_maze_tenant_owner;

REVOKE ALL ON FUNCTION bump_funnel_count(TEXT, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION count_account_created() FROM PUBLIC;
REVOKE ALL ON FUNCTION activate_personal_run() FROM PUBLIC;
REVOKE ALL ON FUNCTION count_checkout_created() FROM PUBLIC;
REVOKE ALL ON FUNCTION count_adult_offer_visit(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION count_adult_offer_visit(TEXT) TO echo_maze_runtime;

DROP TRIGGER IF EXISTS player_access_count_account_created ON player_access;
CREATE TRIGGER player_access_count_account_created
  AFTER INSERT ON player_access
  FOR EACH ROW EXECUTE FUNCTION count_account_created();

DROP TRIGGER IF EXISTS run_access_grants_activate_personal_run ON run_access_grants;
CREATE TRIGGER run_access_grants_activate_personal_run
  AFTER INSERT ON run_access_grants
  FOR EACH ROW EXECUTE FUNCTION activate_personal_run();

-- A reservation inserts no Session, so only the first attach counts.
DROP TRIGGER IF EXISTS lifetime_purchases_count_checkout_created ON lifetime_purchases;
CREATE TRIGGER lifetime_purchases_count_checkout_created
  AFTER UPDATE OF checkout_session_id ON lifetime_purchases
  FOR EACH ROW
  WHEN (OLD.checkout_session_id IS NULL AND NEW.checkout_session_id IS NOT NULL)
  EXECUTE FUNCTION count_checkout_created();

-- A Grant made before this migration is never a first Grant later.
UPDATE player_access AS access
SET first_run_grant_at = earliest.created_at
FROM (
  SELECT player_id, min(created_at) AS created_at
  FROM run_access_grants
  GROUP BY player_id
) AS earliest
WHERE access.clerk_user_id = earliest.player_id
  AND access.first_run_grant_at IS NULL;

COMMIT;
