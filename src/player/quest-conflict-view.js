import { getQuestLevel } from "../questions/quest-levels.js";
import { getPublishedLearningDeckOption } from "../questions/learning-deck-catalog.js";

/**
 * @param {{
 *   onChoose?: (choice: "local" | "cloud") => void
 * }} [options]
 */
export function createQuestConflictView({ onChoose = () => {} } = {}) {
  const elements = {
    cloud: requiredElement("quest-conflict-cloud", HTMLElement),
    dialog: requiredElement("quest-conflict-dialog", HTMLDialogElement),
    intro: requiredElement("quest-conflict-intro", HTMLElement),
    local: requiredElement("quest-conflict-local", HTMLElement),
    title: requiredElement("quest-conflict-title", HTMLElement),
    useCloud: requiredElement(
      "quest-conflict-use-cloud",
      HTMLButtonElement
    ),
    useLocal: requiredElement(
      "quest-conflict-use-local",
      HTMLButtonElement
    )
  };
  /** @type {HTMLElement | null} */
  let returnFocus = null;

  elements.useLocal.addEventListener("click", () => choose("local"));
  elements.useCloud.addEventListener("click", () => choose("cloud"));
  elements.dialog.addEventListener("cancel", (event) => {
    event.preventDefault();
  });
  elements.dialog.addEventListener("close", () => {
    const target = returnFocus;
    returnFocus = null;
    target?.focus();
  });

  return {
    /**
     * @param {{ local: any, cloud: { progress: any, revision: number, updatedAt?: string } }} conflict
     * @param {HTMLElement | null} [trigger]
     */
    show(conflict, trigger = null) {
      returnFocus = trigger;
      elements.intro.textContent =
        "This device and your account have different Quests. Compare both, then choose one. Nothing changes until you decide.";
      renderChoice(elements.local, "This device", conflict.local);
      renderChoice(elements.cloud, "Cloud Quest", conflict.cloud.progress);
      elements.useLocal.textContent = "Keep this device";
      elements.useCloud.textContent = "Use Cloud Quest";
      if (!elements.dialog.open) {
        elements.dialog.showModal();
      }
      elements.title.focus();
    }
  };

  /** @param {"local" | "cloud"} choice */
  function choose(choice) {
    elements.dialog.close();
    onChoose(choice);
  }
}

/**
 * @param {HTMLElement} container
 * @param {string} label
 * @param {{
 *   levelId: string,
 *   learningDeckId: string,
 *   learningDeckRevision: string,
 *   completedLabyrinths: number,
 *   labyrinthNumber: number,
 *   complete: boolean
 * }} progress
 */
function renderChoice(container, label, progress) {
  const eyebrow = document.createElement("span");
  const title = document.createElement("strong");
  const deck = document.createElement("span");
  const summary = document.createElement("span");
  eyebrow.className = "section-label";
  eyebrow.textContent = label;
  title.textContent = getQuestLevel(progress.levelId).name;
  deck.textContent =
    getPublishedLearningDeckOption(
      progress.learningDeckId,
      progress.learningDeckRevision
    )?.label ?? "Unavailable Learning Deck";
  summary.textContent = progress.complete
    ? "20 of 20 complete"
    : `${progress.completedLabyrinths} of 20 complete · Next: Labyrinth ${progress.labyrinthNumber}`;
  container.replaceChildren(eyebrow, title, deck, summary);
}

/**
 * @template {Element} T
 * @param {string} id
 * @param {{ new(): T }} type
 */
function requiredElement(id, type) {
  const element = document.getElementById(id);
  if (!(element instanceof type)) {
    throw new Error(`Missing #${id}.`);
  }
  return element;
}
