import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = fileURLToPath(new URL("../", import.meta.url));
const LEDGER = "db/inspect/migration-ledger.sql";
const FIRST_CHECKED = "0018";

/** @param {string} path */
function read(path) {
  return readFileSync(join(root, path), "utf8").replace(/\r\n/g, "\n");
}

/** @param {string} sql */
function withoutComments(sql) {
  return sql.replace(/--.*$/gm, "");
}

/**
 * Splits the ledger into one entry per row: the file name and its check text.
 *
 * @param {string} sql
 */
function ledgerRows(sql) {
  const parts = withoutComments(sql).split(/^\s*\('(\d{4}_\w+\.sql)',/m);
  /** @type {{ file: string, check: string }[]} */
  const rows = [];
  for (let index = 1; index < parts.length; index += 2) {
    rows.push({ file: parts[index], check: parts[index + 1] });
  }
  return rows;
}

/**
 * The catalog names a check reads. A NOT LIKE token is absent by design.
 *
 * @param {string} check
 */
function signatureTokens(check) {
  const patterns = [
    /to_regclass\('public\.(\w+)'\)/g,
    /to_regprocedure\('public\.(\w+)\(/g,
    /attname = '(\w+)'/g,
    /conname = '(\w+)'/g,
    /(?<!NOT )LIKE '%([^%']+)%'/g
  ];
  return [
    ...new Set(
      patterns.flatMap((pattern) =>
        [...check.matchAll(pattern)].map((match) => match[1])
      )
    )
  ];
}

/**
 * @param {string[]} files
 * @param {{ file: string }[]} rows
 */
function filesWithoutRow(files, rows) {
  const checked = new Set(rows.map((row) => row.file));
  return files.filter((file) => !checked.has(file));
}

const migrations = readdirSync(join(root, "db/migrations"))
  .filter((name) => /^\d{4}_\w+\.sql$/.test(name) && name >= FIRST_CHECKED)
  .sort();

describe("Migration ledger check", () => {
  const sql = read(LEDGER);
  const rows = ledgerRows(sql);

  it("US-05.1 holds one row per migration from 0018 in file order", () => {
    expect(rows.map((row) => row.file)).toEqual(migrations);
  });

  it.each(rows.map((row) => [row.file, row.check]))(
    "US-05.2 checks %s by names its migration file creates",
    (file, check) => {
      const tokens = signatureTokens(check);
      const migration = read(`db/migrations/${file}`).toLowerCase();

      expect(tokens.length).toBeGreaterThan(0);
      for (const token of tokens) {
        expect(migration).toContain(token.toLowerCase());
      }
    }
  );

  it.each(
    rows
      .filter((row) => /CONCURRENTLY/.test(read(`db/migrations/${row.file}`)))
      .map((row) => [row.file, row.check])
  )("US-05.2 counts the concurrent index of %s only when it is valid", (_file, check) => {
    expect(check).toMatch(/\bAND indisvalid\)/);
  });

  // The final statement of each file that runs outside one transaction.
  /** @type {[string, RegExp[]][]} */
  const lastSteps = [
    [
      "0018_verified_daily_entries.sql",
      [
        /WHERE rolname = 'echo_maze_runtime'\)\s+THEN COALESCE\(has_table_privilege\('echo_maze_runtime',\s+to_regclass\('public\.verified_daily_entries'\)/
      ]
    ],
    [
      "0019_score_entry_ruleset_partitions.sql",
      [/to_regclass\('public\.score_entries_partition_ranking_idx'\)\s+AND indisvalid\)/]
    ],
    [
      "0020_learning_deck_quest_identity.sql",
      [
        /attname = 'learning_deck_revision'\s+AND attnotnull/,
        /NOT EXISTS \(SELECT 1 FROM pg_catalog\.pg_constraint[\s\S]*?conname = 'cloud_quest_progress_deck_not_null'\)/
      ]
    ],
    [
      "0022_access_settings_v2.sql",
      [/conname = 'explorer_access_settings_narration_pace_check'\s+AND convalidated/]
    ],
    [
      "0027_echo_lens_learning_deck_revision.sql",
      [/AND convalidated[\s\S]*\) = 2\)/]
    ],
    [
      "0031_billing_mode.sql",
      [
        /to_regclass\('public\.lifetime_purchases_one_open_per_player_mode_idx'\)\s+AND indisvalid\)/,
        /to_regclass\('public\.lifetime_purchases_one_open_per_player_idx'\) IS NULL/
      ]
    ]
  ];

  it.each(lastSteps)("US-05.2 checks the last step of %s", (file, patterns) => {
    const row = rows.find((candidate) => candidate.file === file);

    expect(row).toBeDefined();
    for (const pattern of patterns) {
      expect(row?.check).toMatch(pattern);
    }
  });

  it("US-05.2 reads no privilege-filtered information_schema view", () => {
    expect(withoutComments(sql)).not.toMatch(/information_schema/i);
  });

  it("US-05.3 holds no write or schema statement", () => {
    expect(withoutComments(sql)).not.toMatch(
      /\b(INSERT|UPDATE|DELETE|CREATE|ALTER|DROP|GRANT|REVOKE|TRUNCATE|COMMIT)\b/i
    );
  });

  it("US-05.4 runs inside a read-only transaction that rolls back", () => {
    const statements = withoutComments(sql).trim();

    expect(statements.startsWith("BEGIN READ ONLY;")).toBe(true);
    expect(statements.endsWith("ROLLBACK;")).toBe(true);
  });

  it("US-05.5 names a new migration file that has no ledger row", () => {
    expect(
      filesWithoutRow([...migrations, "0034_future_change.sql"], rows)
    ).toEqual(["0034_future_change.sql"]);
  });
});
