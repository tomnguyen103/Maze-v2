import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const sql = await readFile(
  new URL("../db/migrations/0034_funnel_counter_shards.sql", import.meta.url),
  "utf8"
).then((text) => text.replace(/\r\n/g, "\n"));

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

// Row and lock behaviour needs a live DATABASE_URL. These source checks pin
// the contract in the default gate.
describe("Funnel counter shard migration 0034", () => {
  it("US-01.1 adds a shard column from 0 to 15 and puts it in the primary key", () => {
    expect(sql).toMatch(
      /ADD COLUMN IF NOT EXISTS shard SMALLINT NOT NULL DEFAULT 0\s+CHECK \(shard BETWEEN 0 AND 15\);/
    );
    expect(sql).toMatch(
      /DROP CONSTRAINT IF EXISTS funnel_counts_pkey,\s+ADD CONSTRAINT funnel_counts_pkey\s+PRIMARY KEY \(day, metric, campaign, mode, shard\);/
    );
  });

  it("US-05.1 takes the first free shard from a random start, else waits on a random shard", () => {
    const body = functionBody("bump_funnel_count");
    expect(body).toContain("v_start INT := floor(random() * 16)::int;");
    expect(body).toContain("FOR v_step IN 0..15 LOOP");
    expect(body).toContain("v_shard := (v_start + v_step) % 16;");
    expect(body).toMatch(
      /EXIT WHEN pg_try_advisory_xact_lock\(\s+hashtext\('funnel_counts'\),\s+hashtext\(concat_ws\('\|', v_day, p_metric, p_campaign, p_mode, v_shard\)\)\s+\);\s+v_shard := NULL;/
    );
    expect(body).toContain("COALESCE(v_shard, v_start)");
    expect(body).toMatch(
      /ON CONFLICT \(day, metric, campaign, mode, shard\)\s+DO UPDATE SET count = public\.funnel_counts\.count \+ 1;/
    );
  });

  it("US-08.3 keeps the warning block and the 200 ms wait of 0033", () => {
    expect(functionBody("bump_funnel_count")).toMatch(
      /EXCEPTION WHEN OTHERS THEN\s+RAISE WARNING 'funnel count dropped: %', SQLSTATE;\s+END;\s+END/
    );
    expect(sql).toMatch(
      /FUNCTION bump_funnel_count\([^)]*\)[^$]*SET lock_timeout = '200ms'\s+AS \$\$/
    );
  });

  it("US-06.3 runs the activation stamp and the bump in one warning block", () => {
    const body = functionBody("activate_personal_run");
    expect(body).toMatch(
      /^\s*BEGIN\s+BEGIN\s+UPDATE public\.player_access[\s\S]*PERFORM public\.bump_funnel_count\('personal_run_activated', '', ''\);\s+END IF;\s+EXCEPTION WHEN OTHERS THEN\s+RAISE WARNING 'funnel count dropped: %', SQLSTATE;\s+END;\s+RETURN NULL;\s+END\s*$/
    );
    expect(body.match(/UPDATE /g)).toHaveLength(1);
    expect(body.indexOf("UPDATE ")).toBeLessThan(body.indexOf("EXCEPTION"));
  });

  it("US-08.1 matches the owner, search path, revokes and grants of 0033", () => {
    for (const [name, args] of [
      ["bump_funnel_count", "TEXT, TEXT, TEXT"],
      ["activate_personal_run", ""]
    ]) {
      expect(sql).toMatch(
        new RegExp(
          `CREATE OR REPLACE FUNCTION ${name}\\([^)]*\\)\\s+RETURNS \\w+\\s+LANGUAGE plpgsql\\s+SECURITY DEFINER\\s+SET search_path = pg_catalog, public\\s+(SET lock_timeout = '200ms'\\s+)?AS`
        )
      );
      expect(sql).toContain(
        `ALTER FUNCTION ${name}(${args}) OWNER TO echo_maze_tenant_owner;`
      );
      expect(sql).toContain(`REVOKE ALL ON FUNCTION ${name}(${args}) FROM PUBLIC;`);
    }
    // 0033 grants the runtime no write and no new execute right.
    expect(sql).not.toMatch(/GRANT (EXECUTE|INSERT|UPDATE|DELETE|ALL)/);
  });

  it("US-06.4 runs in one transaction with a short lock wait and lends schema CREATE only for the ownership transfers", () => {
    expect(sql).toMatch(/^BEGIN;\s+SET LOCAL lock_timeout = '3s';/m);
    expect(sql.trimEnd().endsWith("COMMIT;")).toBe(true);
    const grant = sql.indexOf(
      "GRANT CREATE ON SCHEMA public TO echo_maze_tenant_owner;"
    );
    const revoke = sql.indexOf(
      "REVOKE CREATE ON SCHEMA public FROM echo_maze_tenant_owner;"
    );
    const transfers = [...sql.matchAll(/ OWNER TO echo_maze_tenant_owner;/g)].map(
      (match) => match.index
    );
    expect(grant).toBeGreaterThan(-1);
    expect(transfers).toHaveLength(2);
    expect(transfers.every((index) => index > grant && index < revoke)).toBe(true);
    expect(sql.slice(revoke)).toMatch(
      /^REVOKE CREATE ON SCHEMA public FROM echo_maze_tenant_owner;\s+COMMIT;\s*$/
    );
  });

  it("US-06.5 re-runs without error and names the rollback steps", () => {
    expect(sql).not.toMatch(/^CREATE TABLE (?!IF NOT EXISTS)/m);
    expect(sql).not.toMatch(/^CREATE (UNIQUE )?INDEX (?!IF NOT EXISTS)/m);
    expect(sql).not.toMatch(/^\s*ADD COLUMN (?!IF NOT EXISTS)/m);
    expect(sql).not.toMatch(/^\s*DROP CONSTRAINT (?!IF EXISTS)/m);
    expect(sql).not.toMatch(/^CREATE FUNCTION/m);
    expect(sql).not.toMatch(/^(UPDATE|DELETE|INSERT) /m);
    const header = sql.slice(0, sql.indexOf("BEGIN;"));
    expect(header).toContain("Rollback");
    expect(header).toContain("restore the four-column primary");
  });
});
