import { getBundledQuestion } from "../questions/question-bank.js";

const DAILY_RECORDS_KEY = "echo-maze:daily-records:v1";
const DAILY_RECORD_LIMIT = 31;
const DAY_MS = 86_400_000;
const DAILY_QUESTION_STRIDE = 64;

export const DAILY_LEVEL_ID = "trail-scout";
export const DAILY_LABYRINTH_NUMBER = 5;

/**
 * @typedef {{
 *   version: 1,
 *   date: string,
 *   seed: string,
 *   levelId: "trail-scout",
 *   labyrinthNumber: 5,
 *   questionStartOrdinal: number
 * }} DailyContract
 * @typedef {{
 *   version: 1,
 *   date: string,
 *   seed: string,
 *   completed: boolean,
 *   bestElapsedMs: number | null,
 *   bestMoves: number | null
 * }} DailyRecord
 * @typedef {{
 *   getItem: (key: string) => string | null,
 *   setItem: (key: string, value: string) => unknown
 * }} StorageLike
 */

/** @param {Date} [date] */
export function utcDateKey(date = new Date()) {
  if (!Number.isFinite(date.getTime())) {
    throw new Error("Choose a valid UTC date.");
  }
  return [
    String(date.getUTCFullYear()).padStart(4, "0"),
    String(date.getUTCMonth() + 1).padStart(2, "0"),
    String(date.getUTCDate()).padStart(2, "0")
  ].join("-");
}

/** @param {string} date @returns {DailyContract} */
export function createDailyContract(date) {
  const parsed = parseDateKey(date);
  if (!parsed) {
    throw new Error("Choose a valid Daily date.");
  }
  const compactDate = date.replaceAll("-", "");
  const epochDay = Math.floor(parsed.getTime() / DAY_MS);
  return {
    version: 1,
    date,
    seed: `DAILY-${compactDate}`,
    levelId: DAILY_LEVEL_ID,
    labyrinthNumber: DAILY_LABYRINTH_NUMBER,
    questionStartOrdinal: epochDay * DAILY_QUESTION_STRIDE
  };
}

/**
 * @param {DailyContract} daily
 * @param {number} sequenceIndex
 */
export function getDailyQuestion(daily, sequenceIndex) {
  if (!Number.isInteger(sequenceIndex) || sequenceIndex < 0) {
    throw new Error("Daily Question index must be a non-negative integer.");
  }
  return getBundledQuestion({
    levelId: daily.levelId,
    seed: daily.seed,
    wardenId: sequenceIndex,
    labyrinthNumber: daily.labyrinthNumber,
    questionOrdinal: daily.questionStartOrdinal + sequenceIndex
  });
}

/**
 * @param {string | null} requestedDate
 * @param {Date} [now]
 */
export function resolveDailyRequest(requestedDate, now = new Date()) {
  const currentDate = utcDateKey(now);
  if (requestedDate === null) {
    return { status: "none", requestedDate: null, currentDate };
  }
  const normalizedDate = parseDateKey(requestedDate) ? requestedDate : null;
  return {
    status: normalizedDate === currentDate ? "current" : "expired",
    requestedDate: normalizedDate,
    currentDate
  };
}

/**
 * @param {DailyContract} daily
 * @param {Date} [now]
 */
export function isDailyCurrent(daily, now = new Date()) {
  return daily.date === utcDateKey(now);
}

/**
 * @param {string} date
 * @param {StorageLike | undefined} [storage]
 * @returns {DailyRecord | null}
 */
export function loadDailyRecord(date, storage = globalThis.localStorage) {
  return loadDailyRecords(storage).find((record) => record.date === date) ?? null;
}

/**
 * @param {DailyContract} daily
 * @param {{ outcome: "escaped" | "defeated", elapsedMs: number, moves: number }} result
 * @param {StorageLike | undefined} [storage]
 * @returns {DailyRecord}
 */
export function saveDailyResult(
  daily,
  result,
  storage = globalThis.localStorage
) {
  const canonical = createDailyContract(daily.date);
  if (
    daily.version !== canonical.version ||
    daily.seed !== canonical.seed ||
    daily.levelId !== canonical.levelId ||
    daily.labyrinthNumber !== canonical.labyrinthNumber ||
    daily.questionStartOrdinal !== canonical.questionStartOrdinal ||
    result.outcome !== "escaped" &&
      result.outcome !== "defeated" ||
    !Number.isFinite(result.elapsedMs) ||
    result.elapsedMs < 0 ||
    !Number.isInteger(result.moves) ||
    result.moves < 0
  ) {
    throw new Error("Cannot save an invalid Daily result.");
  }

  const records = loadDailyRecords(storage);
  const current = records.find((record) => record.date === daily.date) ?? null;
  const escaped = result.outcome === "escaped";
  const improvesBest =
    escaped &&
    (!current?.completed ||
      current.bestElapsedMs === null ||
      result.elapsedMs < current.bestElapsedMs ||
      result.elapsedMs === current.bestElapsedMs &&
        (current.bestMoves === null || result.moves < current.bestMoves));
  const next = /** @type {DailyRecord} */ ({
    version: 1,
    date: daily.date,
    seed: daily.seed,
    completed: current?.completed === true || escaped,
    bestElapsedMs: improvesBest
      ? result.elapsedMs
      : current?.bestElapsedMs ?? null,
    bestMoves: improvesBest ? result.moves : current?.bestMoves ?? null
  });
  const updated = [
    next,
    ...records.filter((record) => record.date !== daily.date)
  ]
    .sort((left, right) => right.date.localeCompare(left.date))
    .slice(0, DAILY_RECORD_LIMIT);

  try {
    storage?.setItem(DAILY_RECORDS_KEY, JSON.stringify(updated));
  } catch {
    return next;
  }
  return next;
}

/** @param {StorageLike | undefined} storage @returns {DailyRecord[]} */
function loadDailyRecords(storage) {
  if (!storage) {
    return [];
  }
  try {
    const parsed = JSON.parse(storage.getItem(DAILY_RECORDS_KEY) ?? "[]");
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed
      .map(normalizeDailyRecord)
      .filter((record) => record !== null)
      .sort((left, right) => right.date.localeCompare(left.date))
      .slice(0, DAILY_RECORD_LIMIT);
  } catch {
    return [];
  }
}

/** @param {unknown} value @returns {DailyRecord | null} */
function normalizeDailyRecord(value) {
  if (!value || typeof value !== "object") {
    return null;
  }
  const record = /** @type {Partial<DailyRecord>} */ (value);
  if (
    record.version !== 1 ||
    typeof record.date !== "string" ||
    !parseDateKey(record.date) ||
    typeof record.seed !== "string" ||
    record.seed !== createDailyContract(record.date).seed ||
    typeof record.completed !== "boolean"
  ) {
    return null;
  }
  const hasBest =
    Number.isFinite(record.bestElapsedMs) &&
    Number(record.bestElapsedMs) >= 0 &&
    Number.isInteger(record.bestMoves) &&
    Number(record.bestMoves) >= 0;
  if (
    record.completed !== hasBest ||
    !hasBest && (record.bestElapsedMs !== null || record.bestMoves !== null)
  ) {
    return null;
  }
  return {
    version: 1,
    date: record.date,
    seed: record.seed,
    completed: record.completed,
    bestElapsedMs: hasBest ? Number(record.bestElapsedMs) : null,
    bestMoves: hasBest ? Number(record.bestMoves) : null
  };
}

/** @param {string} value */
function parseDateKey(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) {
    return null;
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return utcDateKey(parsed) === value ? parsed : null;
}
