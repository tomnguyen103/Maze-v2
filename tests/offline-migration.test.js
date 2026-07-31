import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("Offline Run Continuity migration", () => {
  const migrationUrl = new URL(
    "../db/migrations/0024_offline_run_continuity.sql",
    import.meta.url
  );

  // Git checks migrations out with CRLF on Windows, so every multi-line
  // assertion below would fail on a fresh clone without this. The migration
  // itself is line-ending agnostic; only the assertions care.
  /** @param {URL} url */
  const readMigration = async (url) =>
    (await readFile(url, "utf8")).replaceAll("\r\n", "\n");

  // Comment prose necessarily names the things the statements must not do, so
  // every "must not appear" assertion runs against the statements alone.
  /** @param {string} sql */
  const statementsOf = (sql) =>
    sql
      .split("\n")
      .filter((line) => !line.trimStart().startsWith("--"))
      .join("\n");

  it("wraps the whole migration in one transaction", async () => {
    const sql = await readMigration(migrationUrl);

    expect(sql).toContain("BEGIN;");
    expect(sql.trimEnd().endsWith("COMMIT;")).toBe(true);
  });

  it("forces row level security on both new tables", async () => {
    const sql = await readMigration(migrationUrl);

    for (const table of [
      "offline_run_receipts",
      "offline_pending_submissions"
    ]) {
      expect(sql).toContain(`CREATE TABLE ${table}`);
      expect(sql).toContain(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY`);
      expect(sql).toContain(`ALTER TABLE ${table} FORCE ROW LEVEL SECURITY`);
      expect(sql).toContain(
        `REVOKE ALL ON TABLE ${table}\n  FROM PUBLIC, echo_maze_runtime;`
      );
    }
  });

  it("pins search_path on every definer function and revokes PUBLIC", async () => {
    const sql = await readMigration(migrationUrl);

    const definerCount = sql.match(/SECURITY DEFINER/g)?.length ?? 0;
    const pinnedCount =
      sql.match(/SET search_path = pg_catalog, public/g)?.length ?? 0;
    expect(definerCount).toBe(6);
    expect(pinnedCount).toBe(definerCount);
    for (const signature of [
      [
        "issue_offline_run_receipt(",
        "  TEXT, CHAR, TEXT, TEXT, SMALLINT, TEXT, CHAR,",
        "  TIMESTAMPTZ, TIMESTAMPTZ, TIMESTAMPTZ, TEXT",
        ")"
      ].join("\n"),
      "read_offline_run_receipt(TEXT, CHAR)",
      "complete_offline_submission(TEXT)",
      "offline_submission_pending_apply(TEXT)",
      [
        "record_offline_submission(",
        "  TEXT, TEXT, BOOLEAN, TEXT, SMALLINT, INTEGER, INTEGER",
        ")"
      ].join("\n"),
      "prune_offline_run_continuity()"
    ]) {
      expect(sql).toContain(`REVOKE ALL ON FUNCTION ${signature}`);
      expect(sql).toContain(`GRANT EXECUTE ON FUNCTION ${signature}`);
    }
  });

  it("scopes the recorded outcome it reports to the Run that asked", async () => {
    // The idempotency key is a client-chosen global primary key, and this
    // function is SECURITY DEFINER, so matching on the key alone would hand a
    // caller another Run's score under its own Run ID.
    const sql = await readMigration(migrationUrl);

    expect(sql).toContain(
      [
        "  WHERE submission.run_id = p_run_id",
        "    AND (",
        "      submission.idempotency_key = p_idempotency_key",
        "      OR submission.accepted",
        "    )"
      ].join("\n")
    );
  });

  it("reads a receipt that matched nothing as no live receipt", async () => {
    // A SELECT that matches no row leaves the flag NULL, and a NULL condition
    // is not taken, so a plain NOT would report an acceptance the ledger never
    // recorded.
    const sql = await readMigration(migrationUrl);

    expect(sql).toContain("IF v_live IS NOT TRUE THEN");
    expect(sql).not.toContain("IF NOT v_live THEN");
  });

  it("keeps one receipt per Run ID", async () => {
    const sql = await readMigration(migrationUrl);

    expect(sql).toContain("run_id TEXT PRIMARY KEY");
    expect(sql).toContain("ON CONFLICT (run_id) DO NOTHING");
  });

  it("stores both expiry instants so no client clock is trusted", async () => {
    const sql = await readMigration(migrationUrl);

    expect(sql).toContain("issued_at TIMESTAMPTZ NOT NULL");
    expect(sql).toContain("play_expires_at TIMESTAMPTZ NOT NULL");
    expect(sql).toContain("submission_expires_at TIMESTAMPTZ NOT NULL");
    // The order is a constraint, not a convention: submission validity always
    // outlives play authority, and both always outlive issue.
    expect(sql).toContain("play_expires_at > issued_at");
    expect(sql).toContain("submission_expires_at >= play_expires_at");
    // Every read compares against the stored instants rather than an argument.
    const reader = sql.slice(
      sql.indexOf("CREATE FUNCTION read_offline_run_receipt")
    );
    expect(reader).toContain("receipt.play_expires_at");
    expect(reader).toContain("receipt.submission_expires_at");
  });

  it("holds no reviewed text and no selected option identifier", async () => {
    const sql = await readMigration(migrationUrl);

    expect(statementsOf(sql)).not.toMatch(
      /question_text|choice|option_id|answer_text|hint|feedback|prompt/i
    );
    const receipt = sql.slice(
      sql.indexOf("CREATE TABLE offline_run_receipts ("),
      sql.indexOf(");", sql.indexOf("CREATE TABLE offline_run_receipts ("))
    );
    const columns = receipt
      .split("\n")
      .slice(1)
      .filter((line) => /^ {2}\S/.test(line))
      .map((line) => line.trim().split(/[\s(]/)[0])
      .filter((name) => /^[a-z_]+$/.test(name));
    expect(columns).toEqual([
      "run_id",
      "player_id",
      "device_installation_hash",
      "seed",
      "level_id",
      "labyrinth_number",
      "ruleset_revision",
      "content_pack_hash",
      "issued_at",
      "play_expires_at",
      "submission_expires_at"
    ]);
  });

  it("cascades both tables away with the account", async () => {
    const sql = await readMigration(migrationUrl);

    expect(
      sql.match(/REFERENCES players\(clerk_user_id\) ON DELETE CASCADE/g)
    ).toHaveLength(2);
    expect(sql).toContain(
      "REFERENCES offline_run_receipts(run_id) ON DELETE CASCADE"
    );
  });

  it("makes one idempotency key produce one submission row", async () => {
    const sql = await readMigration(migrationUrl);

    expect(sql).toContain("idempotency_key VARCHAR(128) PRIMARY KEY");
    expect(sql).toContain("ON CONFLICT (idempotency_key) DO NOTHING");
  });

  it("is recorded in the ordered setup list", async () => {
    const setup = await readFile(
      new URL("../docs/SETUP.md", import.meta.url),
      "utf8"
    );

    expect(setup).toContain("db/migrations/0024_offline_run_continuity.sql");
  });
});
