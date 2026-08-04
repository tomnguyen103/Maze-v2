import { globSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = fileURLToPath(new URL("../", import.meta.url));

/**
 * Migrations 0001 through 0017 are applied to the live database and are never
 * edited. Everything from 0018 on is still unapplied, so it can and must be
 * written to run against a populated table without taking it offline.
 *
 * The A+ audit filed `DB-01`, `DB-02` and `DB-03` for exactly this. The first
 * two are below the boundary and are documented in `docs/migration-safety.md`
 * instead; this guard is what stops a fourth from being written.
 */
const APPLIED_BOUNDARY = 17;

function unappliedMigrations() {
  return globSync("db/migrations/*.sql", { cwd: root })
    .map((relative) => ({
      relative: relative.replaceAll("\\", "/"),
      number: Number(relative.replace(/.*?(\d{4})_.*/, "$1"))
    }))
    .filter((file) => file.number > APPLIED_BOUNDARY)
    .map((file) => ({ ...file, sql: readFileSync(root + file.relative, "utf8") }));
}

/**
 * Tables an applied migration created. Rows already exist in them, so a
 * statement that scans one is a write outage; the same statement against a
 * table created in an unapplied migration scans nothing.
 */
function liveTableNames() {
  return new Set(
    globSync("db/migrations/*.sql", { cwd: root })
      .filter(
        (relative) =>
          Number(relative.replace(/.*?(\d{4})_.*/, "$1")) <= APPLIED_BOUNDARY
      )
      .flatMap((relative) => [
        ...readFileSync(root + relative, "utf8").matchAll(
          /CREATE TABLE (?:IF NOT EXISTS )?(\w+)/g
        )
      ])
      .map((match) => match[1])
  );
}

describe("unapplied migrations run online", () => {
  it("covers the migrations above the boundary", () => {
    const files = unappliedMigrations();
    expect(files.length).toBeGreaterThan(5);
    expect(files.every((file) => file.number >= 18)).toBe(true);
  });

  it("never builds an index on a live table without CONCURRENTLY", () => {
    const liveTables = liveTableNames();

    /** @type {string[]} */
    const blocking = [];
    for (const file of unappliedMigrations()) {
      for (const match of file.sql.matchAll(
        /CREATE\s+(?:UNIQUE\s+)?INDEX\s+(CONCURRENTLY\s+)?(?:IF NOT EXISTS\s+)?(\w+)\s+ON\s+(\w+)/gi
      )) {
        const [, concurrently, index, table] = match;
        if (concurrently) continue;
        if (!liveTables.has(table)) continue;
        blocking.push(`${file.relative}: ${index} on ${table}`);
      }
    }
    expect(blocking).toEqual([]);
  });

  it("adds a scanning constraint as NOT VALID, then validates it", () => {
    // CHECK, FOREIGN KEY and UNIQUE all scan the table to validate, and all
    // three do it under ACCESS EXCLUSIVE unless added NOT VALID first.
    //
    // Scanned rather than matched with one expression: a CHECK body contains
    // commas and newlines of its own, so any pattern that tries to find the
    // end of the constraint lazily stops inside it.
    const opener = /ADD CONSTRAINT\s+(\w+)\s+(CHECK|FOREIGN KEY|UNIQUE)/g;
    const liveTables = liveTableNames();
    /** @type {string[]} */
    const blocking = [];
    for (const file of unappliedMigrations()) {
      for (const match of file.sql.matchAll(opener)) {
        const [, name, kind] = match;
        // Only against a table that already has rows. A constraint on a
        // table an unapplied migration created validates against nothing.
        const target = file.sql
          .slice(0, match.index)
          .match(/ALTER TABLE (?:ONLY )?(\w+)(?![\s\S]*ALTER TABLE)/)?.[1];
        if (!target || !liveTables.has(target)) continue;
        const after = file.sql.slice(match.index + match[0].length);
        // The constraint ends where the next one begins, or where its
        // statement does.
        const nextConstraint = after.search(/ADD CONSTRAINT|DROP CONSTRAINT/);
        const statementEnd = after.indexOf(";");
        const bounds = [nextConstraint, statementEnd].filter((at) => at >= 0);
        const declaration = after.slice(0, Math.min(...bounds, after.length));

        // UNIQUE has no NOT VALID form: it has to be built as a concurrent
        // unique index and then attached with `ADD CONSTRAINT ... USING INDEX`.
        if (kind === "UNIQUE") {
          if (declaration.includes("USING INDEX")) continue;
          blocking.push(`${file.relative}: ${name} (${kind})`);
          continue;
        }
        if (declaration.includes("NOT VALID")) {
          // A NOT VALID constraint that is never validated is a constraint
          // nobody proved, which is its own problem.
          expect(file.sql).toContain(`VALIDATE CONSTRAINT ${name}`);
          continue;
        }
        blocking.push(`${file.relative}: ${name} (${kind})`);
      }
    }
    expect(blocking).toEqual([]);
  });

  it("never proves SET NOT NULL by scanning the table", () => {
    // PostgreSQL 12+ skips the scan when a validated `CHECK (col IS NOT NULL)`
    // already proves it. Without one, `SET NOT NULL` reads every row under
    // ACCESS EXCLUSIVE.
    /** @type {string[]} */
    const unproven = [];
    for (const file of unappliedMigrations()) {
      for (const match of file.sql.matchAll(
        /ALTER COLUMN (\w+) SET NOT NULL/g
      )) {
        const [statement, column] = match;
        const at = file.sql.indexOf(statement);
        const before = file.sql.slice(0, at);
        const proof = [
          ...before.matchAll(/VALIDATE CONSTRAINT (\w+)/g)
        ].some(([, name]) => {
          const declared = before.slice(before.indexOf(`ADD CONSTRAINT ${name}`));
          return (
            declared.includes(`${column} IS NOT NULL`) &&
            declared.length > 0
          );
        });
        // A column added in this same file is empty until the backfill, and
        // the backfill runs before the constraint work, so the proof is the
        // only thing that makes this cheap.
        if (!proof) unproven.push(`${file.relative}: ${column}`);
      }
    }
    expect(unproven).toEqual([]);
  });

  it("never adds a NOT NULL column with a volatile default", () => {
    /** @type {string[]} */
    const rewriting = [];
    for (const file of unappliedMigrations()) {
      for (const match of file.sql.matchAll(
        /ADD COLUMN (?:IF NOT EXISTS )?(\w+)[^,;]*NOT NULL[^,;]*DEFAULT\s+([^,;]+)/gi
      )) {
        const [, column, expression] = match;
        // A constant default is a catalogue-only change on PostgreSQL 11+.
        // A volatile one rewrites every row.
        if (/^'[^']*'|^\d|^TRUE|^FALSE/i.test(expression.trim())) continue;
        rewriting.push(`${file.relative}: ${column} DEFAULT ${expression.trim()}`);
      }
    }
    expect(rewriting).toEqual([]);
  });

  it("keeps every re-authored migration restartable", () => {
    // The files that gave up their transaction to stay online cannot rely on
    // rollback, so a straight re-run from the top has to succeed.
    for (const number of [19, 20]) {
      const file = unappliedMigrations().find((one) => one.number === number);
      expect(file).toBeDefined();
      const sql = file?.sql ?? "";
      expect(sql).not.toMatch(/ADD COLUMN (?!IF NOT EXISTS)/);
      for (const [, name] of sql.matchAll(/ADD CONSTRAINT (\w+)/g)) {
        expect(sql).toContain(`DROP CONSTRAINT IF EXISTS ${name}`);
      }
      expect(sql).not.toMatch(/DROP CONSTRAINT (?!IF EXISTS)/);
    }
  });

  it("keeps the re-authored 0019 online-safe", () => {
    const sql = unappliedMigrations().find((file) => file.number === 19)?.sql;
    expect(sql).toBeDefined();
    // Batched and committing, rather than one unbounded UPDATE that holds a
    // row lock on everything it has touched until the end.
    expect(sql).toContain("LIMIT 10000");
    expect(sql).toContain("GET DIAGNOSTICS touched = ROW_COUNT");
    expect(sql).toContain("COMMIT;");
    // `SET NOT NULL` skips its own scan only because a validated
    // `IS NOT NULL` check proved it first.
    expect(sql).toContain("score_entries_partition_not_null");
    expect(sql?.indexOf("VALIDATE CONSTRAINT score_entries_partition_not_null"))
      .toBeLessThan(sql?.indexOf("ALTER COLUMN atlas_region_id SET NOT NULL") ?? 0);
    expect(sql).toContain("CREATE INDEX CONCURRENTLY");
  });

  it("does not wrap CONCURRENTLY in a transaction", () => {
    for (const file of unappliedMigrations()) {
      // The statement, not the word: prose mentions it too.
      if (!/CREATE\s+(?:UNIQUE\s+)?INDEX\s+CONCURRENTLY/i.test(file.sql)) continue;
      expect(file.sql).not.toMatch(/^\s*BEGIN;/m);
    }
  });

  it("records what the applied migrations cost instead of pretending", () => {
    const doc = readFileSync(root + "docs/migration-safety.md", "utf8");
    for (const marker of ["`DB-01`", "`DB-02`", "`DB-03`", "Quiesce:"]) {
      expect(doc).toContain(marker);
    }
  });
});
