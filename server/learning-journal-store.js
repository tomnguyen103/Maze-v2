import { createLanternJournal } from "../src/learning/lantern-journal.js";
import {
  activeUserGuardCtes,
  DeletedUserError,
  deletedUserHash
} from "./deleted-user-guard.js";

export class JournalClearConflictError extends Error {
  /** @param {number} clearGeneration */
  constructor(clearGeneration) {
    super("The Lantern Journal was cleared on another device.");
    this.name = "JournalClearConflictError";
    this.clearGeneration = clearGeneration;
  }
}

/**
 * @param {{ query: (sql: string, values?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }> }} pool
 */
export function createLearningJournalStore(pool) {
  return {
    /** @param {string} userId */
    async getJournal(userId) {
      const result = await pool.query(
        `SELECT journal, clear_generation
         FROM learning_journals
         WHERE clerk_user_id = $1`,
        [userId]
      );
      return journalState(result.rows[0]);
    },

    /**
     * @param {string} userId
     * @param {unknown} journal
     * @param {number} clearGeneration
     */
    async saveJournal(userId, journal, clearGeneration) {
      const result = await pool.query(
        `WITH ${activeUserGuardCtes("$4")},
         ensured_access AS (
           INSERT INTO player_access (clerk_user_id)
           SELECT $1
           FROM active_user
           ON CONFLICT (clerk_user_id) DO NOTHING
           RETURNING clerk_user_id
         ),
         available_access AS (
           SELECT clerk_user_id FROM ensured_access
           UNION ALL
           SELECT clerk_user_id
           FROM player_access
           WHERE clerk_user_id = $1
             AND EXISTS (SELECT 1 FROM active_user)
         ),
         saved AS (
           INSERT INTO learning_journals (
             clerk_user_id,
             journal,
             clear_generation
           )
           SELECT $1, $2::jsonb, $3
           FROM available_access
           LIMIT 1
           ON CONFLICT (clerk_user_id) DO UPDATE SET
             journal = jsonb_build_object(
               'version',
               1,
               'events',
               COALESCE(
                 (
                   SELECT jsonb_agg(bounded.entry ORDER BY bounded.event_id)
                   FROM (
                     SELECT deduplicated.entry, deduplicated.event_id
                     FROM (
                       SELECT DISTINCT ON (entry->>'eventId')
                         entry,
                         entry->>'eventId' AS event_id
                       FROM jsonb_array_elements(
                         (learning_journals.journal->'events') ||
                         (EXCLUDED.journal->'events')
                       ) AS entries(entry)
                       ORDER BY entry->>'eventId', entry::text
                     ) AS deduplicated
                     ORDER BY deduplicated.event_id DESC
                     LIMIT 200
                   ) AS bounded
                 ),
                 '[]'::jsonb
               )
             ),
             updated_at = NOW()
           WHERE learning_journals.clear_generation = $3
           RETURNING journal, clear_generation, FALSE AS conflict
         )
         SELECT journal, clear_generation, conflict
         FROM saved
         UNION ALL
         SELECT journal, clear_generation, TRUE AS conflict
         FROM learning_journals
         WHERE clerk_user_id = $1
           AND NOT EXISTS (SELECT 1 FROM saved)
         LIMIT 1`,
        [
          userId,
          JSON.stringify(journal),
          clearGeneration,
          deletedUserHash(userId)
        ]
      );
      const row = result.rows[0];
      if (!row) throw new DeletedUserError();
      if (row.conflict) {
        throw new JournalClearConflictError(Number(row.clear_generation));
      }
      return journalState(row);
    },

    /** @param {string} userId */
    async clearJournal(userId) {
      const result = await pool.query(
        `WITH ${activeUserGuardCtes("$2")},
         ensured_access AS (
           INSERT INTO player_access (clerk_user_id)
           SELECT $1
           FROM active_user
           ON CONFLICT (clerk_user_id) DO NOTHING
           RETURNING clerk_user_id
         ),
         available_access AS (
           SELECT clerk_user_id FROM ensured_access
           UNION ALL
           SELECT clerk_user_id
           FROM player_access
           WHERE clerk_user_id = $1
             AND EXISTS (SELECT 1 FROM active_user)
         )
         INSERT INTO learning_journals (
           clerk_user_id,
           journal,
           clear_generation
         )
         SELECT
           $1,
           '{"version":1,"events":[]}'::jsonb,
           1
         FROM available_access
         LIMIT 1
         ON CONFLICT (clerk_user_id) DO UPDATE SET
           journal = '{"version":1,"events":[]}'::jsonb,
           clear_generation = learning_journals.clear_generation + 1,
           updated_at = NOW()
         RETURNING journal, clear_generation`,
        [userId, deletedUserHash(userId)]
      );
      if (!result.rows[0]) throw new DeletedUserError();
      return journalState(result.rows[0]);
    }
  };
}

/** @param {Record<string, unknown> | undefined} row */
function journalState(row) {
  return {
    journal: row?.journal ?? createLanternJournal(),
    clearGeneration: Number(row?.clear_generation ?? 0)
  };
}
