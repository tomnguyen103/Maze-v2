import { normalizeRunRuleset } from "./run-ruleset.js";
import { normalizeRunReplay } from "./run-replay-contract.js";

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
 *   questId?: string,
 *   questLevelId?: "bright-start" | "trail-scout" | "maze-master",
 *   atlasRegionId?: string,
 *   rulesetRevision?: string,
 *   replayOwnerId?: string,
 *   replay?: import("./run-replay-contract.js").RunReplay
 * }} RunRecord
 * @typedef {BestRun & {
 *   outcome?: RunOutcome,
 *   echoesCollected?: number,
 *   echoTotal?: number,
 *   labyrinthNumber?: number,
 *   questId?: string,
 *   questLevelId?: "bright-start" | "trail-scout" | "maze-master",
 *   atlasRegionId?: string,
 *   rulesetRevision?: string,
 *   replayOwnerId?: unknown,
 *   replay?: unknown
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
    return {
      elapsedMs: parsed.elapsedMs,
      moves: parsed.moves,
      seed: parsed.seed
    };
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
  const normalizedCandidate = {
    elapsedMs: candidate.elapsedMs,
    moves: candidate.moves,
    seed: candidate.seed
  };
  const best =
    current &&
    (current.elapsedMs < normalizedCandidate.elapsedMs ||
      (current.elapsedMs === normalizedCandidate.elapsedMs &&
        current.moves <= normalizedCandidate.moves))
      ? current
      : normalizedCandidate;

  try {
    storage?.setItem(BEST_RUN_KEY, JSON.stringify(best));
  } catch {
    return best;
  }
  return best;
}

/**
 * @param {StorageLike | undefined} [storage]
 * @param {string | null} [replayOwnerId]
 * @returns {RunRecord[]}
 */
export function loadRunRecords(
  storage = globalThis.localStorage,
  replayOwnerId = null
) {
  return projectRunRecords(loadStoredRunRecords(storage), replayOwnerId);
}

/**
 * @param {RunRecord[]} records
 * @param {string | null} replayOwnerId
 */
function projectRunRecords(records, replayOwnerId) {
  return records.map((record) => {
    if (
      !record.replay ||
      !record.replayOwnerId ||
      record.replayOwnerId === replayOwnerId
    ) {
      return record;
    }
    const retained = { ...record };
    delete retained.replay;
    delete retained.replayOwnerId;
    return retained;
  });
}

/**
 * @param {string | null} replayOwnerId
 * @param {StorageLike | undefined} [storage]
 */
export function hasRunReplayOwnerMismatch(
  replayOwnerId,
  storage = globalThis.localStorage
) {
  return loadStoredRunRecords(storage).some(
    (record) =>
      Boolean(record.replay) &&
      Boolean(record.replayOwnerId) &&
      record.replayOwnerId !== replayOwnerId
  );
}

/**
 * @param {StorageLike | undefined} storage
 * @returns {RunRecord[]}
 */
function loadStoredRunRecords(storage) {
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
 * @param {string | null} [replayOwnerId]
 * @returns {RunRecord[]}
 */
export function saveRunRecord(
  candidate,
  storage = globalThis.localStorage,
  replayOwnerId = null
) {
  const normalized = normalizeRunRecord(candidate);
  const records = rankRunRecords([
    ...loadStoredRunRecords(storage),
    ...(normalized ? [normalized] : [])
  ]);

  try {
    storage?.setItem(RUN_RECORDS_KEY, JSON.stringify(records));
  } catch {
    return projectRunRecords(records, replayOwnerId);
  }

  const bestEscape = records.find((record) => record.outcome === "escaped");
  if (bestEscape) {
    saveBestRun(bestEscape, storage);
  }
  return projectRunRecords(records, replayOwnerId);
}

/**
 * Removes detailed local Replay data while preserving the retained Record list.
 * @param {StorageLike | undefined} [storage]
 */
export function scrubRunReplays(storage = globalThis.localStorage) {
  const records = loadStoredRunRecords(storage).map((record) => {
    const retained = { ...record };
    delete retained.replay;
    delete retained.replayOwnerId;
    return retained;
  });
  try {
    storage?.setItem(RUN_RECORDS_KEY, JSON.stringify(records));
    const bestRun = loadBestRun(storage);
    if (bestRun) {
      storage?.setItem(BEST_RUN_KEY, JSON.stringify(bestRun));
    }
    return true;
  } catch {
    return false;
  }
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
  const questId =
    typeof candidate.questId === "string" &&
    /^(?:quest|legacy)_[a-z0-9_-]{7,92}$/i.test(candidate.questId)
      ? candidate.questId
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
  const replayOwnerId =
    typeof candidate.replayOwnerId === "string" &&
    /^[a-z0-9_-]{1,128}$/i.test(candidate.replayOwnerId)
      ? candidate.replayOwnerId
      : undefined;
  const replay =
    candidate.replayOwnerId !== undefined && !replayOwnerId
      ? null
      : normalizeRunReplay(candidate.replay);
  return {
    elapsedMs: value.elapsedMs,
    moves: value.moves,
    seed: value.seed,
    outcome,
    echoesCollected,
    ...(candidate.echoTotal === undefined ? {} : { echoTotal }),
    ...(labyrinthNumber ? { labyrinthNumber } : {}),
    ...(questId ? { questId } : {}),
    ...(questLevelId ? { questLevelId } : {}),
    ...(hasRuleset
      ? {
          atlasRegionId: ruleset.atlasRegionId,
          rulesetRevision: ruleset.revision
        }
      : {}),
    ...(replay
      ? {
          replay,
          ...(replayOwnerId ? { replayOwnerId } : {})
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
      `${record.questId ?? "legacy"}:` +
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
