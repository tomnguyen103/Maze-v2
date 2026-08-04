import { globSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = fileURLToPath(new URL("../", import.meta.url));

/**
 * The audit's `TM-11` asks for a drift guard on `DELETION_ASSERTIONS`, so a
 * table added later cannot quietly keep a Clerk identifier after erasure has
 * reported success. It suggests `information_schema`, which needs a live
 * database — but the migration files *are* the schema of record and they are
 * right here, so the guard needs no database at all.
 *
 * Three tables were behind this finding, and every one of them would have been
 * caught by this: `user_roles`, `rate_limit_counters` and
 * `classroom_authority_versions` all carried an identifier that erasure left
 * in place.
 */
const COLUMN = /\b(clerk_user_id|player_id|user_id)\b\s+(?:TEXT|VARCHAR)/i;

/**
 * Tables that hold an account identifier and are deliberately NOT deleted.
 * Each entry is a decision, and adding one should feel like making it.
 */
const NOT_ERASED = Object.freeze({
  classroom_progress_counts:
    "Holds no identifier of its own — the Explorer column is the Classroom's, and rows go with the Classroom. Verified against migration 0014.",
  class_expedition_seats:
    "A seat survives Membership removal because the Licence that funded it is the sponsor's billing record, not the Student's. Cascades from `player_access` on erasure — migration 0021.",
  classroom_run_grants:
    "Cascades from `classroom_memberships`, which cascades from `player_access` — migration 0021."
});

function migrationTables() {
  /** @type {Map<string, string>} */
  const tables = new Map();
  for (const relative of globSync("db/migrations/*.sql", { cwd: root })) {
    const sql = readFileSync(root + relative, "utf8");
    for (const match of sql.matchAll(
      /CREATE TABLE (?:IF NOT EXISTS )?(\w+)\s*\(([\s\S]*?)\n\);/g
    )) {
      tables.set(match[1], match[2]);
    }
  }
  return tables;
}

describe("TM-11 — the deletion store cannot drift behind the schema", () => {
  const store = readFileSync(root + "server/user-deletion-store.js", "utf8");

  it("finds the tables that hold an account identifier", () => {
    const bearing = [...migrationTables()]
      .filter(([, body]) => COLUMN.test(body))
      .map(([name]) => name);
    // If this ever reads zero, the extraction broke and every assertion below
    // is passing on an empty set.
    expect(bearing.length).toBeGreaterThan(15);
    expect(bearing).toContain("players");
    expect(bearing).toContain("user_roles");
  });

  it("either deletes each of them or says why not", () => {
    /** @type {string[]} */
    const unaccounted = [];
    for (const [table, body] of migrationTables()) {
      if (!COLUMN.test(body)) continue;
      if (Object.hasOwn(NOT_ERASED, table)) continue;
      if (store.includes(`FROM ${table}`)) continue;
      unaccounted.push(table);
    }
    expect(unaccounted).toEqual([]);
  });

  it("keeps every exemption explained rather than merely listed", () => {
    for (const [table, reason] of Object.entries(NOT_ERASED)) {
      expect(reason.length).toBeGreaterThan(40);
      expect(reason).toMatch(/migration \d{4}|Cascades/);
      expect(migrationTables().has(table)).toBe(true);
    }
  });

  it("asserts every table it deletes, so a failed delete is not a success", () => {
    // A `DELETE` without a matching `NOT EXISTS` in the verification query is
    // a delete nobody checks: the transaction commits and erasure reports
    // success whether or not the rows went.
    const deleted = [
      ...store.matchAll(/DELETE FROM (\w+)/g)
    ].map((match) => match[1]);
    expect(deleted.length).toBeGreaterThanOrEqual(8);

    const verification = store.slice(store.indexOf("AS tombstone_present"));
    /** @type {string[]} */
    const unverified = [];
    for (const table of new Set(deleted)) {
      if (!verification.includes(`FROM ${table}`)) unverified.push(table);
    }
    expect(unverified).toEqual([]);
  });
});
