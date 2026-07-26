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
import {
  createDailyContract,
  getDailyQuestion,
  isDailyCurrent,
  loadDailyRecord,
  resolveDailyRequest,
  saveDailyResult,
  utcDateKey
} from "./game/daily-labyrinth.js";
import {
  applyAction,
  createRun,
  normalizeSeed
} from "./game/game-session.js";
import {
  createRunAccessId,
  isAdmittedRunResume,
  runLocatorMatches,
  withRunAccessId
} from "./game/run-access.js";
import {
  advanceQuest,
  createQuestProgress,
  loadQuestProgress,
  rememberMap,
  rememberQuestion,
  saveQuestProgress
} from "./game/quest-progress.js";
import { selectDeferredQuestProgress } from "./game/quest-continuity.js";
import { projectQuestAtlas } from "./game/quest-atlas.js";
import {
  createQuestAtlasView,
  renderQuestAtlasSummary
} from "./game/quest-atlas-view.js";
import { loadRunRecords, saveRunRecord } from "./game/storage.js";
import { getBundledQuestion } from "./questions/question-bank.js";
import {
  QUEST_LABYRINTH_COUNT,
  getDifficultyBand,
  getLabyrinthConfig,
  getQuestLevel
} from "./questions/quest-levels.js";
import {
  createLifetimeView
} from "./player/lifetime-view.js";
import { createQuestConflictView } from "./player/quest-conflict-view.js";
import {
  LIFETIME_PRICE_ONCE
} from "../shared/lifetime-product.js";
import { createPlayerController } from "./player/player-controller.js";

/** @typedef {"up" | "right" | "down" | "left"} Direction */
/** @typedef {"move" | "blocked" | "echo" | "pulse" | "challenge" | "correct" | "wrong" | "won" | "lost" | "enabled"} AudioCue */
/** @typedef {ReturnType<typeof import("./player/quest-continuity-controller.js").createQuestContinuityController>} QuestContinuityController */

const canvas = requiredElement("maze-canvas", HTMLCanvasElement);
const renderer = createCanvasRenderer(canvas);
const audio = new EchoAudio();

const elements = {
  atlasButton: requiredElement("atlas-button", HTMLButtonElement),
  best: requiredElement("best-run", HTMLElement),
  canvasFrame: requiredElement("canvas-frame", HTMLElement),
  challengeChoices: requiredElement("challenge-choices", HTMLElement),
  challengeDialog: requiredElement("challenge-dialog", HTMLDialogElement),
  challengeFeedback: requiredElement("challenge-feedback", HTMLElement),
  challengeKicker: requiredElement("challenge-kicker", HTMLElement),
  challengePromise: requiredElement("challenge-promise", HTMLElement),
  challengeQuestion: requiredElement("challenge-question", HTMLElement),
  challengeSource: requiredElement("challenge-source", HTMLElement),
  challengeTitle: requiredElement("challenge-title", HTMLElement),
  dailyButton: requiredElement("daily-button", HTMLButtonElement),
  dailyClose: requiredElement("daily-close", HTMLButtonElement),
  dailyCopy: requiredElement("daily-copy", HTMLButtonElement),
  dailyDate: requiredElement("daily-date", HTMLElement),
  dailyDialog: requiredElement("daily-dialog", HTMLDialogElement),
  dailyExpired: requiredElement("daily-expired", HTMLElement),
  dailyRecord: requiredElement("daily-record", HTMLElement),
  dailyReturn: requiredElement("daily-return", HTMLButtonElement),
  dailyStart: requiredElement("daily-start", HTMLButtonElement),
  dailyTitle: requiredElement("daily-title", HTMLElement),
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
  resultAccessNote: requiredElement("result-access-note", HTMLElement),
  resultAtlas: requiredElement("result-atlas", HTMLElement),
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
  questSyncStatus: requiredElement("quest-sync-status", HTMLElement),
  questionHint: requiredElement("question-hint", HTMLElement),
  seedCopy: requiredElement("seed-copy", HTMLButtonElement),
  seedCopyHint: requiredElement("seed-copy-hint", HTMLElement),
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

const dailyRequest = resolveDailyRequest(
  new URL(window.location.href).searchParams.get("daily")
);
const locationSeed = seedFromLocation();
const sharedParametersNeedNotice =
  locationSeed !== null && hasInvalidSharedParameters();
const storedQuestProgress = loadQuestProgress();
const normalizedLocationSeed =
  locationSeed === null ? null : normalizeSeed(locationSeed);
const sharedLocationFacts = {
  seed: normalizedLocationSeed ?? "",
  levelId: getQuestLevel(levelFromLocation()).id,
  labyrinthNumber: labyrinthFromLocation() ?? 1
};
let activeRunLocator =
  dailyRequest.status === "none" ? loadActiveRunLocator() : null;
if (
  locationSeed !== null &&
  activeRunLocator &&
  !runLocatorMatches(activeRunLocator, sharedLocationFacts)
) {
  activeRunLocator = null;
}
if (
  dailyRequest.status === "none" &&
  activeRunLocator &&
  storedQuestProgress &&
  !activeRunLocator.pending &&
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
  normalizedLocationSeed ?? activeRunLocator?.seed ?? createSeed(),
  getLabyrinthConfig(currentLevel.id, currentLabyrinthNumber)
);
run.status = "paused";
/** @type {QuestContinuityController | null} */
let questContinuityController = null;
/** @type {Promise<QuestContinuityController | null> | null} */
let questContinuityControllerPromise = null;
/** @type {"initial" | "new-quest" | "terminal" | "online" | null} */
let questContinuityLoadKind = null;
const failedQuestContinuityLoads = new Set();
const playerController = createPlayerController({
  onPaletteChange: () => renderer.render(run),
  onAuthenticationChange: handleAuthenticationChange
});
const questConflictView = createQuestConflictView({
  onChoose: (choice) => {
    void loadQuestContinuityController().then((controller) =>
      controller?.resolveConflict(choice) ?? false
    ).then((resolved) => {
      if (
        resolved &&
        resumeAfterQuestConflict &&
        run.status === "paused"
      ) {
        togglePause();
      }
      if (resolved) {
        resumeAfterQuestConflict = false;
      }
    });
  }
});
const lifetimeView = createLifetimeView({
  onUnlock: openLifetimeCheckout
});
let runRecords = loadRunRecords();
let bestEscapeRecord = bestEscape(runRecords);
let lastTick = performance.now();
let eventTimer = 0;
let resumeAfterAtlas = false;
let resumeAfterDaily = false;
let resumeAfterRecords = false;
let resumeAfterQuestConflict = false;
/** @type {{ progress: typeof questProgress, source: "cloud" | "merged" } | null} */
let deferredCloudQuest = null;
let questionRequestKey = "";
let runFinished = false;
let hintVisible = false;
/** @type {ReturnType<typeof createDailyContract> | null} */
let activeDaily = null;
let dailyQuestionIndex = 0;
let demoAccessPending = hasCompletedGuestDemo();
let completedQuestIdle = false;
/** @type {{ freeRunsRemaining: number, state: string } | null} */
let latestRunAccess = null;
let lifetimeReturnConfirmed = false;
let pendingLifetimeSessionId = "";
let mustChooseLevel =
  dailyRequest.status === "none" &&
  locationSeed === null &&
  activeRunLocator === null &&
  storedQuestProgress === null;
if (
  dailyRequest.status === "none" &&
  !mustChooseLevel &&
  !activeRunLocator?.pending
) {
  questProgress = saveQuestProgress(questProgress);
}
/** @type {{ message: string, kind: string }[]} */
let storyEntries = [];
/** @type {{ x: number, y: number } | null} */
let touchStart = null;
const atlasView = createQuestAtlasView({
  onClose: () => {
    if (resumeAfterAtlas && run.status === "paused") {
      togglePause();
    }
    resumeAfterAtlas = false;
  }
});

void initializeRunEntry();
void playerController.isAuthenticated().then(handleAuthenticationChange);
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
elements.newRun.addEventListener("click", () => {
  if (activeDaily) {
    returnToQuest();
    return;
  }
  void openLevelPicker();
});
elements.dailyButton.addEventListener("click", openDailyDialog);
elements.dailyClose.addEventListener("click", closeDailyDialog);
elements.dailyDialog.addEventListener("cancel", (event) => {
  event.preventDefault();
  closeDailyDialog();
});
elements.dailyStart.addEventListener("click", () => {
  startDailyRun();
});
elements.dailyCopy.addEventListener("click", async () => {
  await copyDailyLink(elements.dailyCopy);
});
elements.dailyReturn.addEventListener("click", returnToQuest);
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
  if (run.challenge?.hintRevealed) {
    hintVisible = !hintVisible;
    syncChallengeDialog();
    return;
  }
  hintVisible = true;
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
elements.atlasButton.addEventListener("click", () => {
  resumeAfterAtlas = run.status === "active";
  if (resumeAfterAtlas) {
    togglePause();
  }
  atlasView.show(projectQuestAtlas(questProgress), elements.atlasButton);
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
  if (activeDaily) {
    startDailyRun();
    return;
  }
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
  if (action === "dismiss-access") {
    elements.resultDialog.close();
    return;
  }
  if (action === "daily-return") {
    returnToQuest();
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
    if (activeDaily) {
      await navigator.clipboard.writeText(
        createDailyShareLink(currentDailyContract())
      );
      announce("Today’s Daily link copied.");
      showEvent("Daily link copied. It contains only the public UTC date.");
      return;
    }
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

window.addEventListener("online", () => {
  void loadQuestContinuityController("online").then((controller) =>
    controller?.retry(loadQuestProgress()) ?? false
  );
});

document.addEventListener("visibilitychange", () => {
  if (document.hidden && run.status === "active") {
    togglePause();
  }
});

/**
 * @param {{
 *   version: 2,
 *   runId: string,
 *   pending: boolean,
 *   seed: string,
 *   levelId: string,
 *   labyrinthNumber: number
 * }} locator
 * @param {ReturnType<typeof createDailyContract> | null} [daily]
 */
function startRun(locator, daily = null) {
  activeDaily = daily;
  dailyQuestionIndex = 0;
  document.body.dataset.runMode = daily ? "daily" : "quest";
  completedQuestIdle = false;
  currentLevel = getQuestLevel(locator.levelId);
  currentLabyrinthNumber = locator.labyrinthNumber;
  run = createRun(
    locator.seed,
    getLabyrinthConfig(currentLevel.id, currentLabyrinthNumber)
  );
  if (!daily) {
    const fingerprint = labyrinthFingerprint(run);
    if (!questProgress.usedMapFingerprints.includes(fingerprint)) {
      questProgress = saveQuestProgress(rememberMap(questProgress, fingerprint));
    }
    activeRunLocator = saveActiveRunLocator({
      ...locator,
      pending: false
    });
  }
  lastTick = performance.now();
  questionRequestKey = "";
  runFinished = false;
  storyEntries = [];
  hideSkipWarning();
  addStory(
    daily
      ? `${daily.date} UTC Daily begins. Recover every Echo; your Quest stays unchanged.`
      : `Labyrinth ${currentLabyrinthNumber} of ${QUEST_LABYRINTH_COUNT} begins. Recover every Echo.`,
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
  if (elements.dailyDialog.open) {
    elements.dailyDialog.close();
  }
  resumeAfterDaily = false;
  updateInterface();
  canvas.focus({ preventScroll: true });
  announce(
    daily
      ? `Today’s shared Labyrinth for ${daily.date} UTC. ${run.echoes.length} Echoes remain.`
      : `${currentLevel.name}, Labyrinth ${currentLabyrinthNumber} of ${QUEST_LABYRINTH_COUNT}. ${run.echoes.length} Echoes remain.`
  );
  showEvent(
    daily
      ? "Today’s Daily is ready. Find the Echoes."
      : `Labyrinth ${currentLabyrinthNumber} ready. Find the Echoes.`
  );
  if (lifetimeReturnConfirmed) {
    lifetimeReturnConfirmed = false;
    announce("Lifetime access unlocked. Your saved Run is ready.");
    showEvent("Lifetime access unlocked. Your saved Run is ready.");
  }
}

async function initializeRunEntry() {
  if (dailyRequest.status === "current") {
    startDailyRun();
    return;
  }
  if (dailyRequest.status === "expired") {
    document.body.dataset.runMode = "daily";
    updateInterface();
    openDailyDialog();
    return;
  }
  if (!(await resolveLifetimeReturn())) {
    return;
  }
  if (lifetimeReturnConfirmed && activeRunLocator !== null) {
    await resumePendingRun();
    return;
  }
  if (locationSeed !== null || activeRunLocator !== null) {
    const locator = activeRunLocator;
    await startSharedRun(
      normalizedLocationSeed ?? locator?.seed ?? run.seed,
      currentLevel.id,
      currentLabyrinthNumber,
      sharedParametersNeedNotice,
      locator?.runId
    );
    return;
  }
  if (storedQuestProgress !== null) {
    if (storedQuestProgress.complete) {
      completedQuestIdle = true;
      updateInterface();
      announce("Quest complete. Your restored Echo Atlas has all five Sigils.");
      showEvent("Quest complete. Open the Atlas or start a New Quest.");
      return;
    }
    await startFreshRun();
    return;
  }
  if (mustChooseLevel) {
    await openLevelPicker();
  }
}

function currentDailyContract() {
  return createDailyContract(utcDateKey());
}

function startDailyRun() {
  const daily = currentDailyContract();
  const locator = /** @type {{
   *   version: 2,
   *   runId: string,
   *   pending: boolean,
   *   seed: string,
   *   levelId: string,
   *   labyrinthNumber: number
   * }} */ ({
    version: 2,
    runId: `daily-${daily.date}`,
    pending: false,
    seed: daily.seed,
    levelId: daily.levelId,
    labyrinthNumber: daily.labyrinthNumber
  });
  window.history.replaceState(
    {},
    "",
    `/play?daily=${encodeURIComponent(daily.date)}`
  );
  startRun(locator, daily);
}

function openDailyDialog() {
  const currentDaily = currentDailyContract();
  resumeAfterDaily = run.status === "active";
  if (resumeAfterDaily) {
    togglePause();
  }
  const record = loadDailyRecord(currentDaily.date);
  elements.dailyDate.textContent = `${currentDaily.date} UTC`;
  elements.dailyRecord.textContent = record?.completed
    ? `Personal Best ${formatTime(record.bestElapsedMs ?? 0)} · ${record.bestMoves} moves. Stored only on this device.`
    : "No Daily escape recorded today. Results stay only on this device.";
  const expiredRequest =
    dailyRequest.status === "expired" && activeDaily === null;
  const expiredActive =
    activeDaily !== null && !isDailyCurrent(activeDaily);
  const expiredDate = expiredActive
    ? activeDaily?.date ?? null
    : dailyRequest.requestedDate;
  elements.dailyExpired.hidden = !expiredRequest && !expiredActive;
  elements.dailyExpired.textContent = expiredRequest || expiredActive
    ? expiredDate
      ? `${expiredDate} has expired. Daily links change at the UTC date boundary; today is ${currentDaily.date}.`
      : `That Daily link has an invalid date. Today’s UTC Daily is ${currentDaily.date}.`
    : "";
  elements.dailyStart.textContent = activeDaily && !expiredActive
    ? "Restart today’s Daily"
    : "Start today’s Daily";
  elements.dailyClose.textContent =
    expiredRequest || expiredActive ? "Return to Quest" : "Close";
  if (!elements.dailyDialog.open) {
    elements.dailyDialog.showModal();
  }
  requestAnimationFrame(() => {
    elements.dailyTitle?.focus?.({ preventScroll: true });
  });
}

function closeDailyDialog() {
  if (
    dailyRequest.status === "expired" && activeDaily === null ||
    activeDaily !== null && !isDailyCurrent(activeDaily)
  ) {
    returnToQuest();
    return;
  }
  elements.dailyDialog.close();
  if (resumeAfterDaily && run.status === "paused") {
    togglePause();
  }
  resumeAfterDaily = false;
}

/** @param {HTMLButtonElement} button */
async function copyDailyLink(button) {
  const currentDaily = currentDailyContract();
  try {
    await navigator.clipboard.writeText(createDailyShareLink(currentDaily));
    button.textContent = "Copied";
    announce("Today’s Daily link copied. It contains only the public UTC date.");
    window.setTimeout(() => {
      if (button.isConnected) {
        button.textContent = "Copy today’s link";
      }
    }, 1400);
  } catch {
    announce(`Copy failed. Today’s Daily date is ${currentDaily.date} UTC.`);
  }
}

function returnToQuest() {
  window.location.assign("/play");
}

async function startFreshRun() {
  const levelId = questProgress.levelId;
  const labyrinthNumber = questProgress.labyrinthNumber;
  let locator;
  if (
    activeRunLocator?.levelId === levelId &&
    activeRunLocator.labyrinthNumber === labyrinthNumber
  ) {
    locator = withRunAccessId(activeRunLocator);
  } else {
    locator = createFreshLocator(levelId, labyrinthNumber);
  }
  if (!(await authorizeRunLocator(locator))) {
    return false;
  }
  startRun(locator);
  return true;
}

/**
 * @param {string} seed
 * @param {string} levelId
 * @param {number} labyrinthNumber
 * @param {boolean} [showAdjustedNotice]
 * @param {string} [runId]
 */
async function startSharedRun(
  seed,
  levelId,
  labyrinthNumber,
  showAdjustedNotice = false,
  runId
) {
  const locator = withRunAccessId({
    version: runId ? 2 : 1,
    ...(runId ? { runId } : {}),
    seed,
    levelId,
    labyrinthNumber
  });
  if (!(await authorizeRunLocator(locator))) {
    return false;
  }
  startRun(locator);
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
      return withRunAccessId({
        version: 2,
        runId: createRunAccessId(),
        pending: false,
        seed: candidate.seed,
        levelId: level.id,
        labyrinthNumber
      });
    }
  }

  for (let attempt = 0; attempt < 100; attempt += 1) {
    const fallbackSeed = `EMBER-${17 + attempt}`;
    const candidate = createRun(fallbackSeed, config);
    if (!usedFingerprints.has(labyrinthFingerprint(candidate))) {
      return withRunAccessId({
        version: 2,
        runId: createRunAccessId(),
        pending: false,
        seed: candidate.seed,
        levelId: level.id,
        labyrinthNumber
      });
    }
  }

  throw new Error("Could not create a fresh Labyrinth for this Quest.");
}

/** @param {string} levelId @param {string} [seed] */
async function startNewQuest(levelId, seed) {
  const nextProgress = createQuestProgress(levelId);
  const locator = seed
    ? withRunAccessId({
        version: 2,
        runId: createRunAccessId(),
        pending: false,
        seed,
        levelId: nextProgress.levelId,
        labyrinthNumber: nextProgress.labyrinthNumber
      })
    : createFreshLocator(
        nextProgress.levelId,
        nextProgress.labyrinthNumber
      );
  if (!(await authorizeRunLocator(locator))) {
    return false;
  }
  questProgress = saveQuestProgress(nextProgress);
  void loadQuestContinuityController("new-quest").then((controller) =>
    controller?.queueBoundary(questProgress) ?? false
  );
  currentLabyrinthNumber = questProgress.labyrinthNumber;
  window.history.replaceState({}, "", "/play");
  startRun(locator);
  return true;
}

/**
 * @param {string} levelId
 * @param {number} labyrinthNumber
 * @param {string} seed
 */
async function startRecordedLabyrinth(levelId, labyrinthNumber, seed) {
  const locator = withRunAccessId({
    version: 2,
    runId: createRunAccessId(),
    pending: false,
    seed,
    levelId,
    labyrinthNumber
  });
  if (!(await authorizeRunLocator(locator))) {
    return false;
  }
  questProgress = saveQuestProgress(
    createQuestProgress(levelId, labyrinthNumber)
  );
  void loadQuestContinuityController("new-quest").then((controller) =>
    controller?.queueBoundary(questProgress) ?? false
  );
  window.history.replaceState({}, "", "/play");
  startRun(locator);
  return true;
}

async function openLevelPicker() {
  if (!(await canOpenStartChoice())) {
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

/** @param {{ runId: string, seed: string, levelId: string, labyrinthNumber: number } & Record<string, unknown>} locator */
async function authorizeRunLocator(locator) {
  const resumingAdmittedRun = isAdmittedRunResume(
    activeRunLocator,
    locator
  );
  activeRunLocator = saveActiveRunLocator(
    /** @type {Parameters<typeof saveActiveRunLocator>[0]} */ ({
      ...locator,
      pending: !resumingAdmittedRun
    })
  );
  return canStartAnotherLabyrinth(locator, resumingAdmittedRun);
}

async function canOpenStartChoice() {
  if (
    !demoAccessPending ||
    !requiresDemoAccount(playerController.hasAuthenticatedUser())
  ) {
    demoAccessPending = false;
    return true;
  }
  const signedIn =
    playerController.hasAuthenticatedUser() ||
    await playerController.isAuthenticated();
  if (signedIn) {
    clearPendingGuestDemo();
    demoAccessPending = false;
    return true;
  }
  showDemoAccountGate();
  return false;
}

/**
 * @param {{ runId: string, seed: string, levelId: string, labyrinthNumber: number }} locator
 * @param {boolean} [resumingAdmittedRun]
 */
async function canStartAnotherLabyrinth(locator, resumingAdmittedRun = false) {
  let config;
  try {
    config = await playerController.getRunAccessConfig();
  } catch {
    const signedIn =
      playerController.hasAuthenticatedUser() ||
      await playerController.isAuthenticated();
    if (!signedIn) {
      return canOpenStartChoice();
    }
    announce("Run access could not be checked. Try again.");
    showEvent("Run access could not be checked. Your Run was not consumed.");
    return false;
  }
  if (!config.enforcementEnabled) {
    return canOpenStartChoice();
  }
  const signedIn =
    playerController.hasAuthenticatedUser() ||
    await playerController.isAuthenticated();
  if (demoAccessPending && !signedIn && requiresDemoAccount(false)) {
    showDemoAccountGate();
    return false;
  }
  if (!signedIn) {
    demoAccessPending = false;
    return true;
  }
  if (demoAccessPending) {
    clearPendingGuestDemo();
    demoAccessPending = false;
  }
  try {
    const accessBeforeStart = await playerController.getRunAccess();
    if (
      !resumingAdmittedRun &&
      accessBeforeStart.state === "free" &&
      accessBeforeStart.freeRunsRemaining === 1 &&
      !(await lifetimeView.confirmLastFreeRun())
    ) {
      return false;
    }
    const access = await playerController.authorizeRun(locator);
    latestRunAccess = {
      freeRunsRemaining: Number(access.freeRunsRemaining ?? 0),
      state: String(access.state ?? "")
    };
    if (access.allowed) {
      markGuestDemoComplete();
      return true;
    }
    showRunAccessGate(access);
    return false;
  } catch {
    announce("Run access could not be checked. Try again.");
    showEvent("Run access could not be checked. Your Run was not consumed.");
    return false;
  }
}

/** @param {{ state: string, freeRunsRemaining: number }} access */
function showRunAccessGate(access) {
  if (access.state !== "membership-blocked") {
    if (elements.levelDialog.open) {
      elements.levelDialog.close();
    }
    if (elements.recordsDialog.open) {
      elements.recordsDialog.close();
    }
    if (elements.resultDialog.open) {
      elements.resultDialog.close();
    }
    lifetimeView.showMembership();
    announce(
      `No free Runs remain. Lifetime Membership is ${LIFETIME_PRICE_ONCE}. ${access.freeRunsRemaining} free Runs remaining.`
    );
    return;
  }
  elements.resultKicker.textContent = "Explorer access";
  elements.resultTitle.textContent = "Lifetime access needs attention.";
  elements.resultSummary.textContent =
    "This account's purchase was refunded or disputed. Your current Labyrinth is saved; ask a parent or guardian to contact support.";
  elements.resultAccessNote.hidden = true;
  elements.replay.dataset.resultAction = "dismiss-access";
  elements.replay.textContent = "Close";
  elements.freshRun.hidden = true;
  if (elements.levelDialog.open) {
    elements.levelDialog.close();
  }
  if (!elements.resultDialog.open) {
    elements.resultDialog.showModal();
  }
  announce("Lifetime access needs attention before a new Run can start.");
}

async function openLifetimeCheckout() {
  if (pendingLifetimeSessionId) {
    await confirmLifetimeSession(pendingLifetimeSessionId);
    pendingLifetimeSessionId = "";
    removeCheckoutParameters(new URL(window.location.href));
    lifetimeView.close();
    await resumePendingRun();
    return;
  }
  const checkout = await playerController.createLifetimeCheckout();
  if (checkout.state === "lifetime_active") {
    lifetimeView.setStatus(
      "Lifetime access is already active. Resuming your saved Run.",
      "success"
    );
    lifetimeView.close();
    await resumePendingRun();
    return;
  }
  const checkoutUrl = String(checkout.checkoutUrl ?? "");
  let destination;
  try {
    destination = new URL(checkoutUrl);
  } catch {
    throw new Error("Checkout URL was invalid.");
  }
  if (
    destination.protocol !== "https:" ||
    destination.hostname !== "checkout.stripe.com"
  ) {
    throw new Error("Checkout URL was invalid.");
  }
  window.location.assign(destination.href);
}

async function resolveLifetimeReturn() {
  const url = new URL(window.location.href);
  const checkout = url.searchParams.get("checkout");
  if (!checkout) {
    return true;
  }
  const sessionId = url.searchParams.get("session_id");
  if (checkout === "canceled") {
    removeCheckoutParameters(url);
    lifetimeView.showMembership(
      "Checkout canceled. Nothing was charged. Your Run is still saved."
    );
    return false;
  }
  if (
    checkout !== "success" ||
    !sessionId ||
    !/^cs_[A-Za-z0-9_]{6,255}$/.test(sessionId)
  ) {
    removeCheckoutParameters(url);
    lifetimeView.showMembership(
      "Checkout could not be confirmed. Your Run is still saved.",
      "error"
    );
    return false;
  }
  try {
    pendingLifetimeSessionId = sessionId;
    await confirmLifetimeSession(sessionId);
    pendingLifetimeSessionId = "";
    removeCheckoutParameters(url);
    lifetimeReturnConfirmed = activeRunLocator !== null;
    return true;
  } catch {
    lifetimeView.showMembership(
      "Payment confirmation is taking longer than expected. Try again; your saved Run is safe.",
      "error"
    );
    return false;
  }
}

/** @param {string} sessionId */
async function confirmLifetimeSession(sessionId) {
  if (!(await playerController.isAuthenticated())) {
    throw new Error("Sign in is required.");
  }
  const confirmation =
    await playerController.confirmLifetimeCheckout(sessionId);
  if (
    confirmation.lifetime !== true ||
    confirmation.state !== "lifetime_active"
  ) {
    throw new Error("Payment was not verified.");
  }
}

/** @param {URL} url */
function removeCheckoutParameters(url) {
  url.searchParams.delete("checkout");
  url.searchParams.delete("session_id");
  window.history.replaceState(
    {},
    "",
    `${url.pathname}${url.search}${url.hash}`
  );
}

async function resumePendingRun() {
  if (!activeRunLocator) {
    lifetimeReturnConfirmed = false;
    return false;
  }
  lifetimeReturnConfirmed = true;
  const started = await startSharedRun(
    activeRunLocator.seed,
    activeRunLocator.levelId,
    activeRunLocator.labyrinthNumber,
    false,
    activeRunLocator.runId
  );
  if (!started) {
    lifetimeReturnConfirmed = false;
  }
  return started;
}

function showDemoAccountGate() {
  elements.resultKicker.textContent = "Demo complete";
  elements.resultTitle.textContent = "Create an account for three free Runs.";
  elements.resultSummary.textContent =
    "You completed your Guest Run. Create an account to start three more Runs and continue your Quest.";
  elements.replay.dataset.resultAction = "create-account";
  elements.replay.textContent = "Create account for three Runs";
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
  announce("Your Guest Run is complete. Create an account for three free Runs.");
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
  if (activeDaily) {
    return;
  }
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

/** @param {boolean} signedIn */
function handleAuthenticationChange(signedIn) {
  syncDemoAccountAction(signedIn);
  const userId = signedIn ? playerController.getAuthenticatedUserId() : null;
  void loadQuestContinuityController().then((controller) => {
    if (!controller) {
      return false;
    }
    controller.setAuthenticated(userId);
    return userId ? controller.retry(loadQuestProgress()) : false;
  });
}

/**
 * @param {"initial" | "new-quest" | "terminal" | "online"} [loadKind]
 * @returns {Promise<QuestContinuityController | null>}
 */
function loadQuestContinuityController(loadKind = "initial") {
  if (questContinuityControllerPromise) {
    if (loadKind === questContinuityLoadKind || loadKind === "initial") {
      return questContinuityControllerPromise;
    }
    return questContinuityControllerPromise.then((controller) =>
      controller ?? loadQuestContinuityController(loadKind)
    );
  }
  if (failedQuestContinuityLoads.has(loadKind)) {
    return Promise.resolve(null);
  }
  /** @type {Promise<typeof import("./player/quest-continuity-controller.js")>} */
  let controllerModule;
  if (loadKind === "new-quest") {
    // @ts-expect-error Vite treats the query as a separate retryable chunk.
    controllerModule = import("./player/quest-continuity-controller.js?retry=new-quest");
  } else if (loadKind === "terminal") {
    // @ts-expect-error Vite treats the query as a separate retryable chunk.
    controllerModule = import("./player/quest-continuity-controller.js?retry=terminal");
  } else if (loadKind === "online") {
    // @ts-expect-error Vite treats the query as a separate retryable chunk.
    controllerModule = import("./player/quest-continuity-controller.js?retry=online");
  } else {
    controllerModule = import("./player/quest-continuity-controller.js");
  }
  questContinuityLoadKind = loadKind;
  const loading = controllerModule.then(({
      createQuestContinuityController
    }) => {
      questContinuityController = createQuestContinuityController({
        loadCloud: () => playerController.getCloudQuestProgress(),
        saveCloud: (progress, revision) =>
          playerController.saveCloudQuestProgress(progress, revision),
        onConflict: showQuestConflict,
        onProgress: receiveCloudQuestProgress,
        onStatus: renderQuestSyncStatus
      });
      return questContinuityController;
    }).catch(() => {
      failedQuestContinuityLoads.add(loadKind);
      if (questContinuityControllerPromise === loading) {
        questContinuityControllerPromise = null;
        questContinuityLoadKind = null;
      }
      renderQuestSyncStatus("offline");
      return null;
    });
  questContinuityControllerPromise = loading;
  return questContinuityControllerPromise;
}

/**
 * @param {{ local: typeof questProgress, cloud: { progress: typeof questProgress, revision: number, updatedAt?: string } }} conflict
 */
function showQuestConflict(conflict) {
  const trigger =
    document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
  const pauseActiveRun = run.status === "active";
  resumeAfterQuestConflict ||= pauseActiveRun;
  if (pauseActiveRun) {
    togglePause();
  }
  if (elements.levelDialog.open) {
    elements.levelDialog.close();
  }
  questConflictView.show(conflict, trigger);
}

/**
 * @param {typeof questProgress} progress
 * @param {"cloud" | "merged"} source
 */
function receiveCloudQuestProgress(progress, source) {
  if (
    dailyRequest.status !== "none" ||
    activeDaily !== null ||
    (activeRunLocator !== null &&
      !runFinished &&
      ["active", "paused", "challenge"].includes(run.status))
  ) {
    deferredCloudQuest = { progress, source };
    return;
  }
  if (runFinished || run.status === "won" || run.status === "lost") {
    installCloudQuestProgress(progress, false);
    if (run.status === "won") {
      saveNextBoundaryLocator();
    }
    return;
  }
  installCloudQuestProgress(progress);
}

function applyDeferredCloudQuest() {
  if (!deferredCloudQuest) {
    return;
  }
  const deferred = deferredCloudQuest.progress;
  const nextProgress = selectDeferredQuestProgress(questProgress, deferred);
  deferredCloudQuest = null;
  installCloudQuestProgress(nextProgress, false);
}

/**
 * @param {typeof questProgress} progress
 * @param {boolean} [startRecoveredRun]
 */
function installCloudQuestProgress(progress, startRecoveredRun = true) {
  questProgress = saveQuestProgress(progress);
  currentLevel = getQuestLevel(questProgress.levelId);
  currentLabyrinthNumber = questProgress.labyrinthNumber;
  mustChooseLevel = false;

  if (!startRecoveredRun) {
    return;
  }
  activeRunLocator = null;
  clearActiveRunLocator();
  if (elements.levelDialog.open) {
    elements.levelDialog.close();
  }
  if (questProgress.complete) {
    completedQuestIdle = true;
    updateInterface();
    announce("Cloud Quest restored. Your Echo Atlas is complete.");
    showEvent("Cloud Quest restored. Start a New Quest when ready.");
    return;
  }
  void startFreshRun();
}

function saveNextBoundaryLocator() {
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
}

/**
 * @param {"local" | "syncing" | "saved" | "offline" | "conflict"} status
 */
function renderQuestSyncStatus(status) {
  const copy = {
    local: "Device save",
    syncing: "Saving to account…",
    saved: "Account save",
    offline: "Offline · Device save",
    conflict: "Choose a Quest"
  };
  elements.questSyncStatus.dataset.state = status;
  elements.questSyncStatus.textContent = copy[status];
}

/** @param {Direction | undefined} direction */
function move(direction) {
  if (
    isDemoBlocked() ||
    completedQuestIdle ||
    !direction ||
    run.status !== "active"
  ) {
    return;
  }
  transition({ type: "move", direction });
}

function usePulse() {
  if (isDemoBlocked() || completedQuestIdle || run.status !== "active") {
    return;
  }
  transition({ type: "pulse" });
}

function togglePause() {
  if (
    isDemoBlocked() ||
    completedQuestIdle ||
    activeDaily === null && activeRunLocator?.pending ||
    (run.status !== "active" && run.status !== "paused")
  ) {
    return;
  }
  transition({ type: "pause" });
}

function isDemoBlocked() {
  return demoAccessPending && activeDaily === null;
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
        "gate-warden-challenge",
        "gate-warden-defeated",
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
    hintVisible = false;
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

  const isGateWarden = run.challenge.kind === "gate-warden";
  elements.challengeDialog.dataset.kind = isGateWarden
    ? "gate-warden"
    : "warden";
  elements.challengeKicker.textContent = isGateWarden
    ? "Gate Warden challenge"
    : "Warden challenge";
  elements.challengeTitle.textContent = isGateWarden
    ? "The Gate Warden seals the way."
    : "A Warden blocks the path.";
  elements.challengePromise.textContent = isGateWarden
    ? "Answer correctly to break the seal. Then step through the Gate."
    : "Answer correctly and the Warden is defeated.";

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
    hintVisible = false;
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
  elements.hintButton.disabled = false;
  elements.hintButton.textContent =
    run.challenge.hintRevealed && hintVisible ? "Hide Hint" : "Show Hint";
  elements.hintButton.setAttribute(
    "aria-expanded",
    String(run.challenge.hintRevealed && hintVisible)
  );
  elements.questionHint.hidden = !run.challenge.hintRevealed || !hintVisible;
  elements.questionHint.textContent =
    run.challenge.hintRevealed && hintVisible
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

  if (activeDaily) {
    const question = getDailyQuestion(activeDaily, dailyQuestionIndex);
    dailyQuestionIndex += 1;
    elements.challengeSource.textContent =
      "Today’s reviewed Daily question card is ready.";
    transition({ type: "provide-question", question });
    return;
  }

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
  elements.questLevelName.textContent = activeDaily
    ? `Daily · ${activeDaily.date} UTC`
    : `Quest Level ${currentLevel.number} · ${currentLevel.name}`;
  elements.questStage.textContent = activeDaily
    ? `${currentLevel.name} · Labyrinth ${currentLabyrinthNumber} · ${difficultyBand.label}`
    : `Labyrinth ${currentLabyrinthNumber} of ${QUEST_LABYRINTH_COUNT} · ${difficultyBand.label}`;
  elements.questHeadline.textContent = activeDaily
    ? `Today’s shared Labyrinth: find ${run.echoes.length} Echoes and outsmart ${run.config.wardenCount} ${run.config.wardenCount === 1 ? "Warden" : "Wardens"}.`
    : `Labyrinth ${currentLabyrinthNumber}: find ${run.echoes.length} Echoes and outsmart ${run.config.wardenCount} ${run.config.wardenCount === 1 ? "Warden" : "Wardens"}.`;
  elements.seedValue.textContent = run.seed;
  elements.seedCopyHint.textContent = activeDaily
    ? "Copy Daily Link"
    : "Copy Share Link";
  elements.time.textContent = formatTime(run.elapsedMs);
  elements.moves.textContent = String(run.moves).padStart(3, "0");
  elements.echoCount.textContent = `${collected} / ${run.echoes.length}`;
  elements.vitalityCount.textContent =
    `${run.explorer.vitality} / ${run.explorer.maxVitality}`;
  elements.pulseCount.textContent = String(run.pulses);
  playerController.updateScore(run.score);
  elements.pulse.disabled = run.pulses === 0 || run.status !== "active";
  elements.dailyButton.disabled = run.status === "challenge";
  elements.atlasButton.disabled =
    run.status === "challenge" || activeDaily !== null;
  elements.recordsButton.disabled =
    run.status === "challenge" || activeDaily !== null;
  elements.newRun.textContent = activeDaily ? "Return to Quest" : "New Quest";
  elements.pause.textContent = completedQuestIdle
    ? "Quest complete"
    : run.status === "paused"
      ? "Resume"
      : "Pause";
  elements.pause.disabled = run.status === "challenge" || completedQuestIdle;
  elements.pause.setAttribute("aria-pressed", String(run.status === "paused"));
  elements.runState.textContent = completedQuestIdle
    ? "Quest complete"
    : {
        active: run.gate.open
          ? run.gate.sealed
            ? "Gate sealed"
            : "Gate open"
          : "Exploring",
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
  if (activeDaily) {
    const dailyRecord = loadDailyRecord(activeDaily.date);
    elements.best.textContent = dailyRecord?.completed
      ? `Daily Personal Best ${formatTime(dailyRecord.bestElapsedMs ?? 0)} / ${dailyRecord.bestMoves} moves / stored on this device`
      : "Today’s Daily has no escape yet. Your Quest and Run Records stay unchanged.";
  } else {
    elements.best.textContent = bestEscapeRecord
      ? `Best ${formatTime(bestEscapeRecord.elapsedMs)} / ${bestEscapeRecord.moves} moves / ${bestEscapeRecord.seed}`
      : runRecords.length > 0
        ? `${runRecords.length} ${runRecords.length === 1 ? "attempt" : "attempts"} saved. First escape sets the pace.`
        : "No finished run yet. Escape or defeat saves an attempt.";
  }
  renderStory();
}

function finishRun() {
  runFinished = true;
  elements.resultAtlas.hidden = false;
  elements.freshRun.textContent = "New Quest";
  const won = run.status === "won";
  if (activeDaily) {
    finishDailyRun(activeDaily, won);
    return;
  }
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
  } else {
    activeRunLocator = null;
    clearActiveRunLocator();
  }
  applyDeferredCloudQuest();
  if (won) {
    saveNextBoundaryLocator();
  }
  void loadQuestContinuityController("terminal").then((controller) =>
    controller?.queueBoundary(questProgress) ?? false
  );
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
  renderQuestAtlasSummary(
    elements.resultAtlas,
    projectQuestAtlas(questProgress),
    { finishedLabyrinthNumber, won }
  );
  elements.resultAccessNote.hidden =
    latestRunAccess?.state !== "free" ||
    latestRunAccess.freeRunsRemaining !== 1;
  elements.resultAccessNote.textContent = elements.resultAccessNote.hidden
    ? ""
    : "One free Run remains.";
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

/**
 * @param {ReturnType<typeof createDailyContract>} daily
 * @param {boolean} won
 */
function finishDailyRun(daily, won) {
  if (!isDailyCurrent(daily)) {
    elements.resultKicker.textContent = "UTC date changed";
    elements.resultTitle.textContent = "This Daily has expired.";
    elements.resultSummary.textContent =
      "The UTC date changed before this Run ended, so the result was not saved. Today’s current Daily is ready, and your Quest remains unchanged.";
    elements.resultAtlas.hidden = true;
    elements.resultAccessNote.hidden = true;
    elements.resultAccessNote.textContent = "";
    elements.replay.dataset.resultAction = "daily-return";
    elements.replay.textContent = "Return to Quest";
    elements.freshRun.hidden = false;
    elements.freshRun.textContent = "Start current Daily";
    elements.resultTime.textContent = formatTime(run.elapsedMs);
    elements.resultMoves.textContent = String(run.moves).padStart(3, "0");
    elements.resultSeed.textContent = daily.seed;
    elements.resultRank.textContent = "Expired";
    updateInterface();
    if (!elements.resultDialog.open) {
      elements.resultDialog.showModal();
    }
    return;
  }
  const previous = loadDailyRecord(daily.date);
  const { record, persisted } = saveDailyResult(daily, {
    outcome: won ? "escaped" : "defeated",
    elapsedMs: run.elapsedMs,
    moves: run.moves
  });
  const newBest =
    won &&
    (!previous?.completed ||
      previous.bestElapsedMs === null ||
      run.elapsedMs < previous.bestElapsedMs ||
      run.elapsedMs === previous.bestElapsedMs &&
        (previous.bestMoves === null || run.moves < previous.bestMoves));

  elements.resultKicker.textContent = persisted
    ? "Casual Daily · stored locally"
    : "Casual Daily · storage unavailable";
  elements.resultTitle.textContent = won
    ? "Daily Labyrinth complete."
    : "Today’s Daily ended.";
  const resultSummary = won
    ? "You escaped today’s shared maze. Your Quest, Atlas, Run Access, and Global Scoreboard did not change."
    : "You can try today’s shared maze again. Your Quest, Atlas, Run Access, and Global Scoreboard did not change.";
  elements.resultSummary.textContent = persisted
    ? resultSummary
    : `${resultSummary} This result could not be saved on this device.`;
  elements.resultAtlas.hidden = true;
  elements.resultAccessNote.hidden = true;
  elements.resultAccessNote.textContent = "";
  elements.replay.dataset.resultAction = "daily-return";
  elements.replay.textContent = "Return to Quest";
  elements.freshRun.hidden = false;
  elements.freshRun.textContent = "Play Daily again";
  elements.resultTime.textContent = formatTime(run.elapsedMs);
  elements.resultMoves.textContent = String(run.moves).padStart(3, "0");
  elements.resultSeed.textContent = daily.seed;
  elements.resultRank.textContent = !persisted
    ? "Not saved"
    : won
      ? newBest
        ? "Personal Best"
        : `Best ${formatTime(record.bestElapsedMs ?? 0)}`
      : "Not complete";
  updateInterface();
  if (!elements.resultDialog.open) {
    elements.resultDialog.showModal();
  }
}

/** @param {number} now */
function tick(now) {
  const deltaMs = Math.min(1000, now - lastTick);
  lastTick = now;
  if (!isDemoBlocked() && run.status === "active") {
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
    "gate-warden-challenge": "challenge",
    "gate-warden-defeated": "correct",
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

/** @param {ReturnType<typeof createDailyContract>} daily */
function createDailyShareLink(daily) {
  const url = new URL("/play", window.location.origin);
  url.searchParams.set("daily", daily.date);
  return url.toString();
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
