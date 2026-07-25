import { EchoAudio } from "./game/audio.js";
import {
  clearActiveRunLocator,
  loadActiveRunLocator,
  saveActiveRunLocator
} from "./game/active-run-locator.js";
import { createCanvasRenderer } from "./game/canvas-renderer.js";
import {
  clearPendingGuestDemo,
  hasCompletedGuestDemo,
  markGuestDemoComplete,
  markGuestDemoPendingAuthentication,
  requiresDemoAccount
} from "./game/demo-access.js";
import { applyAction, createRun } from "./game/game-session.js";
import {
  advanceQuest,
  createQuestProgress,
  loadQuestProgress,
  rememberMap,
  rememberQuestion,
  saveQuestProgress
} from "./game/quest-progress.js";
import { loadRunRecords, saveRunRecord } from "./game/storage.js";
import { getBundledQuestion } from "./questions/question-bank.js";
import {
  QUEST_LABYRINTH_COUNT,
  getDifficultyBand,
  getLabyrinthConfig,
  getQuestLevel
} from "./questions/quest-levels.js";
import { createPlayerController } from "./player/player-controller.js";

/** @typedef {"up" | "right" | "down" | "left"} Direction */
/** @typedef {"move" | "blocked" | "echo" | "pulse" | "challenge" | "correct" | "wrong" | "won" | "lost" | "enabled"} AudioCue */

const canvas = requiredElement("maze-canvas", HTMLCanvasElement);
const renderer = createCanvasRenderer(canvas);
const audio = new EchoAudio();

const elements = {
  best: requiredElement("best-run", HTMLElement),
  canvasFrame: requiredElement("canvas-frame", HTMLElement),
  challengeChoices: requiredElement("challenge-choices", HTMLElement),
  challengeDialog: requiredElement("challenge-dialog", HTMLDialogElement),
  challengeFeedback: requiredElement("challenge-feedback", HTMLElement),
  challengeQuestion: requiredElement("challenge-question", HTMLElement),
  challengeSource: requiredElement("challenge-source", HTMLElement),
  echoCount: requiredElement("echo-count", HTMLElement),
  echoMeter: requiredElement("echo-meter", HTMLElement),
  eventRibbon: requiredElement("event-ribbon", HTMLElement),
  fieldNote: requiredElement("field-note", HTMLElement),
  freshRun: requiredElement("fresh-run", HTMLButtonElement),
  hintButton: requiredElement("hint-button", HTMLButtonElement),
  liveRegion: requiredElement("live-region", HTMLElement),
  levelCards: requiredElement("level-cards", HTMLElement),
  levelDialog: requiredElement("level-dialog", HTMLDialogElement),
  moves: requiredElement("moves-value", HTMLElement),
  newRun: requiredElement("new-run", HTMLButtonElement),
  pause: requiredElement("pause-run", HTMLButtonElement),
  pulse: requiredElement("pulse-action", HTMLButtonElement),
  pulseCount: requiredElement("pulse-count", HTMLElement),
  recordsButton: requiredElement("records-button", HTMLButtonElement),
  recordsClose: requiredElement("records-close", HTMLButtonElement),
  recordsDialog: requiredElement("records-dialog", HTMLDialogElement),
  replay: requiredElement("replay-run", HTMLButtonElement),
  resultDialog: requiredElement("result-dialog", HTMLDialogElement),
  resultKicker: requiredElement("result-kicker", HTMLElement),
  resultMoves: requiredElement("result-moves", HTMLElement),
  resultRank: requiredElement("result-rank", HTMLElement),
  resultSeed: requiredElement("result-seed", HTMLElement),
  resultSummary: requiredElement("result-summary", HTMLElement),
  resultTime: requiredElement("result-time", HTMLElement),
  resultTitle: requiredElement("result-title", HTMLElement),
  runState: requiredElement("run-state", HTMLElement),
  runRecords: requiredElement("run-records", HTMLOListElement),
  questHeadline: requiredElement("quest-headline", HTMLElement),
  questLevelName: requiredElement("quest-level-name", HTMLElement),
  questStage: requiredElement("quest-stage", HTMLElement),
  questionHint: requiredElement("question-hint", HTMLElement),
  seedCopy: requiredElement("seed-copy", HTMLButtonElement),
  seedValue: requiredElement("seed-value", HTMLElement),
  skipCancel: requiredElement("skip-cancel", HTMLButtonElement),
  skipConfirm: requiredElement("skip-confirm", HTMLButtonElement),
  skipQuestion: requiredElement("skip-question", HTMLButtonElement),
  skipWarning: requiredElement("skip-warning", HTMLElement),
  skipWarningText: requiredElement("skip-warning-text", HTMLElement),
  sound: requiredElement("sound-toggle", HTMLButtonElement),
  storyLog: requiredElement("story-log", HTMLOListElement),
  time: requiredElement("time-value", HTMLElement),
  vitalityCount: requiredElement("vitality-count", HTMLElement),
  vitalityMeter: requiredElement("vitality-meter", HTMLElement),
  wardenReadout: requiredElement("warden-readout", HTMLElement),
  wardenState: requiredElement("warden-state", HTMLElement)
};

const locationSeed = seedFromLocation();
const sharedParametersNeedNotice =
  locationSeed !== null && hasInvalidSharedParameters();
const storedQuestProgress = loadQuestProgress();
let activeRunLocator = locationSeed === null ? loadActiveRunLocator() : null;
if (
  activeRunLocator &&
  storedQuestProgress &&
  (activeRunLocator.levelId !== storedQuestProgress.levelId ||
    activeRunLocator.labyrinthNumber !== storedQuestProgress.labyrinthNumber)
) {
  clearActiveRunLocator();
  activeRunLocator = null;
}
const locationLevel = getQuestLevel(
  locationSeed === null
    ? activeRunLocator?.levelId ?? storedQuestProgress?.levelId ?? "trail-scout"
    : levelFromLocation()
);
const locationLabyrinthNumber = locationSeed === null
  ? activeRunLocator?.labyrinthNumber ?? storedQuestProgress?.labyrinthNumber ?? 1
  : labyrinthFromLocation() ?? 1;
const storedLocationMatches =
  storedQuestProgress?.levelId === locationLevel.id &&
  storedQuestProgress.labyrinthNumber === locationLabyrinthNumber;
let questProgress =
  storedQuestProgress && storedLocationMatches
    ? storedQuestProgress
    : createQuestProgress(
        locationLevel.id,
        locationLabyrinthNumber
      );
let currentLevel = getQuestLevel(questProgress.levelId);
let currentLabyrinthNumber = questProgress.labyrinthNumber;
let run = createRun(
  locationSeed ?? activeRunLocator?.seed ?? createSeed(),
  getLabyrinthConfig(currentLevel.id, currentLabyrinthNumber)
);
const playerController = createPlayerController({
  onPaletteChange: () => renderer.render(run),
  onAuthenticationChange: syncDemoAccountAction
});
let runRecords = loadRunRecords();
let bestEscapeRecord = bestEscape(runRecords);
let lastTick = performance.now();
let eventTimer = 0;
let resumeAfterRecords = false;
let questionRequestKey = "";
let runFinished = false;
let demoAccessPending = hasCompletedGuestDemo();
let mustChooseLevel =
  locationSeed === null &&
  activeRunLocator === null &&
  storedQuestProgress === null;
if (!mustChooseLevel) {
  questProgress = saveQuestProgress(questProgress);
}
/** @type {{ message: string, kind: string }[]} */
let storyEntries = [];
/** @type {{ x: number, y: number } | null} */
let touchStart = null;

if (locationSeed !== null || activeRunLocator !== null) {
  const locator = activeRunLocator;
  void startSharedRun(
    locationSeed ?? locator?.seed ?? createSeed(),
    currentLevel.id,
    currentLabyrinthNumber,
    sharedParametersNeedNotice
  );
} else if (storedQuestProgress !== null) {
  void startFreshRun();
}
if (mustChooseLevel) {
  void openLevelPicker();
}
requestAnimationFrame(tick);

document.addEventListener("keydown", (event) => {
  if (
    document.querySelector("dialog[open]") ||
    isNativeControl(event.target)
  ) {
    return;
  }
  const directions = /** @type {Partial<Record<string, Direction>>} */ ({
    ArrowUp: "up",
    w: "up",
    W: "up",
    ArrowRight: "right",
    d: "right",
    D: "right",
    ArrowDown: "down",
    s: "down",
    S: "down",
    ArrowLeft: "left",
    a: "left",
    A: "left"
  });
  const direction = directions[event.key];

  if (direction) {
    event.preventDefault();
    move(direction);
  } else if (event.key === "q" || event.key === "Q" || event.code === "Space") {
    event.preventDefault();
    usePulse();
  } else if (event.key === "Escape" || event.key === "p" || event.key === "P") {
    event.preventDefault();
    togglePause();
  }
});

document.querySelectorAll("[data-move]").forEach((button) => {
  button.addEventListener("click", () => {
    if (button instanceof HTMLElement) {
      move(/** @type {Direction | undefined} */ (button.dataset.move));
    }
  });
});

elements.pulse.addEventListener("click", usePulse);
elements.pause.addEventListener("click", togglePause);
elements.newRun.addEventListener("click", openLevelPicker);
elements.levelCards.addEventListener("click", async (event) => {
  const button =
    event.target instanceof Element
      ? event.target.closest("button[data-level]")
      : null;
  if (!(button instanceof HTMLButtonElement) || !button.dataset.level) {
    return;
  }

  if (await startNewQuest(button.dataset.level)) {
    mustChooseLevel = false;
    elements.levelDialog.close();
  }
});
elements.levelDialog.addEventListener("cancel", (event) => {
  if (mustChooseLevel) {
    event.preventDefault();
  }
});
elements.challengeDialog.addEventListener("cancel", (event) => {
  event.preventDefault();
});
elements.challengeChoices.addEventListener("click", (event) => {
  const button =
    event.target instanceof Element
      ? event.target.closest("button[data-answer]")
      : null;
  if (!(button instanceof HTMLButtonElement) || !button.dataset.answer) {
    return;
  }

  transition({
    type: "answer-question",
    answerId: button.dataset.answer
  });
});
elements.hintButton.addEventListener("click", () => {
  transition({ type: "reveal-hint" });
});
elements.skipQuestion.addEventListener("click", () => {
  if (run.freeQuestionSkipAvailable) {
    transition({ type: "skip-question" });
    return;
  }
  showSkipWarning();
});
elements.skipCancel.addEventListener("click", () => {
  hideSkipWarning();
  elements.skipQuestion.focus();
});
elements.skipConfirm.addEventListener("click", () => {
  hideSkipWarning();
  transition({ type: "skip-question" });
});
elements.recordsButton.addEventListener("click", () => {
  resumeAfterRecords = run.status === "active";
  if (resumeAfterRecords) {
    togglePause();
  }
  renderRunRecords();
  elements.recordsDialog.showModal();
});
elements.recordsClose.addEventListener("click", () => {
  elements.recordsDialog.close();
});
elements.recordsDialog.addEventListener("close", () => {
  if (resumeAfterRecords && run.status === "paused") {
    togglePause();
  }
  resumeAfterRecords = false;
});
elements.runRecords.addEventListener("click", async (event) => {
  const button =
    event.target instanceof Element
      ? event.target.closest("button[data-seed]")
      : null;
  if (
    !(button instanceof HTMLButtonElement) ||
    !button.dataset.seed
  ) {
    return;
  }

  if (button.dataset.recordAction === "replay") {
    await startRecordedLabyrinth(
      button.dataset.level ?? "trail-scout",
      Number(button.dataset.labyrinth ?? 1),
      button.dataset.seed
    );
    return;
  }

  if (button.dataset.recordAction === "copy") {
    try {
      await navigator.clipboard.writeText(
        createShareLink(
          button.dataset.seed,
          button.dataset.level ?? "trail-scout",
          Number(button.dataset.labyrinth ?? 1)
        )
      );
      button.textContent = "Copied";
      announce(`Share link for seed ${button.dataset.seed} copied.`);
      window.setTimeout(() => {
        if (button.isConnected) {
          button.textContent = "Copy Share Link";
        }
      }, 1400);
    } catch {
      announce(`Copy failed. Seed ${button.dataset.seed} is visible.`);
    }
  }
});
elements.freshRun.addEventListener("click", () => {
  void openLevelPicker();
});
elements.replay.addEventListener("click", async () => {
  const action = elements.replay.dataset.resultAction;
  if (action === "create-account") {
    await requestDemoAccount();
    return;
  }
  if (action === "continue" || action === "retry") {
    await startFreshRun();
    return;
  }
  await openLevelPicker();
});
elements.sound.addEventListener("click", async () => {
  const enabled = await audio.toggle();
  elements.sound.textContent = enabled ? "Sound on" : "Sound off";
  elements.sound.setAttribute("aria-pressed", String(enabled));
});
elements.seedCopy.addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(createShareLink());
    announce("Share link copied.");
    showEvent("Share link copied. Send it to another Explorer.");
  } catch {
    announce(`Share link copy failed. Current seed ${run.seed}.`);
  }
});

canvas.addEventListener("pointerdown", (event) => {
  touchStart = { x: event.clientX, y: event.clientY };
  try {
    canvas.setPointerCapture(event.pointerId);
  } catch {
    // Synthetic pointer events and older browsers may not expose capture.
  }
});
canvas.addEventListener("pointerup", (event) => {
  if (!touchStart) {
    return;
  }
  const deltaX = event.clientX - touchStart.x;
  const deltaY = event.clientY - touchStart.y;
  touchStart = null;
  if (Math.max(Math.abs(deltaX), Math.abs(deltaY)) < 24) {
    canvas.focus();
    return;
  }
  move(Math.abs(deltaX) > Math.abs(deltaY)
    ? deltaX > 0 ? "right" : "left"
    : deltaY > 0 ? "down" : "up");
});

window.addEventListener("resize", () => {
  renderer.resize();
  renderer.render(run);
});

document.addEventListener("visibilitychange", () => {
  if (document.hidden && run.status === "active") {
    togglePause();
  }
});

/**
 * @param {string} seed
 * @param {string} [levelId]
 * @param {number} [labyrinthNumber]
 */
function startRun(
  seed,
  levelId = currentLevel.id,
  labyrinthNumber = questProgress.labyrinthNumber
) {
  currentLevel = getQuestLevel(levelId);
  currentLabyrinthNumber = labyrinthNumber;
  run = createRun(
    seed,
    getLabyrinthConfig(currentLevel.id, currentLabyrinthNumber)
  );
  const fingerprint = labyrinthFingerprint(run);
  if (!questProgress.usedMapFingerprints.includes(fingerprint)) {
    questProgress = saveQuestProgress(rememberMap(questProgress, fingerprint));
  }
  activeRunLocator = saveActiveRunLocator({
    version: 1,
    seed: run.seed,
    levelId: currentLevel.id,
    labyrinthNumber: currentLabyrinthNumber
  });
  lastTick = performance.now();
  questionRequestKey = "";
  runFinished = false;
  storyEntries = [];
  hideSkipWarning();
  addStory(
    `Labyrinth ${currentLabyrinthNumber} of ${QUEST_LABYRINTH_COUNT} begins. Recover every Echo.`,
    "start"
  );
  if (elements.resultDialog.open) {
    elements.resultDialog.close();
  }
  if (elements.recordsDialog.open) {
    elements.recordsDialog.close();
  }
  if (elements.challengeDialog.open) {
    elements.challengeDialog.close();
  }
  updateInterface();
  canvas.focus({ preventScroll: true });
  announce(
    `${currentLevel.name}, Labyrinth ${currentLabyrinthNumber} of ${QUEST_LABYRINTH_COUNT}. ${run.echoes.length} Echoes remain.`
  );
  showEvent(`Labyrinth ${currentLabyrinthNumber} ready. Find the Echoes.`);
}

async function startFreshRun() {
  if (!(await canStartAnotherLabyrinth())) {
    return false;
  }
  const levelId = questProgress.levelId;
  const labyrinthNumber = questProgress.labyrinthNumber;
  if (
    activeRunLocator?.levelId === levelId &&
    activeRunLocator.labyrinthNumber === labyrinthNumber
  ) {
    startRun(activeRunLocator.seed, levelId, labyrinthNumber);
    return true;
  }
  const locator = createFreshLocator(levelId, labyrinthNumber);
  startRun(locator.seed, levelId, labyrinthNumber);
  return true;
}

/**
 * @param {string} seed
 * @param {string} levelId
 * @param {number} labyrinthNumber
 * @param {boolean} [showAdjustedNotice]
 */
async function startSharedRun(seed, levelId, labyrinthNumber, showAdjustedNotice = false) {
  if (!(await canStartAnotherLabyrinth())) {
    return false;
  }
  startRun(seed, levelId, labyrinthNumber);
  if (showAdjustedNotice) {
    announce("This share link was adjusted to a safe Labyrinth.");
    showEvent("This share link was adjusted to a safe Labyrinth.");
  }
  return true;
}

/** @param {string} levelId @param {number} labyrinthNumber */
function createFreshLocator(levelId, labyrinthNumber) {
  const level = getQuestLevel(levelId);
  const config = getLabyrinthConfig(levelId, labyrinthNumber);
  const usedFingerprints = new Set([
    ...questProgress.usedMapFingerprints,
    labyrinthFingerprint(run)
  ]);
  for (let attempt = 0; attempt < 24; attempt += 1) {
    const seed = createSeed();
    if (seed === run.seed) {
      continue;
    }
    const candidate = createRun(seed, config);
    if (!usedFingerprints.has(labyrinthFingerprint(candidate))) {
      return {
        version: 1,
        seed: candidate.seed,
        levelId: level.id,
        labyrinthNumber
      };
    }
  }

  for (let attempt = 0; attempt < 100; attempt += 1) {
    const fallbackSeed = `EMBER-${17 + attempt}`;
    const candidate = createRun(fallbackSeed, config);
    if (!usedFingerprints.has(labyrinthFingerprint(candidate))) {
      return {
        version: 1,
        seed: candidate.seed,
        levelId: level.id,
        labyrinthNumber
      };
    }
  }

  throw new Error("Could not create a fresh Labyrinth for this Quest.");
}

/** @param {string} levelId @param {string} [seed] */
async function startNewQuest(levelId, seed) {
  if (!(await canStartAnotherLabyrinth())) {
    return false;
  }
  questProgress = saveQuestProgress(createQuestProgress(levelId));
  currentLabyrinthNumber = questProgress.labyrinthNumber;
  activeRunLocator = null;
  clearActiveRunLocator();
  window.history.replaceState({}, "", "/play");
  if (seed) {
    startRun(seed, questProgress.levelId, currentLabyrinthNumber);
    return true;
  }
  return startFreshRun();
}

/**
 * @param {string} levelId
 * @param {number} labyrinthNumber
 * @param {string} seed
 */
async function startRecordedLabyrinth(levelId, labyrinthNumber, seed) {
  if (!(await canStartAnotherLabyrinth())) {
    return false;
  }
  questProgress = saveQuestProgress(
    createQuestProgress(levelId, labyrinthNumber)
  );
  window.history.replaceState({}, "", "/play");
  startRun(seed, questProgress.levelId, questProgress.labyrinthNumber);
  return true;
}

async function openLevelPicker() {
  if (!(await canStartAnotherLabyrinth())) {
    return false;
  }
  mustChooseLevel = false;
  if (elements.recordsDialog.open) {
    elements.recordsDialog.close();
  }
  if (!elements.levelDialog.open) {
    elements.levelDialog.showModal();
  }
  return true;
}

async function canStartAnotherLabyrinth() {
  if (
    !demoAccessPending ||
    !requiresDemoAccount(playerController.hasAuthenticatedUser())
  ) {
    demoAccessPending = false;
    return true;
  }
  if (await playerController.isAuthenticated()) {
    clearPendingGuestDemo();
    demoAccessPending = false;
    return true;
  }
  showDemoAccountGate();
  return false;
}

function showDemoAccountGate() {
  elements.resultKicker.textContent = "Demo complete";
  elements.resultTitle.textContent = "Create an account to continue.";
  elements.resultSummary.textContent =
    "You completed your free Labyrinth. Create an account to continue your Quest.";
  elements.replay.dataset.resultAction = "create-account";
  elements.replay.textContent = "Create account to continue";
  elements.freshRun.hidden = true;
  if (elements.levelDialog.open) {
    elements.levelDialog.close();
  }
  if (elements.recordsDialog.open) {
    elements.recordsDialog.close();
  }
  if (!elements.resultDialog.open) {
    elements.resultDialog.showModal();
  }
  announce("Your free Labyrinth is complete. Create an account to continue.");
}

async function requestDemoAccount() {
  const restoreDemoGate = elements.resultDialog.open;
  if (restoreDemoGate) {
    elements.resultDialog.close();
  }
  if (await playerController.openAccountCreation()) {
    return;
  }
  elements.resultSummary.textContent =
    "Account creation is unavailable right now. Try again later to continue your Quest.";
  if (restoreDemoGate && !elements.resultDialog.open) {
    elements.resultDialog.showModal();
  }
  announce("Account creation is unavailable right now.");
  showEvent("Account creation is unavailable right now.");
}

/** @param {boolean} signedIn */
function syncDemoAccountAction(signedIn) {
  if (!signedIn) {
    demoAccessPending = demoAccessPending || requiresDemoAccount(false);
    return;
  }
  if (elements.replay.dataset.resultAction !== "create-account") {
    return;
  }
  demoAccessPending = false;
  const questComplete = questProgress.complete;
  elements.resultSummary.textContent = questComplete
    ? "Your account is ready. Begin a new Quest whenever you are ready."
    : "Your account is ready. Continue your Quest.";
  elements.replay.dataset.resultAction = questComplete ? "new-quest" : "continue";
  elements.replay.textContent = questComplete ? "New Quest" : "Continue Quest";
  elements.freshRun.hidden = questComplete;
}

/** @param {Direction | undefined} direction */
function move(direction) {
  if (demoAccessPending || !direction || run.status !== "active") {
    return;
  }
  transition({ type: "move", direction });
}

function usePulse() {
  if (demoAccessPending || run.status !== "active") {
    return;
  }
  transition({ type: "pulse" });
}

function togglePause() {
  if (
    demoAccessPending ||
    (run.status !== "active" && run.status !== "paused")
  ) {
    return;
  }
  transition({ type: "pause" });
}

/** @param {Parameters<typeof applyAction>[1]} action */
function transition(action) {
  const previous = run;
  const previousWardenMode = summarizeWardenMode(previous);
  run = applyAction(run, action);
  const eventType = run.event.type;
  const wardenMode = summarizeWardenMode(run);
  const eventChanged =
    eventType !== previous.event.type || run.moves !== previous.moves;

  if (eventChanged) {
    showEvent(run.event.message);
    if (
      [
        "echo-collected",
        "gate-locked",
        "challenge-started",
        "question-skipped-free",
        "question-skipped-paid",
        "wrong-answer",
        "warden-defeated",
        "escaped",
        "defeated"
      ].includes(eventType)
    ) {
      addStory(run.event.message, eventType);
    }
  }
  if (eventChanged || wardenMode !== previousWardenMode) {
    const modeAnnouncement =
      wardenMode !== previousWardenMode
        ? ` Warden mode: ${wardenModeLabel(wardenMode)}.`
        : "";
    announce(`${eventChanged ? run.event.message : ""}${modeAnnouncement}`.trim());
  }
  playEventSound(eventType);
  if (
    eventType === "wrong-answer" ||
    eventType === "question-skipped-paid" ||
    eventType === "defeated"
  ) {
    elements.canvasFrame.classList.remove("is-hurt");
    void elements.canvasFrame.offsetWidth;
    elements.canvasFrame.classList.add("is-hurt");
  }

  updateInterface();
  syncChallengeDialog();
  if (!runFinished && (run.status === "won" || run.status === "lost")) {
    finishRun();
  }
}

function syncChallengeDialog() {
  if (run.status !== "challenge" || !run.challenge) {
    hideSkipWarning();
    if (elements.challengeDialog.open) {
      elements.challengeDialog.close();
      canvas.focus({ preventScroll: true });
    }
    return;
  }

  if (!elements.challengeDialog.open) {
    elements.challengeDialog.showModal();
  }

  const { question, feedback } = run.challenge;
  elements.challengeFeedback.classList.toggle(
    "is-wrong",
    feedback?.kind === "wrong"
  );
  elements.challengeFeedback.classList.toggle(
    "is-skipped",
    feedback?.kind === "skipped"
  );
  elements.challengeFeedback.textContent = feedback
    ? `${feedback.message} ${feedback.explanation}`
    : "Think carefully. Your timer is paused.";

  if (!question) {
    hideSkipWarning();
    elements.challengeQuestion.textContent = feedback
      ? "The Warden draws a new question…"
      : "Preparing your question…";
    elements.challengeChoices.replaceChildren();
    elements.hintButton.disabled = true;
    elements.hintButton.setAttribute("aria-expanded", "false");
    elements.questionHint.hidden = true;
    elements.questionHint.textContent = "";
    elements.skipQuestion.disabled = true;
    elements.challengeSource.textContent = "Opening the question scroll…";
    void loadChallengeQuestion();
    return;
  }

  elements.challengeQuestion.textContent = question.prompt;
  elements.hintButton.disabled = run.challenge.hintRevealed;
  elements.hintButton.textContent = run.challenge.hintRevealed
    ? "Hint shown"
    : "Show Hint";
  elements.hintButton.setAttribute(
    "aria-expanded",
    String(run.challenge.hintRevealed)
  );
  elements.questionHint.hidden = !run.challenge.hintRevealed;
  elements.questionHint.textContent = run.challenge.hintRevealed
    ? question.hint
    : "";
  elements.skipQuestion.disabled = false;
  elements.skipQuestion.textContent = run.freeQuestionSkipAvailable
    ? "Skip free"
    : "Skip · 1 Vitality";
  elements.challengeChoices.replaceChildren(
    ...question.choices.map((choice) => {
      const button = document.createElement("button");
      const marker = document.createElement("span");
      const label = document.createElement("strong");
      button.type = "button";
      button.className = "challenge-choice";
      button.dataset.answer = choice.id;
      marker.textContent = choice.id.toUpperCase();
      marker.setAttribute("aria-hidden", "true");
      label.textContent = choice.label;
      button.append(marker, label);
      return button;
    })
  );
  requestAnimationFrame(() => {
    elements.challengeQuestion.focus({ preventScroll: true });
  });
}

function showSkipWarning() {
  if (run.status !== "challenge" || !run.challenge?.question) {
    return;
  }
  elements.skipWarningText.textContent =
    run.explorer.vitality === 1
      ? "This skip uses your last Vitality and will end this Labyrinth."
      : "Skipping costs 1 Vitality.";
  elements.skipWarning.hidden = false;
  elements.skipConfirm.focus();
}

function hideSkipWarning() {
  elements.skipWarning.hidden = true;
}

async function loadChallengeQuestion() {
  if (run.status !== "challenge" || !run.challenge) {
    return;
  }
  const challengeSnapshot = {
    levelId: currentLevel.id,
    seed: run.seed,
    wardenId: run.challenge.wardenId,
    attempt: run.challenge.attempt,
    labyrinthNumber: currentLabyrinthNumber,
    questionOrdinal: questProgress.nextQuestionOrdinal
  };
  const key = questionRequestIdentifier(challengeSnapshot);
  if (questionRequestKey === key) {
    return;
  }
  questionRequestKey = key;

  let acceptedQuestion = null;
  let acceptedOrdinal = challengeSnapshot.questionOrdinal;
  let acceptedSource = "bundled";
  for (let offset = 0; offset < 20; offset += 1) {
    const request = {
      ...challengeSnapshot,
      questionOrdinal: challengeSnapshot.questionOrdinal + offset
    };
    let question;
    let source = "bundled";
    try {
      const parameters = new URLSearchParams({
        level: request.levelId,
        seed: request.seed,
        warden: String(request.wardenId),
        attempt: String(request.attempt),
        labyrinth: String(request.labyrinthNumber),
        question: String(request.questionOrdinal)
      });
      const response = await fetch(`/api/question?${parameters}`);
      if (!response.ok) {
        throw new Error("Question service unavailable.");
      }
      const payload = await response.json();
      if (!isClientQuestion(payload.question)) {
        throw new Error("Question service returned an invalid card.");
      }
      question = payload.question;
      source = payload.source;
    } catch {
      question = getBundledQuestion(request);
    }

    if (!questProgress.usedQuestionIds.includes(question.id)) {
      acceptedQuestion = question;
      acceptedOrdinal = request.questionOrdinal;
      acceptedSource = source;
      break;
    }
  }

  if (
    run.status !== "challenge" ||
    !run.challenge ||
    challengeSnapshot.seed !== run.seed ||
    challengeSnapshot.levelId !== currentLevel.id ||
    challengeSnapshot.labyrinthNumber !== currentLabyrinthNumber ||
    challengeSnapshot.wardenId !== run.challenge.wardenId ||
    challengeSnapshot.attempt !== run.challenge.attempt ||
    questionRequestKey !== key
  ) {
    return;
  }
  if (!acceptedQuestion) {
    elements.challengeSource.textContent =
      "No fresh question card was available. Start a new Quest to reset the Question deck.";
    return;
  }

  questProgress = saveQuestProgress(
    rememberQuestion(questProgress, acceptedQuestion.id, acceptedOrdinal)
  );

  elements.challengeSource.textContent = {
    ollama: "A fresh local question is ready.",
    gemini: "A fresh quest question is ready.",
    bundled: "A trusty question card is ready."
  }[acceptedSource] ?? "Your question is ready.";
  transition({ type: "provide-question", question: acceptedQuestion });
}

/**
 * @param {{
 *   levelId: string,
 *   seed: string,
 *   wardenId: number,
 *   attempt: number,
 *   labyrinthNumber: number,
 *   questionOrdinal: number
 * }} request
 */
function questionRequestIdentifier(request) {
  return [
    request.levelId,
    request.seed,
    request.wardenId,
    request.attempt,
    request.labyrinthNumber,
    request.questionOrdinal
  ].join(":");
}

/** @param {unknown} value */
function isClientQuestion(value) {
  if (!value || typeof value !== "object") {
    return false;
  }
  const question = /** @type {Record<string, unknown>} */ (value);
  return (
    typeof question.id === "string" &&
    typeof question.prompt === "string" &&
    typeof question.answerId === "string" &&
    typeof question.hint === "string" &&
    typeof question.explanation === "string" &&
    typeof question.difficultyBand === "string" &&
    typeof question.difficultyRank === "number" &&
    Array.isArray(question.choices) &&
    question.choices.length === 3
  );
}

function updateInterface() {
  renderer.render(run);
  const collected = run.echoes.filter((echo) => echo.collected).length;
  const difficultyBand = getDifficultyBand(currentLabyrinthNumber);
  elements.questLevelName.textContent =
    `Quest Level ${currentLevel.number} · ${currentLevel.name}`;
  elements.questStage.textContent =
    `Labyrinth ${currentLabyrinthNumber} of ${QUEST_LABYRINTH_COUNT} · ${difficultyBand.label}`;
  elements.questHeadline.textContent =
    `Labyrinth ${currentLabyrinthNumber}: find ${run.echoes.length} Echoes and outsmart ${run.config.wardenCount} ${run.config.wardenCount === 1 ? "Warden" : "Wardens"}.`;
  elements.seedValue.textContent = run.seed;
  elements.time.textContent = formatTime(run.elapsedMs);
  elements.moves.textContent = String(run.moves).padStart(3, "0");
  elements.echoCount.textContent = `${collected} / ${run.echoes.length}`;
  elements.vitalityCount.textContent =
    `${run.explorer.vitality} / ${run.explorer.maxVitality}`;
  elements.pulseCount.textContent = String(run.pulses);
  playerController.updateScore(run.score);
  elements.pulse.disabled = run.pulses === 0 || run.status !== "active";
  elements.recordsButton.disabled = run.status === "challenge";
  elements.pause.textContent = run.status === "paused" ? "Resume" : "Pause";
  elements.pause.disabled = run.status === "challenge";
  elements.pause.setAttribute("aria-pressed", String(run.status === "paused"));
  elements.runState.textContent = {
    active: run.gate.open ? "Gate open" : "Exploring",
    paused: "Paused",
    challenge: "Brain battle",
    won: "Escaped",
    lost: "Light lost"
  }[run.status];
  const wardenMode = summarizeWardenMode();
  elements.wardenState.textContent = wardenModeLabel(wardenMode);
  elements.wardenReadout.dataset.mode = wardenMode;
  elements.fieldNote.textContent = run.event.message;
  renderPips(elements.echoMeter, run.echoes.length, collected, "echo-pip");
  renderPips(
    elements.vitalityMeter,
    run.explorer.maxVitality,
    run.explorer.vitality,
    "vitality-pip"
  );
  elements.best.textContent = bestEscapeRecord
    ? `Best ${formatTime(bestEscapeRecord.elapsedMs)} / ${bestEscapeRecord.moves} moves / ${bestEscapeRecord.seed}`
    : runRecords.length > 0
      ? `${runRecords.length} ${runRecords.length === 1 ? "attempt" : "attempts"} saved. First escape sets the pace.`
      : "No finished run yet. Escape or defeat saves an attempt.";
  renderStory();
}

function finishRun() {
  runFinished = true;
  const won = run.status === "won";
  const finishedLabyrinthNumber = currentLabyrinthNumber;
  const echoesCollected = run.echoes.filter((echo) => echo.collected).length;
  runRecords = saveRunRecord({
    elapsedMs: run.elapsedMs,
    moves: run.moves,
    seed: run.seed,
    outcome: won ? "escaped" : "defeated",
    echoesCollected,
    echoTotal: run.echoes.length,
    questLevelId: currentLevel.id,
    labyrinthNumber: currentLabyrinthNumber
  });
  bestEscapeRecord = bestEscape(runRecords);
  if (won) {
    void playerController.submitEscapedRun(
      {
        seed: run.seed,
        moves: run.moves,
        elapsedMs: run.elapsedMs,
        score: run.score,
        wardensDefeated: run.wardensDefeated,
        echoesCollected
      },
      currentLevel.id,
      finishedLabyrinthNumber
    );
    questProgress = saveQuestProgress(advanceQuest(questProgress));
    activeRunLocator = questProgress.complete
      ? null
      : saveActiveRunLocator(
          createFreshLocator(
            questProgress.levelId,
            questProgress.labyrinthNumber
          )
        );
    if (questProgress.complete) {
      clearActiveRunLocator();
    }
  } else {
    activeRunLocator = null;
    clearActiveRunLocator();
  }
  window.history.replaceState({}, "", "/play");

  const questComplete = won && questProgress.complete;
  elements.resultKicker.textContent = questComplete
    ? "Quest complete"
    : won
      ? `Labyrinth ${finishedLabyrinthNumber} of ${QUEST_LABYRINTH_COUNT} complete`
      : `Labyrinth ${finishedLabyrinthNumber} ended`;
  elements.resultTitle.textContent = questComplete
    ? "You mastered all twenty Labyrinths."
    : won
      ? "You brought these Echoes home."
      : "The maze light needs a rest.";
  elements.resultSummary.textContent = questComplete
    ? `${currentLevel.name} is complete. Every Warden Question in this Quest stayed unique.`
    : won
      ? `Next: Labyrinth ${questProgress.labyrinthNumber} · ${getDifficultyBand(questProgress.labyrinthNumber).label}. Its paths and Questions will be harder.`
      : `You found ${echoesCollected} of ${run.echoes.length} Echoes. Try Labyrinth ${finishedLabyrinthNumber} again with a fresh path and full Vitality.`;
  elements.replay.dataset.resultAction = questComplete
    ? "new-quest"
    : won
      ? "continue"
      : "retry";
  elements.replay.textContent = questComplete
    ? "New Quest"
    : won
      ? "Continue Quest"
      : "Retry Labyrinth";
  elements.freshRun.hidden = questComplete;
  if (!playerController.hasAuthenticatedUser()) {
    markGuestDemoPendingAuthentication();
    demoAccessPending = true;
    showDemoAccountGate();
    void playerController.isAuthenticated().then((authenticated) => {
      if (authenticated) {
        clearPendingGuestDemo();
        syncDemoAccountAction(true);
        return;
      }
      markGuestDemoComplete();
      demoAccessPending = true;
    });
  }
  elements.resultTime.textContent = formatTime(run.elapsedMs);
  elements.resultMoves.textContent = String(run.moves).padStart(3, "0");
  elements.resultSeed.textContent = run.seed;
  elements.resultRank.textContent = resultStanding();
  renderRunRecords();
  updateInterface();
  if (!elements.resultDialog.open) {
    elements.resultDialog.showModal();
  }
}

/** @param {number} now */
function tick(now) {
  const deltaMs = Math.min(1000, now - lastTick);
  lastTick = now;
  if (!demoAccessPending && run.status === "active") {
    run = applyAction(run, { type: "tick", deltaMs });
    elements.time.textContent = formatTime(run.elapsedMs);
  }
  requestAnimationFrame(tick);
}

/** @param {string} type */
function playEventSound(type) {
  const cues = /** @type {Partial<Record<string, AudioCue>>} */ ({
    moved: "move",
    blocked: "blocked",
    "gate-locked": "blocked",
    "echo-collected": "echo",
    pulse: "pulse",
    "challenge-started": "challenge",
    "question-skipped-free": "pulse",
    "question-skipped-paid": "wrong",
    "wrong-answer": "wrong",
    "warden-defeated": "correct",
    escaped: "won",
    defeated: "lost"
  });
  const cue = cues[type];
  if (cue) {
    audio.play(cue);
  }
}

/** @param {HTMLElement} container @param {number} total @param {number} filled @param {string} className */
function renderPips(container, total, filled, className) {
  container.replaceChildren(
    ...Array.from({ length: total }, (_, index) => {
      const pip = document.createElement("span");
      pip.className = `${className}${index < filled ? " is-filled" : " is-empty"}`;
      return pip;
    })
  );
}

/** @param {string} message @param {string} kind */
function addStory(message, kind) {
  storyEntries = [...storyEntries, { message, kind }].slice(-4);
}

function renderStory() {
  elements.storyLog.replaceChildren(
    ...storyEntries.map((entry) => {
      const item = document.createElement("li");
      item.dataset.kind = entry.kind;
      item.textContent = entry.message;
      return item;
    })
  );
}

/** @param {string} message */
function showEvent(message) {
  window.clearTimeout(eventTimer);
  elements.eventRibbon.textContent = message;
  elements.eventRibbon.classList.add("is-visible");
  eventTimer = window.setTimeout(() => {
    elements.eventRibbon.classList.remove("is-visible");
  }, 2800);
}

/** @param {string} message */
function announce(message) {
  elements.liveRegion.textContent = "";
  requestAnimationFrame(() => {
    elements.liveRegion.textContent = message;
  });
}

/** @param {number} elapsedMs */
function formatTime(elapsedMs) {
  const totalSeconds = Math.floor(elapsedMs / 1000);
  return `${String(Math.floor(totalSeconds / 60)).padStart(2, "0")}:${String(totalSeconds % 60).padStart(2, "0")}`;
}

function createSeed() {
  const first = ["ASH", "CINDER", "EMBER", "LANTERN", "MOSS", "RUNE", "STONE"];
  const second = ["CHOIR", "HOLLOW", "KEEP", "PASSAGE", "VAULT", "WATCH"];
  const bytes = new Uint16Array(3);
  crypto.getRandomValues(bytes);
  return `${first[bytes[0] % first.length]}-${second[bytes[1] % second.length]}-${String(bytes[2] % 100).padStart(2, "0")}`;
}

/** @param {typeof run} gameRun */
function labyrinthFingerprint(gameRun) {
  return gameRun.labyrinth.map((row) => row.join("")).join("/");
}

/**
 * @param {string} [seed]
 * @param {string} [levelId]
 * @param {number} [labyrinthNumber]
 */
function createShareLink(
  seed = run.seed,
  levelId = currentLevel.id,
  labyrinthNumber = currentLabyrinthNumber
) {
  const url = new URL("/play", window.location.origin);
  url.searchParams.set("seed", seed);
  url.searchParams.set("level", levelId);
  url.searchParams.set("labyrinth", String(labyrinthNumber));
  return url.toString();
}

function seedFromLocation() {
  return new URL(window.location.href).searchParams.get("seed");
}

function hasInvalidSharedParameters() {
  const url = new URL(window.location.href);
  const seed = url.searchParams.get("seed");
  const levelId = url.searchParams.get("level");
  const labyrinthNumber = Number(url.searchParams.get("labyrinth"));
  return (
    !seed ||
    !/^[A-Z0-9]+(?:-[A-Z0-9]+)*$/.test(seed) ||
    !["bright-start", "trail-scout", "maze-master"].includes(levelId ?? "") ||
    !Number.isInteger(labyrinthNumber) ||
    labyrinthNumber < 1 ||
    labyrinthNumber > QUEST_LABYRINTH_COUNT
  );
}

function levelFromLocation() {
  return new URL(window.location.href).searchParams.get("level") ?? "trail-scout";
}

function labyrinthFromLocation() {
  const rawValue = new URL(window.location.href).searchParams.get("labyrinth");
  if (rawValue === null) {
    return null;
  }
  const labyrinthNumber = Number(rawValue);
  return Number.isInteger(labyrinthNumber) &&
    labyrinthNumber >= 1 &&
    labyrinthNumber <= QUEST_LABYRINTH_COUNT
    ? labyrinthNumber
    : null;
}

/** @param {typeof run} [gameRun] */
function summarizeWardenMode(gameRun = run) {
  if (gameRun.wardens.length === 0) {
    return "cleared";
  }
  if (gameRun.wardens.some((warden) => warden.mode === "intercept")) {
    return "intercept";
  }
  if (gameRun.wardens.some((warden) => warden.mode === "hunt")) {
    return "hunt";
  }
  return "patrol";
}

/** @param {"patrol" | "hunt" | "intercept" | "cleared"} mode */
function wardenModeLabel(mode) {
  return {
    cleared: "Path clear",
    intercept: "Intercept active",
    hunt: "Hunt active",
    patrol: "Patrol"
  }[mode];
}

function renderRunRecords() {
  if (runRecords.length === 0) {
    const empty = document.createElement("li");
    empty.className = "run-records__empty";
    empty.textContent = "No finished Runs recorded yet.";
    elements.runRecords.replaceChildren(empty);
    return;
  }

  elements.runRecords.replaceChildren(
    ...runRecords.map((record, index) => {
      const item = document.createElement("li");
      const summary = document.createElement("div");
      const title = document.createElement("strong");
      const detail = document.createElement("span");
      const actions = document.createElement("div");
      const replay = document.createElement("button");
      const copy = document.createElement("button");

      const outcome = record.outcome === "escaped" ? "Escaped" : "Defeated";
      const level = getQuestLevel(record.questLevelId);
      title.textContent =
        `#${index + 1} ${outcome} / ${level.name} / ${formatTime(record.elapsedMs)}`;
      detail.textContent =
        `Labyrinth ${record.labyrinthNumber ?? 1} / ${record.echoesCollected} / ${record.echoTotal ?? 3} Echoes / ${record.moves} moves / ${record.seed}`;
      replay.type = "button";
      replay.className = "control-button";
      replay.dataset.seed = record.seed;
      replay.dataset.level = record.questLevelId ?? "trail-scout";
      replay.dataset.labyrinth = String(record.labyrinthNumber ?? 1);
      replay.dataset.recordAction = "replay";
      replay.textContent = "Replay";
      replay.setAttribute("aria-label", `Replay seed ${record.seed}`);
      copy.type = "button";
      copy.className = "control-button";
      copy.dataset.seed = record.seed;
      copy.dataset.level = record.questLevelId ?? "trail-scout";
      copy.dataset.labyrinth = String(record.labyrinthNumber ?? 1);
      copy.dataset.recordAction = "copy";
      copy.textContent = "Copy Share Link";
      copy.setAttribute("aria-label", `Copy share link for seed ${record.seed}`);
      summary.append(title, detail);
      actions.className = "run-records__actions";
      actions.append(copy, replay);
      item.append(summary, actions);
      return item;
    })
  );
}

function resultStanding() {
  const index = runRecords.findIndex(
    (record) =>
      record.seed === run.seed &&
      (record.questLevelId ?? "trail-scout") === currentLevel.id &&
      (record.labyrinthNumber ?? 1) === currentLabyrinthNumber
  );
  if (index === -1) {
    return "Outside top 5";
  }

  const record = runRecords[index];
  const outcome = run.status === "won" ? "escaped" : "defeated";
  return (
    record.elapsedMs === run.elapsedMs &&
    record.moves === run.moves &&
    record.outcome === outcome
  )
    ? run.status === "won"
      ? `Personal #${index + 1}`
      : `Attempt #${index + 1}`
    : "Seed best kept";
}

/** @param {ReturnType<typeof loadRunRecords>} records */
function bestEscape(records) {
  return records.find((record) => record.outcome === "escaped") ?? null;
}

/** @param {EventTarget | null} target */
function isNativeControl(target) {
  return (
    target instanceof HTMLElement &&
    target.matches("a, button, input, textarea, select, [contenteditable='true']")
  );
}

/**
 * @template {Element} T
 * @param {string} id
 * @param {new () => T} type
 * @returns {T}
 */
function requiredElement(id, type) {
  const element = document.getElementById(id);
  if (!element || !(element instanceof type)) {
    throw new Error(`Missing required element #${id}`);
  }
  return element;
}
