import { normalizeRunRuleset } from "./run-ruleset.js";

const BEST_RUN_KEY = "echo-maze:best-run:v1";
const RUN_RECORDS_KEY = "echo-maze:run-records:v1";
const RUN_RECORD_LIMIT = 5;

/**
 * @typedef {{ elapsedMs: number, moves: number, seed: string }} BestRun
 * @typedef {"escaped" | "defeated"} RunOutcome
 * @typedef {BestRun & {
 *   outcome: RunOutcome,
 *   echoesCollected: number,
 *   echoTotal?: number,
 *   labyrinthNumber?: number,
 *   questLevelId?: "bright-start" | "trail-scout" | "maze-master",
 *   atlasRegionId?: string,
 *   rulesetRevision?: string
 * }} RunRecord
 * @typedef {BestRun & {
 *   outcome?: RunOutcome,
 *   echoesCollected?: number,
 *   echoTotal?: number,
 *   labyrinthNumber?: number,
 *   questLevelId?: "bright-start" | "trail-scout" | "maze-master",
 *   atlasRegionId?: string,
 *   rulesetRevision?: string
 * }} RunRecordCandidate
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
    if (!isBestRun(parsed)) {
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
 * @returns {RunRecord[]}
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
        return rankRunRecords(
          parsed
            .map(normalizeRunRecord)
            .filter((record) => record !== null)
        );
      }
    }
  } catch {
    // Fall through to the compatible single-record key.
  }

  const bestRun = loadBestRun(storage);
  const migrated = normalizeRunRecord(bestRun);
  return migrated ? [migrated] : [];
}

/**
 * @param {RunRecordCandidate} candidate
 * @param {StorageLike | undefined} [storage]
 * @returns {RunRecord[]}
 */
export function saveRunRecord(candidate, storage = globalThis.localStorage) {
  const normalized = normalizeRunRecord(candidate);
  const records = rankRunRecords([
    ...loadRunRecords(storage),
    ...(normalized ? [normalized] : [])
  ]);

  try {
    storage?.setItem(RUN_RECORDS_KEY, JSON.stringify(records));
  } catch {
    return records;
  }

  const bestEscape = records.find((record) => record.outcome === "escaped");
  if (bestEscape) {
    saveBestRun(bestEscape, storage);
  }
  return records;
}

/**
 * @param {unknown} value
 * @returns {value is BestRun}
 */
function isBestRun(value) {
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
 * @param {unknown} value
 * @returns {RunRecord | null}
 */
function normalizeRunRecord(value) {
  if (!isBestRun(value)) {
    return null;
  }
  const candidate = /** @type {Partial<RunRecord>} */ (value);
  if (
    candidate.outcome !== undefined &&
    candidate.outcome !== "escaped" &&
    candidate.outcome !== "defeated"
  ) {
    return null;
  }
  const outcome = candidate.outcome ?? "escaped";
  const echoTotal = candidate.echoTotal ?? 3;
  if (
    !Number.isInteger(echoTotal) ||
    echoTotal < 1 ||
    echoTotal > 20
  ) {
    return null;
  }
  const echoesCollected =
    outcome === "escaped"
      ? echoTotal
      : candidate.echoesCollected === undefined
        ? 0
      : candidate.echoesCollected;
  if (
    !Number.isInteger(echoesCollected) ||
    echoesCollected < 0 ||
    echoesCollected > echoTotal
  ) {
    return null;
  }
  const questLevelId =
    candidate.questLevelId === "bright-start" ||
    candidate.questLevelId === "trail-scout" ||
    candidate.questLevelId === "maze-master"
      ? candidate.questLevelId
      : undefined;
  const labyrinthNumber =
    Number.isInteger(candidate.labyrinthNumber) &&
    Number(candidate.labyrinthNumber) >= 1 &&
    Number(candidate.labyrinthNumber) <= 20
      ? Number(candidate.labyrinthNumber)
      : undefined;
  const hasRuleset =
    candidate.atlasRegionId !== undefined ||
    candidate.rulesetRevision !== undefined;
  const ruleset = normalizeRunRuleset(
    hasRuleset
      ? {
          atlasRegionId: candidate.atlasRegionId,
          revision: candidate.rulesetRevision
        }
      : undefined,
    labyrinthNumber ?? 1
  );
  if (!ruleset) {
    return null;
  }
  return {
    elapsedMs: value.elapsedMs,
    moves: value.moves,
    seed: value.seed,
    outcome,
    echoesCollected,
    ...(candidate.echoTotal === undefined ? {} : { echoTotal }),
    ...(labyrinthNumber ? { labyrinthNumber } : {}),
    ...(questLevelId ? { questLevelId } : {}),
    ...(hasRuleset
      ? {
          atlasRegionId: ruleset.atlasRegionId,
          rulesetRevision: ruleset.revision
        }
      : {})
  };
}

/**
 * @param {RunRecord[]} records
 * @returns {RunRecord[]}
 */
function rankRunRecords(records) {
  /** @type {Map<string, RunRecord>} */
  const bestByQuest = new Map();

  for (const record of records) {
    const ruleset = normalizeRunRuleset(
      record.atlasRegionId !== undefined ||
        record.rulesetRevision !== undefined
        ? {
            atlasRegionId: record.atlasRegionId,
            revision: record.rulesetRevision
          }
        : undefined,
      record.labyrinthNumber ?? 1
    );
    const questKey =
      `${record.questLevelId ?? "trail-scout"}:${record.labyrinthNumber ?? 1}:` +
      `${ruleset?.revision ?? "invalid"}:${record.seed}`;
    const current = bestByQuest.get(questKey);
    if (!current || compareRuns(record, current) < 0) {
      bestByQuest.set(questKey, record);
    }
  }

  return [...bestByQuest.values()]
    .sort(compareRuns)
    .slice(0, RUN_RECORD_LIMIT);
}

/**
 * @param {RunRecord} left
 * @param {RunRecord} right
 * @returns {number}
 */
function compareRuns(left, right) {
  if (left.outcome !== right.outcome) {
    return left.outcome === "escaped" ? -1 : 1;
  }
  if (left.outcome === "defeated") {
    return (
      right.echoesCollected - left.echoesCollected ||
      left.elapsedMs - right.elapsedMs ||
      left.moves - right.moves
    );
  }
  return left.elapsedMs - right.elapsedMs || left.moves - right.moves;
}
