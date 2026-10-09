import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { CAMPAIGN_CODES } from "../shared/campaign-codes.js";

const sql = await readFile(
  new URL("../db/migrations/0033_funnel_counts.sql", import.meta.url),
  "utf8"
);

/** @param {string} name */
function functionBody(name) {
  const match = sql.match(
    new RegExp(
      `CREATE OR REPLACE FUNCTION ${name}\\([\\s\\S]*?AS \\$\\$([\\s\\S]*?)\\$\\$;`
    )
  );
  if (!match) throw new Error(`Function ${name} is missing.`);
  return match[1];
}

const FUNCTIONS = [
  "bump_funnel_count",
  "count_account_created",
  "activate_personal_run",
  "count_checkout_created",
  "count_adult_offer_visit"
];

// Row and trigger behaviour needs a live DATABASE_URL. These source checks
// pin the contract in the unit lane.
describe("Funnel Count migration 0033", () => {
  it("US-05.1 counts each new account from the player_access insert", () => {
    expect(sql).toMatch(
      /CREATE TRIGGER player_access_count_account_created\s+AFTER INSERT ON player_access\s+FOR EACH ROW EXECUTE FUNCTION count_account_created\(\);/
    );
    expect(functionBody("count_account_created")).toContain(
      "bump_funnel_count('account_created', '', '')"
    );
  });

  it("US-06.1 counts an activation once, from the first Personal Run Grant only", () => {
    expect(sql).toMatch(
      /CREATE TRIGGER run_access_grants_activate_personal_run\s+AFTER INSERT ON run_access_grants\s+FOR EACH ROW EXECUTE FUNCTION activate_personal_run\(\);/
    );
    const body = functionBody("activate_personal_run");
    expect(body).toMatch(
      /AND first_run_grant_at IS NULL;\s+IF FOUND AND NOT EXISTS \(\s+SELECT 1 FROM public\.run_access_grants\s+WHERE player_id = NEW\.player_id AND id <> NEW\.id\s+\) THEN\s+PERFORM public\.bump_funnel_count\('personal_run_activated', '', ''\);/
    );
    // The dedup update must fail loudly, so no block swallows it.
    expect(body).not.toContain("EXCEPTION");
  });

  it("US-06.2 stamps the earliest Grant, so an Explorer with an earlier Grant never counts", () => {
    expect(functionBody("activate_personal_run")).toMatch(
      /SET first_run_grant_at = \(\s+SELECT min\(created_at\) FROM public\.run_access_grants\s+WHERE player_id = NEW\.player_id\s+\)/
    );
    expect(sql).toMatch(
      /GRANT SELECT \(id, player_id, created_at\) ON TABLE run_access_grants\s+TO echo_maze_tenant_owner;/
    );
    // No full-table update holds the migration locks, and only the definer
    // function writes counts.
    expect(sql).not.toMatch(/^UPDATE /m);
    expect(sql.match(/INSERT INTO (public\.)?funnel_counts/g)).toHaveLength(1);
    expect(sql).not.toMatch(/^(SELECT|PERFORM) /m);
  });

  it("US-07.1 counts a Checkout on the first Session attach in a known Billing Mode", () => {
    expect(sql).toMatch(
      /AFTER UPDATE OF checkout_session_id ON lifetime_purchases\s+FOR EACH ROW\s+WHEN \(OLD\.checkout_session_id IS NULL AND NEW\.checkout_session_id IS NOT NULL\)\s+EXECUTE FUNCTION count_checkout_created\(\);/
    );
    expect(functionBody("count_checkout_created")).toMatch(
      /IF NEW\.billing_mode IN \('test', 'live'\) THEN\s+PERFORM public\.bump_funnel_count\('checkout_created', '', NEW\.billing_mode\);/
    );
  });

  it("US-08.3 turns a counter failure or a long lock wait into a warning, so analytics never blocks the write that fired it", () => {
    expect(functionBody("bump_funnel_count")).toMatch(
      /BEGIN\s+BEGIN\s+INSERT INTO public\.funnel_counts[\s\S]*ON CONFLICT \(day, metric, campaign, mode\)\s+DO UPDATE SET count = public\.funnel_counts\.count \+ 1;\s+EXCEPTION WHEN OTHERS THEN\s+RAISE WARNING 'funnel count dropped: %', SQLSTATE;\s+END;\s+END/
    );
    expect(sql).toMatch(
      /FUNCTION bump_funnel_count\([^)]*\)[^$]*SET lock_timeout = '200ms'\s+AS \$\$/
    );
  });

  it("US-08.1 runs every counter as the tenant owner with a fixed search path", () => {
    for (const name of FUNCTIONS) {
      expect(sql).toMatch(
        new RegExp(
          `CREATE OR REPLACE FUNCTION ${name}\\([^)]*\\)\\s+RETURNS \\w+\\s+LANGUAGE plpgsql\\s+SECURITY DEFINER\\s+SET search_path = pg_catalog, public\\s+(SET lock_timeout = '\\d+ms'\\s+)?AS`
        )
      );
      expect(sql).toMatch(
        new RegExp(
          `ALTER FUNCTION ${name}\\([^)]*\\) OWNER TO echo_maze_tenant_owner;`
        )
      );
      expect(sql).toMatch(
        new RegExp(`REVOKE ALL ON FUNCTION ${name}\\([^)]*\\) FROM PUBLIC;`)
      );
    }
  });

  it("US-09.1 lets the runtime read the counts and call only the visit counter", () => {
    expect(sql).toContain(
      "REVOKE ALL ON TABLE funnel_counts FROM PUBLIC, echo_maze_runtime;"
    );
    expect(sql.match(/GRANT [A-Z, ]+ ON TABLE funnel_counts TO [^;]+;/g)).toEqual(
      ["GRANT SELECT ON TABLE funnel_counts TO echo_maze_runtime;"]
    );
    expect(sql.match(/GRANT EXECUTE ON FUNCTION [^;]+;/g)).toEqual([
      "GRANT EXECUTE ON FUNCTION count_adult_offer_visit(TEXT) TO echo_maze_runtime;"
    ]);
  });

  it("US-09.2 stores only a day, a step, a Campaign Code, a Billing Mode and a count", () => {
    const table = sql.match(
      /CREATE TABLE IF NOT EXISTS funnel_counts \(([\s\S]*?)\r?\n\);/
    );
    expect(table).not.toBeNull();
    const columns = [
      ...(table?.[1] ?? "").matchAll(/^ {2}([a-z_]+) [A-Z]+/gm)
    ].map((match) => match[1]);
    expect(columns).toEqual(["day", "metric", "campaign", "mode", "count"]);
    expect(sql).toContain("PRIMARY KEY (day, metric, campaign, mode)");
  });

  it("US-09.2 accepts every Campaign Code and rejects a free-text value", () => {
    const pattern = sql.match(/CHECK \(campaign ~ '([^']+)'\)/)?.[1];
    expect(pattern).toBe("^[a-z0-9-]{0,32}$");
    const check = new RegExp(/** @type {string} */ (pattern));
    expect(CAMPAIGN_CODES.every((code) => check.test(code))).toBe(true);
    expect(check.test("")).toBe(true);
    expect(check.test("parent@example.test")).toBe(false);
    expect(check.test("https://example.test")).toBe(false);
  });

  it("US-06.4 runs the migration in one transaction with a short lock wait", () => {
    expect(sql).toMatch(/^BEGIN;\s+SET LOCAL lock_timeout = '3s';/m);
    expect(sql.trimEnd().endsWith("COMMIT;")).toBe(true);
  });
});
