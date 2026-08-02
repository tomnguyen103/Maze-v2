import { getBundledQuestion } from "../questions/question-bank.js";
import {
  applyTacticsLabAction,
  createTacticsLabSession,
  getTacticsLabPublicState,
  listTacticsDrills,
  TACTICS_TRAIL_TWIST_IDS
} from "../game/tactics-lab.js";

/** @typedef {Readonly<{ prompt: string, choices: readonly { id: string, label: string }[], hint: string }>} TacticsQuestion */

/** @type {Readonly<Record<string, string>>} */
const TWIST_LABELS = Object.freeze({
  "echo-hush-v1": "Echo Hush",
  "windways-v1": "Windways",
  "echo-bridges-v1": "Echo Bridges",
  "tide-doors-v1": "Tide Doors",
  "warden-bells-v1": "Warden Bells"
});

/** @type {Readonly<Record<string, number>>} */
const TWIST_LABYRINTHS = Object.freeze({
  "echo-hush-v1": 1,
  "windways-v1": 5,
  "echo-bridges-v1": 9,
  "tide-doors-v1": 13,
  "warden-bells-v1": 17
});

/** @type {Readonly<Record<string, string>>} */
const MODE_COPY = Object.freeze({
  patrol: "Patrol: distant and readable movement.",
  hunt: "Hunt: the Warden closes distance when it is near enough.",
  intercept: "Intercept: the Warden predicts the Explorer's last direction.",
  lured: "Lured: the Warden follows the temporary Pulse signal."
});

/**
 * @param {{ onExit?: () => void }} [options]
 */
export function createTacticsLabView({ onExit = () => {} } = {}) {
  const elements = {
    back: required("practice-tactics-back", HTMLButtonElement),
    catalog: required("practice-tactics-catalog", HTMLElement),
    challenge: required("practice-tactics-challenge", HTMLElement),
    choices: required("practice-tactics-choices", HTMLElement),
    drillTitle: required("practice-tactics-drill-title", HTMLElement),
    exit: required("practice-tactics-exit", HTMLButtonElement),
    hint: required("practice-tactics-hint", HTMLButtonElement),
    hintCopy: required("practice-tactics-hint-copy", HTMLElement),
    intro: required("practice-tactics-intro", HTMLElement),
    moves: required("practice-tactics-pulse", HTMLButtonElement),
    objective: required("practice-tactics-objective", HTMLElement),
    progress: required("practice-tactics-progress", HTMLElement),
    report: required("practice-tactics-report", HTMLElement),
    restart: required("practice-tactics-restart", HTMLButtonElement),
    session: required("practice-tactics-session", HTMLElement),
    shell: required("practice-tactics", HTMLElement),
    status: required("practice-tactics-status", HTMLElement),
    title: required("practice-tactics-title", HTMLElement),
    twistList: required("practice-tactics-twist-list", HTMLElement),
    twists: required("practice-tactics-twists", HTMLElement),
    question: required("practice-tactics-question", HTMLElement),
    rule: required("practice-tactics-rule", HTMLElement),
    skip: required("practice-tactics-skip", HTMLButtonElement)
  };
  /** @type {ReturnType<typeof createTacticsLabSession> | null} */
  let session = null;
  /** @type {ReturnType<typeof listTacticsDrills>[number] | null} */
  let drill = null;

  elements.catalog.addEventListener("click", (event) => {
    const button = closestButton(event, "[data-tactics-drill]");
    if (!button) return;
    const drillId = button.dataset.tacticsDrill ?? "";
    if (drillId === "trail-twists") {
      renderTwistChoices();
      return;
    }
    startDrill(drillId);
  });
  elements.twistList.addEventListener("click", (event) => {
    const button = closestButton(event, "[data-tactics-twist]");
    if (!button) return;
    startDrill("trail-twists", button.dataset.tacticsTwist);
  });
  elements.shell.addEventListener("click", (event) => {
    const button = closestButton(event, "[data-tactics-move]");
    if (!button || !session) return;
    apply({ type: "move", direction: button.dataset.tacticsMove });
  });
  elements.moves.addEventListener("click", () => {
    if (!session) return;
    apply({ type: "pulse" });
  });
  elements.choices.addEventListener("click", (event) => {
    const button = closestButton(event, "[data-tactics-answer]");
    if (!button || !session) return;
    apply({ type: "answer-question", answerId: button.dataset.tacticsAnswer });
  });
  elements.hint.addEventListener("click", () => {
    if (!session) return;
    apply({ type: "reveal-hint" });
  });
  elements.skip.addEventListener("click", () => {
    if (!session) return;
    apply({ type: "skip-question" });
  });
  elements.restart.addEventListener("click", () => {
    if (!session) return;
    apply({ type: "restart" });
  });
  elements.back.addEventListener("click", renderCatalog);
  elements.exit.addEventListener("click", () => {
    hide();
    onExit();
  });

  return { hide, reset, show };

  function show() {
    elements.shell.hidden = false;
    renderCatalog();
  }

  function hide() {
    session = null;
    drill = null;
    clearPresentation();
    elements.shell.hidden = true;
  }

  function reset() {
    hide();
  }

  function renderCatalog() {
    session = null;
    drill = null;
    elements.catalog.replaceChildren(
      ...listTacticsDrills().map((entry) => {
        const button = document.createElement("button");
        const title = document.createElement("strong");
        const copy = document.createElement("span");
        button.type = "button";
        button.className = "practice-tactics-card";
        button.dataset.tacticsDrill = entry.id;
        title.textContent = entry.title;
        copy.textContent = entry.objective;
        button.append(title, copy);
        return button;
      })
    );
    elements.twistList.replaceChildren();
    elements.catalog.hidden = false;
    elements.twists.hidden = true;
    elements.session.hidden = true;
    elements.intro.hidden = false;
    elements.exit.hidden = false;
    elements.title.focus({ preventScroll: true });
  }

  function renderTwistChoices() {
    elements.catalog.hidden = true;
    elements.twists.hidden = false;
    elements.session.hidden = true;
    elements.twistList.replaceChildren(
      ...TACTICS_TRAIL_TWIST_IDS.map((twistId) => {
        const button = document.createElement("button");
        const title = document.createElement("strong");
        const copy = document.createElement("span");
        button.type = "button";
        button.className = "practice-tactics-twist";
        button.dataset.tacticsTwist = twistId;
        title.textContent = TWIST_LABELS[twistId];
        copy.textContent = `Ruleset ${twistId}`;
        button.append(title, copy);
        return button;
      })
    );
    elements.twistList.querySelector("button")?.focus();
  }

  /** @param {string} drillId @param {string} [twistRevision] */
  function startDrill(drillId, twistRevision) {
    session = createTacticsLabSession(drillId, twistRevision);
    drill = listTacticsDrills().find((entry) => entry.id === drillId) ?? null;
    if (!drill) {
      throw new Error("Tactics Lab drill is not available.");
    }
    elements.catalog.hidden = true;
    elements.twists.hidden = true;
    elements.session.hidden = false;
    elements.intro.hidden = true;
    renderSession();
    elements.drillTitle.focus({ preventScroll: true });
  }

  function renderSession() {
    if (!session || !drill) return;
    provideQuestionIfNeeded();
    const state = getTacticsLabPublicState(session);
    elements.progress.textContent = `${drill.title} / ${state.moves} moves / ${state.pulses} Pulses`;
    elements.drillTitle.textContent = drill.title;
    elements.objective.textContent = drill.objective;
    elements.rule.textContent = session.twistId
      ? `${TWIST_LABELS[session.twistId]} is active. The Lab uses the production regional rule and no hidden map shortcut.`
      : "Classic Rules are active. The Lab uses the production Warden movement thresholds.";
    const eventMessage = safeEventMessage(state.event?.message);
    elements.status.textContent = `${eventMessage} ${statusCopy(state.status)}`.trim();
    elements.report.replaceChildren(
      ...state.wardens.map((warden) => {
        const line = document.createElement("span");
        const label = document.createElement("strong");
        label.textContent = `Warden ${warden.id + 1}`;
        line.append(
          label,
          ` ${MODE_COPY[warden.mode] ?? "The Warden's current mode is not available."}`
        );
        return line;
      })
    );
    for (const button of elements.shell.querySelectorAll("[data-tactics-move]")) {
      if (button instanceof HTMLButtonElement) {
        button.disabled = state.status !== "active";
      }
    }
    elements.moves.disabled = state.status !== "active";
    elements.challenge.hidden = state.status !== "challenge";
    if (state.status === "challenge" && session.run.challenge?.question) {
      renderQuestion(session.run.challenge.question);
    } else {
      clearQuestion();
    }
  }

  /** @param {TacticsQuestion} question */
  function renderQuestion(question) {
    elements.question.textContent = question.prompt;
    elements.choices.replaceChildren(
      ...question.choices.map((choice) => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "practice-tactics__choice";
        button.dataset.tacticsAnswer = choice.id;
        button.textContent = choice.label;
        return button;
      })
    );
    elements.hint.disabled = session?.run.challenge?.hintRevealed === true;
    elements.hintCopy.textContent =
      session?.run.challenge?.hintRevealed === true ? question.hint : "";
    elements.hintCopy.hidden = session?.run.challenge?.hintRevealed !== true;
    elements.skip.disabled = false;
  }

  function clearQuestion() {
    elements.question.textContent = "";
    elements.choices.replaceChildren();
    elements.hintCopy.textContent = "";
    elements.hintCopy.hidden = true;
    elements.hint.disabled = false;
    elements.skip.disabled = false;
  }

  /** @param {Parameters<typeof applyTacticsLabAction>[1]} action */
  function apply(action) {
    if (!session) return;
    session = applyTacticsLabAction(session, action);
    renderSession();
  }

  function provideQuestionIfNeeded() {
    if (
      !session ||
      session.run.status !== "challenge" ||
      !session.run.challenge ||
      session.run.challenge.question
    ) {
      return;
    }
    const challenge = session.run.challenge;
    const question = getBundledQuestion({
      levelId: "bright-start",
      seed: session.run.seed,
      wardenId: challenge.wardenId,
      attempt: challenge.attempt,
      labyrinthNumber: session.twistId
        ? TWIST_LABYRINTHS[session.twistId]
        : 1,
      questionOrdinal: challenge.attempt + 1,
      challengeKind: challenge.kind === "gate-warden" ? "gate-warden" : "warden"
    });
    session = applyTacticsLabAction(session, {
      type: "provide-question",
      question
    });
  }

  function clearPresentation() {
    elements.catalog.replaceChildren();
    elements.twistList.replaceChildren();
    elements.catalog.hidden = true;
    elements.twists.hidden = true;
    elements.session.hidden = true;
    elements.intro.hidden = false;
    elements.exit.hidden = false;
    clearQuestion();
  }
}

/** @param {Event} event @param {string} selector */
function closestButton(event, selector) {
  const target = event.target;
  const button = target instanceof Element ? target.closest(selector) : null;
  return button instanceof HTMLButtonElement ? button : null;
}

/** @param {string | undefined} message */
function safeEventMessage(message) {
  return (message ?? "Choose a move to read the Warden report.").replace(
    /\s*You earned \d+ score\./gi,
    ""
  );
}

/** @param {string} status */
function statusCopy(status) {
  return {
    active: "Choose a legal action; this session is unscored.",
    challenge: "Answer the reviewed Question or use the normal Hint/Skip economy.",
    paused: "The drill is paused.",
    won: "The drill ended; restart or return to the cards.",
    lost: "The drill ended; restart or return to the cards."
  }[status] ?? "The drill is ready.";
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
    throw new Error(`Tactics Lab view is missing #${id}.`);
  }
  return element;
}
