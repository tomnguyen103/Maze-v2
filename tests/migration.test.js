import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { PUBLIC_EMAIL_DOMAINS } from "../server/classroom-domain.js";

describe("Run Access migration", () => {
  it("adds bounded replay-verified Daily submissions and one best entry", async () => {
    const sql = await readFile(
      new URL(
        "../db/migrations/0018_verified_daily_entries.sql",
        import.meta.url
      ),
      "utf8"
    );

    expect(sql).toContain("CREATE TABLE verified_daily_submissions");
    expect(sql).toContain("CREATE TABLE verified_daily_entries");
    expect(sql).toContain("daily_version = 1");
    expect(sql).toContain("elapsed_ms BETWEEN 0 AND 14400000");
    expect(sql).toContain(
      "best_result IN ('created', 'improved', 'unchanged')"
    );
    expect(sql).toContain("response_score SMALLINT NOT NULL");
    expect(sql).toContain("response_moves INTEGER NOT NULL");
    expect(sql).toContain(
      "PRIMARY KEY (player_id, daily_date, idempotency_key)"
    );
    expect(sql).toContain("PRIMARY KEY (player_id, daily_date)");
    expect(sql).toContain("verified_daily_entries_ranking_idx");
    expect(sql).toContain("score DESC");
    expect(sql).toContain("moves ASC");
    expect(sql).toContain("achieved_at ASC");
    expect(sql).toContain("ENABLE ROW LEVEL SECURITY");
    expect(sql).toContain("FORCE ROW LEVEL SECURITY");
    expect(sql).toContain("TO echo_maze_runtime");
    expect(sql).not.toContain("email");
    expect(sql).not.toContain("question");
    expect(sql).not.toContain("action_log");
  });
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
    expect(sql).toContain(
      "level_id IN ('bright-start', 'trail-scout', 'maze-master')"
    );
    expect(sql).toContain("UNIQUE (level_id, difficulty_band, question_ordinal)");
    expect(sql).toContain(
      "REFERENCES questions(id) ON DELETE CASCADE"
    );
    expect(sql).toContain("CHECK (status IN ('draft', 'published'))");
    expect(sql).toContain("edited_by TEXT NOT NULL");
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

describe("Explorer Access Settings sync migration", () => {
  it("stores one bounded revisioned presentation record per Clerk identity", async () => {
    const sql = await readFile(
      new URL("../db/migrations/0011_explorer_access_settings.sql", import.meta.url),
      "utf8"
    );

    expect(sql).toContain("CREATE TABLE explorer_access_settings");
    expect(sql).toContain("clerk_user_id TEXT PRIMARY KEY");
    expect(sql).toContain("schema_version SMALLINT NOT NULL DEFAULT 1");
    expect(sql).toContain("CHECK (schema_version = 1)");
    expect(sql).toContain("high_contrast BOOLEAN NOT NULL");
    expect(sql).toContain("large_marks BOOLEAN NOT NULL");
    expect(sql).toContain("reader_friendly_questions BOOLEAN NOT NULL");
    expect(sql).toContain("reduced_effects BOOLEAN NOT NULL");
    expect(sql).toContain("revision INTEGER NOT NULL DEFAULT 1");
    expect(sql).toContain("CHECK (revision > 0)");
    expect(sql).not.toContain("difficulty");
    expect(sql).not.toContain("score");
    expect(sql).not.toContain("question_text");
    expect(sql).not.toContain("prompt");
  });
});

describe("Verified Classroom Domain migration", () => {
  it("keeps domain ownership unique and Membership grants webhook-authoritative", async () => {
    const sql = await readFile(
      new URL(
        "../db/migrations/0017_verified_classroom_domains.sql",
        import.meta.url
      ),
      "utf8"
    );

    expect(sql).toContain("CREATE TABLE org_domains");
    expect(sql).toContain("domain TEXT PRIMARY KEY");
    expect(sql).toContain("classroom_id TEXT NOT NULL UNIQUE");
    expect(sql).toContain("auto_join_enabled BOOLEAN NOT NULL DEFAULT TRUE");
    expect(sql).toContain("CREATE FUNCTION register_classroom_domain");
    expect(sql).toContain("role = 'teacher'");
    expect(sql).toContain("CREATE FUNCTION classroom_for_verified_domain");
    expect(sql).toContain("ALTER TABLE org_domains FORCE ROW LEVEL SECURITY");
    expect(
      sql.match(/char_length\(domain\) BETWEEN 4 AND 253/g)
    ).toHaveLength(2);
    expect(sql).toContain(
      "char_length(p_domain) NOT BETWEEN 4 AND 253"
    );
    const generatedDomains = generatedPublicEmailDomains(sql);
    expect(generatedDomains).toEqual([...PUBLIC_EMAIL_DOMAINS].sort());
    expect(sql).not.toContain("INSERT INTO classroom_memberships");
  });
});

/** @param {string} sql */
function generatedPublicEmailDomains(sql) {
  const block = sql.match(
    /-- BEGIN GENERATED PUBLIC EMAIL DOMAINS([\s\S]*?)-- END GENERATED PUBLIC EMAIL DOMAINS/
  )?.[1];
  if (!block) {
    throw new Error("Generated public email domain block is missing.");
  }
  return [...block.matchAll(/'([^']+)'/g)].map((match) => match[1]);
}

describe("Audit privilege boundary migration", () => {
  it("moves audit ownership behind one fixed-search-path definer function", async () => {
    const expand = await readFile(
      new URL("../db/migrations/0012_audit_privilege_boundary.sql", import.meta.url),
      "utf8"
    );
    const finalize = await readFile(
      new URL(
        "../db/migrations/0013_audit_privilege_boundary_finalize.sql",
        import.meta.url
      ),
      "utf8"
    );

    expect(expand).toContain("CREATE ROLE echo_maze_audit_owner NOLOGIN");
    expect(expand).toContain("CREATE ROLE echo_maze_runtime NOLOGIN");
    expect(expand).toContain("CREATE EXTENSION IF NOT EXISTS pgcrypto");
    expect(expand).toContain("CREATE FUNCTION canonical_audit_json");
    expect(expand).toContain("ADD COLUMN canonical_payload TEXT");
    expect(expand).toContain(
      "GRANT USAGE, CREATE ON SCHEMA public TO echo_maze_audit_owner"
    );
    expect(expand).toContain("CREATE FUNCTION append_audit_event");
    expect(expand).toContain("SECURITY DEFINER");
    expect(expand).toContain("SET search_path = pg_catalog, public");
    expect(expand).toContain("SELECT head.row_hash");
    expect(expand).toContain("FOR UPDATE");
    expect(expand).toContain("public.digest");
    expect(expand).toContain(
      "normalized_payload := public.canonical_audit_json(payload)"
    );
    expect(expand).toContain("audit payload field types are invalid");
    expect(expand).toContain(
      "audit payload timestamp is not canonical UTC"
    );
    expect(expand).toContain(
      "REVOKE ALL ON FUNCTION canonical_audit_json(JSONB) FROM PUBLIC"
    );
    expect(expand).toContain(
      "GRANT EXECUTE ON FUNCTION append_audit_event(TEXT) TO PUBLIC"
    );
    expect(expand).not.toContain("ALTER TABLE audit_events OWNER");
    expect(finalize).toContain(
      "ALTER TABLE audit_events OWNER TO echo_maze_audit_owner"
    );
    expect(finalize).toContain(
      "ALTER TABLE audit_chain_head OWNER TO echo_maze_audit_owner"
    );
    expect(finalize).toContain(
      "REVOKE CREATE ON SCHEMA public FROM echo_maze_audit_owner"
    );
    expect(finalize).toContain(
      "REVOKE ALL ON TABLE audit_events FROM echo_maze_runtime"
    );
    expect(finalize).toContain(
      "GRANT SELECT ON TABLE audit_events TO echo_maze_runtime"
    );
    expect(finalize).toContain(
      "GRANT EXECUTE ON FUNCTION append_audit_event(TEXT) TO echo_maze_runtime"
    );
    expect(finalize).toContain(
      "REVOKE EXECUTE ON FUNCTION append_audit_event(TEXT) FROM PUBLIC"
    );
    expect(finalize).not.toContain("GRANT INSERT ON TABLE audit_events");
    expect(finalize).not.toContain("GRANT UPDATE ON TABLE audit_chain_head");
  });
});

describe("Classroom forced-RLS foundation migration", () => {
  it("adds nullable Classroom scope while preserving one Personal Play record", async () => {
    const sql = await readFile(
      new URL(
        "../db/migrations/0014_classroom_rls_foundation.sql",
        import.meta.url
      ),
      "utf8"
    );

    expect(sql).toContain("CREATE TABLE classrooms");
    expect(sql).toContain("CREATE TABLE classroom_memberships");
    expect(sql).toContain(
      "REFERENCES player_access(clerk_user_id) ON DELETE CASCADE"
    );
    expect(sql).toContain("role IN ('teacher', 'student')");
    expect(sql).toContain("ADD COLUMN classroom_id TEXT");
    expect(sql).toContain(
      "UNIQUE NULLS NOT DISTINCT (clerk_user_id, classroom_id)"
    );
    expect(sql.match(
      /FOREIGN KEY \(classroom_id, clerk_user_id\)/g
    )).toHaveLength(2);
    expect(sql.match(
      /REFERENCES classroom_memberships\(classroom_id, clerk_user_id\)[\s\S]*?ON DELETE CASCADE/g
    )).toHaveLength(2);
    expect(sql).toContain("CREATE ROLE echo_maze_tenant_owner NOLOGIN");
    expect(sql).toContain(
      "ALTER TABLE cloud_quest_progress ENABLE ROW LEVEL SECURITY"
    );
    expect(sql).toContain(
      "ALTER TABLE cloud_quest_progress FORCE ROW LEVEL SECURITY"
    );
    expect(sql).toContain(
      "ALTER TABLE learning_journals ENABLE ROW LEVEL SECURITY"
    );
    expect(sql).toContain(
      "ALTER TABLE learning_journals FORCE ROW LEVEL SECURITY"
    );
    expect(sql).toContain(
      "current_setting('echo_maze.explorer_id', true)"
    );
    expect(sql).toContain(
      "current_setting('echo_maze.classroom_id', true)"
    );
    expect(sql).toContain("ALTER TABLE classrooms OWNER TO echo_maze_tenant_owner");
    expect(sql).toContain(
      "ALTER TABLE classroom_memberships OWNER TO echo_maze_tenant_owner"
    );
    expect(sql).toContain(
      "REVOKE CREATE ON SCHEMA public FROM echo_maze_tenant_owner"
    );
    expect(sql).toContain(
      "GRANT SELECT ON TABLE classrooms, classroom_memberships"
    );
    expect(sql).not.toContain("BYPASSRLS");
  });
});

describe("Classroom authority synchronization migration", () => {
  it("adds monotonic narrow definer writes without runtime table grants", async () => {
    const sql = await readFile(
      new URL(
        "../db/migrations/0015_classroom_authority_and_writes.sql",
        import.meta.url
      ),
      "utf8"
    );

    expect(sql).toContain("CREATE TABLE classroom_authority_versions");
    expect(sql).toContain("event_timestamp BIGINT NOT NULL");
    expect(sql).toContain("CREATE FUNCTION sync_classroom(");
    expect(sql).toContain("CREATE FUNCTION delete_classroom(");
    expect(sql).toContain("CREATE FUNCTION sync_classroom_membership(");
    expect(sql).toContain("CREATE FUNCTION delete_classroom_membership(");
    expect(sql.match(/SECURITY DEFINER/g)).toHaveLength(4);
    expect(sql.match(/SET search_path = pg_catalog, public/g)).toHaveLength(4);
    expect(sql).toContain("EXCLUDED.event_timestamp >");
    expect(sql).toContain(
      "pg_advisory_xact_lock(hashtextextended(p_user_id, 0))"
    );
    expect(sql).toContain(
      "public.classroom_authority_versions.deleted = FALSE"
    );
    expect(sql).toContain("p_role = 'student'");
    expect(sql).toContain("deleted_user_tombstones");
    expect(sql).toContain("sha256(convert_to(p_user_id, 'UTF8'))");
    expect(sql).toContain("REVOKE ALL ON FUNCTION sync_classroom");
    expect(sql).toContain("GRANT EXECUTE ON FUNCTION sync_classroom");
    expect(sql).not.toContain(
      "GRANT INSERT ON TABLE classrooms TO echo_maze_runtime"
    );
    expect(sql).not.toContain(
      "GRANT INSERT ON TABLE classroom_memberships TO echo_maze_runtime"
    );
    expect(sql).not.toContain("BYPASSRLS");
    expect(sql).toContain("ADD COLUMN classroom_id TEXT");
    expect(sql).toContain(
      "ALTER TABLE score_entries FORCE ROW LEVEL SECURITY"
    );
    expect(sql).toContain("score_entries_classroom_write");
    expect(sql).toContain("score_entries_classroom_read");
    expect(sql).toContain("score_entries_idempotent_update");
  });
});

describe("Regional shared-score partition migration", () => {
  it("backfills legacy rows into Classic Rules without touching Verified Daily", async () => {
    const sql = await readFile(
      new URL(
        "../db/migrations/0019_score_entry_ruleset_partitions.sql",
        import.meta.url
      ),
      "utf8"
    );

    expect(sql).toContain("ADD COLUMN atlas_region_id");
    expect(sql).toContain("ADD COLUMN ruleset_revision");
    expect(sql).toContain("ruleset_revision = 'classic-v1'");
    expect(sql).toContain("labyrinth_number BETWEEN 1 AND 4");
    expect(sql).toContain("score_entries_partition_ranking_idx");
    expect(sql).toContain("CHECK (");
    expect(sql).toContain("echo-hush-v1");
    expect(sql).toContain("warden-bells-v1");
    expect(sql).not.toContain("verified_daily");
    expect(sql).not.toMatch(/\bDELETE\b/);
  });
});

describe("Classroom Teacher read boundary migration", () => {
  it("projects journals into count-only rows behind one bounded definer read", async () => {
    const sql = await readFile(
      new URL(
        "../db/migrations/0016_classroom_teacher_progress.sql",
        import.meta.url
      ),
      "utf8"
    );

    expect(sql).toContain("CREATE TABLE classroom_progress_counts");
    expect(sql).toContain(
      "CREATE FUNCTION refresh_classroom_progress_counts()"
    );
    expect(sql).toContain(
      "CREATE TRIGGER learning_journals_refresh_classroom_progress_counts"
    );
    expect(sql.match(/SECURITY DEFINER/g)).toHaveLength(2);
    expect(sql.match(/SET search_path = pg_catalog, public/g)).toHaveLength(2);
    expect(sql).toContain(
      "ALTER TABLE classroom_progress_counts FORCE ROW LEVEL SECURITY"
    );
    expect(sql).toContain("classroom_progress_counts_teacher_read");
    expect(sql).toContain(
      "classroom_progress_counts_tenant_owner_insert"
    );
    expect(sql).toContain(
      "classroom_progress_counts_tenant_owner_delete"
    );
    expect(sql).not.toContain(
      "classroom_progress_counts_tenant_owner_write"
    );
    expect(sql).toContain("CREATE FUNCTION read_classroom_progress");
    expect(sql).toContain("role = 'teacher'");
    expect(sql).toContain("role = 'student'");
    expect(sql).toContain("learningObjectiveId");
    expect(sql).toContain("COUNT(*) FILTER");
    expect(sql).toContain("COUNT(*) OVER () > 500 AS truncated");
    expect(sql).toContain("LIMIT 500");
    expect(sql).toContain(
      "REVOKE ALL ON FUNCTION read_classroom_progress(TEXT) FROM PUBLIC"
    );
    expect(sql).toContain(
      "GRANT EXECUTE ON FUNCTION read_classroom_progress(TEXT)"
    );
    expect(sql).not.toContain(
      "GRANT SELECT ON TABLE learning_journals TO echo_maze_runtime"
    );
    expect(sql).not.toContain(
      "GRANT SELECT ON TABLE classroom_progress_counts TO echo_maze_runtime"
    );
    expect(sql).not.toMatch(/\bstudent_id\b/);
    expect(sql).not.toMatch(/prompt|answer_text|selected_answer/i);
    expect(sql).not.toContain("BYPASSRLS");
  });
});
