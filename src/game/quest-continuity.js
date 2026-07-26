import { normalizeQuestProgress } from "./quest-progress.js";

/**
 * @typedef {NonNullable<ReturnType<typeof normalizeQuestProgress>>} QuestProgress
 * @typedef {{ progress: QuestProgress, revision: number, updatedAt: string }} CloudQuest
 * @typedef {{ kind: "empty" } | { kind: "upload-local", progress: QuestProgress, expectedRevision: number } | { kind: "restore-cloud", progress: QuestProgress, revision: number } | { kind: "conflict", local: QuestProgress, cloud: CloudQuest } | { kind: "cloud-current", progress: QuestProgress, revision: number } | { kind: "merge-and-upload", progress: QuestProgress, expectedRevision: number }} QuestReconciliation
 */

/**
 * @param {QuestProgress} local
 * @param {QuestProgress} cloud
 * @returns {QuestProgress}
 */
export function mergeSameQuestProgress(local, cloud) {
  if (local.questId !== cloud.questId) {
    throw new Error("Different Quests require an explicit choice.");
  }
  if (local.levelId !== cloud.levelId) {
    throw new Error("One Quest ID cannot use two Quest Levels.");
  }
  const complete = local.complete || cloud.complete;
  const completedLabyrinths = complete
    ? 20
    : Math.max(local.completedLabyrinths, cloud.completedLabyrinths);
  const usedMapFingerprints = [
    ...new Set([
      ...local.usedMapFingerprints,
      ...cloud.usedMapFingerprints
    ])
  ].sort();
  const usedQuestionIds = [
    ...new Set([
      ...local.usedQuestionIds,
      ...cloud.usedQuestionIds
    ])
  ].sort();
  const merged = normalizeQuestProgress({
    version: 1,
    questId: local.questId,
    levelId: local.levelId,
    labyrinthNumber: complete ? 20 : completedLabyrinths + 1,
    completedLabyrinths,
    usedMapFingerprints,
    usedQuestionIds,
    nextQuestionOrdinal: Math.max(
      local.nextQuestionOrdinal,
      cloud.nextQuestionOrdinal,
      usedQuestionIds.length
    ),
    complete
  });
  if (!merged) {
    throw new Error("Merged Quest Progress is invalid.");
  }
  return merged;
}

/**
 * @param {QuestProgress | null} local
 * @param {CloudQuest | null} cloud
 * @returns {QuestReconciliation}
 */
export function reconcileQuestProgress(local, cloud) {
  if (!local && !cloud) {
    return { kind: "empty" };
  }
  if (local && !cloud) {
    return {
      kind: "upload-local",
      progress: local,
      expectedRevision: 0
    };
  }
  if (!local && cloud) {
    return {
      kind: "restore-cloud",
      progress: cloud.progress,
      revision: cloud.revision
    };
  }
  if (!local || !cloud) {
    throw new Error("Quest reconciliation state is invalid.");
  }
  if (local.questId !== cloud.progress.questId) {
    return { kind: "conflict", local, cloud };
  }
  const progress = mergeSameQuestProgress(local, cloud.progress);
  if (JSON.stringify(progress) === JSON.stringify(cloud.progress)) {
    return {
      kind: "cloud-current",
      progress,
      revision: cloud.revision
    };
  }
  return {
    kind: "merge-and-upload",
    progress,
    expectedRevision: cloud.revision
  };
}
