import { createHash } from "node:crypto";
import { advanceQuest } from "../src/game/quest-progress.js";
import { recordLearningOutcome } from "../src/learning/lantern-journal.js";
import { getBundledQuestion } from "../src/questions/question-bank.js";
import { getDifficultyBand } from "../src/questions/quest-levels.js";
import { normalizeRunRuleset } from "../src/game/run-ruleset.js";
import { getQuestContentPackId, QUEST_II_CONTENT_PACK_ID } from "../src/game/quest-content.js";

const JOURNAL_LEVEL_BY_BAND = Object.freeze({
  foundation: { levelId: "bright-start", labyrinthNumber: 1 },
  developing: { levelId: "trail-scout", labyrinthNumber: 5 },
  capable: { levelId: "trail-scout", labyrinthNumber: 9 },
  advanced: { levelId: "maze-master", labyrinthNumber: 13 },
  mastery: { levelId: "maze-master", labyrinthNumber: 17 }
});

/** @param {string} key @param {number} index @param {Record<string, unknown>} event */
function deterministicEventId(key, index, event) {
  const digest = createHash("sha256")
    .update(JSON.stringify([key, index, event]))
    .digest("hex");
  const uuid = `${digest.slice(0, 8)}-${digest.slice(8, 12)}-4${digest.slice(
    13,
    16
  )}-8${digest.slice(17, 20)}-${digest.slice(20, 32)}`;
  return `event_${uuid}`;
}

/**
 * Applies only the replay result. All operations are idempotent: score uses
 * the stable Run key, Quest writes use optimistic revision semantics, and
 * Journal events use deterministic event ids. A retry after a partial cloud
 * write therefore finishes the same result rather than creating a second one.
 *
 * @param {{
 *   playerStore: { submitScore: (userId: string, run: {
 *     idempotencyKey: string,
 *     levelId: string,
 *     labyrinthNumber: number,
 *     seed: string,
 *     wardensDefeated: number,
 *     echoesCollected: number,
 *     moves: number,
 *     elapsedMs: number,
 *     escaped: boolean,
 *     atlasRegionId: string,
 *     rulesetRevision: string,
 *     score: number
 *   }, classroomId?: string | null) => Promise<unknown> },
 *   questProgressStore: { get: (userId: string, classroomId?: string | null) => Promise<{ progress: Parameters<typeof advanceQuest>[0], revision: number, updatedAt: string } | null>, save: (userId: string, expectedRevision: number, progress: Parameters<typeof advanceQuest>[0], classroomId?: string | null) => Promise<unknown> },
 *   learningJournalStore: { getJournal: (userId: string, classroomId?: string | null) => Promise<{ journal: unknown, clearGeneration: number }>, saveJournal: (userId: string, journal: unknown, clearGeneration: number, classroomId?: string | null) => Promise<unknown> }
 * }} dependencies
 */
export function createOfflineCloudOutcomeApplier({
  playerStore,
  questProgressStore,
  learningJournalStore
}) {
  /**
   * @param {{
   *   runId: string,
   *   playerId: string | null,
   *   receipt: { runId: string, playerId: string | null, questId?: string, seed: string, levelId: string, labyrinthNumber: number, rulesetRevision: string },
   *   result: { status: "won" | "lost", score: number, wardensDefeated: number, echoesCollected: number, moves: number, elapsedMs: number, journalEvents?: { questionId: string, topicId: string, learningObjectiveId: string, difficultyBand: string, outcome: "correct" | "wrong" | "hint" | "skip" }[], journalSummary?: { questId?: string, challengeKind?: "gate-warden", topicId: string, learningObjectiveId: string, difficultyBand: string, outcome: "correct" | "wrong" | "hint" | "skip", count: number }[] }
   * }} outcome
   */
  return async function applyOfflineCloudOutcome({
    runId,
    playerId,
    receipt,
    result
  }) {
    if (!playerId || receipt.playerId !== playerId) {
      throw new Error("Offline replay account binding is invalid.");
    }
    const ruleset = normalizeRunRuleset(
      {
        atlasRegionId: getDifficultyBand(receipt.labyrinthNumber).id,
        revision: receipt.rulesetRevision
      },
      receipt.labyrinthNumber
    );
    if (!ruleset) {
      throw new Error("Offline replay ruleset is invalid.");
    }

    if (result.status === "won") {
      await playerStore.submitScore(
        playerId,
        {
          idempotencyKey: `offline_${runId}`,
          levelId: receipt.levelId,
          labyrinthNumber: receipt.labyrinthNumber,
          seed: receipt.seed,
          wardensDefeated: result.wardensDefeated,
          echoesCollected: result.echoesCollected,
          moves: result.moves,
          elapsedMs: result.elapsedMs,
          escaped: true,
          atlasRegionId: ruleset.atlasRegionId,
          rulesetRevision: ruleset.revision,
          score: result.score
        },
        null
      );

      const record = await questProgressStore.get(playerId, null);
      const progress = record?.progress;
      if (
        record &&
        progress &&
        typeof receipt.questId === "string" &&
        progress.questId === receipt.questId &&
        progress.levelId === receipt.levelId &&
        progress.labyrinthNumber === receipt.labyrinthNumber &&
        progress.complete !== true
      ) {
        await questProgressStore.save(
          playerId,
          record.revision,
          advanceQuest(/** @type {Parameters<typeof advanceQuest>[0]} */ (progress)),
          null
        );
      }
    }

    const events = result.journalEvents ?? [];
    const summaries = result.journalSummary ?? [];
    if (events.length === 0 && summaries.length === 0) {
      return;
    }
    const state = await learningJournalStore.getJournal(playerId, null);
    let journal = state.journal;
    let changed = false;
    const descriptors =
      summaries.length > 0
        ? summaries.flatMap((summary) => {
            const question = journalQuestionForSummary(summary, receipt.questId);
            if (
              !question ||
              !Number.isSafeInteger(summary.count) ||
              summary.count < 1 ||
              summary.count > 4096
            ) {
              return [];
            }
            return Array.from({ length: summary.count }, () => ({
              question,
              outcome: summary.outcome,
              identity: summary
            }));
          })
        : events.map((event) => ({
            question: {
              id: event.questionId,
              topicId: event.topicId,
              learningObjectiveId: event.learningObjectiveId,
              difficultyBand: event.difficultyBand
            },
            outcome: event.outcome,
            identity: event
          }));
    const existingEventIds = new Set(
      journal &&
      typeof journal === "object" &&
      "events" in journal &&
      Array.isArray(journal.events)
        ? journal.events
            .map((event) =>
              event && typeof event === "object" && "eventId" in event
                ? event.eventId
                : null
            )
            .filter((eventId) => typeof eventId === "string")
        : []
    );
    for (const [index, event] of descriptors.entries()) {
      const eventId = deterministicEventId(`offline_${runId}`, index, event);
      if (existingEventIds.has(eventId)) {
        continue;
      }
      try {
        const next = recordLearningOutcome(
          /** @type {Parameters<typeof recordLearningOutcome>[0]} */ (journal),
          event.question,
          event.outcome,
          () => eventId
        );
        if (JSON.stringify(next) !== JSON.stringify(journal)) {
          changed = true;
        }
        journal = next;
        existingEventIds.add(eventId);
      } catch {
        // Gate-Warden capstones do not belong to the coarse Journal contract;
        // replay still succeeds and the unsupported event is not persisted.
      }
    }
    if (changed) {
      await learningJournalStore.saveJournal(
        playerId,
        journal,
        state.clearGeneration,
        null
      );
    }
  };
}

/**
 * Rehydrates one representative reviewed Journal Question from the compact
 * summary. The summary deliberately stores learning metadata and counts, not
 * the Question id or its child-facing content.
 *
 * @param {{ questId?: string, challengeKind?: "gate-warden", topicId: string, learningObjectiveId: string, difficultyBand: string }} summary
 * @param {string} [receiptQuestId]
 */
function journalQuestionForSummary(summary, receiptQuestId) {
  const summaryQuestId =
    typeof summary.questId === "string" ? summary.questId : undefined;
  if (
    summaryQuestId !== undefined &&
    receiptQuestId !== undefined &&
    summaryQuestId !== receiptQuestId
  ) {
    return null;
  }
  const questId = summaryQuestId ?? receiptQuestId;
  const placement =
    JOURNAL_LEVEL_BY_BAND[
      /** @type {keyof typeof JOURNAL_LEVEL_BY_BAND} */ (
        summary.difficultyBand
      )
    ];
  if (!placement) {
    return null;
  }
  const questII =
    getQuestContentPackId(questId) === QUEST_II_CONTENT_PACK_ID;
  const questionCount =
    summary.challengeKind === "gate-warden" ? 1 : questII ? 20 : 8;
  for (let questionOrdinal = 0; questionOrdinal < questionCount; questionOrdinal += 1) {
    const question = getBundledQuestion({
      levelId: placement.levelId,
      seed: "offline-journal-summary",
      wardenId: 0,
      labyrinthNumber: placement.labyrinthNumber,
      questionOrdinal,
      ...(typeof questId === "string" ? { questId } : {}),
      ...(summary.challengeKind
        ? { challengeKind: summary.challengeKind }
        : {})
    });
    if (
      question.topicId === summary.topicId &&
      question.learningObjectiveId === summary.learningObjectiveId &&
      question.difficultyBand === summary.difficultyBand
    ) {
      return question;
    }
  }
  return null;
}
