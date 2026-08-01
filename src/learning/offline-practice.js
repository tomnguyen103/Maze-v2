import { OFFLINE_PRACTICE_PIN_PREFIX } from "../game/offline-local-scrub.js";

/**
 * Offline Practice on one preselected immutable Lantern Trail, per ADR 0034.
 *
 * The Explorer chooses a learning objective while online, and exactly that
 * Trail is cached — three required Questions plus up to two optional. Offline,
 * the Trail cannot adapt, generate, replace, or select another Question:
 * choosing differently requires reconnecting. That is a deliberate limit, not
 * a missing feature. Adapting offline would mean either shipping the selection
 * logic and the whole Question bank to the device, or letting the device
 * invent Questions no adult reviewed.
 *
 * Outcomes stay coarse and stay in this tab. Nothing durable is written, so a
 * closed or refreshed tab discards unfinished position and unsynced events —
 * there is no queue on disk to leak a selected option identifier or to sync
 * later from a device the Explorer no longer holds.
 *
 * @typedef {"correct" | "wrong" | "hint" | "skip"} PracticeOutcome
 * @typedef {{ questionRevisionId: string, outcome: PracticeOutcome }} PracticeEvent
 */

export const OFFLINE_PRACTICE_PIN_KEY = OFFLINE_PRACTICE_PIN_PREFIX.slice(0, -1);

/**
 * Pins one Trail under its own key. Practice expiry must never disturb a
 * non-terminal Quest Run, so the two are pinned separately rather than sharing
 * one manifest entry — ADR 0036 pins Quest assets until terminal, while
 * Practice is current-tab only.
 *
 * @param {{
 *   learningObjectiveId: string,
 *   questions: { id: string }[],
 *   requiredQuestionCount: number
 * }} trail
 */
export function pinOfflinePracticeTrail(trail) {
  if (trail.requiredQuestionCount !== 3 || trail.questions.length < 3) {
    throw new Error(
      "Offline Practice needs three required reviewed Questions."
    );
  }
  if (trail.questions.length > 5) {
    throw new Error("Offline Practice pins at most five reviewed Questions.");
  }
  return {
    key: `${OFFLINE_PRACTICE_PIN_KEY}:${trail.learningObjectiveId}`,
    learningObjectiveId: trail.learningObjectiveId,
    questionIds: trail.questions.map((question) => question.id)
  };
}

/**
 * A Practice session over the pinned Trail and nothing else.
 *
 * @param {ReturnType<typeof pinOfflinePracticeTrail>} pinned
 */
export function createOfflinePracticeSession(pinned) {
  let index = 0;
  /** @type {PracticeEvent[]} */
  let events = [];

  return {
    currentQuestionId: () => pinned.questionIds[index] ?? null,
    /** @returns {readonly PracticeEvent[]} */
    pendingEvents: () => events,
    learningObjectiveId: () => pinned.learningObjectiveId,

    /**
     * @param {string} questionRevisionId
     * @param {PracticeOutcome} outcome
     */
    record(questionRevisionId, outcome) {
      if (questionRevisionId !== pinned.questionIds[index]) {
        throw new Error("Offline Practice can only answer its pinned Question.");
      }
      // Only the coarse outcome. The selected option identifier is used to
      // decide the outcome and then discarded, so nothing that could
      // reconstruct an answer survives the call.
      events = [...events, { questionRevisionId, outcome }];
      index += 1;
      return { outcome, remaining: pinned.questionIds.length - index };
    },

    /**
     * Reconnecting in this tab syncs what is still in memory. The sync is
     * keyed on the objective and the exact revision, so replaying it produces
     * no second entry in the Lantern Journal.
     *
     * @param {{
     *   recordLearningOutcome: (
     *     event: { questionRevisionId: string, learningObjectiveId: string },
     *     outcome: PracticeOutcome
     *   ) => unknown
     * }} journal
     */
    sync(journal) {
      /** @type {Set<string>} */
      const applied = new Set();
      for (const event of events) {
        const key = `${event.questionRevisionId}:${event.outcome}`;
        if (applied.has(key)) {
          continue;
        }
        applied.add(key);
        journal.recordLearningOutcome(
          {
            questionRevisionId: event.questionRevisionId,
            learningObjectiveId: pinned.learningObjectiveId
          },
          event.outcome
        );
      }
      events = [];
      return { synced: applied.size };
    },

    /** A closed or refreshed tab reaches this the only way it can: not at all. */
    discard() {
      events = [];
      index = 0;
    }
  };
}
