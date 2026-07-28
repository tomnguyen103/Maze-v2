import { createQuestionApi } from "../server/question-api.js";

const handler = createQuestionApi();

/**
 * @param {import("node:http").IncomingMessage} request
 * @param {import("node:http").ServerResponse} response
 */
export default function question(request, response) {
  return handler(request, response, undefined);
}
