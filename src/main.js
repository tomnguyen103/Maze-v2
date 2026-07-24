import "@fontsource-variable/bricolage-grotesque";
import "@fontsource-variable/geist";
import "@fontsource-variable/geist-mono";
import "./daylight.css";

import { EchoAudio } from "./game/audio.js";
import { createCanvasRenderer } from "./game/canvas-renderer.js";
import { applyAction, createRun } from "./game/game-session.js";
import { loadRunRecords, saveRunRecord } from "./game/storage.js";
import { getBundledQuestion } from "./questions/question-bank.js";
import { getQuestLevel } from "./questions/quest-levels.js";

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
  seedCopy: requiredElement("seed-copy", HTMLButtonElement),
  seedValue: requiredElement("seed-value", HTMLElement),
  sound: requiredElement("sound-toggle", HTMLButtonElement),
  storyLog: requiredElement("story-log", HTMLOListElement),
  time: requiredElement("time-value", HTMLElement),
  vitalityCount: requiredElement("vitality-count", HTMLElement),
  vitalityMeter: requiredElement("vitality-meter", HTMLElement),
  wardenReadout: requiredElement("warden-readout", HTMLElement),
  wardenState: requiredElement("warden-state", HTMLElement)
};

const locationSeed = seedFromLocation();
let currentLevel = getQuestLevel(levelFromLocation());
let run = createRun(locationSeed ?? createSeed(), currentLevel.config);
let runRecords = loadRunRecords();
let bestEscapeRecord = bestEscape(runRecords);
let lastTick = performance.now();
let eventTimer = 0;
let resumeAfterRecords = false;
let questionRequestKey = "";
let mustChooseLevel = locationSeed === null;
/** @type {{ message: string, kind: string }[]} */
let storyEntries = [];
/** @type {{ x: number, y: number } | null} */
let touchStart = null;

startRun(run.seed, currentLevel.id);
if (mustChooseLevel) {
  elements.levelDialog.showModal();
}
requestAnimationFrame(tick);

document.addEventListener("keydown", (event) => {
  if (
    elements.resultDialog.open ||
    elements.recordsDialog.open ||
    elements.levelDialog.open ||
    elements.challengeDialog.open ||
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
elements.levelCards.addEventListener("click", (event) => {
  const button =
    event.target instanceof Element
      ? event.target.closest("button[data-level]")
      : null;
  if (!(button instanceof HTMLButtonElement) || !button.dataset.level) {
    return;
  }

  mustChooseLevel = false;
  elements.levelDialog.close();
  startFreshRun(button.dataset.level);
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
    startRun(
      button.dataset.seed,
      button.dataset.level ?? "trail-scout"
    );
    return;
  }

  if (button.dataset.recordAction === "copy") {
    try {
      await navigator.clipboard.writeText(button.dataset.seed);
      button.textContent = "Copied";
      announce(`Seed ${button.dataset.seed} copied.`);
      window.setTimeout(() => {
        if (button.isConnected) {
          button.textContent = "Copy";
        }
      }, 1400);
    } catch {
      announce(`Copy failed. Seed ${button.dataset.seed}.`);
    }
  }
});
elements.freshRun.addEventListener("click", () => {
  elements.resultDialog.close();
  openLevelPicker();
});
elements.replay.addEventListener("click", () => {
  elements.resultDialog.close();
  restartRun();
});
elements.sound.addEventListener("click", async () => {
  const enabled = await audio.toggle();
  elements.sound.textContent = enabled ? "Sound on" : "Sound off";
  elements.sound.setAttribute("aria-pressed", String(enabled));
});
elements.seedCopy.addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(run.seed);
    announce("Seed copied.");
    showEvent("Seed copied. Send it to another Explorer.");
  } catch {
    announce(`Current seed ${run.seed}`);
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

/** @param {string} seed @param {string} [levelId] */
function startRun(seed, levelId = currentLevel.id) {
  currentLevel = getQuestLevel(levelId);
  run = createRun(seed, currentLevel.config);
  const url = new URL(window.location.href);
  url.searchParams.set("seed", run.seed);
  url.searchParams.set("level", currentLevel.id);
  window.history.replaceState({}, "", url);
  lastTick = performance.now();
  questionRequestKey = "";
  storyEntries = [];
  addStory(`The ${currentLevel.name} quest begins. Recover every Echo.`, "start");
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
    `New ${currentLevel.name} maze ${seed}. ${run.echoes.length} Echoes remain.`
  );
  showEvent(`${currentLevel.name} ready. Find the Echoes.`);
}

function restartRun() {
  run = applyAction(run, { type: "restart" });
  questionRequestKey = "";
  lastTick = performance.now();
  updateInterface();
  canvas.focus({ preventScroll: true });
  announce(`Maze ${run.seed} restarted.`);
  showEvent("Seed reset. Same maze, fresh timer.");
}

/** @param {string} [levelId] */
function startFreshRun(levelId = currentLevel.id) {
  const level = getQuestLevel(levelId);
  const currentFingerprint = labyrinthFingerprint(run);
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const seed = createSeed();
    if (seed === run.seed) {
      continue;
    }
    const candidate = createRun(seed, level.config);
    if (labyrinthFingerprint(candidate) !== currentFingerprint) {
      startRun(seed, level.id);
      return;
    }
  }

  const firstFallback = createRun("EMBER-17", level.config);
  const fallbackSeed =
    labyrinthFingerprint(firstFallback) !== currentFingerprint
      ? firstFallback.seed
      : "EMBER-18";
  startRun(fallbackSeed, level.id);
}

function openLevelPicker() {
  mustChooseLevel = false;
  if (elements.recordsDialog.open) {
    elements.recordsDialog.close();
  }
  if (!elements.levelDialog.open) {
    elements.levelDialog.showModal();
  }
}

/** @param {Direction | undefined} direction */
function move(direction) {
  if (!direction || run.status !== "active") {
    return;
  }
  transition({ type: "move", direction });
}

function usePulse() {
  if (run.status !== "active") {
    return;
  }
  transition({ type: "pulse" });
}

function togglePause() {
  if (run.status !== "active" && run.status !== "paused") {
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
  if (eventType === "wrong-answer" || eventType === "defeated") {
    elements.canvasFrame.classList.remove("is-hurt");
    void elements.canvasFrame.offsetWidth;
    elements.canvasFrame.classList.add("is-hurt");
  }

  updateInterface();
  syncChallengeDialog();
  if (run.status === "won" || run.status === "lost") {
    finishRun();
  }
}

function syncChallengeDialog() {
  if (run.status !== "challenge" || !run.challenge) {
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
  elements.challengeFeedback.textContent = feedback
    ? `${feedback.message} ${feedback.explanation}`
    : "Think carefully. Your timer is paused.";

  if (!question) {
    elements.challengeQuestion.textContent = feedback
      ? "The Warden draws a new question…"
      : "Preparing your question…";
    elements.challengeChoices.replaceChildren();
    elements.challengeSource.textContent = "Opening the question scroll…";
    void loadChallengeQuestion();
    return;
  }

  elements.challengeQuestion.textContent = question.prompt;
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

async function loadChallengeQuestion() {
  if (run.status !== "challenge" || !run.challenge) {
    return;
  }
  const request = {
    levelId: currentLevel.id,
    seed: run.seed,
    wardenId: run.challenge.wardenId,
    attempt: run.challenge.attempt
  };
  const key = `${request.levelId}:${request.seed}:${request.wardenId}:${request.attempt}`;
  if (questionRequestKey === key) {
    return;
  }
  questionRequestKey = key;

  let question;
  let source = "bundled";
  try {
    const parameters = new URLSearchParams({
      level: request.levelId,
      seed: request.seed,
      warden: String(request.wardenId),
      attempt: String(request.attempt)
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

  if (
    run.status !== "challenge" ||
    !run.challenge ||
    key !==
      `${currentLevel.id}:${run.seed}:${run.challenge.wardenId}:${run.challenge.attempt}`
  ) {
    return;
  }

  elements.challengeSource.textContent = {
    ollama: "A fresh local question is ready.",
    gemini: "A fresh quest question is ready.",
    bundled: "A trusty question card is ready."
  }[source] ?? "Your question is ready.";
  transition({ type: "provide-question", question });
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
    typeof question.explanation === "string" &&
    Array.isArray(question.choices) &&
    question.choices.length === 3
  );
}

function updateInterface() {
  renderer.render(run);
  const collected = run.echoes.filter((echo) => echo.collected).length;
  elements.questLevelName.textContent = currentLevel.name;
  elements.questHeadline.textContent =
    `Find ${run.echoes.length} Echoes. Outsmart ${run.config.wardenCount} ${run.config.wardenCount === 1 ? "Warden" : "Wardens"}.`;
  elements.seedValue.textContent = run.seed;
  elements.time.textContent = formatTime(run.elapsedMs);
  elements.moves.textContent = String(run.moves).padStart(3, "0");
  elements.echoCount.textContent = `${collected} / ${run.echoes.length}`;
  elements.vitalityCount.textContent =
    `${run.explorer.vitality} / ${run.explorer.maxVitality}`;
  elements.pulseCount.textContent = String(run.pulses);
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
  const won = run.status === "won";
  const echoesCollected = run.echoes.filter((echo) => echo.collected).length;
  runRecords = saveRunRecord({
    elapsedMs: run.elapsedMs,
    moves: run.moves,
    seed: run.seed,
    outcome: won ? "escaped" : "defeated",
    echoesCollected,
    echoTotal: run.echoes.length,
    questLevelId: currentLevel.id
  });
  bestEscapeRecord = bestEscape(runRecords);
  elements.resultKicker.textContent = won ? "Run complete" : "Run ended";
  elements.resultTitle.textContent = won
    ? "You brought the Echoes home."
    : "The maze light needs a rest.";
  elements.resultSummary.textContent = won
    ? "Saved to your local Run Records. Replay the seed to improve your route."
    : `You found ${echoesCollected} of ${run.echoes.length} Echoes. Every brave try teaches a new path.`;
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
  if (run.status === "active") {
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

function seedFromLocation() {
  return new URL(window.location.href).searchParams.get("seed");
}

function levelFromLocation() {
  return new URL(window.location.href).searchParams.get("level") ?? "trail-scout";
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
        `${record.echoesCollected} / ${record.echoTotal ?? 3} Echoes / ${record.moves} moves / ${record.seed}`;
      replay.type = "button";
      replay.className = "control-button";
      replay.dataset.seed = record.seed;
      replay.dataset.level = record.questLevelId ?? "trail-scout";
      replay.dataset.recordAction = "replay";
      replay.textContent = "Replay";
      replay.setAttribute("aria-label", `Replay seed ${record.seed}`);
      copy.type = "button";
      copy.className = "control-button";
      copy.dataset.seed = record.seed;
      copy.dataset.recordAction = "copy";
      copy.textContent = "Copy";
      copy.setAttribute("aria-label", `Copy seed ${record.seed}`);
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
      (record.questLevelId ?? "trail-scout") === currentLevel.id
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
