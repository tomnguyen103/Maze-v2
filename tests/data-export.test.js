import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  buildUserExport,
  EXPORT_SCHEMA_ID,
  exportUserSnapshot
} from "../server/data-export.js";

const USER = "user_export_1";
const OTHER = "user_other_2";

/**
 * Adapter with one fixture row per user-owned table, keyed strictly by the
 * bound user id — a query for anyone else gets nothing, which is what the
 * cross-user-leak test relies on.
 */
function fixtureAdapter() {
  /** @type {string[]} */
  const queries = [];
  const rowsByTable = {
    players: {
      username: "Moss Runner",
      explorer_palette: "teal",
      playground_palette: "daylight",
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-02T00:00:00.000Z"
    },
    score_entries: {
      classroom_id: "org_export_1",
      level_id: "trail-scout",
      labyrinth_number: 4,
      seed: "DAYLIGHT-0",
      wardens_defeated: 2,
      echoes_collected: 3,
      moves: 81,
      elapsed_ms: 92000,
      score: 900,
      escaped: true,
      created_at: "2026-01-03T00:00:00.000Z"
    },
    player_access: {
      free_runs_used: 2,
      membership_state: "active",
      entitlement_updated_at: "2026-01-04T00:00:00.000Z",
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-04T00:00:00.000Z"
    },
    run_access_grants: {
      run_id: "access_run_1",
      seed: "DAYLIGHT-0",
      level_id: "trail-scout",
      labyrinth_number: 4,
      grant_source: "lifetime",
      created_at: "2026-01-04T00:00:00.000Z"
    },
    lifetime_purchases: {
      id: "11111111-1111-4111-8111-111111111111",
      checkout_session_id: "cs_test_1",
      payment_intent_id: "pi_test_1",
      stripe_price_id: "price_test_1",
      amount: 599,
      currency: "usd",
      status: "paid",
      paid_at: "2026-01-04T00:00:00.000Z",
      refunded_at: null,
      disputed_at: null,
      created_at: "2026-01-04T00:00:00.000Z",
      updated_at: "2026-01-04T00:00:00.000Z"
    },
    classroom_memberships: {
      classroom_id: "org_export_1",
      clerk_membership_id: "orgmem_export_1",
      role: "student",
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-05T00:00:00.000Z"
    },
    cloud_quest_progress: {
      quest_id: "quest_export_123",
      level_id: "trail-scout",
      labyrinth_number: 5,
      completed_labyrinths: 4,
      used_map_fingerprints: [],
      used_question_ids: ["scout-foundation-0"],
      next_question_ordinal: 8,
      complete: false,
      revision: 3,
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-05T00:00:00.000Z"
    },
    learning_journals: {
      journal: { version: 1, events: [{ outcome: "correct" }] },
      clear_generation: 1,
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-05T00:00:00.000Z"
    },
    explorer_access_settings: {
      schema_version: 1,
      high_contrast: true,
      large_marks: false,
      reader_friendly_questions: true,
      reduced_effects: false,
      revision: 2,
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-05T00:00:00.000Z"
    },
    verified_daily_submissions: {
      daily_date: "2026-07-26",
      daily_version: 1,
      score: 900,
      wardens_defeated: 2,
      echoes_collected: 4,
      moves: 76,
      elapsed_ms: 7600,
      best_result: "created",
      response_score: 900,
      response_moves: 76,
      verified_at: "2026-07-26T12:00:00.000Z"
    },
    verified_daily_entries: {
      daily_date: "2026-07-26",
      daily_version: 1,
      score: 900,
      wardens_defeated: 2,
      echoes_collected: 4,
      moves: 76,
      elapsed_ms: 7600,
      achieved_at: "2026-07-26T12:00:00.000Z"
    },
    user_roles: { role: "moderator" }
  };
  return {
    queries,
    /**
     * @param {string} sql
     * @param {unknown[]} [values]
     */
    async query(sql, values) {
      queries.push(sql);
      const table = Object.keys(rowsByTable).find((name) =>
        sql.includes(` FROM ${name}`)
      );
      if (!table || values?.[0] !== USER) {
        return { rows: [] };
      }
      if (table === "score_entries" && typeof values?.[1] !== "string") {
        return { rows: [] };
      }
      /** @type {Record<string, unknown>} */
      const fixture = {
        ...rowsByTable[/** @type {keyof typeof rowsByTable} */ (table)]
      };
      if (
        typeof values?.[1] === "string" &&
        (
          table === "score_entries" ||
          table === "cloud_quest_progress" ||
          table === "learning_journals"
        )
      ) {
        fixture.classroom_id = values[1];
      }
      return {
        rows: [
          /** @type {Record<string, unknown>} */ (fixture)
        ]
      };
    }
  };
}

describe("buildUserExport", () => {
  it("wraps every user-owned table in the versioned envelope", async () => {
    const adapter = fixtureAdapter();
    const generatedAt = "2026-07-27T00:00:00.000Z";
    const exported = await buildUserExport(adapter, USER, {
      now: () => generatedAt
    });

    expect(exported.schema).toBe(EXPORT_SCHEMA_ID);
    expect(exported.generated_at).toBe(generatedAt);
    expect(exported.data.profile).toMatchObject({ username: "Moss Runner" });
    expect(exported.data.scores).toHaveLength(1);
    expect(exported.data.scores[0]).toMatchObject({
      classroom_id: "org_export_1",
      score: 900
    });
    expect(exported.data.run_access.access).toMatchObject({
      membership_state: "active"
    });
    expect(exported.data.run_access.grants).toHaveLength(1);
    expect(exported.data.lifetime_purchases[0]).toMatchObject({
      checkout_session_id: "cs_test_1",
      status: "paid"
    });
    expect(exported.data.classroom_memberships).toEqual([
      expect.objectContaining({ classroom_id: "org_export_1" })
    ]);
    expect(exported.data.quest_progress).toMatchObject({
      quest_id: "quest_export_123"
    });
    expect(exported.data.journal).toMatchObject({ clear_generation: 1 });
    expect(exported.data.class_quest_progress).toEqual([
      expect.objectContaining({
        classroom_id: "org_export_1",
        quest_id: "quest_export_123"
      })
    ]);
    expect(exported.data.class_journals).toEqual([
      expect.objectContaining({
        classroom_id: "org_export_1",
        clear_generation: 1
      })
    ]);
    expect(exported.data.access_settings).toMatchObject({
      high_contrast: true,
      revision: 2
    });
    expect(exported.data.verified_daily_results).toEqual([
      expect.objectContaining({
        daily_date: "2026-07-26",
        score: 900,
        moves: 76,
        best_result: "created",
        response_score: 900,
        response_moves: 76
      })
    ]);
    expect(exported.data.verified_daily_best_results).toEqual([
      expect.objectContaining({
        daily_date: "2026-07-26",
        score: 900,
        moves: 76,
        achieved_at: "2026-07-26T12:00:00.000Z"
      })
    ]);
    expect(exported.data.role).toBe("moderator");
  });

  it("exports empty sections after deletion, never another Explorer's data", async () => {
    const adapter = fixtureAdapter();
    const exported = await buildUserExport(adapter, OTHER, {
      now: () => "2026-07-27T00:00:00.000Z"
    });

    expect(exported.data.profile).toBeNull();
    expect(exported.data.scores).toEqual([]);
    expect(exported.data.run_access).toEqual({ access: null, grants: [] });
    expect(exported.data.lifetime_purchases).toEqual([]);
    expect(exported.data.classroom_memberships).toEqual([]);
    expect(exported.data.quest_progress).toBeNull();
    expect(exported.data.journal).toBeNull();
    expect(exported.data.class_quest_progress).toEqual([]);
    expect(exported.data.class_journals).toEqual([]);
    expect(exported.data.access_settings).toBeNull();
    expect(exported.data.verified_daily_results).toEqual([]);
    expect(exported.data.verified_daily_best_results).toEqual([]);
    expect(exported.data.role).toBe("player");
    expect(JSON.stringify(exported)).not.toContain("Moss Runner");
  });

  it("binds every query to the requesting user", async () => {
    const adapter = fixtureAdapter();
    await buildUserExport(adapter, USER, { now: () => "x" });
    for (const sql of adapter.queries) {
      expect(sql).toContain("$1");
    }
    // Personal sections plus three Classroom-scoped sections.
    expect(adapter.queries).toHaveLength(15);
  });

  // Structural pinning only: envelope keys, section set, and $id. The
  // schema's per-section constraints (additionalProperties, the role enum)
  // are documentation for external consumers — enforcing them here would
  // need a JSON-Schema engine, which is not an allowed dependency.
  it("matches the checked-in export schema", async () => {
    const schema = JSON.parse(
      readFileSync(
        new URL("../shared/export-schema.json", import.meta.url),
        "utf8"
      )
    );
    const exported = await buildUserExport(fixtureAdapter(), USER, {
      now: () => "2026-07-27T00:00:00.000Z"
    });
    expect(schema.$id).toBe(EXPORT_SCHEMA_ID);
    expect(schema.required).toEqual(["schema", "generated_at", "data"]);
    const sectionNames = Object.keys(schema.properties.data.properties);
    expect(Object.keys(exported.data).sort()).toEqual(sectionNames.sort());
    expect(schema.properties.data.required.sort()).toEqual(
      sectionNames.sort()
    );
  });
});

describe("exportUserSnapshot", () => {
  function fakeSnapshotPool({
    failOn = "",
    failRollback = false
  } = {}) {
    /** @type {string[]} */
    const statements = [];
    /** @type {unknown[][]} */
    const parameters = [];
    /** @type {boolean | undefined} */
    let released;
    const client = {
      async query(/** @type {string} */ sql, /** @type {unknown[]} */ values) {
        statements.push(sql.split(/\s+/).slice(0, 2).join(" "));
        parameters.push(values ?? []);
        if (failRollback && sql === "ROLLBACK") {
          throw new Error("rollback failed");
        }
        if (failOn && sql.includes(failOn)) {
          throw new Error("boom");
        }
        return { rows: [] };
      },
      release(destroy = false) {
        released = destroy;
      }
    };
    return {
      statements,
      parameters,
      releasedWith: () => released,
      async connect() {
        return client;
      }
    };
  }

  it("wraps every section read in one repeatable-read snapshot", async () => {
    const pool = fakeSnapshotPool();
    const exported = await exportUserSnapshot(
      /** @type {import("pg").Pool} */ (/** @type {unknown} */ (pool)),
      "user_snapshot_1",
      { now: () => "2026-07-27T00:00:00.000Z" }
    );
    expect(pool.statements[0]).toBe("BEGIN TRANSACTION");
    expect(pool.statements[1]).toBe("SELECT set_config('echo_maze.explorer_id',");
    expect(pool.parameters[1]).toEqual(["user_snapshot_1", ""]);
    expect(pool.statements.at(-1)).toBe("COMMIT");
    // Context plus 12 section reads between BEGIN and COMMIT.
    expect(pool.statements).toHaveLength(15);
    expect(pool.releasedWith()).toBe(false);
    expect(exported.schema).toBe(EXPORT_SCHEMA_ID);
  });

  it("rolls back and releases when a section read fails", async () => {
    const pool = fakeSnapshotPool({ failOn: "FROM players" });
    await expect(
      exportUserSnapshot(
        /** @type {import("pg").Pool} */ (/** @type {unknown} */ (pool)),
        "user_snapshot_1"
      )
    ).rejects.toThrow("boom");
    expect(pool.statements.at(-1)).toBe("ROLLBACK");
    expect(pool.releasedWith()).toBe(false);
  });

  it("destroys the pooled client when snapshot rollback fails", async () => {
    const pool = fakeSnapshotPool({
      failOn: "FROM players",
      failRollback: true
    });
    await expect(
      exportUserSnapshot(
        /** @type {import("pg").Pool} */ (/** @type {unknown} */ (pool)),
        "user_snapshot_1"
      )
    ).rejects.toThrow("boom");
    expect(pool.releasedWith()).toBe(true);
  });
});
