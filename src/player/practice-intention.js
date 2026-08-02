/** @typedef {"review" | "explore" | "challenge"} PracticeIntentionId */

export const PRACTICE_INTENTIONS = Object.freeze([
  Object.freeze({
    id: /** @type {PracticeIntentionId} */ ("review"),
    label: "Review",
    description: "Keep your current Quest Level and reviewed Learning Deck."
  }),
  Object.freeze({
    id: /** @type {PracticeIntentionId} */ ("explore"),
    label: "Explore",
    description: "Choose a different reviewed Level or Learning Deck."
  }),
  Object.freeze({
    id: /** @type {PracticeIntentionId} */ ("challenge"),
    label: "Challenge",
    description: "Opt into a higher Quest Level explicitly."
  })
]);

/** @type {PracticeIntentionId} */
export const DEFAULT_PRACTICE_INTENTION = "explore";

/** @type {ReadonlySet<string>} */
const PRACTICE_INTENTION_IDS = new Set(
  PRACTICE_INTENTIONS.map(({ id }) => id)
);

/**
 * Validates the Explorer's explicit New Quest intention without changing any
 * Quest, Run, account, or sharing state.
 *
 * @param {{
 *   intention: string,
 *   selectedLevelNumber: number,
 *   currentLevelNumber: number,
 *   selectedDeckId: string,
 *   currentDeckId: string
 * }} choice
 */
export function validatePracticeIntention(choice) {
  if (!PRACTICE_INTENTION_IDS.has(choice.intention)) {
    return { valid: false, message: "Choose a Practice Intention." };
  }

  if (choice.intention === "review") {
    return choice.selectedLevelNumber === choice.currentLevelNumber &&
      choice.selectedDeckId === choice.currentDeckId
      ? { valid: true, message: "Review choice is ready." }
      : {
          valid: false,
          message: "Review keeps your current Quest Level and Learning Deck."
        };
  }

  if (choice.intention === "challenge") {
    return choice.selectedLevelNumber > choice.currentLevelNumber
      ? { valid: true, message: "Challenge choice is ready." }
      : {
          valid: false,
          message: "Choose a higher Quest Level for Challenge."
        };
  }

  return { valid: true, message: "Explore choice is ready." };
}
