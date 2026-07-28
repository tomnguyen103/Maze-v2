import { createQueryAdapter, getDatabasePool } from "./database.js";
import { createQuestionBankStore } from "./question-bank-store.js";
import { createQuestionHandler } from "./question-route.js";
import { createQuestionService } from "./question-service.js";
import { safeErrorName } from "./safe-error-log.js";

/**
 * The `/api/question` composition root, alongside `createPlayerApi`: env
 * reading and pool construction belong here rather than in the serverless
 * entry, so both are injectable and testable.
 *
 * Without a database the bundled bank is the whole bank — the state every
 * deployment starts in, and the state an outage falls back to.
 *
 * @param {NodeJS.ProcessEnv | Record<string, string | undefined>} [env]
 */
export function createQuestionApi(env = process.env) {
  const connectionString = env.DATABASE_URL;
  const questionBank = connectionString
    ? createQuestionBankStore(
        createQueryAdapter(getDatabasePool(connectionString))
      )
    : null;
  return createQuestionHandler(
    createQuestionService({
      env: /** @type {NodeJS.ProcessEnv} */ (env),
      questionBank,
      onQuestionBankError: (error) =>
        console.error("[question] published bank read failed", {
          name: safeErrorName(error)
        })
    })
  );
}
