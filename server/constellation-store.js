import {
  CONSTELLATION_MARKER_THRESHOLD,
  isConstellationReadable,
  projectConstellation,
  shouldPublishBatch
} from "../shared/constellation.js";
import { withTenantContext } from "./tenant-context.js";

/**
 * @typedef {import("./constellation-markers.js").TrailMarker} TrailMarker
 * @param {{
 *   query: (
 *     sql: string,
 *     values?: unknown[]
 *   ) => Promise<{ rows: Record<string, unknown>[] }>,
 *   connect?: () => Promise<{
 *     query: (
 *       sql: string,
 *       values?: unknown[]
 *     ) => Promise<{ rows: Record<string, unknown>[] }>,
 *     release: (destroy?: boolean) => void
 *   }>
 * }} pool
 */
export function createConstellationStore(pool) {
  return {
    /**
     * Aggregates one verified escape. The marker set arrives already derived
     * in request memory; the Run Action Log itself never reaches this module.
     *
     * @param {string} userId
     * @param {string} date
     * @param {TrailMarker[]} markers
     */
    async recordContribution(userId, date, markers) {
      if (!pool.connect) {
        throw new Error("Constellation aggregation requires a transactional pool.");
      }
      const transactionalPool =
        /** @type {typeof pool & { connect: NonNullable<typeof pool.connect> }} */ (
          pool
        );
      return withTenantContext(
        transactionalPool,
        { explorerId: userId, classroomId: null },
        async (database) => {
          const recorded = await database.query(
            `SELECT
               contributed,
               contributor_count,
               published_contributor_count
             FROM record_daily_trail_contribution($1::date, $2::jsonb)`,
            [date, JSON.stringify(markers)]
          );
          const row = recorded.rows[0];
          if (!row || row.contributed !== true) {
            return { contributed: false };
          }
          if (
            shouldPublishBatch({
              contributors: Number(row.contributor_count),
              published: Number(row.published_contributor_count)
            })
          ) {
            await database.query(
              "SELECT publish_daily_trail_batch($1::date)",
              [date]
            );
          }
          return { contributed: true };
        }
      );
    },

    /**
     * The published projection for one Daily. Anyone who has escaped may read
     * it, including a Guest, so this deliberately carries no tenant context.
     *
     * @param {string} date
     * @param {{ now?: () => Date }} [options]
     */
    async readProjection(date, { now = () => new Date() } = {}) {
      // The prune job is the housekeeping half of the 48-hour guarantee; this
      // is the half that holds even when the job has not run, so an unpruned
      // row is never served.
      if (!isConstellationReadable(date, now())) {
        return { published: false, markers: [] };
      }
      const [summary, counters] = await Promise.all([
        pool.query(
          "SELECT read_daily_trail_summary($1::date) AS published_contributors",
          [date]
        ),
        pool.query(
          `SELECT marker_kind, grid_x, grid_y, contributor_count
           FROM read_daily_trail_constellation($1::date, $2)`,
          [date, CONSTELLATION_MARKER_THRESHOLD]
        )
      ]);
      return projectConstellation({
        publishedContributors: Number(
          summary.rows[0]?.published_contributors ?? 0
        ),
        markers: counters.rows.map((row) => ({
          kind: /** @type {TrailMarker["kind"]} */ (String(row.marker_kind)),
          x: Number(row.grid_x),
          y: Number(row.grid_y),
          contributorCount: Number(row.contributor_count)
        }))
      });
    },

    /**
     * The Explorer's own contribution receipts, for the self-service export.
     *
     * @param {string} userId
     */
    async readOwnContributions(userId) {
      if (!pool.connect) {
        throw new Error("Constellation export requires a transactional pool.");
      }
      const transactionalPool =
        /** @type {typeof pool & { connect: NonNullable<typeof pool.connect> }} */ (
          pool
        );
      return withTenantContext(
        transactionalPool,
        { explorerId: userId, classroomId: null },
        async (database) => {
          const result = await database.query(
            `SELECT daily_date, contributed_at
             FROM read_own_daily_trail_contributions()`
          );
          return result.rows.map((row) => ({
            dailyDate: String(row.daily_date).slice(0, 10),
            contributedAt: new Date(
              /** @type {string} */ (row.contributed_at)
            ).toISOString()
          }));
        }
      );
    },

    /** Hard-deletes every Constellation row past its 48-hour window. */
    async prune() {
      const result = await pool.query(
        `SELECT pruned_totals, pruned_contributions
         FROM prune_daily_trail_constellation()`
      );
      return {
        prunedTotals: Number(result.rows[0]?.pruned_totals ?? 0),
        prunedContributions: Number(result.rows[0]?.pruned_contributions ?? 0)
      };
    }
  };
}
