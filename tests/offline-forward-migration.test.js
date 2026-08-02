import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("Offline Run Continuity forward migration", () => {
  const migrationUrl = new URL(
    "../db/migrations/0025_offline_run_continuity_forward.sql",
    import.meta.url
  );

  /** @param {URL} url */
  const readMigration = async (url) =>
    (await readFile(url, "utf8")).replaceAll("\r\n", "\n");

  it("adds the receipt Quest identity and replay snapshot without recreating tables", async () => {
    const sql = await readMigration(migrationUrl);

    expect(sql).toContain("ALTER TABLE question_versions");
    expect(sql).toContain(
      "DROP CONSTRAINT IF EXISTS question_versions_check"
    );
    expect(sql).toContain(
      "CHECK (status <> 'published' OR published_at IS NOT NULL)"
    );
    expect(sql).toContain("ALTER TABLE offline_run_receipts");
    expect(sql).toContain("ADD COLUMN IF NOT EXISTS quest_id TEXT");
    expect(sql).toContain("ADD COLUMN IF NOT EXISTS learning_deck_id TEXT");
    expect(sql).toContain("ADD COLUMN IF NOT EXISTS initial_used_question_ids JSONB");
    expect(sql).toContain("ALTER TABLE offline_pending_submissions");
    expect(sql).toContain("ADD COLUMN IF NOT EXISTS replay_result JSONB");
    expect(sql).not.toContain("CREATE TABLE offline_run_receipts");
    expect(sql).not.toContain("CREATE TABLE offline_pending_submissions");
    expect(sql).not.toContain("CREATE TABLE question_versions");
  });

  it("replaces the old function signatures with the receipt-bound contract", async () => {
    const sql = await readMigration(migrationUrl);

    expect(sql).toContain(
      "TIMESTAMPTZ, TIMESTAMPTZ, TIMESTAMPTZ, TEXT, TEXT, TEXT, TEXT, INTEGER, JSONB"
    );
    expect(sql).toContain("recorded_replay_result JSONB");
    expect(sql).toContain("DROP FUNCTION IF EXISTS read_offline_run_receipt(TEXT, CHAR)");
    expect(sql).toContain(
      "DROP FUNCTION IF EXISTS record_offline_submission(\n  TEXT, TEXT, BOOLEAN, TEXT, SMALLINT, INTEGER, INTEGER\n)"
    );
    expect(sql).toContain("CREATE FUNCTION record_offline_submission(");
  });

  it("keeps definer reads and writes scoped to the session Explorer", async () => {
    const sql = await readMigration(migrationUrl);

    expect(sql).toContain("receipt.player_id IS NOT DISTINCT FROM NULLIF(");
    expect(sql).toContain("submission.player_id IS NOT DISTINCT FROM NULLIF(");
    expect(sql).toContain("current_setting('echo_maze.explorer_id', true)");
    expect(sql).toContain("p_quest_id !~ '^(quest|legacy)_[A-Za-z0-9_-]{7,92}$'");
    expect(sql).toContain(
      "IF p_accepted AND p_replay_result IS NULL THEN"
    );
  });

  it("is listed after migration 0024", async () => {
    const setup = await readFile(
      new URL("../docs/SETUP.md", import.meta.url),
      "utf8"
    );
    expect(setup.indexOf("0024_offline_run_continuity.sql")).toBeLessThan(
      setup.indexOf("0025_offline_run_continuity_forward.sql")
    );
  });
});
