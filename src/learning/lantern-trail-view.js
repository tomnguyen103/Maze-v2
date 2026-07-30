import "./lantern-trail.css";
import {
  continueLanternTrail,
  createLanternTrail,
  createLanternTrailSession,
  listLanternTrailObjectives,
  recordLanternTrailHint,
  resolveLanternTrailQuestion
} from "./lantern-trail.js";
import { evaluatePracticeAnswer } from "./lantern-journal-ui.js";
import { ensureQuestionNarration } from "./question-narration.js";

const LEVEL_LABELS = Object.freeze({
  "bright-start": "Bright Start",
  "trail-scout": "Trail Scout",
  "maze-master": "Maze Master"
});
const BAND_LABELS = Object.freeze({
  foundation: "Foundation",
  developing: "Developing",
  capable: "Capable",
  advanced: "Advanced",
  mastery: "Mastery"
});

/**
 * @param {{
 *   onNavigate?: (
 *     destination: "play" | "journal" | "atlas",
 *     returnTarget: HTMLElement | null
 *   ) => void,
 *   onRecord?: (
 *     question: ReturnType<typeof createLanternTrail>["questions"][number],
 *     outcome: "correct" | "wrong" | "hint" | "skip"
 *   ) => void
 * }} [options]
 */
export function createLanternTrailView({
  onNavigate = () => {},
  onRecord = () => {}
} = {}) {
  try {
    ensureQuestionNarration();
  } catch {
    // Read Aloud is optional; the written Question always stays.
  }
  const elements = {
    atlas: required("practice-atlas", HTMLButtonElement),
    catalog: required("practice-catalog", HTMLElement),
    catalogSummary: required("practice-catalog-summary", HTMLElement),
    choices: required("practice-choices", HTMLElement),
    choose: required("practice-choose", HTMLButtonElement),
    close: required("practice-close", HTMLButtonElement),
    completion: required("practice-completion", HTMLElement),
    completionCopy: required("practice-completion-copy", HTMLElement),
    dialog: required("practice-dialog", HTMLDialogElement),
    feedback: required("practice-feedback", HTMLElement),
    hint: required("practice-hint", HTMLElement),
    hintButton: required("practice-hint-button", HTMLButtonElement),
    journal: required("practice-journal", HTMLButtonElement),
    keep: required("practice-keep", HTMLButtonElement),
    next: required("practice-next", HTMLButtonElement),
    objectiveLabel: required("practice-objective-label", HTMLElement),
    objectives: required("practice-objectives", HTMLElement),
    progress: required("practice-progress", HTMLElement),
    question: required("practice-question", HTMLElement),
    skip: required("practice-skip", HTMLButtonElement),
    title: required("practice-title", HTMLElement),
    trail: required("practice-trail", HTMLElement)
  };
  /** @type {ReturnType<typeof createLanternTrailSession> | null} */
  let session = null;
  /** @type {{ levelId: string, difficultyBand: string } | null} */
  let catalogSelection = null;
  /** @type {"play" | "journal" | "atlas"} */
  let destination = "play";
  /** @type {"play" | "journal" | "atlas"} */
  let origin = "play";
  /** @type {HTMLElement | null} */
  let returnTarget = null;

  elements.objectives.addEventListener("click", (event) => {
    const button =
      event.target instanceof Element
        ? event.target.closest("button[data-practice-objective]")
        : null;
    if (!(button instanceof HTMLButtonElement) || !catalogSelection) return;
    startTrail({
      ...catalogSelection,
      learningObjectiveId: button.dataset.practiceObjective ?? ""
    });
  });
  elements.choices.addEventListener("click", (event) => {
    const button =
      event.target instanceof Element
        ? event.target.closest("button[data-practice-answer]")
        : null;
    if (!(button instanceof HTMLButtonElement) || !session) return;
    resolveQuestion(
      button.dataset.practiceAnswer === currentQuestion().answerId
        ? "correct"
        : "wrong"
    );
  });
  elements.hintButton.addEventListener("click", () => {
    if (!session) return;
    const next = recordLanternTrailHint(session);
    if (next === session) return;
    session = next;
    onRecord(currentQuestion(), "hint");
    elements.hint.textContent = currentQuestion().hint;
    elements.hint.hidden = false;
    elements.hintButton.disabled = true;
    elements.hintButton.setAttribute("aria-expanded", "true");
  });
  elements.skip.addEventListener("click", () => resolveQuestion("skip"));
  elements.next.addEventListener("click", () => advance(false));
  elements.keep.addEventListener("click", () => advance(true));
  elements.choose.addEventListener("click", renderCatalog);
  elements.close.addEventListener("click", () => closeTo(origin));
  elements.journal.addEventListener("click", () => closeTo("journal"));
  elements.atlas.addEventListener("click", () => closeTo("atlas"));
  elements.dialog.addEventListener("close", () => {
    const nextDestination = destination;
    const target = returnTarget;
    session = null;
    catalogSelection = null;
    returnTarget = null;
    clearTrailPresentation();
    onNavigate(nextDestination, target);
  });

  return {
    /**
     * @param {{
     *   levelId: string,
     *   difficultyBand: string,
     *   learningObjectiveId?: string,
     *   origin?: "play" | "journal" | "atlas",
     *   trigger?: HTMLElement | null
     * }} selection
     */
    show({
      levelId,
      difficultyBand,
      learningObjectiveId,
      origin: nextOrigin = "play",
      trigger = null
    }) {
      origin = nextOrigin;
      destination = nextOrigin;
      returnTarget = trigger;
      catalogSelection = { levelId, difficultyBand };
      elements.close.textContent =
        nextOrigin === "journal"
          ? "Back to Journal"
          : nextOrigin === "atlas"
            ? "Back to Atlas"
            : "Return to Play";
      // A suggested objective is only offered when it can supply three
      // genuinely distinct required Lanterns; otherwise the Explorer picks
      // from the Trails that can.
      const offered = listLanternTrailObjectives({ levelId, difficultyBand })
        .some(
          (objective) =>
            objective.learningObjectiveId === learningObjectiveId
        );
      if (learningObjectiveId && offered) {
        startTrail({ levelId, difficultyBand, learningObjectiveId });
      } else {
        renderCatalog();
      }
      if (!elements.dialog.open) {
        elements.dialog.showModal();
      }
      requestAnimationFrame(() => {
        (learningObjectiveId && offered
          ? elements.question
          : elements.title
        ).focus({ preventScroll: true });
      });
    }
  };

  function renderCatalog() {
    if (!catalogSelection) return;
    session = null;
    clearTrailPresentation();
    const objectives = listLanternTrailObjectives(catalogSelection);
    elements.catalogSummary.textContent =
      `${LEVEL_LABELS[
        /** @type {keyof typeof LEVEL_LABELS} */ (catalogSelection.levelId)
      ]} · ` +
      `${BAND_LABELS[
        /** @type {keyof typeof BAND_LABELS} */ (
          catalogSelection.difficultyBand
        )
      ]} · ${objectives.length} reviewed goals`;
    elements.objectives.replaceChildren(
      ...objectives.map((objective) => {
        const button = document.createElement("button");
        const label = document.createElement("strong");
        const topic = document.createElement("span");
        button.type = "button";
        button.className = "practice-objective";
        button.dataset.practiceObjective = objective.learningObjectiveId;
        label.textContent = objective.label;
        topic.textContent = objective.topicLabel;
        button.append(label, topic);
        return button;
      })
    );
    elements.catalog.hidden = false;
    elements.trail.hidden = true;
    elements.completion.hidden = true;
    elements.journal.hidden = false;
    elements.atlas.hidden = false;
    elements.title.focus({ preventScroll: true });
  }

  /**
   * @param {{
   *   levelId: string,
   *   difficultyBand: string,
   *   learningObjectiveId: string
   * }} selection
   */
  function startTrail(selection) {
    session = createLanternTrailSession(createLanternTrail(selection));
    renderQuestion();
  }

  function renderQuestion() {
    if (!session) return;
    const question = currentQuestion();
    const optionalIndex =
      session.index - session.trail.requiredQuestionCount + 1;
    elements.progress.textContent =
      session.index < session.trail.requiredQuestionCount
        ? `Lantern ${session.index + 1} of 3 required`
        : `Extra Lantern ${optionalIndex} of 2`;
    elements.objectiveLabel.textContent = session.trail.objectiveLabel;
    elements.question.textContent = question.prompt;
    elements.hint.textContent = "";
    elements.hint.hidden = true;
    elements.hintButton.disabled = false;
    elements.hintButton.setAttribute("aria-expanded", "false");
    elements.feedback.dataset.state = "";
    elements.feedback.textContent =
      "Take your time. This Trail is unscored and changes only coarse Journal outcomes.";
    elements.choices.replaceChildren(
      ...question.choices.map((choice) => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "practice-choice";
        button.dataset.practiceAnswer = choice.id;
        button.textContent = choice.label;
        return button;
      })
    );
    elements.skip.disabled = false;
    elements.next.disabled = false;
    elements.keep.disabled = false;
    elements.next.hidden = true;
    elements.keep.hidden = true;
    elements.catalog.hidden = true;
    elements.completion.hidden = true;
    elements.trail.hidden = false;
    elements.journal.hidden = true;
    elements.atlas.hidden = true;
    elements.question.focus({ preventScroll: true });
  }

  /** @param {"correct" | "wrong" | "skip"} outcome */
  function resolveQuestion(outcome) {
    if (!session) return;
    const question = currentQuestion();
    const next = resolveLanternTrailQuestion(session, outcome);
    if (next === session) return;
    session = next;
    onRecord(question, outcome);
    for (const choice of elements.choices.querySelectorAll("button")) {
      if (choice instanceof HTMLButtonElement) choice.disabled = true;
    }
    elements.hintButton.disabled = true;
    elements.skip.disabled = true;

    let message;
    if (outcome === "skip") {
      message = `Skipped safely. ${question.explanation}`;
    } else {
      const result = evaluatePracticeAnswer(
        question,
        outcome === "correct" ? question.answerId : ""
      );
      message = `${result.message} ${result.explanation}`;
    }
    if (next.requiredComplete && next.index === 2) {
      message +=
        " Required Trail complete. You can finish here or keep practicing.";
    }
    elements.feedback.dataset.state = outcome;
    elements.feedback.textContent = message;
    elements.next.textContent =
      next.index < next.trail.requiredQuestionCount - 1
        ? "Next Lantern"
        : "Finish Trail";
    elements.next.hidden = false;
    elements.keep.hidden =
      next.index < next.trail.requiredQuestionCount - 1 ||
      next.index >= next.trail.questions.length - 1;
    elements.next.focus({ preventScroll: true });
  }

  /** @param {boolean} keepPracticing */
  function advance(keepPracticing) {
    if (!session || !session.outcome) return;
    elements.next.disabled = true;
    elements.keep.disabled = true;
    const next = continueLanternTrail(session, { keepPracticing });
    session = next;
    if (next.complete) {
      renderCompletion();
    } else {
      renderQuestion();
    }
  }

  function renderCompletion() {
    if (!session) return;
    elements.completionCopy.textContent =
      `You practiced ${session.index + 1} reviewed Questions. ` +
      "No score, rank, reward, or Quest progress was created.";
    elements.catalog.hidden = true;
    elements.trail.hidden = true;
    elements.completion.hidden = false;
    elements.journal.hidden = false;
    elements.atlas.hidden = false;
    elements.choose.focus({ preventScroll: true });
  }

  function clearTrailPresentation() {
    elements.catalogSummary.textContent = "";
    elements.objectives.replaceChildren();
    elements.progress.textContent = "";
    elements.objectiveLabel.textContent = "";
    elements.question.textContent = "";
    elements.hint.textContent = "";
    elements.hint.hidden = true;
    elements.choices.replaceChildren();
    elements.feedback.textContent = "";
    delete elements.feedback.dataset.state;
    elements.completionCopy.textContent = "";
    elements.catalog.hidden = true;
    elements.trail.hidden = true;
    elements.completion.hidden = true;
    elements.next.hidden = true;
    elements.keep.hidden = true;
    elements.next.disabled = false;
    elements.keep.disabled = false;
  }

  function currentQuestion() {
    if (!session) {
      throw new Error("Lantern Trail has no active Question.");
    }
    return session.trail.questions[session.index];
  }

  /** @param {"play" | "journal" | "atlas"} nextDestination */
  function closeTo(nextDestination) {
    destination = nextDestination;
    if (elements.dialog.open) {
      elements.dialog.close();
    }
  }
}

/**
 * @template {HTMLElement} T
 * @param {string} id
 * @param {new (...args: never[]) => T} Type
 * @returns {T}
 */
function required(id, Type) {
  const element = document.getElementById(id);
  if (!(element instanceof Type)) {
    throw new Error(`Lantern Trail view is missing #${id}.`);
  }
  return element;
}
