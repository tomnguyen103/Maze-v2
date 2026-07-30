import {
  getDefaultLearningDeckOption,
  getPublishedLearningDeckOption,
  getPublishedLearningDeckOptions
} from "../questions/learning-deck-catalog.js";

/**
 * Builds the Learning Deck radio group inside the Quest Level picker. Lives
 * in its own lazy chunk: the picker opens rarely and the game bundle sits
 * against its 30 KB ceiling, so this DOM assembly stays off the boot path.
 *
 * @param {HTMLElement} container
 * @param {string | undefined} activeLearningDeckId
 */
export function renderLearningDeckOptions(container, activeLearningDeckId) {
  const defaultDeck = getDefaultLearningDeckOption();
  // Reopening the picker shows the Deck this Quest is on, not Mixed Trail.
  const activeDeckId =
    getPublishedLearningDeckOption(activeLearningDeckId)?.deckId ??
    defaultDeck.deckId;
  container.replaceChildren(
    ...getPublishedLearningDeckOptions().map((deck) => {
      const label = document.createElement("label");
      const input = document.createElement("input");
      const name = document.createElement("strong");
      const description = document.createElement("span");
      label.className = "learning-deck-option";
      input.type = "radio";
      input.name = "learning-deck";
      input.value = deck.deckId;
      input.dataset.revision = deck.revisionId;
      input.checked = deck.deckId === activeDeckId;
      name.id = `learning-deck-name-${deck.deckId}`;
      name.textContent = deck.label;
      description.id = `learning-deck-description-${deck.deckId}`;
      description.textContent = deck.description;
      // The Deck name alone is the accessible name; the description follows it
      // as a separate announcement rather than becoming part of the name.
      input.setAttribute("aria-labelledby", name.id);
      input.setAttribute("aria-describedby", description.id);
      label.append(input, name, description);
      return label;
    })
  );
}
