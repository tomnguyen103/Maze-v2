import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const migrationUrl = new URL(
  "../db/migrations/0026_echo_fossil_collections.sql",
  import.meta.url
);

describe("Echo Fossil migration", () => {
  it("creates a personal forced-RLS collection with a bounded payload", async () => {
    const sql = await readFile(migrationUrl, "utf8");

    expect(sql).toContain("BEGIN;");
    expect(sql.trimEnd()).toMatch(/COMMIT;\s*$/);
    expect(sql).toContain("CREATE TABLE echo_fossil_collections");
    expect(sql).toContain("REFERENCES player_access(clerk_user_id) ON DELETE CASCADE");
    expect(sql).toContain("jsonb_array_length(collection->'fossils') <= 40");
    expect(sql).toContain("ENABLE ROW LEVEL SECURITY");
    expect(sql).toContain("FORCE ROW LEVEL SECURITY");
    expect(sql).toContain("echo_fossil_collections_explorer_scope");
    expect(sql).toContain("REVOKE ALL ON TABLE echo_fossil_collections");
    expect(sql).toContain("GRANT SELECT, INSERT, UPDATE, DELETE");
  });
});
