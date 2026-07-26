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
});
