const BEST_RUN_KEY = "echo-maze:best-run:v1";

/**
 * @typedef {{ elapsedMs: number, moves: number, seed: string }} BestRun
 * @typedef {{
 *   getItem: (key: string) => string | null,
 *   setItem: (key: string, value: string) => unknown
 * }} StorageLike
 */

/**
 * @param {StorageLike | undefined} [storage]
 * @returns {BestRun | null}
 */
export function loadBestRun(storage = globalThis.localStorage) {
  if (!storage) {
    return null;
  }

  try {
    const parsed = JSON.parse(storage.getItem(BEST_RUN_KEY) ?? "null");
    if (
      !parsed ||
      typeof parsed.elapsedMs !== "number" ||
      typeof parsed.moves !== "number" ||
      typeof parsed.seed !== "string"
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

/**
 * @param {BestRun} candidate
 * @param {StorageLike | undefined} [storage]
 * @returns {BestRun}
 */
export function saveBestRun(candidate, storage = globalThis.localStorage) {
  const current = loadBestRun(storage);
  const best =
    current &&
    (current.elapsedMs < candidate.elapsedMs ||
      (current.elapsedMs === candidate.elapsedMs && current.moves <= candidate.moves))
      ? current
      : candidate;

  try {
    storage?.setItem(BEST_RUN_KEY, JSON.stringify(best));
  } catch {
    return best;
  }
  return best;
}
