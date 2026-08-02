import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import {
  constellationExpiresAt,
  isConstellationReadable
} from "../shared/constellation.js";
import { createConstellationStore } from "../server/constellation-store.js";
import { buildUserExport, EXPORT_SCHEMA_ID } from "../server/data-export.js";

const DAILY = "2026-07-26";

/**
 * A pool that still holds an expired Daily because the prune job has not run.
 * Its rows are exactly what an unguarded read would serve.
 *
 * @param {{ published?: number, markers?: Record<string, unknown>[] }} [rows]
 */
function unprunedPool({ published = 40, markers = undefined } = {}) {
  /** @type {string[]} */
  const statements = [];
  return {
    statements,
    /** @param {string} sql @param {unknown[]} [values] */
    query: vi.fn(async (sql, values) => {
      statements.push(sql);
      void values;
      if (sql.includes("read_daily_trail_summary")) {
        return { rows: [{ published_contributors: published }] };
      }
      if (sql.includes("read_daily_trail_constellation")) {
        return {
          rows: markers ?? [
            {
              marker_kind: "cell",
              grid_x: 1,
              grid_y: 1,
              published_count: 30
            }
          ]
        };
      }
      if (sql.includes("prune_daily_trail_constellation")) {
        return { rows: [{ pruned_totals: 2, pruned_contributions: 7 }] };
      }
      return { rows: [] };
    })
  };
}

describe("Constellation 48-hour window", () => {
  it("expires a Daily 48 hours after its UTC day closes", () => {
    expect(constellationExpiresAt(DAILY)).toBe("2026-07-29T00:00:00.000Z");
  });

  it("stays readable to the last instant and not one after", () => {
    expect(
      isConstellationReadable(DAILY, new Date("2026-07-28T23:59:59.999Z"))
    ).toBe(true);
    expect(
      isConstellationReadable(DAILY, new Date("2026-07-29T00:00:00.000Z"))
    ).toBe(false);
  });

  it("never serves an unpruned expired row", async () => {
    const pool = unprunedPool();

    const live = await createConstellationStore(pool, {
      now: () => new Date("2026-07-28T12:00:00.000Z")
    }).readProjection(DAILY);
    expect(live.published).toBe(true);
    expect(live.markers).toHaveLength(1);

    pool.statements.length = 0;
    const expired = await createConstellationStore(pool, {
      now: () => new Date("2026-07-29T00:00:01.000Z")
    }).readProjection(DAILY);
    expect(expired).toEqual({ published: false, markers: [] });
    // The guard short-circuits before any read, so an expired Daily cannot be
    // served even by a database whose own filter was somehow bypassed.
    expect(pool.statements).toEqual([]);
  });

  it("keeps no historical archive for an expired Daily to fall back to", async () => {
    const sql = readFileSync(
      new URL(
        "../db/migrations/0023_daily_trail_constellation.sql",
        import.meta.url
      ),
      "utf8"
    );

    // Three tables, all carrying the same generated expiry, and the prune
    // deletes from the two roots. Nothing copies a row anywhere else, so once
    // the window closes there is no surviving record to serve.
    expect(sql.match(/CREATE TABLE /g)).toHaveLength(3);
    expect(sql).not.toMatch(/archive|history|_snapshot\b/i);
    const prune = sql.slice(
      sql.indexOf("CREATE FUNCTION prune_daily_trail_constellation")
    );
    expect(prune).toContain("DELETE FROM public.daily_trail_constellation_totals");
    expect(prune).toContain("DELETE FROM public.daily_trail_contributions");
  });

  it("prunes both classes of row and is safe to run again", async () => {
    const pool = unprunedPool();
    const store = createConstellationStore(pool);

    await expect(store.prune()).resolves.toEqual({
      prunedTotals: 2,
      prunedContributions: 7
    });
    pool.query.mockResolvedValueOnce({
      rows: [{ pruned_totals: 0, pruned_contributions: 0 }]
    });
    await expect(store.prune()).resolves.toEqual({
      prunedTotals: 0,
      prunedContributions: 0
    });
  });
});

describe("Constellation export section", () => {
  it("advances the export schema id to version 4", () => {
    const schema = JSON.parse(
      readFileSync(
        new URL("../shared/export-schema.json", import.meta.url),
        "utf8"
      )
    );

    expect(EXPORT_SCHEMA_ID).toBe("echo-maze-export/5");
    expect(schema.$id).toBe("echo-maze-export/5");
    expect(schema.properties.schema.const).toBe("echo-maze-export/5");
    expect(schema.properties.data.required).toContain(
      "daily_trail_contributions"
    );
  });

  it("exports the receipt through its expiry-guarded definer reader", async () => {
    /** @type {string[]} */
    const queries = [];
    await buildUserExport(
      {
        /** @param {string} sql */
        async query(sql) {
          queries.push(sql);
          return { rows: [] };
        }
      },
      "user_export_1",
      { now: () => "2026-07-27T00:00:00.000Z" }
    );

    const section = queries.find((sql) =>
      sql.includes("read_own_daily_trail_contributions()")
    );
    expect(section).toBeDefined();
    expect(section).not.toContain("grid_");
    expect(section).not.toContain("marker");
  });

  it("carries the receipt and nothing that could describe a path", async () => {
    const adapter = {
      /** @param {string} sql */
      async query(sql) {
        if (sql.includes("read_own_daily_trail_contributions")) {
          return {
            rows: [
              { daily_date: DAILY, contributed_at: "2026-07-26T09:00:00.000Z" }
            ]
          };
        }
        return { rows: [] };
      }
    };

    const exported = await buildUserExport(adapter, "user_export_1", {
      now: () => "2026-07-27T00:00:00.000Z"
    });

    expect(exported.data.daily_trail_contributions).toEqual([
      { daily_date: DAILY, contributed_at: "2026-07-26T09:00:00.000Z" }
    ]);
    const serialized = JSON.stringify(exported.data.daily_trail_contributions);
    expect(serialized).not.toMatch(/grid|marker|band|elapsed|seed/i);
  });
});
