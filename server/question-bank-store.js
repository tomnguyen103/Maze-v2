import { normalizeQuestion } from "./question-service.js";
import { QUEST_LEVELS } from "../src/questions/quest-levels.js";

const LEVEL_IDS = /** @type {Set<string>} */ (
  new Set(QUEST_LEVELS.map((level) => level.id))
);

/**
 * Reads the published question bank. Only published versions are visible here:
 * a draft has no read path to a player at all, rather than being filtered out
 * further downstream where a missed condition would leak it.
 *
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
 *     release: () => void
 *   }>
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
         WHERE q.level_id = $1
           AND q.difficulty_band = $2
           AND q.question_ordinal = $3
         LIMIT 1`,
        [levelId, difficultyBand, Math.max(0, Math.trunc(questionOrdinal))]
      );
      // Published rows are ordinal-specific overlays. A missing ordinal returns
      // null so the service falls through to the unbounded bundled generator;
      // publishing one reviewed card can never collapse a whole band to one id.
      if (result.rows.length === 0) {
        return null;
      }
      const row = result.rows[0];
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
    },

    async listQuestions() {
      const result = await pool.query(
        `SELECT q.id, q.level_id, q.difficulty_band, q.question_ordinal,
                v.version, v.status, v.content, v.created_at, v.published_at
         FROM questions q
         LEFT JOIN question_versions v ON v.question_id = q.id
         ORDER BY q.level_id, q.difficulty_band, q.question_ordinal,
                  v.version DESC
         LIMIT 1000`
      );
      /** @type {Map<string, Record<string, unknown>>} */
      const questions = new Map();
      for (const row of result.rows) {
        const id = String(row.id);
        let question = questions.get(id);
        if (!question) {
          question = {
            id,
            levelId: String(row.level_id),
            difficultyBand: String(row.difficulty_band),
            questionOrdinal: Number(row.question_ordinal),
            versions: []
          };
          questions.set(id, question);
        }
        if (row.version !== null && row.version !== undefined) {
          /** @type {Record<string, unknown>[]} */ (question.versions).push({
            version: Number(row.version),
            status: String(row.status),
            content: row.content,
            createdAt: asIso(row.created_at),
            publishedAt: asIso(row.published_at)
          });
        }
      }
      return [...questions.values()];
    },

    /**
     * @param {{
     *   id: string,
     *   levelId: string,
     *   difficultyBand: string,
     *   questionOrdinal: number,
     *   content: unknown
     * }} input
     * @param {string} editedBy
     */
    async saveDraft(input, editedBy) {
      const normalized = validateDraft(input);
      if (typeof editedBy !== "string" || !editedBy) {
        throw new QuestionBankInputError("Draft editor is required.");
      }
      const client = await transactionalClient(pool);
      try {
        await client.query("BEGIN");
        await client.query(
          `INSERT INTO questions (
             id, level_id, difficulty_band, question_ordinal
           ) VALUES ($1, $2, $3, $4)
           ON CONFLICT (id) DO NOTHING`,
          [
            input.id,
            input.levelId,
            input.difficultyBand,
            input.questionOrdinal
          ]
        );
        const placement = await client.query(
          `SELECT level_id, difficulty_band, question_ordinal
           FROM questions
           WHERE id = $1
           FOR UPDATE`,
          [input.id]
        );
        if (
          !placement.rows[0] ||
          String(placement.rows[0].level_id) !== input.levelId ||
          String(placement.rows[0].difficulty_band) !== input.difficultyBand ||
          Number(placement.rows[0].question_ordinal) !== input.questionOrdinal
        ) {
          throw new QuestionBankInputError(
            "An existing Warden Question cannot change its live placement."
          );
        }
        const next = await client.query(
          `SELECT COALESCE(MAX(version), 0) + 1 AS version
           FROM question_versions
           WHERE question_id = $1`,
          [input.id]
        );
        const version = Number(next.rows[0]?.version ?? 1);
        const inserted = await client.query(
           `INSERT INTO question_versions (
              question_id, version, status, content, edited_by
            ) VALUES ($1, $2, 'draft', $3, $4)
            RETURNING question_id AS id, version`,
          [input.id, version, normalized, editedBy]
        );
        await client.query("COMMIT");
        return {
          id: String(inserted.rows[0]?.id ?? input.id),
          version: Number(inserted.rows[0]?.version ?? version)
        };
      } catch (error) {
        await rollback(client);
        throw error;
      } finally {
        client.release();
      }
    },

    /** @param {string} questionId @param {number} version */
    async publishVersion(questionId, version) {
      const client = await transactionalClient(pool);
      try {
        await client.query("BEGIN");
        const target = await client.query(
          `SELECT content
           FROM question_versions
           WHERE question_id = $1 AND version = $2
           FOR UPDATE`,
          [questionId, version]
        );
        if (!target.rows[0]) {
          throw new QuestionBankInputError(
            "That Warden Question version does not exist."
          );
        }
        const normalized = normalizeQuestion(target.rows[0].content);
        if (normalized.id !== questionId) {
          throw new QuestionBankInputError(
            "Warden Question content does not match its id."
          );
        }
        await client.query(
          `UPDATE question_versions
           SET status = 'draft', published_at = NULL
           WHERE question_id = $1 AND status = 'published'`,
          [questionId]
        );
        const published = await client.query(
          `UPDATE question_versions
           SET status = 'published', published_at = now()
           WHERE question_id = $1 AND version = $2
           RETURNING question_id AS id, version`,
          [questionId, version]
        );
        await client.query("COMMIT");
        return {
          id: String(published.rows[0]?.id ?? questionId),
          version: Number(published.rows[0]?.version ?? version)
        };
      } catch (error) {
        await rollback(client);
        throw error;
      } finally {
        client.release();
      }
    },

    /** @param {string} questionId */
    async deleteQuestion(questionId) {
      const result = await pool.query(
        `DELETE FROM questions WHERE id = $1 RETURNING id`,
        [questionId]
      );
      if (!result.rows[0]) {
        throw new QuestionBankInputError(
          "That Warden Question does not exist."
        );
      }
      return { id: questionId, deleted: true };
    }
  };
}

export class QuestionBankInputError extends Error {}

/**
 * @param {{
 *   id: string,
 *   levelId: string,
 *   difficultyBand: string,
 *   questionOrdinal: number,
 *   content: unknown
 * }} input
 */
function validateDraft(input) {
  if (
    !input ||
    typeof input !== "object" ||
    typeof input.id !== "string" ||
    !input.id ||
    typeof input.levelId !== "string" ||
    !LEVEL_IDS.has(input.levelId) ||
    typeof input.difficultyBand !== "string" ||
    !Number.isSafeInteger(input.questionOrdinal) ||
    Number(input.questionOrdinal) < 0
  ) {
    throw new QuestionBankInputError(
      "Warden Question metadata is not valid."
    );
  }
  let normalized;
  try {
    normalized = normalizeQuestion(input.content);
  } catch {
    throw new QuestionBankInputError(
      "Warden Question content is not valid."
    );
  }
  if (normalized.id !== input.id) {
    throw new QuestionBankInputError(
      "Warden Question content does not match its id."
    );
  }
  if (normalized.difficultyBand !== input.difficultyBand) {
    throw new QuestionBankInputError(
      "Warden Question content does not match its difficulty band."
    );
  }
  return normalized;
}

/**
 * @param {{
 *   connect?: () => Promise<{
 *     query: (sql: string, values?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>,
 *     release: () => void
 *   }>
 * }} pool
 */
async function transactionalClient(pool) {
  if (typeof pool.connect !== "function") {
    throw new Error("Question bank writes require a database transaction.");
  }
  return pool.connect();
}

/**
 * @param {{
 *   query: (sql: string, values?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>
 * }} client
 */
async function rollback(client) {
  try {
    await client.query("ROLLBACK");
  } catch {
    // Preserve the operation error; a dropped connection cannot roll back.
  }
}

/** @param {unknown} value */
function asIso(value) {
  if (value === null || value === undefined) {
    return null;
  }
  return value instanceof Date ? value.toISOString() : String(value);
}
