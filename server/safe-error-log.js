/** @param {unknown} error */
export function safeErrorName(error) {
  return error instanceof Error ? "Error" : "UnknownError";
}

/** @param {unknown} error */
export function logProviderFallback(error) {
  console.warn(
    "[questions] AI provider unavailable; using bundled deck.",
    { name: safeErrorName(error) }
  );
}
