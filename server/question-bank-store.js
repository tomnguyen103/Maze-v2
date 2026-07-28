import { normalizeQuestion } from "./question-service.js";

/**
 * A band's deck is small by design. The bound exists so a mis-seeded table
 * cannot turn one player request into an unbounded read.
 */
const MAX_DECK_SIZE = 200;

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
         ORDER BY q.question_ordinal ASC, q.id ASC
         LIMIT $3`,
        [levelId, difficultyBand, MAX_DECK_SIZE]
      );
      // A band's deck is small — the bundled bank's is single digits — so the
      // whole published deck comes back and the ordinal picks from it in
      // memory. Ordinals wrap over what is live, not over what is authored: a
      // half-published deck is simply a shorter deck.
      if (result.rows.length === 0) {
        return null;
      }
      const ordinal = Math.max(0, Math.trunc(questionOrdinal));
      const row = result.rows[ordinal % result.rows.length];
      // The same validation the bundled bank passes, plus the one thing the
      // schema cannot express: content lives in `question_versions` and the
      // band it is filed under lives in `questions`, so no CHECK can hold them
      // together. A mismatch means a Warden Question is miscategorized, which
      // would serve a foundation prompt at mastery.
      const question = normalizeQuestion(row.content);
      if (question.difficultyBand !== difficultyBand) {
        throw new Error(
          "Published Warden Question does not match its difficulty band."
        );
      }
      return question;
    }
  };
}
