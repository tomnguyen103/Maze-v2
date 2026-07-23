const BEST_RUN_KEY = "echo-maze:best-run:v1";
const RUN_RECORDS_KEY = "echo-maze:run-records:v1";
const RUN_RECORD_LIMIT = 5;

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
    if (!isRunRecord(parsed)) {
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

/**
 * @param {StorageLike | undefined} [storage]
 * @returns {BestRun[]}
 */
export function loadRunRecords(storage = globalThis.localStorage) {
  if (!storage) {
    return [];
  }

  try {
    const stored = storage.getItem(RUN_RECORDS_KEY);
    if (stored !== null) {
      const parsed = JSON.parse(stored);
      if (Array.isArray(parsed)) {
        return rankRunRecords(parsed.filter(isRunRecord));
      }
    }
  } catch {
    // Fall through to the compatible single-record key.
  }

  const bestRun = loadBestRun(storage);
  return bestRun ? [bestRun] : [];
}

/**
 * @param {BestRun} candidate
 * @param {StorageLike | undefined} [storage]
 * @returns {BestRun[]}
 */
export function saveRunRecord(candidate, storage = globalThis.localStorage) {
  const records = rankRunRecords([...loadRunRecords(storage), candidate]);

  try {
    storage?.setItem(RUN_RECORDS_KEY, JSON.stringify(records));
  } catch {
    return records;
  }

  saveBestRun(records[0], storage);
  return records;
}

/**
 * @param {unknown} value
 * @returns {value is BestRun}
 */
function isRunRecord(value) {
  if (!value || typeof value !== "object") {
    return false;
  }
  const record = /** @type {Partial<BestRun>} */ (value);
  return Boolean(
    Number.isFinite(record.elapsedMs) &&
      Number(record.elapsedMs) >= 0 &&
      Number.isFinite(record.moves) &&
      Number(record.moves) >= 0 &&
      typeof record.seed === "string" &&
      record.seed.length > 0
  );
}

/**
 * @param {BestRun[]} records
 * @returns {BestRun[]}
 */
function rankRunRecords(records) {
  /** @type {Map<string, BestRun>} */
  const bestBySeed = new Map();

  for (const record of records) {
    if (!isRunRecord(record)) {
      continue;
    }
    const current = bestBySeed.get(record.seed);
    if (!current || compareRuns(record, current) < 0) {
      bestBySeed.set(record.seed, record);
    }
  }

  return [...bestBySeed.values()]
    .sort(compareRuns)
    .slice(0, RUN_RECORD_LIMIT);
}

/**
 * @param {BestRun} left
 * @param {BestRun} right
 * @returns {number}
 */
function compareRuns(left, right) {
  return left.elapsedMs - right.elapsedMs || left.moves - right.moves;
}
