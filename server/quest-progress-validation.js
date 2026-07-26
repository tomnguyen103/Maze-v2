import { InputError } from "./player-validation.js";
import { normalizeQuestProgress } from "../src/game/quest-progress.js";

export { InputError };

const PROGRESS_FIELDS = new Set([
  "version",
  "questId",
  "levelId",
  "labyrinthNumber",
  "completedLabyrinths",
  "usedMapFingerprints",
  "usedQuestionIds",
  "nextQuestionOrdinal",
  "complete"
]);

/** @param {unknown} value */
export function validateCloudQuestWrite(value) {
  if (!value || typeof value !== "object") {
    throw new InputError("Cloud Quest Progress must be an object.");
  }
  const candidate = /** @type {Record<string, unknown>} */ (value);
  if (
    !Number.isInteger(candidate.expectedRevision) ||
    Number(candidate.expectedRevision) < 0 ||
    Number(candidate.expectedRevision) > 2147483647
  ) {
    throw new InputError("Expected Quest Revision is invalid.");
  }
  if (!candidate.progress || typeof candidate.progress !== "object") {
    throw new InputError("Quest Progress is required.");
  }
  const progressInput = /** @type {Record<string, unknown>} */ (
    candidate.progress
  );
  if (
    Object.keys(progressInput).some((field) => !PROGRESS_FIELDS.has(field))
  ) {
    throw new InputError("Cloud Quest Progress accepts boundary fields only.");
  }
  if (typeof progressInput.questId !== "string") {
    throw new InputError("Quest ID is required before cloud sync.");
  }
  const progress = normalizeQuestProgress(progressInput);
  if (!progress || progress.questId !== progressInput.questId) {
    throw new InputError("Cloud Quest Progress is invalid.");
  }
  return {
    expectedRevision: Number(candidate.expectedRevision),
    progress
  };
}
