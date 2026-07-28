import { normalizeQuestion } from "./question-service.js";

/**
 * Reads the published question bank. Only published versions are visible here:
 * a draft has no read path to a player at all, rather than being filtered out
 * further downstream where a missed condition would leak it.
 *
 * @param {{
 *   query: (
 *     sql: string,
 *     values?: unknown[]
 *   ) => Promise<{ rows: Record<string, unknown>[] }>
 * }} pool
 */
export function createQuestionBankStore(pool) {
  return {
    /**
     * @param {{
     *   levelId: string,
     *   difficultyBand: string,
     *   questionOrdinal: number
     * }} request
     * @returns {Promise<
     *   import("./question-service.js").WardenQuestion | null
     * >}
     */
    async publishedQuestion({ levelId, difficultyBand, questionOrdinal }) {
      const result = await pool.query(
        `SELECT v.content
         FROM questions q
         JOIN question_versions v
           ON v.question_id = q.id AND v.status = 'published'
         WHERE q.level_id = $1 AND q.difficulty_band = $2
         ORDER BY q.question_ordinal ASC, q.id ASC`,
        [levelId, difficultyBand]
      );
      // A band's deck is small — the bundled bank's is single digits — so the
      // whole deck comes back and the ordinal picks from it in memory, exactly
      // as the bundled bank cycles. Counting first to OFFSET would cost a
      // second round trip to answer the same question.
      if (result.rows.length === 0) {
        return null;
      }
      const ordinal = Math.max(0, Math.trunc(questionOrdinal));
      const row = result.rows[ordinal % result.rows.length];
      try {
        // The same validation the bundled bank passes. A row that fails it is
        // treated as absent, so a bad publish degrades to the bundled card
        // rather than showing a child a malformed one.
        return normalizeQuestion(row.content);
      } catch {
        return null;
      }
    }
  };
}
