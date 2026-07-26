import { createLanternJournal } from "../src/learning/lantern-journal.js";

/**
 * @param {{ query: (sql: string, values?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }> }} pool
 */
export function createLearningJournalStore(pool) {
  return {
    /** @param {string} userId */
    async getJournal(userId) {
      const result = await pool.query(
        `SELECT journal
         FROM learning_journals
         WHERE clerk_user_id = $1`,
        [userId]
      );
      return result.rows[0]?.journal ?? createLanternJournal();
    },

    /** @param {string} userId @param {unknown} journal */
    async saveJournal(userId, journal) {
      const result = await pool.query(
        `WITH ensured_access AS (
           INSERT INTO player_access (clerk_user_id)
           VALUES ($1)
           ON CONFLICT (clerk_user_id) DO NOTHING
         )
         INSERT INTO learning_journals (clerk_user_id, journal)
         VALUES ($1, $2::jsonb)
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
         RETURNING journal`,
        [userId, JSON.stringify(journal)]
      );
      return result.rows[0]?.journal ?? journal;
    },

    /** @param {string} userId */
    async clearJournal(userId) {
      await pool.query(
        `DELETE FROM learning_journals
         WHERE clerk_user_id = $1`,
        [userId]
      );
    }
  };
}
