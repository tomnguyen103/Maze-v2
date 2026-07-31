import {
  activeUserGuardCtes,
  DeletedUserError,
  deletedUserHash
} from "./deleted-user-guard.js";

const COLUMNS = `
  schema_version,
  high_contrast,
  large_marks,
  reader_friendly_questions,
  reduced_effects,
  trail_compass_enabled,
  narration_pace,
  revision,
  updated_at
`;

const NARRATION_PACES = new Set(["standard", "slower", "faster"]);

/**
 * @typedef {{
 *   version: 2,
 *   highContrast: boolean,
 *   largeMarks: boolean,
 *   readerFriendlyQuestions: boolean,
 *   reducedEffects: boolean,
 *   trailCompassEnabled: boolean,
 *   narrationPace: "standard" | "slower" | "faster"
 * }} AccessSettings
 */

/**
 * @param {{
 *   query: (
 *     sql: string,
 *     values?: unknown[]
 *   ) => Promise<{ rows: Record<string, unknown>[] }>
 * }} database
 */
export function createAccessSettingsStore(database) {
  /** @param {string} userId */
  async function get(userId) {
    const result = await database.query(
      `SELECT ${COLUMNS}
       FROM explorer_access_settings
       WHERE clerk_user_id = $1`,
      [userId]
    );
    return result.rows[0] ? mapRecord(result.rows[0]) : null;
  }

  return {
    get,
    /**
     * @param {string} userId
     * @param {number} expectedRevision
     * @param {AccessSettings} settings
     */
    async save(userId, expectedRevision, settings) {
      const result = expectedRevision === 0
        ? await database.query(
            `WITH ${activeUserGuardCtes("$9")}
             INSERT INTO explorer_access_settings (
               clerk_user_id,
               schema_version,
               high_contrast,
               large_marks,
               reader_friendly_questions,
               reduced_effects,
               trail_compass_enabled,
               narration_pace
             )
             SELECT $1, $2, $3, $4, $5, $6, $7, $8
             FROM active_user
             ON CONFLICT DO NOTHING
             RETURNING ${COLUMNS}`,
            [
              userId,
              settings.version,
              settings.highContrast,
              settings.largeMarks,
              settings.readerFriendlyQuestions,
              settings.reducedEffects,
              settings.trailCompassEnabled,
              settings.narrationPace,
              deletedUserHash(userId)
            ]
          )
        : await database.query(
            `UPDATE explorer_access_settings
             SET
               schema_version = $3,
               high_contrast = $4,
               large_marks = $5,
               reader_friendly_questions = $6,
               reduced_effects = $7,
               trail_compass_enabled = $8,
               narration_pace = $9,
               revision = revision + 1,
               updated_at = NOW()
             WHERE clerk_user_id = $1
               AND revision = $2
             RETURNING ${COLUMNS}`,
            [
              userId,
              expectedRevision,
              settings.version,
              settings.highContrast,
              settings.largeMarks,
              settings.readerFriendlyQuestions,
              settings.reducedEffects,
              settings.trailCompassEnabled,
              settings.narrationPace
            ]
          );

      if (result.rows[0]) {
        return {
          record: mapRecord(result.rows[0]),
          conflict: false,
          duplicate: false
        };
      }
      if (expectedRevision === 0) {
        const deleted = await database.query(
          `SELECT 1
           FROM deleted_user_tombstones
           WHERE clerk_user_id_hash = $1`,
          [deletedUserHash(userId)]
        );
        if (deleted.rows.length) {
          throw new DeletedUserError();
        }
      }
      const record = await get(userId);
      const duplicate =
        record !== null &&
        JSON.stringify(record.settings) === JSON.stringify(settings);
      return {
        record,
        conflict: !duplicate,
        duplicate
      };
    }
  };
}

/** @param {Record<string, unknown>} row */
function mapRecord(row) {
  const schemaVersion = Number(row.schema_version);
  if (
    (schemaVersion !== 1 && schemaVersion !== 2) ||
    typeof row.high_contrast !== "boolean" ||
    typeof row.large_marks !== "boolean" ||
    typeof row.reader_friendly_questions !== "boolean" ||
    typeof row.reduced_effects !== "boolean" ||
    typeof row.trail_compass_enabled !== "boolean" ||
    !NARRATION_PACES.has(String(row.narration_pace))
  ) {
    throw new Error("Stored Explorer Access Settings are invalid.");
  }
  return {
    settings: {
      // A pre-migration version-1 row reads as the deterministic version-2
      // upgrade: migration 0022's column defaults are Trail Compass Off and
      // Standard pace, so the mapped record and the migration agree.
      version: /** @type {const} */ (2),
      highContrast: row.high_contrast,
      largeMarks: row.large_marks,
      readerFriendlyQuestions: row.reader_friendly_questions,
      reducedEffects: row.reduced_effects,
      trailCompassEnabled: row.trail_compass_enabled,
      narrationPace:
        /** @type {"standard" | "slower" | "faster"} */ (
          String(row.narration_pace)
        )
    },
    revision: Number(row.revision),
    updatedAt: new Date(String(row.updated_at)).toISOString()
  };
}
