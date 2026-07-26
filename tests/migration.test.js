import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("Run Access migration", () => {
  it("creates an additive allowance and immutable Run-fact ledger", async () => {
    const sql = await readFile(
      new URL("../db/migrations/0002_run_access.sql", import.meta.url),
      "utf8"
    );

    expect(sql).toContain("CREATE TABLE player_access");
    expect(sql).toContain("free_runs_used BETWEEN 0 AND 3");
    expect(sql).toContain("CREATE TABLE run_access_grants");
    expect(sql).toContain("seed VARCHAR(24) NOT NULL");
    expect(sql).toContain("level_id TEXT NOT NULL");
    expect(sql).toContain("labyrinth_number SMALLINT NOT NULL");
    expect(sql).toContain("grant_source IN ('free', 'lifetime')");
    expect(sql).toContain("UNIQUE (player_id, run_id)");
    expect(sql).not.toContain("ALTER TABLE players");
    expect(sql).not.toContain("ALTER TABLE score_entries");
  });

  it("adds constrained lifetime purchases and a Stripe replay ledger", async () => {
    const sql = await readFile(
      new URL("../db/migrations/0003_lifetime_membership.sql", import.meta.url),
      "utf8"
    );

    expect(sql).toContain("CREATE TABLE lifetime_purchases");
    expect(sql).toContain("amount SMALLINT NOT NULL DEFAULT 599");
    expect(sql).toContain("CHECK (amount = 599)");
    expect(sql).toContain("CHECK (currency = 'usd')");
    expect(sql).toContain("checkout_session_id TEXT UNIQUE");
    expect(sql).toContain("payment_intent_id TEXT UNIQUE");
    expect(sql).toContain("CREATE TABLE stripe_webhook_events");
    expect(sql).toContain("event_id TEXT PRIMARY KEY");
    expect(sql).toContain("'duplicate'");
    expect(sql).toContain("active_purchase_id UUID");
    expect(sql).not.toContain("card_number");
    expect(sql).not.toContain("billing_address");
  });

  it("stores bounded privacy-minimized Journals with account deletion cascade", async () => {
    const sql = await readFile(
      new URL("../db/migrations/0005_lantern_journal.sql", import.meta.url),
      "utf8"
    );

    expect(sql).toContain("CREATE TABLE learning_journals");
    expect(sql).toContain("CREATE TABLE deleted_user_tombstones");
    expect(sql).toContain("clerk_user_id_hash CHAR(64) PRIMARY KEY");
    expect(sql).toContain("clerk_user_id TEXT PRIMARY KEY");
    expect(sql).toContain("clear_generation INTEGER NOT NULL DEFAULT 0");
    expect(sql).toContain("journal -> 'version' = '1'::jsonb");
    expect(sql).toContain("REFERENCES player_access(clerk_user_id) ON DELETE CASCADE");
    expect(sql).toContain("jsonb_array_length(journal->'events') <= 200");
    expect(sql).not.toContain("answer_text");
    expect(sql).not.toContain("child_name");
  });

  it("adds one bounded optimistic Cloud Quest record per Clerk identity", async () => {
    const sql = await readFile(
      new URL("../db/migrations/0004_cloud_quest_progress.sql", import.meta.url),
      "utf8"
    );

    expect(sql).toContain("CREATE TABLE cloud_quest_progress");
    expect(sql).toContain(
      "REFERENCES player_access(clerk_user_id) ON DELETE CASCADE"
    );
    expect(sql).toContain("clerk_user_id TEXT PRIMARY KEY");
    expect(sql).toContain("schema_version SMALLINT NOT NULL DEFAULT 1");
    expect(sql).toContain("quest_id VARCHAR(100) NOT NULL");
    expect(sql).toContain(
      "quest_id ~ '^(quest|legacy)_[A-Za-z0-9_-]{7,92}$'"
    );
    expect(sql).toContain(
      "level_id IN ('bright-start', 'trail-scout', 'maze-master')"
    );
    expect(sql).toContain("labyrinth_number BETWEEN 1 AND 20");
    expect(sql).toContain(
      "jsonb_array_length(used_map_fingerprints) <= 1000"
    );
    expect(sql).toContain("jsonb_array_length(used_question_ids) <= 5000");
    expect(sql).toContain("complete = TRUE");
    expect(sql).toContain("revision > 0");
    expect(sql).toContain("completed_labyrinths = labyrinth_number - 1");
    expect(sql).toContain("revision INTEGER NOT NULL DEFAULT 1");
    expect(sql).toContain("used_map_fingerprints JSONB NOT NULL");
    expect(sql).toContain("used_question_ids JSONB NOT NULL");
    expect(sql).not.toContain("position");
    expect(sql).not.toContain("elapsed");
    expect(sql).not.toContain("question_text");
  });
});
