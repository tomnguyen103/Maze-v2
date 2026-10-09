/** @param {unknown} error */
export function safeErrorName(error) {
  return error instanceof Error ? "Error" : "UnknownError";
}
