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

  it("creates an append-only hash-chained audit log without raw addresses", async () => {
    const sql = await readFile(
      new URL("../db/migrations/0006_audit_events.sql", import.meta.url),
      "utf8"
    );

    expect(sql).toContain("CREATE TABLE audit_events");
    expect(sql).toContain("prev_hash CHAR(64) NOT NULL");
    expect(sql).toContain("row_hash CHAR(64) NOT NULL");
    expect(sql).toContain("ip_hash CHAR(64)");
    expect(sql).toContain("actor_role IN ('admin', 'moderator', 'player', 'system')");
    // A CHECK on the action name would silently drop rows, because recordAudit
    // swallows write errors by design.
    expect(sql).not.toContain("CHECK (action");
    expect(sql).toContain("CREATE TABLE audit_chain_head");
    expect(sql).toContain("CHECK (id = 1)");
    expect(sql).toContain("REVOKE UPDATE, DELETE, TRUNCATE ON audit_events");
    expect(sql).toContain("BEFORE UPDATE OR DELETE ON audit_events");
    // TRUNCATE never fires row triggers, so it needs its own statement trigger.
    expect(sql).toContain("BEFORE TRUNCATE ON audit_events");
    expect(sql).toContain(
      "FOR EACH STATEMENT EXECUTE FUNCTION audit_events_append_only()"
    );
    expect(sql).toContain("ALTER TABLE audit_chain_head SET (");
    expect(sql).toContain("fillfactor = 50");
    expect(sql).toContain("audit_events_actor_idx");
    expect(sql).toContain("audit_events_resource_idx");
    expect(sql).not.toContain("ip_address");
    expect(sql).not.toContain("user_agent");
    expect(sql).not.toContain("ALTER TABLE players");
  });

  it("adds serverless-safe rate-limit counters without storing addresses", async () => {
    const sql = await readFile(
      new URL("../db/migrations/0007_rate_limit_counters.sql", import.meta.url),
      "utf8"
    );

    expect(sql).toContain("CREATE TABLE rate_limit_counters");
    expect(sql).toContain("key TEXT PRIMARY KEY");
    expect(sql).toContain("window_start TIMESTAMPTZ NOT NULL");
    expect(sql).toContain("CHECK (count >= 0)");
    expect(sql).toContain("rate_limit_counters_window_idx");
    expect(sql).not.toContain("ip_address");
    expect(sql).not.toContain("clerk_user_id");
    expect(sql).not.toContain("ALTER TABLE player_access");
  });

  it("stores the authoritative role with its granting admin", async () => {
    const sql = await readFile(
      new URL("../db/migrations/0008_user_roles.sql", import.meta.url),
      "utf8"
    );

    expect(sql).toContain("CREATE TABLE user_roles");
    expect(sql).toContain("user_id TEXT PRIMARY KEY");
    expect(sql).toContain("role IN ('admin', 'moderator', 'player')");
    expect(sql).toContain("granted_by TEXT NOT NULL");
    // Self-promotion is refused in the route; this is the database backstop.
    expect(sql).toContain("CHECK (user_id <> granted_by");
    expect(sql).toContain("user_roles_role_idx");
    expect(sql).not.toContain("password");
    expect(sql).not.toContain("ALTER TABLE players");
  });

  it("stores webhook deliveries once, with no provider error bodies", async () => {
    const sql = await readFile(
      new URL("../db/migrations/0009_webhook_inbox.sql", import.meta.url),
      "utf8"
    );

    expect(sql).toContain("CREATE TABLE webhook_inbox");
    expect(sql).toContain("PRIMARY KEY (provider, event_id)");
    expect(sql).toContain("provider IN ('stripe', 'clerk')");
    expect(sql).toContain("status IN ('pending', 'processed', 'failed', 'dead')");
    expect(sql).toContain("attempts INT NOT NULL DEFAULT 0");
    // A processed row must record when, and an unprocessed row must not claim to.
    expect(sql).toContain("CHECK ((status = 'processed') = (processed_at IS NOT NULL))");
    expect(sql).toContain("webhook_inbox_retry_idx");
    expect(sql).toContain("webhook_inbox_dead_idx");
    // The payload is transient: a Clerk user.deleted payload carries the raw
    // Clerk id that the deletion tombstone exists to avoid storing.
    expect(sql).toContain("payload JSONB,");
    expect(sql).not.toContain("payload JSONB NOT NULL");
    expect(sql).toContain("webhook_inbox_settled_idx");
    expect(sql).not.toContain("card_number");
    expect(sql).not.toContain("ALTER TABLE lifetime_purchases");
  });
});

describe("Question bank migration", () => {
  it("stores versioned cards with exactly one published version each", async () => {
    const sql = await readFile(
      new URL("../db/migrations/0010_question_bank.sql", import.meta.url),
      "utf8"
    );

    expect(sql).toContain("CREATE TABLE questions");
    expect(sql).toContain("CREATE TABLE question_versions");
    expect(sql).toContain("UNIQUE (level_id, difficulty_band, question_ordinal)");
    expect(sql).toContain(
      "REFERENCES questions(id) ON DELETE CASCADE"
    );
    expect(sql).toContain("CHECK (status IN ('draft', 'published'))");
    expect(sql).toContain(
      "CHECK ((status = 'published') = (published_at IS NOT NULL))"
    );
    expect(sql).toContain("CREATE UNIQUE INDEX question_versions_published_idx");
    expect(sql).toContain("WHERE status = 'published'");
    // No player identity belongs in content storage.
    expect(sql).not.toContain("clerk_user_id");
    expect(sql).not.toContain("player_id");
  });
});
