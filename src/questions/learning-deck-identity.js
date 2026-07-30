import {
  getDefaultLearningDeckOption,
  getPublishedLearningDeckOption
} from "./learning-deck-catalog.js";

/**
 * Quest identity view of the authored Deck roster. Quest Progress stores the
 * exact Deck and revision it pinned, so this module answers only two
 * questions: what a new Quest pins, and whether a stored pin was published.
 */
export const DEFAULT_LEARNING_DECK_ID = getDefaultLearningDeckOption().deckId;
export const DEFAULT_LEARNING_DECK_REVISION =
  getDefaultLearningDeckOption().revisionId;

/**
 * The revision a Quest starting on this Deck pins now.
 *
 * @param {string | null | undefined} deckId
 * @returns {string | null}
 */
export function getPublishedLearningDeckRevisionId(deckId) {
  return getPublishedLearningDeckOption(deckId)?.revisionId ?? null;
}

/**
 * Whether a stored Quest pin names a revision this Deck has published. A Quest
 * keeps its own revision until it ends or is replaced, so superseded revisions
 * stay valid here.
 *
 * @param {string | null | undefined} deckId
 * @param {unknown} revisionId
 * @returns {revisionId is string}
 */
export function isPublishedLearningDeckRevision(deckId, revisionId) {
  if (typeof revisionId !== "string") {
    return false;
  }
  const option = getPublishedLearningDeckOption(deckId);
  return option
    ? option.publishedRevisionIds.includes(revisionId)
    : false;
}
