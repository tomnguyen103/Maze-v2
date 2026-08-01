import { getBundledQuestion } from "../src/questions/question-bank.js";

const LEVELS = Object.freeze({
  bright: "bright-start",
  scout: "trail-scout",
  master: "maze-master"
});
const BANDS = Object.freeze({
  foundation: 1,
  developing: 5,
  capable: 9,
  advanced: 13,
  mastery: 17
});

/**
 * Resolves the immutable reviewed pack shipped with the application. The
 * receipt binds the pack hash; the server chooses the question generator and
 * never trusts question text or answer data supplied by the browser.
 *
 * @param {string} hash
 */
export function createOfflineContentPack(hash) {
  return {
    hash,
    /** @param {string} revisionId */
    questionForRevision(revisionId) {
      if (typeof revisionId !== "string") {
        return null;
      }
      const capstone =
        /^capstone-(bright-start|trail-scout|maze-master)-(foundation|developing|capable|advanced|mastery)$/.exec(
          revisionId
        );
      if (capstone) {
        return bundledQuestion(
          /** @type {"bright-start" | "trail-scout" | "maze-master"} */ (
            capstone[1]
          ),
          BANDS[/** @type {keyof typeof BANDS} */ (capstone[2])],
          "gate-warden",
          revisionId
        );
      }
      const generated = /^(bright|scout|master)-(foundation|developing|capable|advanced|mastery)-(\d+)$/.exec(
        revisionId
      );
      if (!generated) {
        return null;
      }
      const level = LEVELS[/** @type {keyof typeof LEVELS} */ (generated[1])];
      const labyrinthNumber =
        BANDS[/** @type {keyof typeof BANDS} */ (generated[2])];
      return bundledQuestion(
        /** @type {"bright-start" | "trail-scout" | "maze-master"} */ (level),
        labyrinthNumber,
        "warden",
        revisionId,
        Number(generated[3])
      );
    }
  };
}

/**
 * @param {"bright-start" | "trail-scout" | "maze-master"} levelId
 * @param {number} labyrinthNumber
 * @param {"warden" | "gate-warden"} challengeKind
 * @param {string} revisionId
 * @param {number} [questionOrdinal]
 */
function bundledQuestion(
  levelId,
  labyrinthNumber,
  challengeKind,
  revisionId,
  questionOrdinal = 0
) {
  try {
    const question = getBundledQuestion({
      levelId,
      seed: "offline-content-pack",
      wardenId: questionOrdinal,
      labyrinthNumber,
      challengeKind,
      questionOrdinal
    });
    return question.id === revisionId || question.reviewedRevisionId === revisionId
      ? question
      : null;
  } catch {
    return null;
  }
}
