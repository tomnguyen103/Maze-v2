import { createQueryAdapter, getDatabasePool } from "../server/database.js";
import { createQuestionBankStore } from "../server/question-bank-store.js";
import { createQuestionHandler } from "../server/question-route.js";
import { createQuestionService } from "../server/question-service.js";
import { safeErrorName } from "../server/safe-error-log.js";

// Without a database the bundled bank is the whole bank, which is the same
// state every deployment starts in and the state a database outage falls back
// to.
const connectionString = process.env.DATABASE_URL;
const questionBank = connectionString
  ? createQuestionBankStore(
      createQueryAdapter(getDatabasePool(connectionString))
    )
  : null;

const handler = createQuestionHandler(
  createQuestionService({
    questionBank,
    onQuestionBankError: (error) =>
      console.error("[question] published bank read failed", {
        name: safeErrorName(error)
      })
  })
);

/**
 * @param {import("node:http").IncomingMessage} request
 * @param {import("node:http").ServerResponse} response
 */
export default function question(request, response) {
  return handler(request, response, undefined);
}
