import { setTenantContext } from "./tenant-context.js";

export const EXPORT_SCHEMA_ID = "echo-maze-export/3";

/**
 * Snapshot variant: every section reads from ONE repeatable-read snapshot,
 * so a concurrent save or deletion cannot produce an export whose sections
 * describe different moments.
 *
 * @param {import("pg").Pool} pool
 * @param {string} userId
 * @param {{ now?: () => string }} [options]
 */
export async function exportUserSnapshot(pool, userId, options) {
  const client = await pool.connect();
  let released = false;
  try {
    await client.query(
      "BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY"
    );
    await setTenantContext(client, {
      explorerId: userId,
      classroomId: null
    });
    const exported = await buildUserExport(
      {
        query: async (sql, values) => {
          const result = await client.query(sql, values);
          return {
            rows: /** @type {Record<string, unknown>[]} */ (result.rows)
          };
        },
        selectClassroom: (classroomId) => setTenantContext(client, {
          explorerId: userId,
          classroomId
        })
      },
      userId,
      options
    );
    await client.query("COMMIT");
    return exported;
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch {
      client.release(true);
      released = true;
    }
    throw error;
  } finally {
    if (!released) {
      client.release();
    }
  }
}

/**
 * Every column each section exports is named explicitly: an export must never
 * grow a column by accident just because a migration added one. Notably
 * absent on purpose: `idempotency_key` (a client-generated dedup token, not
 * player data) and any raw payment data (none is stored — Stripe identifiers
 * only, per the Lifetime Membership design).
 */
const SECTION_QUERIES = {
  profile: `SELECT username, explorer_palette, playground_palette,
      created_at, updated_at
    FROM players WHERE clerk_user_id = $1`,
  personal_scores: `SELECT classroom_id, level_id, labyrinth_number, seed,
      atlas_region_id, ruleset_revision,
      wardens_defeated, echoes_collected, moves, elapsed_ms, score, escaped,
      created_at
    FROM score_entries
    WHERE player_id = $1 AND classroom_id IS NULL
    ORDER BY created_at, id`,
  class_scores: `SELECT classroom_id, level_id, labyrinth_number, seed,
      atlas_region_id, ruleset_revision,
      wardens_defeated,
      echoes_collected, moves, elapsed_ms, score, escaped, created_at
    FROM score_entries
    WHERE player_id = $1 AND classroom_id = $2
    ORDER BY created_at, id`,
  access: `SELECT free_runs_used, membership_state, entitlement_updated_at,
      created_at, updated_at
    FROM player_access WHERE clerk_user_id = $1`,
  grants: `SELECT run_id, seed, level_id, labyrinth_number, grant_source,
      created_at
    FROM run_access_grants WHERE player_id = $1 ORDER BY created_at, id`,
  lifetime_purchases: `SELECT id, checkout_session_id, payment_intent_id,
      stripe_price_id, amount, currency, status, paid_at, refunded_at,
      disputed_at, created_at, updated_at
    FROM lifetime_purchases WHERE player_id = $1 ORDER BY created_at`,
  classroom_memberships: `SELECT classroom_id, clerk_membership_id, role,
      created_at, updated_at
    FROM classroom_memberships
    WHERE clerk_user_id = $1 ORDER BY created_at, classroom_id`,
  quest_progress: `SELECT quest_id, level_id, learning_deck_id,
      learning_deck_revision, labyrinth_number,
      completed_labyrinths, used_map_fingerprints, used_question_ids,
      next_question_ordinal, complete, revision, created_at, updated_at
    FROM cloud_quest_progress
    WHERE clerk_user_id = $1 AND classroom_id IS NULL`,
  class_quest_progress: `SELECT classroom_id, quest_id, level_id,
      learning_deck_id, learning_deck_revision,
      labyrinth_number, completed_labyrinths, used_map_fingerprints,
      used_question_ids, next_question_ordinal, complete, revision,
      created_at, updated_at
    FROM cloud_quest_progress
    WHERE clerk_user_id = $1 AND classroom_id = $2`,
  journal: `SELECT journal, clear_generation, created_at, updated_at
    FROM learning_journals
    WHERE clerk_user_id = $1 AND classroom_id IS NULL`,
  class_journal: `SELECT classroom_id, journal, clear_generation, created_at,
      updated_at
    FROM learning_journals
    WHERE clerk_user_id = $1 AND classroom_id = $2`,
  class_run_grants: `SELECT expedition_id, labyrinth_number, run_id, status,
      created_at, updated_at
    FROM classroom_run_grants
    WHERE clerk_user_id = $1 AND classroom_id = $2
    ORDER BY expedition_id, labyrinth_number`,
  class_expedition_seats: "SELECT * FROM read_own_class_expedition_seats()",
  class_expedition_licenses:
    "SELECT * FROM read_own_class_expedition_licenses()",
  access_settings: `SELECT schema_version, high_contrast, large_marks,
      reader_friendly_questions, reduced_effects, trail_compass_enabled,
      narration_pace, revision, created_at,
      updated_at
    FROM explorer_access_settings WHERE clerk_user_id = $1`,
  verified_daily_results: `SELECT daily_date, daily_version, score,
      wardens_defeated, echoes_collected, moves, elapsed_ms, best_result,
      response_score, response_moves, verified_at
    FROM verified_daily_submissions
    WHERE player_id = $1
    ORDER BY daily_date, verified_at`,
  verified_daily_best_results: `SELECT daily_date, daily_version, score,
      wardens_defeated, echoes_collected, moves, elapsed_ms, achieved_at
    FROM verified_daily_entries
    WHERE player_id = $1
    ORDER BY daily_date, achieved_at`,
  role: `SELECT role FROM user_roles WHERE user_id = $1`
};

/**
 * Builds one Explorer's complete personal-data export. Every query binds the
 * requesting user id, so the function cannot return anyone else's rows, and
 * a deleted account yields empty sections rather than an error.
 *
 * Composable on purpose, and NOT the thing a route should wire: on a plain
 * adapter these reads are multiple statements, so a concurrent save or
 * deletion could produce sections describing different moments. Route through
 * `exportUserSnapshot`, which supplies a single-snapshot adapter. The seam
 * exists so tests can drive a fake adapter and so phase 7's admin export can
 * reuse the same section list.
 *
 * @param {{
 *   query: (sql: string, values?: unknown[]) => Promise<{
 *     rows: Record<string, unknown>[]
 *   }>,
 *   selectClassroom?: (classroomId: string) => Promise<void>
 * }} adapter
 * @param {string} userId
 * @param {{ now?: () => string }} [options]
 */
export async function buildUserExport(
  adapter,
  userId,
  { now = () => new Date().toISOString() } = {}
) {
  /**
   * @param {keyof typeof SECTION_QUERIES} section
   * @param {unknown[]} [values]
   */
  const rowsOf = async (section, values = [userId]) =>
    (await adapter.query(SECTION_QUERIES[section], values)).rows;

  const profile = await rowsOf("profile");
  const personalScores = await rowsOf("personal_scores");
  const access = await rowsOf("access");
  const grants = await rowsOf("grants");
  const lifetimePurchases = await rowsOf("lifetime_purchases");
  const classroomMemberships = await rowsOf("classroom_memberships");
  const personalQuestProgress = await rowsOf("quest_progress");
  const personalJournal = await rowsOf("journal");
  const accessSettings = await rowsOf("access_settings");
  const verifiedDailyResults = await rowsOf("verified_daily_results");
  const verifiedDailyBestResults = await rowsOf(
    "verified_daily_best_results"
  );
  const role = await rowsOf("role");

  /** @type {Record<string, unknown>[]} */
  const classQuestProgress = [];
  /** @type {Record<string, unknown>[]} */
  const classJournals = [];
  /** @type {Record<string, unknown>[]} */
  const classScores = [];
  /** @type {Record<string, unknown>[]} */
  const classRunGrants = [];
  for (const membership of classroomMemberships) {
    if (typeof membership.classroom_id !== "string") continue;
    await adapter.selectClassroom?.(membership.classroom_id);
    const scoreRows = await rowsOf(
      "class_scores",
      [userId, membership.classroom_id]
    );
    const questRows = await rowsOf(
      "class_quest_progress",
      [userId, membership.classroom_id]
    );
    const journalRows = await rowsOf(
      "class_journal",
      [userId, membership.classroom_id]
    );
    const grantRows = await rowsOf(
      "class_run_grants",
      [userId, membership.classroom_id]
    );
    classScores.push(...scoreRows);
    classQuestProgress.push(...questRows);
    classJournals.push(...journalRows);
    classRunGrants.push(...grantRows);
  }
  // Definer readers keyed on the transaction-local Explorer identity: seats
  // survive Membership removal and sponsored Licenses are the sponsor's own
  // billing records, so neither depends on the membership loop above.
  const classExpeditionSeats = await rowsOf("class_expedition_seats", []);
  const classExpeditionLicenses = await rowsOf(
    "class_expedition_licenses",
    []
  );

  return {
    schema: EXPORT_SCHEMA_ID,
    generated_at: now(),
    data: {
      profile: profile[0] ?? null,
      scores: [...personalScores, ...classScores],
      run_access: {
        access: access[0] ?? null,
        grants
      },
      lifetime_purchases: lifetimePurchases,
      classroom_memberships: classroomMemberships,
      quest_progress: personalQuestProgress[0] ?? null,
      journal: personalJournal[0] ?? null,
      class_quest_progress: classQuestProgress,
      class_journals: classJournals,
      class_run_grants: classRunGrants,
      class_expedition_seats: classExpeditionSeats,
      class_expedition_licenses: classExpeditionLicenses,
      access_settings: accessSettings[0] ?? null,
      verified_daily_results: verifiedDailyResults,
      verified_daily_best_results: verifiedDailyBestResults,
      // Absence of a row means player, same as the RBAC resolver.
      role: typeof role[0]?.role === "string" ? role[0].role : "player"
    }
  };
}
