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
  createFirstLightRun,
  getFirstLightQuestion,
  markFirstLightSeen,
  shouldOfferFirstLight
} from "./game/first-light.js";
import {
  createRunActionLog,
  tryAppendRunAction
} from "./game/run-action-log.js";
import {
  CLASSIC_RULESET_REVISION,
  getClassicRunRuleset,
  getQuestRunRuleset,
  normalizeRunRuleset
} from "./game/run-ruleset.js";
import { getRegionTheme } from "./game/region-theme.js";
import { claimRegionCeremony } from "./game/region-ceremony.js";
import { createVerifiedDailySubmission } from "./player/daily-submission.js";
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
import { renderQuestAtlasSummary } from "./game/quest-atlas-summary.js";
import {
  hasRunReplayOwnerMismatch,
  loadRunRecords,
  saveRunRecord,
  scrubRunReplays
} from "./game/storage.js";
import { scrubActiveRunRecovery } from "./game/local-recovery-scrub.js";
import { getBundledQuestion } from "./questions/question-bank.js";
import { normalizeQuestion } from "./questions/question-contract.js";
import {
  QUEST_LABYRINTH_COUNT,
  getDifficultyBand,
  getLabyrinthConfig,
  getQuestLevel,
  isGateWardenMilestone
} from "./questions/quest-levels.js";
import {
  createLifetimeView
} from "./player/lifetime-view.js";
import {
  LIFETIME_PRICE_ONCE
} from "../shared/lifetime-product.js";
import {
  applyAccessSettings
} from "./player/access-settings.js";
import {
  createAccessSettingsContinuity
} from "./player/access-settings-continuity.js";
import { createPlayerController } from "./player/player-controller.js";
import {
  createLanternJournal
} from "./learning/lantern-journal.js";
/** @type {Promise<typeof import("./learning/lantern-journal-ui.js")> | null} */
let lanternJournalUiPromise = null;
let lanternJournalUiRetry = false;
let lanternJournalUiFailedTwice = false;

/** @typedef {"up" | "right" | "down" | "left"} Direction */
/** @typedef {"move" | "blocked" | "echo" | "pulse" | "challenge" | "correct" | "wrong" | "won" | "lost" | "enabled"} AudioCue */
/** @typedef {ReturnType<typeof import("./player/quest-continuity-controller.js").createQuestContinuityController>} QuestContinuityController */
/** @typedef {ReturnType<typeof import("./game/active-run-recovery.js").createActiveRunRecoveryController>} ActiveRunRecoveryController */
/** @typedef {ReturnType<typeof import("./game/active-run-recovery.js").createCampfireResumeView>} CampfireResumeView */

const canvas = requiredElement("maze-canvas", HTMLCanvasElement);
const renderer = createCanvasRenderer(canvas);
const audio = new EchoAudio();

const elements = {
  atlasButton: requiredElement("atlas-button", HTMLButtonElement),
  settingsButton: requiredElement("settings-button", HTMLButtonElement),
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
  gateStagingSkip: requiredElement(
    "gate-staging-skip",
    HTMLButtonElement
  ),
  dailyButton: requiredElement("daily-button", HTMLButtonElement),
  dailyBoardDate: requiredElement("daily-board-date", HTMLElement),
  dailyBoardList: requiredElement("daily-board-list", HTMLOListElement),
  dailyBoardNote: requiredElement("daily-board-note", HTMLElement),
  dailyBoardRetry: requiredElement("daily-board-retry", HTMLButtonElement),
  dailyBoardStatus: requiredElement("daily-board-status", HTMLElement),
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
  firstLightDialog: requiredElement("first-light-dialog", HTMLDialogElement),
  firstLightReplay: requiredElement("first-light-replay", HTMLButtonElement),
  firstLightSkip: requiredElement("first-light-skip", HTMLButtonElement),
  firstLightStart: requiredElement("first-light-start", HTMLButtonElement),
  firstLightTitle: requiredElement("first-light-title", HTMLElement),
  freshRun: requiredElement("fresh-run", HTMLButtonElement),
  hintButton: requiredElement("hint-button", HTMLButtonElement),
  journalBands: requiredElement("journal-bands", HTMLElement),
  journalButton: requiredElement("journal-button", HTMLButtonElement),
  journalClear: requiredElement("journal-clear", HTMLButtonElement),
  journalClearCancel: requiredElement("journal-clear-cancel", HTMLButtonElement),
  journalClearConfirm: requiredElement("journal-clear-confirm", HTMLButtonElement),
  journalClearWarning: requiredElement("journal-clear-warning", HTMLElement),
  journalClose: requiredElement("journal-close", HTMLButtonElement),
  journalDialog: requiredElement("journal-dialog", HTMLDialogElement),
  journalStatus: requiredElement("journal-status", HTMLElement),
  liveRegion: requiredElement("live-region", HTMLElement),
  levelCards: requiredElement("level-cards", HTMLElement),
  levelDialog: requiredElement("level-dialog", HTMLDialogElement),
  moves: requiredElement("moves-value", HTMLElement),
  newRun: requiredElement("new-run", HTMLButtonElement),
  pause: requiredElement("pause-run", HTMLButtonElement),
  pulse: requiredElement("pulse-action", HTMLButtonElement),
  pulseCount: requiredElement("pulse-count", HTMLElement),
  practiceChoices: requiredElement("practice-choices", HTMLElement),
  practiceClose: requiredElement("practice-close", HTMLButtonElement),
  practiceDialog: requiredElement("practice-dialog", HTMLDialogElement),
  practiceFeedback: requiredElement("practice-feedback", HTMLElement),
  practiceQuestion: requiredElement("practice-question", HTMLElement),
  recordsButton: requiredElement("records-button", HTMLButtonElement),
  recordsClose: requiredElement("records-close", HTMLButtonElement),
  recordsDialog: requiredElement("records-dialog", HTMLDialogElement),
  replay: requiredElement("replay-run", HTMLButtonElement),
  resultDialog: requiredElement("result-dialog", HTMLDialogElement),
  resultKicker: requiredElement("result-kicker", HTMLElement),
  resultAccessNote: requiredElement("result-access-note", HTMLElement),
  resultAtlas: requiredElement("result-atlas", HTMLElement),
  resultMoves: requiredElement("result-moves", HTMLElement),
  resultPractice: requiredElement("result-practice", HTMLButtonElement),
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
  wardenGuild: requiredElement("warden-guild", HTMLElement),
  wardenState: requiredElement("warden-state", HTMLElement),
  windwayLegend: requiredElement("windway-legend", HTMLLIElement)
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
/** @type {{ seed: string, levelId: string, labyrinthNumber: number, atlasRegionId?: string, rulesetRevision?: string }} */
const sharedLocationFacts = {
  seed: normalizedLocationSeed ?? "",
  levelId: getQuestLevel(levelFromLocation()).id,
  labyrinthNumber: labyrinthFromLocation() ?? 1
};
const sharedLocationRuleset =
  locationSeed === null
    ? null
    : rulesetFromLocation(sharedLocationFacts.labyrinthNumber) ??
      getClassicRunRuleset(sharedLocationFacts.labyrinthNumber);
if (sharedLocationRuleset) {
  sharedLocationFacts.atlasRegionId = sharedLocationRuleset.atlasRegionId;
  sharedLocationFacts.rulesetRevision = sharedLocationRuleset.revision;
}
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
const initialRuleset =
  activeRunLocator
    ? normalizeRunRuleset(
        rulesetIdentityFromLocator(activeRunLocator),
        currentLabyrinthNumber
      )
    : sharedLocationRuleset ??
      getQuestRunRuleset(currentLabyrinthNumber);
let run = createRun(
  normalizedLocationSeed ?? activeRunLocator?.seed ?? createSeed(),
  {
    ...getLabyrinthConfig(currentLevel.id, currentLabyrinthNumber),
    ruleset:
      initialRuleset ?? getClassicRunRuleset(currentLabyrinthNumber)
  }
);
let runActionLog = createRunActionLog();
let runActionLogOverflowed = false;
run.status = "paused";
let lanternJournal = createLanternJournal();
let lanternJournalStatus = "";
let authenticationObserved = false;
let authenticatedUserId = "";
/** @type {QuestContinuityController | null} */
let questContinuityController = null;
/** @type {Promise<QuestContinuityController | null> | null} */
let questContinuityControllerPromise = null;
/** @type {"initial" | "new-quest" | "terminal" | "online" | null} */
let questContinuityLoadKind = null;
const failedQuestContinuityLoads = new Set();
const playerController = createPlayerController({
  getScorePartition: () => ({
    atlasRegionId: run.ruleset.atlasRegionId,
    rulesetRevision: run.ruleset.revision,
    regionLabel: getDifficultyBand(currentLabyrinthNumber).label,
    rulesetLabel: run.ruleset.label
  }),
  onPaletteChange: () => renderer.render(run),
  onAuthenticationChange: handleAuthenticationChange,
  onIdentityEnd: clearActiveRunRecoveryForIdentityChange,
  onJournalChange: (journal) => {
    lanternJournal = journal;
    void syncPracticeOffer();
    if (elements.journalDialog.open) {
      void renderLanternJournal().catch(reportLanternJournalUnavailable);
    }
  },
  onJournalStatusChange: (message) => {
    lanternJournalStatus = message;
    elements.journalStatus.textContent = message;
  }
});
const accessSettingsContinuity = createAccessSettingsContinuity({
  client: {
    getAccessSettings: () => playerController.getCloudAccessSettings(),
    saveAccessSettings: (settings, expectedRevision) =>
      playerController.saveCloudAccessSettings(settings, expectedRevision)
  },
  onApply: (settings) => {
    applyAccessSettings(settings);
    renderer.render(run);
  },
  onStatus: (message) => {
    if (message) {
      announce(message);
    }
  }
});
/** @type {Promise<ReturnType<typeof import("./player/quest-conflict-view.js").createQuestConflictView>> | null} */
let questConflictViewPromise = null;
let questConflictViewRetry = false;
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
let reopenJournalAfterPractice = false;
let journalOpenPending = false;
/** @type {ReturnType<typeof import("./learning/lantern-journal-ui.js").selectPracticeQuestion> | null} */
let activePracticeQuestion = null;
let resumeAfterAccessSettings = false;
let resumeAfterQuestConflict = false;
/** @type {{ progress: typeof questProgress, source: "cloud" | "merged" } | null} */
let deferredCloudQuest = null;
let questionRequestKey = "";
let runFinished = false;
let hintVisible = false;
/** @type {number | null} */
let stagedGateWardenId = null;
let gateStagingComplete = false;
/** @type {ReturnType<typeof createDailyContract> | null} */
let activeDaily = null;
let dailyQuestionIndex = 0;
let dailyBoardRequestId = 0;
let demoAccessPending = hasCompletedGuestDemo();
let activeFirstLight = false;
let firstLightEntryPending = false;
let firstLightHandoff = false;
let completedQuestIdle = false;
/** @type {Promise<typeof import("./game/active-run-recovery.js") | null> | null} */
let activeRunRecoveryModulePromise = null;
/** @type {ActiveRunRecoveryController | null} */
let activeRunRecoveryController = null;
/** @type {CampfireResumeView | null} */
let campfireResumeView = null;
let activeRunRecoveryUnavailableReported = false;
/** @type {import("./game/run-replay-contract.js").RunReplay | null} */
let pendingRunReplay = null;
/** @type {{ freeRunsRemaining: number, state: string } | null} */
let latestRunAccess = null;
let lifetimeReturnConfirmed = false;
let pendingLifetimeSessionId = "";
let mustChooseLevel =
  dailyRequest.status === "none" &&
  locationSeed === null &&
  activeRunLocator === null &&
  storedQuestProgress === null;
firstLightEntryPending =
  mustChooseLevel &&
  !demoAccessPending &&
  shouldOfferFirstLight();
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
/** @type {Promise<ReturnType<typeof import("./game/quest-atlas-view.js").createQuestAtlasView>> | null} */
let atlasViewPromise = null;
let atlasOpening = false;
let atlasViewRetry = false;
/** @type {Promise<ReturnType<typeof import("./game/run-replay-view.js").createRunReplayView>> | null} */
let runReplayViewPromise = null;
let runReplayOpening = false;
let runReplayViewRetry = false;
let resumeAfterRunReplay = false;
/** @type {typeof import("./game/run-replay.js").buildRunReplayTimeline | null} */
let buildRunReplayTimelineForAtlas = null;
/** @type {Promise<ReturnType<typeof import("./player/access-settings-view.js").createAccessSettingsView>> | null} */
let accessSettingsViewPromise = null;
let accessSettingsOpening = false;
let accessSettingsViewRetry = false;

export const gameReady = initializeRunEntry();
void gameReady.then(() => {
  if (new URL(window.location.href).searchParams.has("atlas")) {
    void showQuestAtlas(elements.atlasButton);
  }
});
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
  if (activeFirstLight) {
    void openLevelPicker(true);
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
elements.dailyBoardRetry.addEventListener("click", () => {
  void refreshVerifiedDailyBoard(
    createDailyContract(elements.dailyBoardDate.textContent ?? utcDateKey())
  );
});
elements.dailyReturn.addEventListener("click", returnToQuest);
elements.firstLightDialog.addEventListener("cancel", (event) => {
  event.preventDefault();
});
elements.firstLightStart.addEventListener("click", () => {
  firstLightEntryPending = false;
  elements.firstLightDialog.close();
  startFirstLight();
});
elements.firstLightSkip.addEventListener("click", () => {
  markFirstLightSeen();
  firstLightEntryPending = false;
  firstLightHandoff = true;
  deferredCloudQuest = null;
  elements.firstLightDialog.close();
  void openLevelPicker(true);
});
elements.firstLightReplay.addEventListener("click", () => {
  elements.levelDialog.close();
  startFirstLight();
});
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
    canvas.focus({ preventScroll: true });
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
  if (activeFirstLight && !run.challenge?.hintRevealed) {
    return;
  }

  const question = run.challenge?.question;
  if (question && !activeFirstLight) {
    playerController.recordLearningOutcome(
      question,
      button.dataset.answer === question.answerId ? "correct" : "wrong"
    );
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
  if (run.challenge?.question && !activeFirstLight) {
    playerController.recordLearningOutcome(run.challenge.question, "hint");
  }
  transition({ type: "reveal-hint" });
});
elements.skipQuestion.addEventListener("click", () => {
  if (activeFirstLight) {
    return;
  }
  if (run.freeQuestionSkipAvailable) {
    recordCurrentSkip();
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
  if (activeFirstLight) {
    return;
  }
  hideSkipWarning();
  recordCurrentSkip();
  transition({ type: "skip-question" });
});
elements.atlasButton.addEventListener("click", () => {
  void showQuestAtlas(elements.atlasButton);
});
elements.gateStagingSkip.addEventListener("click", () => {
  gateStagingComplete = true;
  elements.gateStagingSkip.hidden = true;
  syncChallengeDialog();
});

/** @param {HTMLElement} trigger */
async function showQuestAtlas(trigger) {
  if (atlasOpening) {
    return;
  }
  atlasOpening = true;
  resumeAfterAtlas = run.status === "active";
  if (resumeAfterAtlas) {
    togglePause();
  }
  const retrying = atlasViewRetry;
  try {
    if (!atlasViewPromise) {
      /** @type {Promise<typeof import("./game/quest-atlas-view.js")>} */
      const viewModule = retrying
        // @ts-expect-error Vite treats the query as a distinct retry chunk.
        ? import("./game/quest-atlas-view.js?retry=1")
        : import("./game/quest-atlas-view.js");
      atlasViewRetry = true;
      atlasViewPromise = viewModule.then(
        ({ createQuestAtlasView }) => createQuestAtlasView({
        onWatchTrail: (landmarkId, returnTarget) => {
          const record = replayRecordForLandmark(landmarkId);
          if (!record) {
            announce(
              "That Trail is no longer retained on this device."
            );
            return;
          }
          resumeAfterRunReplay = false;
          void openRunReplay(record, returnTarget);
        },
        onClose: () => {
          if (resumeAfterAtlas && run.status === "paused") {
            togglePause();
          }
          resumeAfterAtlas = false;
        }
        })
      );
    }
    const atlasView = await atlasViewPromise;
    const watchTrailLandmarkIds = await compatibleReplayLandmarkIds();
    atlasView.show(projectQuestAtlas(questProgress, {
      watchTrailLandmarkIds
    }), trigger);
  } catch {
    atlasViewPromise = null;
    if (resumeAfterAtlas && run.status === "paused") {
      togglePause();
    }
    resumeAfterAtlas = false;
    announce(
      "Echo Atlas could not open. Continue the Quest and try again."
    );
  } finally {
    atlasOpening = false;
  }
}

/** @param {string} landmarkId */
function replayRecordForLandmark(landmarkId) {
  return runRecords.find(
    (record) =>
      isCompatibleRunReplay(record) &&
      record.questId === questProgress.questId &&
      record.questLevelId === questProgress.levelId &&
      record.labyrinthNumber !== undefined &&
      `${getDifficultyBand(record.labyrinthNumber).id}-` +
        `${record.labyrinthNumber}` === landmarkId
  ) ?? null;
}

async function compatibleReplayLandmarkIds() {
  try {
    if (!buildRunReplayTimelineForAtlas) {
      ({ buildRunReplayTimeline: buildRunReplayTimelineForAtlas } =
        await import("./game/run-replay.js"));
    }
  } catch {
    return new Set();
  }
  return new Set(
    runRecords
      .filter(
        (record) =>
          isCompatibleRunReplay(record) &&
          record.questId === questProgress.questId &&
          record.questLevelId === questProgress.levelId &&
          record.labyrinthNumber !== undefined
      )
      .map(
        (record) =>
          `${getDifficultyBand(record.labyrinthNumber ?? 1).id}-` +
          `${record.labyrinthNumber}`
      )
  );
}

/** @param {typeof runRecords[number]} record */
function isCompatibleRunReplay(record) {
  if (!record.replay || !buildRunReplayTimelineForAtlas) {
    return false;
  }
  try {
    buildRunReplayTimelineForAtlas(record);
    return true;
  } catch {
    return false;
  }
}

/**
 * @param {typeof runRecords[number]} record
 * @param {HTMLElement} trigger
 */
async function openRunReplay(record, trigger) {
  if (runReplayOpening || !record.replay) {
    return;
  }
  runReplayOpening = true;
  const retrying = runReplayViewRetry;
  try {
    let view;
    try {
      if (!runReplayViewPromise) {
        /** @type {Promise<typeof import("./game/run-replay-view.js")>} */
        const viewModule = retrying
          // @ts-expect-error Vite treats the query as a distinct retry chunk.
          ? import("./game/run-replay-view.js?retry=1")
          : import("./game/run-replay-view.js");
        runReplayViewRetry = true;
        runReplayViewPromise = viewModule.then(
          ({ createRunReplayView }) => createRunReplayView({
            onClose: () => {
              if (resumeAfterRunReplay && run.status === "paused") {
                togglePause();
              }
              resumeAfterRunReplay = false;
            }
          })
        );
      }
      view = await runReplayViewPromise;
    } catch {
      runReplayViewPromise = null;
      if (resumeAfterRunReplay && run.status === "paused") {
        togglePause();
      }
      resumeAfterRunReplay = false;
      announce(
        retrying
          ? "This Trail is unavailable. Reload to try again."
          : "This Trail is unavailable. Try again."
      );
      return;
    }
    try {
      view.show(record, trigger);
    } catch {
      if (resumeAfterRunReplay && run.status === "paused") {
        togglePause();
      }
      resumeAfterRunReplay = false;
      announce(
        "This Trail is corrupt, so it cannot be watched. Play This Seed is still available."
      );
    }
  } finally {
    runReplayOpening = false;
  }
}

elements.recordsButton.addEventListener("click", () => {
  resumeAfterRecords = run.status === "active";
  if (resumeAfterRecords) {
    togglePause();
  }
  renderRunRecords();
  elements.recordsDialog.showModal();
});
elements.settingsButton.addEventListener("click", async () => {
  if (accessSettingsOpening) {
    return;
  }
  accessSettingsOpening = true;
  resumeAfterAccessSettings = run.status === "active";
  if (resumeAfterAccessSettings) {
    togglePause();
  }
  const retrying = accessSettingsViewRetry;
  try {
    if (!accessSettingsViewPromise) {
      /** @type {Promise<typeof import("./player/access-settings-view.js")>} */
      const viewModule = retrying
        // @ts-expect-error Vite treats the query as a distinct retry chunk.
        ? import("./player/access-settings-view.js?retry=1")
        : import("./player/access-settings-view.js");
      accessSettingsViewRetry = true;
      accessSettingsViewPromise = viewModule.then(
      ({ createAccessSettingsView }) =>
        createAccessSettingsView({
          onApply: (settings) => {
            applyAccessSettings(settings);
            renderer.render(run);
          },
          onClose: () => {
            if (resumeAfterAccessSettings && run.status === "paused") {
              togglePause();
            }
            resumeAfterAccessSettings = false;
          },
          onSave: (settings) => accessSettingsContinuity.save(settings)
        })
      );
    }
    const accessSettingsView = await accessSettingsViewPromise;
    accessSettingsView.show(elements.settingsButton);
  } catch {
    accessSettingsViewPromise = null;
    if (resumeAfterAccessSettings && run.status === "paused") {
      togglePause();
    }
    resumeAfterAccessSettings = false;
    announce(
      retrying
        ? "Explorer Access Settings are unavailable. Reload to try again."
        : "Explorer Access Settings are unavailable. Try again."
    );
  } finally {
    accessSettingsOpening = false;
  }
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
elements.journalButton.addEventListener("click", () => {
  void openLanternJournal();
});
elements.journalClose.addEventListener("click", () => {
  elements.journalDialog.close();
});
elements.journalDialog.addEventListener("close", () => {
  elements.journalClearWarning.hidden = true;
  if (
    !reopenJournalAfterPractice &&
    elements.journalDialog.dataset.resumeRun === "true" &&
    run.status === "paused"
  ) {
    togglePause();
  }
  if (!reopenJournalAfterPractice) {
    delete elements.journalDialog.dataset.resumeRun;
  }
});
elements.journalBands.addEventListener("click", (event) => {
  const button =
    event.target instanceof Element
      ? event.target.closest("button[data-practice-question]")
      : null;
  if (!(button instanceof HTMLButtonElement)) return;
  void openPractice(
    {
      id: button.dataset.practiceQuestion ?? "",
      topicId: button.dataset.topic ?? "",
      learningObjectiveId: button.dataset.objective ?? "",
      difficultyBand: button.dataset.band ?? ""
    },
    true
  );
});
elements.journalClear.addEventListener("click", () => {
  elements.journalClearWarning.hidden = false;
  elements.journalClearConfirm.focus();
});
elements.journalClearCancel.addEventListener("click", () => {
  elements.journalClearWarning.hidden = true;
  elements.journalClear.focus();
});
elements.journalClearConfirm.addEventListener("click", () => {
  elements.journalClearWarning.hidden = true;
  playerController.clearLanternJournal();
  void renderLanternJournal().catch(reportLanternJournalUnavailable);
  elements.journalClose.focus();
});
elements.practiceChoices.addEventListener("click", async (event) => {
  const button =
    event.target instanceof Element
      ? event.target.closest("button[data-practice-answer]")
      : null;
  if (
    !(button instanceof HTMLButtonElement) ||
    !button.dataset.practiceAnswer ||
    !activePracticeQuestion
  ) {
    return;
  }
  const practiceQuestion = activePracticeQuestion;
  for (const choice of elements.practiceChoices.querySelectorAll("button")) {
    if (choice instanceof HTMLButtonElement) {
      choice.disabled = true;
    }
  }
  try {
    const { evaluatePracticeAnswer } = await loadLanternJournalUi();
    const result = evaluatePracticeAnswer(
      practiceQuestion,
      button.dataset.practiceAnswer
    );
    playerController.recordLearningOutcome(
      practiceQuestion,
      result.correct ? "correct" : "wrong"
    );
    elements.practiceFeedback.dataset.state = result.correct
      ? "correct"
      : "wrong";
    elements.practiceFeedback.textContent =
      `${result.message} ${result.explanation}`;
    elements.practiceClose.focus();
  } catch {
    for (const choice of elements.practiceChoices.querySelectorAll("button")) {
      if (choice instanceof HTMLButtonElement) {
        choice.disabled = false;
      }
    }
    reportLanternJournalUnavailable();
  }
});
elements.practiceClose.addEventListener("click", () => {
  elements.practiceDialog.close();
});
elements.practiceDialog.addEventListener("close", async () => {
  activePracticeQuestion = null;
  if (reopenJournalAfterPractice && !elements.journalDialog.open) {
    reopenJournalAfterPractice = false;
    try {
      await renderLanternJournal();
      if (!elements.journalDialog.open) {
        elements.journalDialog.showModal();
      }
    } catch {
      reportLanternJournalUnavailable();
    }
  }
});
elements.resultPractice.addEventListener("click", () => {
  void openFirstPractice();
});

async function openLanternJournal() {
  if (journalOpenPending) {
    return;
  }
  journalOpenPending = true;
  try {
    const pauseForJournal = run.status === "active";
    if (pauseForJournal) {
      elements.journalDialog.dataset.resumeRun = "true";
      togglePause();
    }
    await renderLanternJournal();
    if (!elements.journalDialog.open) {
      elements.journalDialog.showModal();
    }
  } catch {
    if (
      elements.journalDialog.dataset.resumeRun === "true" &&
      run.status === "paused"
    ) {
      togglePause();
    }
    delete elements.journalDialog.dataset.resumeRun;
    reportLanternJournalUnavailable();
    return;
  } finally {
    journalOpenPending = false;
  }
}

async function renderLanternJournal() {
  const { projectLanternJournal } = await loadLanternJournalUi();
  const projection = projectLanternJournal(lanternJournal);
  elements.journalStatus.textContent =
    lanternJournalStatus ||
    (playerController.getAuthenticatedUserId()
      ? "Signed in: Journal entries sync with this account."
      : "Guest Journal: entries stay on this device.");
  elements.journalClear.disabled = projection.empty;

  if (projection.empty) {
    const empty = document.createElement("div");
    const title = document.createElement("strong");
    const note = document.createElement("p");
    empty.className = "journal-empty";
    title.textContent = "Your lantern is ready.";
    note.textContent =
      "Answer, use a Hint, or skip a Warden Question to add a learning note.";
    empty.append(title, note);
    elements.journalBands.replaceChildren(empty);
    return;
  }

  elements.journalBands.replaceChildren(
    ...projection.bands.map((band) => {
      const section = document.createElement("section");
      const heading = document.createElement("h3");
      const objectives = document.createElement("div");
      section.className = "journal-band";
      heading.textContent = band.label;
      objectives.className = "journal-objectives";
      objectives.replaceChildren(
        ...band.objectives.map((objective) => {
          const row = document.createElement("article");
          const copy = document.createElement("div");
          const title = document.createElement("h4");
          const topic = document.createElement("p");
          const counts = document.createElement("ul");
          const practice = document.createElement("button");
          row.className = "journal-objective";
          title.textContent = objective.label;
          topic.textContent = objective.topicLabel;
          counts.className = "journal-counts";
          counts.replaceChildren(
            countItem("Correct", objective.correct),
            countItem("Wrong", objective.wrong),
            countItem("Hints", objective.hint),
            countItem("Skips", objective.skip)
          );
          copy.append(title, topic, counts);
          practice.type = "button";
          practice.className = "control-button journal-practice";
          practice.textContent = "Practice";
          practice.hidden = objective.status !== "practice-ready";
          practice.dataset.practiceQuestion = objective.practiceQuestionId;
          practice.dataset.topic = objective.topicId;
          practice.dataset.objective = objective.learningObjectiveId;
          practice.dataset.band = objective.difficultyBand;
          row.append(copy, practice);
          return row;
        })
      );
      section.append(heading, objectives);
      return section;
    })
  );
}

/** @param {string} label @param {number} count */
function countItem(label, count) {
  const item = document.createElement("li");
  item.textContent = `${label} ${count}`;
  return item;
}

/**
 * @param {{ id: string, topicId: string, learningObjectiveId: string, difficultyBand: string }} triggeringQuestion
 * @param {boolean} returnToJournal
 */
async function openPractice(triggeringQuestion, returnToJournal) {
  try {
    const { selectPracticeQuestion } = await loadLanternJournalUi();
    activePracticeQuestion = selectPracticeQuestion(triggeringQuestion);
  } catch {
    elements.journalStatus.textContent =
      "A different reviewed Practice Question is unavailable.";
    return;
  }
  reopenJournalAfterPractice = returnToJournal;
  elements.practiceClose.textContent = returnToJournal
    ? "Back to Journal"
    : "Close Practice";
  elements.practiceQuestion.textContent = activePracticeQuestion.prompt;
  elements.practiceFeedback.dataset.state = "";
  elements.practiceFeedback.textContent =
    "Take your time. This answer changes only the Journal.";
  elements.practiceChoices.replaceChildren(
    ...activePracticeQuestion.choices.map((choice) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "practice-choice";
      button.dataset.practiceAnswer = choice.id;
      button.textContent = choice.label;
      return button;
    })
  );
  if (elements.journalDialog.open) {
    elements.journalDialog.close();
  }
  if (!elements.practiceDialog.open) {
    elements.practiceDialog.showModal();
  }
  requestAnimationFrame(() => {
    elements.practiceQuestion.focus({ preventScroll: true });
  });
}

async function openFirstPractice() {
  const { projectLanternJournal } = await loadLanternJournalUi();
  const objective = projectLanternJournal(lanternJournal).bands
    .flatMap((band) => band.objectives)
    .find((entry) => entry.status === "practice-ready");
  if (!objective) return;
  await openPractice(
    {
      id: objective.practiceQuestionId,
      topicId: objective.topicId,
      learningObjectiveId: objective.learningObjectiveId,
      difficultyBand: objective.difficultyBand
    },
    false
  );
}

async function syncPracticeOffer() {
  try {
    const { projectLanternJournal } = await loadLanternJournalUi();
    const hasPractice = projectLanternJournal(lanternJournal).bands
      .some((band) =>
        band.objectives.some(
          (objective) => objective.status === "practice-ready"
        )
      );
    elements.resultPractice.hidden = !hasPractice;
  } catch {
    elements.resultPractice.hidden = true;
  }
}

function loadLanternJournalUi() {
  if (!lanternJournalUiPromise) {
    const retrying = lanternJournalUiRetry;
    /** @type {Promise<typeof import("./learning/lantern-journal-ui.js")>} */
    let journalUiModule;
    if (retrying) {
      // @ts-expect-error Vite treats the query as a distinct retry chunk.
      journalUiModule = import("./learning/lantern-journal-ui.js?retry=1");
    } else {
      journalUiModule = import("./learning/lantern-journal-ui.js");
    }
    lanternJournalUiRetry = true;
    lanternJournalUiPromise = journalUiModule.catch((error) => {
      lanternJournalUiPromise = null;
      lanternJournalUiFailedTwice ||= retrying;
      throw error;
    });
  }
  return lanternJournalUiPromise;
}

function reportLanternJournalUnavailable() {
  const message = lanternJournalUiFailedTwice
    ? "Lantern Journal is temporarily unavailable. Reload to try again."
    : "Lantern Journal is temporarily unavailable. Try again.";
  elements.journalStatus.textContent = message;
  announce(message);
  showEvent(message);
}

function recordCurrentSkip() {
  if (run.challenge?.question && !activeFirstLight) {
    playerController.recordLearningOutcome(run.challenge.question, "skip");
  }
}
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

  if (button.dataset.recordAction === "watch") {
    const record = runRecords[Number(button.dataset.recordIndex)];
    if (!record?.replay) {
      announce(
        "This Trail is missing or corrupt. Play This Seed is still available."
      );
      return;
    }
    resumeAfterRunReplay = resumeAfterRecords;
    resumeAfterRecords = false;
    elements.recordsDialog.close();
    await openRunReplay(record, elements.recordsButton);
    return;
  }

  if (button.dataset.recordAction === "replay") {
    await startRecordedLabyrinth(
      button.dataset.level ?? "trail-scout",
      Number(button.dataset.labyrinth ?? 1),
      button.dataset.seed,
      {
        atlasRegionId: button.dataset.region,
        revision: button.dataset.ruleset
      }
    );
    return;
  }

  if (button.dataset.recordAction === "copy") {
    try {
      await navigator.clipboard.writeText(
        createShareLink(
          button.dataset.seed,
          button.dataset.level ?? "trail-scout",
          Number(button.dataset.labyrinth ?? 1),
          {
            atlasRegionId: button.dataset.region,
            revision: button.dataset.ruleset
          }
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
  if (activeFirstLight) {
    if (run.status === "won") {
      startFirstLight();
      return;
    }
    void openLevelPicker(true);
    return;
  }
  void openLevelPicker();
});
elements.replay.addEventListener("click", async () => {
  const action = elements.replay.dataset.resultAction;
  if (action === "first-light-retry") {
    startFirstLight();
    return;
  }
  if (action === "first-light-levels") {
    await openLevelPicker(true);
    return;
  }
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
  if (activeFirstLight) {
    announce("First Light uses one fixed practice seed and has no share link.");
    return;
  }
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
  void playerController.retryLanternJournalSync();
  void loadQuestContinuityController("online").then((controller) =>
    controller?.retry(loadQuestProgress()) ?? false
  );
});

document.addEventListener("visibilitychange", () => {
  if (document.hidden && run.status === "active") {
    togglePause();
  }
});

async function loadActiveRunRecoveryModule() {
  if (!activeRunRecoveryModulePromise) {
    activeRunRecoveryModulePromise = import(
      "./game/active-run-recovery.js"
    ).catch(() => null);
  }
  const module = await activeRunRecoveryModulePromise;
  if (module && !activeRunRecoveryController) {
    activeRunRecoveryController =
      module.createActiveRunRecoveryController();
  }
  return module;
}

/** @param {boolean} [force] */
function reportActiveRunRecoveryUnavailable(force = false) {
  if (activeRunRecoveryUnavailableReported && !force) {
    return;
  }
  activeRunRecoveryUnavailableReported = true;
  const message =
    "Campfire Resume is unavailable for this Run. Current-tab play continues.";
  announce(message);
  showEvent(message);
}

function reportActiveRunRecoveryScrubFailed() {
  const message =
    "This device could not erase the old Quest checkpoint. Clear this site's data before another player uses this device.";
  announce(message);
  showEvent(message);
}

/** @param {Parameters<typeof startRun>[0]} locator */
async function beginActiveRunRecovery(locator) {
  const module = await loadActiveRunRecoveryModule();
  activeRunRecoveryUnavailableReported = false;
  if (!module || !activeRunRecoveryController) {
    reportActiveRunRecoveryUnavailable();
    return;
  }
  const recovery = activeRunRecoveryController.begin(locator, {
    clearStored: true
  });
  if (recovery.status === "unavailable") {
    reportActiveRunRecoveryUnavailable();
  }
}

/** @param {Parameters<typeof startRun>[0]} locator */
async function loadRecoveredRun(locator) {
  const module = await loadActiveRunRecoveryModule();
  if (!module || !activeRunRecoveryController) {
    reportActiveRunRecoveryUnavailable();
    return null;
  }
  const recovery = activeRunRecoveryController.load(locator);
  if (recovery.status === "recovered" && recovery.run) {
    activeRunRecoveryUnavailableReported = false;
    return recovery.run;
  }
  if (
    recovery.status === "invalid" ||
    recovery.status === "unavailable"
  ) {
    reportActiveRunRecoveryUnavailable();
  }
  const nextRecovery = activeRunRecoveryController.begin(locator, {
    clearStored: true
  });
  if (nextRecovery.status === "unavailable") {
    reportActiveRunRecoveryUnavailable();
  }
  return null;
}

async function openCampfireResume() {
  const module = await loadActiveRunRecoveryModule();
  if (!module) {
    reportActiveRunRecoveryUnavailable();
    return;
  }
  campfireResumeView ??= module.createCampfireResumeView({
    onContinue: () => {
      lastTick = performance.now();
      if (run.status === "paused") {
        transition({ type: "pause" });
        canvas.focus({ preventScroll: true });
      } else {
        hintVisible = Boolean(run.challenge?.hintRevealed);
        syncChallengeDialog();
      }
      announce("Campfire checkpoint continued.");
      showEvent("Campfire checkpoint continued.");
    },
    onRestart: async () => {
      const cleared = activeRunRecoveryController?.clear();
      if (cleared?.status === "unavailable") {
        reportActiveRunRecoveryUnavailable();
      }
      await startFreshRun(true);
      if (activeRunRecoveryUnavailableReported) {
        reportActiveRunRecoveryUnavailable(true);
      }
    }
  });
  campfireResumeView.show(run, {
    levelName: currentLevel.name,
    labyrinthNumber: currentLabyrinthNumber
  });
}

/**
 * @param {{
 *   version: 2 | 3,
 *   runId: string,
 *   pending: boolean,
 *   seed: string,
 *   levelId: string,
 *   labyrinthNumber: number,
 *   atlasRegionId?: string,
 *   rulesetRevision?: string
 * }} locator
 * @param {ReturnType<typeof createDailyContract> | null} [daily]
 * @param {ReturnType<typeof createRun> | null} [recoveredRun]
 */
function startRun(locator, daily = null, recoveredRun = null) {
  activeFirstLight = false;
  activeDaily = daily;
  dailyQuestionIndex = 0;
  document.body.dataset.runMode = daily ? "daily" : "quest";
  completedQuestIdle = false;
  currentLevel = getQuestLevel(locator.levelId);
  currentLabyrinthNumber = locator.labyrinthNumber;
  const ruleset = daily
    ? getClassicRunRuleset(currentLabyrinthNumber)
    : normalizeRunRuleset(
        rulesetIdentityFromLocator(locator),
        currentLabyrinthNumber
      );
  if (!ruleset) {
    throw new Error("Run ruleset identity is invalid.");
  }
  run =
    recoveredRun ??
    createRun(
      locator.seed,
      {
        ...getLabyrinthConfig(currentLevel.id, currentLabyrinthNumber),
        ruleset
      }
    );
  runActionLog = createRunActionLog();
  runActionLogOverflowed = false;
  pendingRunReplay = null;
  if (!daily && !recoveredRun) {
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
    recoveredRun
      ? `Campfire checkpoint found in Labyrinth ${currentLabyrinthNumber}. The Run is paused until you choose.`
      : daily
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
  if (recoveredRun) {
    announce("Campfire checkpoint found. Choose Continue Run or Restart Run.");
    showEvent("Campfire checkpoint found. The Run remains paused.");
    return;
  }
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
  if (!daily && activeRunRecoveryUnavailableReported) {
    reportActiveRunRecoveryUnavailable(true);
  }
}

function startFirstLight() {
  firstLightEntryPending = false;
  firstLightHandoff = false;
  deferredCloudQuest = null;
  activeFirstLight = true;
  activeDaily = null;
  mustChooseLevel = false;
  completedQuestIdle = false;
  document.body.dataset.runMode = "first-light";
  currentLevel = getQuestLevel("bright-start");
  currentLabyrinthNumber = 1;
  run = createFirstLightRun();
  runActionLog = createRunActionLog();
  runActionLogOverflowed = false;
  pendingRunReplay = null;
  lastTick = performance.now();
  questionRequestKey = "";
  runFinished = false;
  hintVisible = false;
  storyEntries = [];
  hideSkipWarning();
  addStory(
    "First Light begins. Recover one Echo, outsmart one Warden, then reach the Gate.",
    "start"
  );
  for (const dialog of [
    elements.firstLightDialog,
    elements.levelDialog,
    elements.resultDialog,
    elements.recordsDialog,
    elements.challengeDialog,
    elements.dailyDialog
  ]) {
    if (dialog.open) {
      dialog.close();
    }
  }
  resumeAfterDaily = false;
  updateInterface();
  canvas.focus({ preventScroll: true });
  announce(
    "First Light. One Echo and one Warden stand between you and the Gate."
  );
  showEvent("First Light is ready. Follow the passage to the Echo.");
}

function openFirstLightOffer() {
  if (!elements.firstLightDialog.open) {
    elements.firstLightDialog.showModal();
  }
  requestAnimationFrame(() => {
    elements.firstLightTitle.focus({ preventScroll: true });
  });
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
    firstLightEntryPending = false;
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
      locator?.runId,
      locator
        ? rulesetIdentityFromLocator(locator)
        : sharedLocationRuleset
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
    if (firstLightEntryPending) {
      openFirstLightOffer();
      return;
    }
    await openLevelPicker(true);
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
  elements.dailyBoardDate.textContent = currentDaily.date;
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
  renderDailyBoardParticipation();
  void refreshVerifiedDailyBoard(currentDaily);
  if (!elements.dailyDialog.open) {
    elements.dailyDialog.showModal();
  }
  requestAnimationFrame(() => {
    elements.dailyTitle?.focus?.({ preventScroll: true });
  });
}

function renderDailyBoardParticipation() {
  elements.dailyBoardNote.textContent = playerController.hasAuthenticatedUser()
    ? "Signed-in escapes with a saved username are checked by replay before they join this board."
    : "Guest Daily stays casual. Sign in and create a username to join the verified board.";
}

/** @param {ReturnType<typeof createDailyContract>} daily */
async function refreshVerifiedDailyBoard(daily) {
  const requestId = ++dailyBoardRequestId;
  elements.dailyBoardList.replaceChildren();
  elements.dailyBoardRetry.hidden = true;
  elements.dailyBoardStatus.dataset.state = "loading";
  elements.dailyBoardStatus.textContent = "Loading verified escapes…";
  try {
    const result = await playerController.getVerifiedDailyLeaderboard();
    if (
      requestId !== dailyBoardRequestId ||
      elements.dailyBoardDate.textContent !== daily.date
    ) {
      return;
    }
    if (result.date !== daily.date) {
      elements.dailyBoardStatus.dataset.state = "error";
      elements.dailyBoardStatus.textContent =
        "Verified Daily Board date changed. Reopen Daily to see the current board.";
      return;
    }
    const entries = Array.isArray(result.entries) ? result.entries : [];
    renderVerifiedDailyEntries(entries);
  } catch (error) {
    if (
      requestId !== dailyBoardRequestId ||
      elements.dailyBoardDate.textContent !== daily.date
    ) {
      return;
    }
    elements.dailyBoardList.replaceChildren();
    elements.dailyBoardRetry.hidden = false;
    elements.dailyBoardStatus.dataset.state = "error";
    elements.dailyBoardStatus.textContent = errorStatus(error) === 0
      ? "Network could not reach the Verified Daily Board. Local Daily play still works."
      : "Verified Daily services are unavailable. Local Daily play still works.";
  }
}

/** @param {Record<string, unknown>[]} entries */
function renderVerifiedDailyEntries(entries) {
  elements.dailyBoardList.replaceChildren(
    ...entries.slice(0, 10).map((entry, index) => {
      const item = document.createElement("li");
      const rank = document.createElement("span");
      const username = document.createElement("strong");
      const score = document.createElement("span");
      const moves = document.createElement("span");
      rank.className = "daily-board__rank";
      rank.textContent = `#${entry.rank ?? index + 1}`;
      username.className = "daily-board__username";
      username.textContent = String(entry.username ?? "Explorer");
      score.className = "daily-board__score";
      score.textContent = `${entry.score ?? 0} pts`;
      moves.className = "daily-board__moves";
      moves.textContent = `${entry.moves ?? 0} moves`;
      item.append(rank, username, score, moves);
      return item;
    })
  );
  elements.dailyBoardStatus.dataset.state = entries.length === 0
    ? "empty"
    : "success";
  elements.dailyBoardStatus.textContent = entries.length === 0
    ? "No verified escapes yet. The first checked Gate is waiting."
    : `${entries.length} verified ${entries.length === 1 ? "Explorer" : "Explorers"} ranked today.`;
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

/** @param {boolean} [replaceRunIdentity] */
async function startFreshRun(replaceRunIdentity = false) {
  const levelId = questProgress.levelId;
  const labyrinthNumber = questProgress.labyrinthNumber;
  let locator;
  if (
    activeRunLocator?.levelId === levelId &&
    activeRunLocator.labyrinthNumber === labyrinthNumber
  ) {
    locator = withRunAccessId(
      replaceRunIdentity
        ? {
            ...activeRunLocator,
            version: 3,
            runId: createRunAccessId(),
            pending: false
          }
        : activeRunLocator
    );
  } else {
    locator = createFreshLocator(levelId, labyrinthNumber);
  }
  if (!(await authorizeRunLocator(locator))) {
    return false;
  }
  await beginActiveRunRecovery(locator);
  startRun(locator);
  return true;
}

/**
 * @param {string} seed
 * @param {string} levelId
 * @param {number} labyrinthNumber
 * @param {boolean} [showAdjustedNotice]
 * @param {string} [runId]
 * @param {{ atlasRegionId?: string, revision?: string } | null} [rulesetIdentity]
 */
async function startSharedRun(
  seed,
  levelId,
  labyrinthNumber,
  showAdjustedNotice = false,
  runId,
  rulesetIdentity
) {
  const canRecover =
    typeof runId === "string" &&
    (activeRunLocator?.version === 2 || activeRunLocator?.version === 3) &&
    activeRunLocator.pending === false &&
    activeRunLocator.runId === runId;
  const ruleset = normalizeRunRuleset(rulesetIdentity, labyrinthNumber);
  if (!ruleset) {
    throw new Error("Run ruleset identity is invalid.");
  }
  const locator = withRunAccessId({
    version: 3,
    ...(runId ? { runId } : {}),
    pending: false,
    seed,
    levelId,
    labyrinthNumber,
    atlasRegionId: ruleset.atlasRegionId,
    rulesetRevision: ruleset.revision
  });
  if (!(await authorizeRunLocator(locator))) {
    return false;
  }
  const recoveredRun = canRecover
    ? await loadRecoveredRun(locator)
    : null;
  if (!canRecover) {
    await beginActiveRunRecovery(locator);
  }
  startRun(locator, null, recoveredRun);
  if (recoveredRun) {
    await openCampfireResume();
  }
  if (showAdjustedNotice) {
    announce("This share link was adjusted to a safe Labyrinth.");
    showEvent("This share link was adjusted to a safe Labyrinth.");
  }
  if (activeRunRecoveryUnavailableReported) {
    reportActiveRunRecoveryUnavailable(true);
  }
  return true;
}

/** @param {string} levelId @param {number} labyrinthNumber */
function createFreshLocator(levelId, labyrinthNumber) {
  const level = getQuestLevel(levelId);
  const ruleset = getQuestRunRuleset(labyrinthNumber);
  const config = {
    ...getLabyrinthConfig(levelId, labyrinthNumber),
    ruleset
  };
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
        version: 3,
        runId: createRunAccessId(),
        pending: false,
        seed: candidate.seed,
        levelId: level.id,
        labyrinthNumber,
        atlasRegionId: ruleset.atlasRegionId,
        rulesetRevision: ruleset.revision
      });
    }
  }

  for (let attempt = 0; attempt < 100; attempt += 1) {
    const fallbackSeed = `EMBER-${17 + attempt}`;
    const candidate = createRun(fallbackSeed, config);
    if (!usedFingerprints.has(labyrinthFingerprint(candidate))) {
      return withRunAccessId({
        version: 3,
        runId: createRunAccessId(),
        pending: false,
        seed: candidate.seed,
        levelId: level.id,
        labyrinthNumber,
        atlasRegionId: ruleset.atlasRegionId,
        rulesetRevision: ruleset.revision
      });
    }
  }

  throw new Error("Could not create a fresh Labyrinth for this Quest.");
}

/** @param {string} levelId @param {string} [seed] */
async function startNewQuest(levelId, seed) {
  const nextProgress = createQuestProgress(levelId);
  const ruleset = getQuestRunRuleset(nextProgress.labyrinthNumber);
  const locator = seed
    ? withRunAccessId({
        version: 3,
        runId: createRunAccessId(),
        pending: false,
        seed,
        levelId: nextProgress.levelId,
        labyrinthNumber: nextProgress.labyrinthNumber,
        atlasRegionId: ruleset.atlasRegionId,
        rulesetRevision: ruleset.revision
      })
    : createFreshLocator(
        nextProgress.levelId,
        nextProgress.labyrinthNumber
      );
  if (!(await authorizeRunLocator(locator))) {
    return false;
  }
  if (firstLightHandoff) {
    deferredCloudQuest = null;
    firstLightHandoff = false;
  }
  questProgress = saveQuestProgress(nextProgress);
  void loadQuestContinuityController("new-quest").then((controller) =>
    controller?.queueBoundary(questProgress) ?? false
  );
  currentLabyrinthNumber = questProgress.labyrinthNumber;
  window.history.replaceState({}, "", "/play");
  await beginActiveRunRecovery(locator);
  startRun(locator);
  return true;
}

/**
 * @param {string} levelId
 * @param {number} labyrinthNumber
 * @param {string} seed
 * @param {{ atlasRegionId?: string, revision?: string }} [rulesetIdentity]
 */
async function startRecordedLabyrinth(
  levelId,
  labyrinthNumber,
  seed,
  rulesetIdentity
) {
  const ruleset = normalizeRunRuleset(rulesetIdentity, labyrinthNumber);
  if (!ruleset) {
    throw new Error("Run ruleset identity is invalid.");
  }
  const locator = withRunAccessId({
    version: 3,
    runId: createRunAccessId(),
    pending: false,
    seed,
    levelId,
    labyrinthNumber,
    atlasRegionId: ruleset.atlasRegionId,
    rulesetRevision: ruleset.revision
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
  await beginActiveRunRecovery(locator);
  startRun(locator);
  return true;
}

/** @param {boolean} [requireChoice] */
async function openLevelPicker(requireChoice = false) {
  if (!(await canOpenStartChoice())) {
    return false;
  }
  if (activeFirstLight) {
    firstLightHandoff = true;
    deferredCloudQuest = null;
    activeFirstLight = false;
    document.body.dataset.runMode = "quest";
    if (run.status === "active") {
      run = applyAction(run, { type: "pause" });
    }
  }
  mustChooseLevel = requireChoice;
  if (elements.firstLightDialog.open) {
    elements.firstLightDialog.close();
  }
  if (elements.recordsDialog.open) {
    elements.recordsDialog.close();
  }
  if (elements.resultDialog.open) {
    elements.resultDialog.close();
  }
  if (!elements.levelDialog.open) {
    elements.levelDialog.showModal();
  }
  requestAnimationFrame(() => {
    elements.levelDialog
      .querySelector("h2")
      ?.focus?.({ preventScroll: true });
  });
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
  const signedIn =
    playerController.hasAuthenticatedUser() ||
    await playerController.isAuthenticated();
  if (demoAccessPending && !signedIn && requiresDemoAccount(false)) {
    showDemoAccountGate();
    return false;
  }
  if (!signedIn) {
    if (!config.guestDemoEnforcementEnabled) {
      return canOpenStartChoice();
    }
    try {
      const access = await playerController.authorizeGuestRun(locator);
      if (access.allowed) {
        demoAccessPending = false;
        return true;
      }
      markGuestDemoComplete();
      demoAccessPending = true;
      showDemoAccountGate();
      return false;
    } catch {
      // A temporary server failure must not strand a child at the entrance.
      // The local gate remains the fail-open floor until the server recovers.
      return canOpenStartChoice();
    }
  }
  if (!config.enforcementEnabled) {
    return canOpenStartChoice();
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
    activeRunLocator.runId,
    rulesetIdentityFromLocator(activeRunLocator)
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
  if (elements.dailyDialog.open) {
    renderDailyBoardParticipation();
  }
  const userId = signedIn ? playerController.getAuthenticatedUserId() : null;
  if (
    (
      authenticationObserved &&
      authenticatedUserId &&
      authenticatedUserId !== (userId ?? "")
    ) ||
    hasRunReplayOwnerMismatch(userId)
  ) {
    clearActiveRunRecoveryForIdentityChange();
  }
  authenticationObserved = true;
  authenticatedUserId = userId ?? "";
  runRecords = loadRunRecords(undefined, userId);
  bestEscapeRecord = bestEscape(runRecords);
  if (elements.recordsDialog.open) {
    renderRunRecords();
  }
  void accessSettingsContinuity.selectUser(userId ?? "").then((record) => {
    void accessSettingsViewPromise
      ?.then((view) => view.replaceSavedSettings(record.settings))
      .catch(() => {});
  });
  void loadQuestContinuityController().then((controller) => {
    if (!controller) {
      return false;
    }
    controller.setAuthenticated(userId);
    return userId ? controller.retry(loadQuestProgress()) : false;
  });
}

function clearActiveRunRecoveryForIdentityChange() {
  if (scrubRunReplays()) {
    runRecords = loadRunRecords();
    bestEscapeRecord = bestEscape(runRecords);
    if (elements.recordsDialog.open) {
      renderRunRecords();
    }
  } else {
    const message =
      "This device could not erase account-context Run Replay details. Clear this site's data before another player uses this device.";
    announce(message);
    showEvent(message);
  }
  if (!activeRunRecoveryController) {
    if (scrubActiveRunRecovery()) {
      return;
    }
    reportActiveRunRecoveryScrubFailed();
    return;
  }
  const result = activeRunRecoveryController.clear();
  if (result.status === "unavailable") {
    reportActiveRunRecoveryScrubFailed();
  }
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
  if (
    firstLightEntryPending ||
    activeFirstLight ||
    firstLightHandoff
  ) {
    return;
  }
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
  const retrying = questConflictViewRetry;
  if (!questConflictViewPromise) {
    const viewModule = retrying
      // @ts-expect-error Vite treats the query as a distinct retry chunk.
      ? import("./player/quest-conflict-view.js?retry=1")
      : import("./player/quest-conflict-view.js");
    questConflictViewRetry = true;
    questConflictViewPromise = viewModule.then(({ createQuestConflictView }) =>
      createQuestConflictView({ onChoose: resolveQuestConflictChoice })
    );
  }
  const loading = questConflictViewPromise;
  void loading
    .then((questConflictView) => questConflictView.show(conflict, trigger))
    .catch(() => {
      if (questConflictViewPromise === loading) {
        questConflictViewPromise = null;
      }
      if (resumeAfterQuestConflict && run.status === "paused") {
        togglePause();
      }
      resumeAfterQuestConflict = false;
      announce(
        retrying
          ? "Cloud Quest choice is unavailable. Reload to try again."
          : "Cloud Quest choice is unavailable. Your device Quest is safe."
      );
    });
}

/** @param {"local" | "cloud"} choice */
function resolveQuestConflictChoice(choice) {
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

/**
 * @param {typeof questProgress} progress
 * @param {"cloud" | "merged"} source
 */
function receiveCloudQuestProgress(progress, source) {
  if (
    dailyRequest.status !== "none" ||
    activeDaily !== null ||
    firstLightEntryPending ||
    activeFirstLight ||
    firstLightHandoff ||
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
  if (activeFirstLight) {
    elements.questSyncStatus.dataset.state = "local";
    elements.questSyncStatus.textContent = "Practice only";
    return;
  }
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
  if (
    activeFirstLight ||
    isDemoBlocked() ||
    completedQuestIdle ||
    run.status !== "active"
  ) {
    return;
  }
  transition({ type: "pulse" });
}

function togglePause() {
  if (
    isDemoBlocked() ||
    completedQuestIdle ||
    !activeFirstLight && activeDaily === null && activeRunLocator?.pending ||
    (run.status !== "active" && run.status !== "paused")
  ) {
    return;
  }
  transition({ type: "pause" });
}

function isDemoBlocked() {
  return demoAccessPending && activeDaily === null && !activeFirstLight;
}

/** @param {Parameters<typeof applyAction>[1]} action */
function transition(action) {
  const previous = run;
  const previousWardenMode = summarizeWardenMode(previous);
  run = applyAction(run, action);
  const recoveryResult =
    !activeFirstLight && activeDaily === null
      ? activeRunRecoveryController?.record(previous, action, run)
      : null;
  if (activeDaily && !runActionLogOverflowed) {
    const nextLog = tryAppendRunAction(runActionLog, previous, action, run);
    if (nextLog) {
      runActionLog = nextLog;
    } else {
      runActionLogOverflowed = true;
    }
  }
  const eventType = run.event.type;
  const eventMessage = activeFirstLight
    ? run.event.message.replace(/\s+You earned [^.]+\.$/, "")
    : run.event.message;
  const wardenMode = summarizeWardenMode(run);
  const eventChanged =
    eventType !== previous.event.type || run.moves !== previous.moves;

  if (eventChanged) {
    showEvent(eventMessage);
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
      addStory(eventMessage, eventType);
    }
  }
  if (eventChanged || wardenMode !== previousWardenMode) {
    const modeAnnouncement =
      wardenMode !== previousWardenMode
        ? ` Warden mode: ${wardenModeLabel(wardenMode)}.`
        : "";
    announce(`${eventChanged ? eventMessage : ""}${modeAnnouncement}`.trim());
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
  if (recoveryResult?.status === "unavailable") {
    reportActiveRunRecoveryUnavailable();
  }
  if (
    recoveryResult?.status === "terminal" &&
    "replay" in recoveryResult
  ) {
    pendingRunReplay = recoveryResult.replay ?? null;
  }
  if (!runFinished && (run.status === "won" || run.status === "lost")) {
    finishRun();
  }
}

function syncChallengeDialog() {
  if (run.status !== "challenge" || !run.challenge) {
    stagedGateWardenId = null;
    gateStagingComplete = false;
    elements.gateStagingSkip.hidden = true;
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
  if (isGateWarden && stagedGateWardenId !== run.challenge.wardenId) {
    stagedGateWardenId = run.challenge.wardenId;
    gateStagingComplete = false;
  }
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
    elements.skipQuestion.hidden = activeFirstLight;
    elements.challengeSource.textContent = "Opening the question scroll…";
    if (isGateWarden && !gateStagingComplete) {
      const theme = getRegionTheme(run.ruleset.atlasRegionId);
      elements.challengeKicker.textContent =
        `${theme?.wardenGuild ?? "Gate Warden"} entrance`;
      elements.challengeQuestion.textContent =
        "The universal diamond crest marks the Gate Warden. The timer is paused.";
      elements.challengeSource.textContent =
        "Skip the entrance whenever you are ready. No Run state changes.";
      elements.gateStagingSkip.hidden = false;
      elements.gateStagingSkip.textContent = "Skip entrance · Begin challenge";
      requestAnimationFrame(() =>
        elements.gateStagingSkip.focus({ preventScroll: true })
      );
      return;
    }
    elements.gateStagingSkip.hidden = true;
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
  const firstLightNeedsHint =
    activeFirstLight && !run.challenge.hintRevealed;
  elements.skipQuestion.hidden = activeFirstLight;
  elements.skipQuestion.disabled = activeFirstLight;
  elements.skipQuestion.textContent = run.freeQuestionSkipAvailable
    ? "Skip free"
    : "Skip · 1 Vitality";
  elements.challengeChoices.replaceChildren(
    ...(firstLightNeedsHint ? [] : question.choices).map((choice) => {
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
    (firstLightNeedsHint
      ? elements.hintButton
      : elements.challengeQuestion
    ).focus({ preventScroll: true });
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
  if (activeFirstLight) {
    const key = [
      "first-light",
      run.seed,
      run.challenge.wardenId,
      run.challenge.attempt
    ].join(":");
    if (questionRequestKey === key) {
      return;
    }
    questionRequestKey = key;
    const question = getFirstLightQuestion(run.challenge);
    elements.challengeSource.textContent =
      "First Light uses one reviewed question card from the game.";
    transition({ type: "provide-question", question });
    return;
  }
  const challengeSnapshot = {
    levelId: currentLevel.id,
    seed: run.seed,
    wardenId: run.challenge.wardenId,
    attempt: run.challenge.attempt,
    challengeKind: /** @type {"warden" | "gate-warden"} */ (
      run.challenge.kind === "gate-warden" ? "gate-warden" : "warden"
    ),
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
      questionOrdinal: challengeSnapshot.questionOrdinal + offset,
      challengeKind: /** @type {"warden" | "gate-warden"} */ (
        offset === 0 &&
          challengeSnapshot.attempt === 0 &&
          challengeSnapshot.challengeKind === "gate-warden"
          ? "gate-warden"
          : "warden"
      )
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
        question: String(request.questionOrdinal),
        challenge: request.challengeKind
      });
      const response = await fetch(`/api/question?${parameters}`);
      if (!response.ok) {
        throw new Error("Question service unavailable.");
      }
      const payload = await response.json();
      question = normalizeQuestion(payload.question);
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
 *   challengeKind: "warden" | "gate-warden",
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
    request.challengeKind,
    request.labyrinthNumber,
    request.questionOrdinal
  ].join(":");
}

function updateInterface() {
  const regionTheme = getRegionTheme(run.ruleset.atlasRegionId);
  document.body.dataset.regionTheme = regionTheme?.id ?? "";
  audio.setAmbient(
    run.ruleset.atlasRegionId,
    !activeFirstLight && run.status === "active" && !document.hidden
  );
  renderer.render(run);
  canvas.setAttribute(
    "aria-label",
    activeFirstLight
      ? "First Light maze. Use arrow keys, WASD, or the touch movement controls to move."
      : run.windways.length > 0
        ? "Interactive maze with directional Windway source and destination marks. Use arrow keys or WASD to move. Press Q or Space to use Pulse."
        : "Interactive maze. Use arrow keys or WASD to move. Press Q or Space to use Pulse."
  );
  const collected = run.echoes.filter((echo) => echo.collected).length;
  const difficultyBand = getDifficultyBand(currentLabyrinthNumber);
  elements.questLevelName.textContent = activeDaily
    ? `Daily · ${activeDaily.date} UTC`
    : activeFirstLight
      ? "First Light"
      : `Quest Level ${currentLevel.number} · ${currentLevel.name}`;
  elements.questStage.textContent = activeDaily
    ? `${currentLevel.name} · Labyrinth ${currentLabyrinthNumber} · ${difficultyBand.label}`
    : activeFirstLight
      ? "One Echo · One Warden · One Gate"
      : `Labyrinth ${currentLabyrinthNumber} of ${QUEST_LABYRINTH_COUNT} · ${formatRunRulesetLabel(run.ruleset, currentLabyrinthNumber)}`;
  elements.questHeadline.textContent = activeDaily
    ? `Today’s shared Labyrinth: find ${run.echoes.length} Echoes and outsmart ${run.config.wardenCount} ${run.config.wardenCount === 1 ? "Warden" : "Wardens"}.`
    : activeFirstLight
      ? "First Light: recover one Echo, outsmart one Warden, and reach the Gate."
      : `Labyrinth ${currentLabyrinthNumber}: find ${run.echoes.length} Echoes and outsmart ${run.config.wardenCount} ${run.config.wardenCount === 1 ? "Warden" : "Wardens"}.`;
  elements.seedValue.textContent = run.seed;
  elements.seedCopyHint.textContent = activeDaily
    ? "Copy Daily Link"
    : activeFirstLight
      ? "Practice seed"
      : "Copy Share Link";
  elements.seedCopy.disabled = activeFirstLight;
  elements.time.textContent = formatTime(run.elapsedMs);
  elements.moves.textContent = String(run.moves).padStart(3, "0");
  elements.echoCount.textContent = `${collected} / ${run.echoes.length}`;
  elements.vitalityCount.textContent =
    `${run.explorer.vitality} / ${run.explorer.maxVitality}`;
  elements.pulseCount.textContent = String(run.pulses);
  playerController.updateScore(activeFirstLight ? 0 : run.score);
  elements.pulse.disabled = run.pulses === 0 || run.status !== "active";
  elements.dailyButton.disabled =
    run.status === "challenge" || activeFirstLight;
  elements.atlasButton.disabled =
    run.status === "challenge" || activeDaily !== null || activeFirstLight;
  elements.journalButton.disabled =
    run.status === "challenge" || activeFirstLight;
  elements.recordsButton.disabled =
    run.status === "challenge" || activeDaily !== null || activeFirstLight;
  elements.settingsButton.disabled = run.status === "challenge";
  elements.newRun.textContent = activeDaily
    ? "Return to Quest"
    : activeFirstLight
      ? "Choose Quest"
      : "New Quest";
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
  elements.wardenGuild.textContent = regionTheme
    ? `${regionTheme.wardenGuild} · ${regionTheme.ambientLabel} is optional.`
    : "Universal Warden marks";
  elements.windwayLegend.hidden = run.windways.length === 0;
  elements.fieldNote.textContent = run.event.message;
  renderPips(elements.echoMeter, run.echoes.length, collected, "echo-pip");
  renderPips(
    elements.vitalityMeter,
    run.explorer.maxVitality,
    run.explorer.vitality,
    "vitality-pip"
  );
  if (activeFirstLight) {
    elements.best.textContent =
      "First Light saves no scores, records, Atlas marks, Journal notes, or Quest progress.";
    renderQuestSyncStatus("local");
  } else if (activeDaily) {
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
  const won = run.status === "won";
  if (activeFirstLight) {
    finishFirstLight(won);
    return;
  }
  elements.resultAtlas.hidden = false;
  elements.freshRun.textContent = "New Quest";
  if (activeDaily) {
    finishDailyRun(activeDaily, won);
    return;
  }
  const finishedLabyrinthNumber = currentLabyrinthNumber;
  const echoesCollected = run.echoes.filter((echo) => echo.collected).length;
  const runReplayOwnerId = playerController.getAuthenticatedUserId();
  runRecords = saveRunRecord({
    elapsedMs: run.elapsedMs,
    moves: run.moves,
    seed: run.seed,
    outcome: won ? "escaped" : "defeated",
    echoesCollected,
    echoTotal: run.echoes.length,
    questId: questProgress.questId,
    questLevelId: currentLevel.id,
    labyrinthNumber: currentLabyrinthNumber,
    atlasRegionId: run.ruleset.atlasRegionId,
    rulesetRevision: run.ruleset.revision,
    ...(pendingRunReplay
      ? {
          replay: pendingRunReplay,
          ...(runReplayOwnerId
            ? { replayOwnerId: runReplayOwnerId }
            : {})
        }
      : {})
  }, undefined, runReplayOwnerId);
  pendingRunReplay = null;
  bestEscapeRecord = bestEscape(runRecords);
  if (won) {
    void playerController.submitEscapedRun(
      {
        seed: run.seed,
        moves: run.moves,
        elapsedMs: run.elapsedMs,
        score: run.score,
        wardensDefeated: run.wardensDefeated,
        echoesCollected,
        atlasRegionId: run.ruleset.atlasRegionId,
        rulesetRevision: run.ruleset.revision
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
  const regionTheme = getRegionTheme(run.ruleset.atlasRegionId);
  const sigilMilestone =
    won &&
    isGateWardenMilestone(finishedLabyrinthNumber) &&
    regionTheme !== null;
  const sigilCeremony =
    sigilMilestone &&
    claimRegionCeremony(
      questProgress.questId,
      run.ruleset.atlasRegionId
    ) === "full";
  elements.resultKicker.textContent = questComplete
    ? "Quest complete"
    : sigilCeremony
      ? `${regionTheme.name} Sigil ceremony`
    : sigilMilestone
      ? `${regionTheme.name} milestone`
    : won
      ? `Labyrinth ${finishedLabyrinthNumber} of ${QUEST_LABYRINTH_COUNT} complete`
      : `Labyrinth ${finishedLabyrinthNumber} ended`;
  elements.resultTitle.textContent = questComplete
    ? "You mastered all twenty Labyrinths."
    : sigilCeremony
      ? `The ${regionTheme.sigilName} returns.`
    : sigilMilestone
      ? `The ${regionTheme.sigilName} remains restored.`
    : won
      ? "You brought these Echoes home."
      : "The maze light needs a rest.";
  elements.resultSummary.textContent = questComplete
    ? `${currentLevel.name} is complete. Every Warden Question in this Quest stayed unique.`
    : sigilCeremony
      ? "The restored Atlas landmark is the only lasting result. No currency, inventory, or gameplay reward is created."
    : sigilMilestone
      ? "Compact result: the Atlas landmark is already restored. No additional gameplay reward is created."
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
    : sigilCeremony
      ? "Skip ceremony · Continue Quest"
    : won
      ? "Continue Quest"
      : "Retry Labyrinth";
  elements.freshRun.hidden = questComplete;
  if (!playerController.hasAuthenticatedUser()) {
    markGuestDemoPendingAuthentication();
    demoAccessPending = true;
    if (!sigilMilestone) {
      showDemoAccountGate();
    }
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

/** @param {boolean} won */
function finishFirstLight(won) {
  if (won) {
    markFirstLightSeen();
  }
  elements.resultAtlas.hidden = true;
  elements.resultAccessNote.hidden = true;
  elements.resultAccessNote.textContent = "";
  elements.resultPractice.hidden = true;
  elements.resultKicker.textContent = won
    ? "Lesson complete"
    : "Free practice retry";
  elements.resultTitle.textContent = won
    ? "First Light complete."
    : "Your First Light can begin again.";
  elements.resultSummary.textContent = won
    ? "You recovered an Echo, used knowledge to defeat a Warden, and reached the Gate with normal Quest rules. Choose a Quest Level when you are ready."
    : "Wrong answers used your Vitality exactly as they do in a Quest. Retry with full Vitality, or choose a Quest Level.";
  elements.replay.dataset.resultAction = won
    ? "first-light-levels"
    : "first-light-retry";
  elements.replay.textContent = won
    ? "Choose Quest Level"
    : "Retry First Light";
  elements.freshRun.hidden = false;
  elements.freshRun.textContent = won
    ? "Replay First Light"
    : "Choose Quest Level";
  elements.resultTime.textContent = formatTime(run.elapsedMs);
  elements.resultMoves.textContent = String(run.moves).padStart(3, "0");
  elements.resultSeed.textContent = "Practice";
  elements.resultRank.textContent = "Not saved";
  updateInterface();
  if (!elements.resultDialog.open) {
    elements.resultDialog.showModal();
  }
  requestAnimationFrame(() => {
    elements.resultTitle.focus({ preventScroll: true });
  });
  announce(
    won
      ? "First Light complete. Choose a Quest Level when you are ready."
      : "First Light ended. Retry for free with full Vitality."
  );
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
  if (won) {
    void submitVerifiedDailyRun(daily);
  }
}

/** @param {ReturnType<typeof createDailyContract>} daily */
async function submitVerifiedDailyRun(daily) {
  const submittedLog = runActionLog;
  const localKicker = elements.resultKicker.textContent ?? "";
  const localSummary = elements.resultSummary.textContent ?? "";
  const localRank = elements.resultRank.textContent ?? "";
  if (runActionLogOverflowed) {
    elements.resultKicker.textContent =
      `${localKicker} · replay limit reached`;
    elements.resultSummary.textContent =
      `${localSummary} This long Run stayed playable, but its replay was too long for the verified board.`;
    elements.resultRank.textContent = localRank;
    announce("Daily replay limit reached. Your local result is unchanged.");
    return;
  }
  const submission = createVerifiedDailySubmission(daily, submittedLog, run);
  if (playerController.hasAuthenticatedUser()) {
    elements.resultKicker.textContent = "Checking Daily replay";
    elements.resultRank.textContent = "Checking";
  }
  const result = await playerController.submitVerifiedDaily(submission);
  if (activeDaily?.date !== daily.date || runActionLog !== submittedLog) {
    return;
  }
  if (result.state === "verified") {
    elements.resultKicker.textContent =
      `${localKicker} · verified replay`;
    if (result.bestResult === "created") {
      elements.resultSummary.textContent =
        `${localSummary} Your first checked score joined today’s Verified Daily Board.`;
      elements.resultRank.textContent = `${localRank} · Verified`;
      announce("Daily escape verified. Your first entry joined the board.");
    } else if (result.bestResult === "improved") {
      elements.resultSummary.textContent =
        `${localSummary} Your checked score improved today’s Verified Daily best.`;
      elements.resultRank.textContent = `${localRank} · Verified`;
      announce("Daily escape verified. Your board best improved.");
    } else {
      elements.resultSummary.textContent =
        `${localSummary} Replay passed. Your existing Verified Daily best stays on the board.`;
      elements.resultRank.textContent = `${localRank} · Verified`;
      announce("Daily escape verified. Your existing board best remains.");
    }
    return;
  }
  elements.resultRank.textContent = localRank;
  if (result.state === "signed-out") {
    elements.resultKicker.textContent = `${localKicker} · sign in needed`;
    elements.resultSummary.textContent =
      `${localSummary} Sign in before a future escape can join the verified board.`;
    announce("Daily result remains local. Sign in for future verified entries.");
    return;
  }
  if (result.state === "profile-required") {
    elements.resultKicker.textContent = `${localKicker} · username needed`;
    elements.resultSummary.textContent =
      `${localSummary} Create a username before a future escape can join the verified board.`;
    announce("Daily result remains local. Create a username for future verified entries.");
    return;
  }
  if (result.state === "rejected") {
    elements.resultKicker.textContent = `${localKicker} · replay not verified`;
    elements.resultSummary.textContent =
      `${localSummary} This result did not pass the replay check. Local Daily play still works.`;
    announce("Daily replay was not verified. Your local result is unchanged.");
    return;
  }
  if (result.state === "network-failure") {
    elements.resultKicker.textContent = `${localKicker} · replay not sent`;
    elements.resultSummary.textContent =
      `${localSummary} The network could not reach the verified board. Your local Daily result is unchanged.`;
    announce("Network could not verify the Daily result. Local result unchanged.");
    return;
  }
  if (result.state === "unavailable") {
    elements.resultKicker.textContent =
      `${localKicker} · verification unavailable`;
    elements.resultSummary.textContent =
      `${localSummary} The verified board could not be reached. Your local Daily result is unchanged.`;
    announce("Verified Daily service unavailable. Local result unchanged.");
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

/** @param {unknown} error */
function errorStatus(error) {
  return error &&
    typeof error === "object" &&
    "status" in error &&
    typeof error.status === "number"
    ? error.status
    : 0;
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
 * @param {{ atlasRegionId?: string, revision?: string }} [rulesetIdentity]
 */
function createShareLink(
  seed = run.seed,
  levelId = currentLevel.id,
  labyrinthNumber = currentLabyrinthNumber,
  rulesetIdentity = run.ruleset
) {
  const ruleset = normalizeRunRuleset(rulesetIdentity, labyrinthNumber);
  if (!ruleset) {
    throw new Error("Run ruleset identity is invalid.");
  }
  const url = new URL("/play", window.location.origin);
  url.searchParams.set("seed", seed);
  url.searchParams.set("level", levelId);
  url.searchParams.set("labyrinth", String(labyrinthNumber));
  url.searchParams.set("region", ruleset.atlasRegionId);
  url.searchParams.set("rules", ruleset.revision);
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
  const ruleset = rulesetFromLocation(labyrinthNumber);
  const hasRegion = url.searchParams.has("region");
  const hasRules = url.searchParams.has("rules");
  return (
    !seed ||
    !/^[A-Z0-9]+(?:-[A-Z0-9]+)*$/.test(seed) ||
    !["bright-start", "trail-scout", "maze-master"].includes(levelId ?? "") ||
    !Number.isInteger(labyrinthNumber) ||
    labyrinthNumber < 1 ||
    labyrinthNumber > QUEST_LABYRINTH_COUNT ||
    hasRegion !== hasRules ||
    (hasRegion && ruleset === null)
  );
}

/** @param {number} labyrinthNumber */
function rulesetFromLocation(labyrinthNumber) {
  if (
    !Number.isInteger(labyrinthNumber) ||
    labyrinthNumber < 1 ||
    labyrinthNumber > QUEST_LABYRINTH_COUNT
  ) {
    return null;
  }
  const url = new URL(window.location.href);
  const atlasRegionId = url.searchParams.get("region");
  const revision = url.searchParams.get("rules");
  if (atlasRegionId === null && revision === null) {
    return getClassicRunRuleset(labyrinthNumber);
  }
  if (!atlasRegionId || !revision) {
    return null;
  }
  return normalizeRunRuleset(
    { atlasRegionId, revision },
    labyrinthNumber
  );
}

/**
 * @param {{ atlasRegionId?: string, rulesetRevision?: string }} locator
 */
function rulesetIdentityFromLocator(locator) {
  return locator.atlasRegionId === undefined &&
    locator.rulesetRevision === undefined
    ? undefined
    : {
        atlasRegionId: locator.atlasRegionId,
        revision: locator.rulesetRevision
      };
}

/**
 * @param {{ revision: string, label: string }} ruleset
 * @param {number} labyrinthNumber
 */
function formatRunRulesetLabel(ruleset, labyrinthNumber) {
  const region = getDifficultyBand(labyrinthNumber);
  return ruleset.revision === CLASSIC_RULESET_REVISION
    ? `Atlas Region: ${region.label} · Classic Rules`
    : `Atlas Region: ${region.label} · Trail Twist: ${ruleset.label}`;
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
      const watch = record.replay
        ? document.createElement("button")
        : null;

      const outcome = record.outcome === "escaped" ? "Escaped" : "Defeated";
      const level = getQuestLevel(record.questLevelId);
      const ruleset =
        normalizeRunRuleset(
          record.atlasRegionId || record.rulesetRevision
            ? {
                atlasRegionId: record.atlasRegionId,
                revision: record.rulesetRevision
              }
            : undefined,
          record.labyrinthNumber ?? 1
        ) ?? getClassicRunRuleset(record.labyrinthNumber ?? 1);
      title.textContent =
        `#${index + 1} ${outcome} / ${level.name} / ${formatTime(record.elapsedMs)}`;
      detail.textContent =
        `Labyrinth ${record.labyrinthNumber ?? 1} / ${formatRunRulesetLabel(ruleset, record.labyrinthNumber ?? 1)} / ${record.echoesCollected} / ${record.echoTotal ?? 3} Echoes / ${record.moves} moves / ${record.seed}`;
      replay.type = "button";
      replay.className = "control-button";
      replay.dataset.seed = record.seed;
      replay.dataset.level = record.questLevelId ?? "trail-scout";
      replay.dataset.labyrinth = String(record.labyrinthNumber ?? 1);
      replay.dataset.region = ruleset.atlasRegionId;
      replay.dataset.ruleset = ruleset.revision;
      replay.dataset.recordAction = "replay";
      replay.textContent = "Play This Seed";
      replay.setAttribute("aria-label", `Play seed ${record.seed}`);
      if (watch) {
        watch.type = "button";
        watch.className = "primary-button";
        watch.dataset.seed = record.seed;
        watch.dataset.recordAction = "watch";
        watch.dataset.recordIndex = String(index);
        watch.textContent = "Watch Trail";
        watch.setAttribute(
          "aria-label",
          `Watch retained Trail for seed ${record.seed}`
        );
      }
      copy.type = "button";
      copy.className = "control-button";
      copy.dataset.seed = record.seed;
      copy.dataset.level = record.questLevelId ?? "trail-scout";
      copy.dataset.labyrinth = String(record.labyrinthNumber ?? 1);
      copy.dataset.region = ruleset.atlasRegionId;
      copy.dataset.ruleset = ruleset.revision;
      copy.dataset.recordAction = "copy";
      copy.textContent = "Copy Share Link";
      copy.setAttribute("aria-label", `Copy share link for seed ${record.seed}`);
      summary.append(title, detail);
      actions.className = "run-records__actions";
      actions.append(copy);
      if (watch) {
        actions.append(watch);
      }
      actions.append(replay);
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
      (record.labyrinthNumber ?? 1) === currentLabyrinthNumber &&
      (record.atlasRegionId ?? run.ruleset.atlasRegionId) ===
        run.ruleset.atlasRegionId &&
      (record.rulesetRevision ?? "classic-v1") === run.ruleset.revision
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
