import { createQuestionHandler } from "../server/question-route.js";
import { createQuestionService } from "../server/question-service.js";

const handler = createQuestionHandler(createQuestionService());

/**
 * @param {import("node:http").IncomingMessage} request
 * @param {import("node:http").ServerResponse} response
 */
export default function question(request, response) {
  return handler(request, response, undefined);
}
