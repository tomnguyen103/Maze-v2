import "@fontsource-variable/bricolage-grotesque";
import "@fontsource-variable/geist";
import "@fontsource-variable/geist-mono";
import "./daylight.css";

import { EchoAudio } from "./game/audio.js";
import { createCanvasRenderer } from "./game/canvas-renderer.js";
import { applyAction, createRun } from "./game/game-session.js";
import { loadRunRecords, saveRunRecord } from "./game/storage.js";

/** @typedef {"up" | "right" | "down" | "left"} Direction */
/** @typedef {"move" | "blocked" | "echo" | "pulse" | "hurt" | "won" | "lost" | "enabled"} AudioCue */

const canvas = requiredElement("maze-canvas", HTMLCanvasElement);
const renderer = createCanvasRenderer(canvas);
const audio = new EchoAudio();

const elements = {
  best: requiredElement("best-run", HTMLElement),
  canvasFrame: requiredElement("canvas-frame", HTMLElement),
  echoCount: requiredElement("echo-count", HTMLElement),
  echoMeter: requiredElement("echo-meter", HTMLElement),
  eventRibbon: requiredElement("event-ribbon", HTMLElement),
  fieldNote: requiredElement("field-note", HTMLElement),
  freshRun: requiredElement("fresh-run", HTMLButtonElement),
  liveRegion: requiredElement("live-region", HTMLElement),
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
  seedCopy: requiredElement("seed-copy", HTMLButtonElement),
  seedValue: requiredElement("seed-value", HTMLElement),
  sound: requiredElement("sound-toggle", HTMLButtonElement),
  time: requiredElement("time-value", HTMLElement),
  vitalityCount: requiredElement("vitality-count", HTMLElement),
  vitalityMeter: requiredElement("vitality-meter", HTMLElement),
  wardenReadout: requiredElement("warden-readout", HTMLElement),
  wardenState: requiredElement("warden-state", HTMLElement)
};

let run = createRun(seedFromLocation() ?? createSeed());
let runRecords = loadRunRecords();
let bestRun = runRecords[0] ?? null;
let lastTick = performance.now();
let eventTimer = 0;
let resumeAfterRecords = false;
/** @type {{ x: number, y: number } | null} */
let touchStart = null;

startRun(run.seed);
requestAnimationFrame(tick);

document.addEventListener("keydown", (event) => {
  if (
    elements.resultDialog.open ||
    elements.recordsDialog.open ||
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
elements.newRun.addEventListener("click", () => startRun(createSeed()));
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
    startRun(button.dataset.seed);
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
  startRun(createSeed());
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

/** @param {string} seed */
function startRun(seed) {
  run = createRun(seed);
  const url = new URL(window.location.href);
  url.searchParams.set("seed", run.seed);
  window.history.replaceState({}, "", url);
  lastTick = performance.now();
  if (elements.resultDialog.open) {
    elements.resultDialog.close();
  }
  if (elements.recordsDialog.open) {
    elements.recordsDialog.close();
  }
  updateInterface();
  canvas.focus({ preventScroll: true });
  announce(`New maze ${seed}. Three Echoes remain.`);
  showEvent("Run ready.");
}

function restartRun() {
  run = applyAction(run, { type: "restart" });
  lastTick = performance.now();
  updateInterface();
  canvas.focus({ preventScroll: true });
  announce(`Maze ${run.seed} restarted.`);
  showEvent("Seed reset. Same maze, fresh timer.");
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
  if (run.status === "won" || run.status === "lost") {
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
  }
  if (eventChanged || wardenMode !== previousWardenMode) {
    const modeAnnouncement =
      wardenMode !== previousWardenMode
        ? ` Warden mode: ${wardenModeLabel(wardenMode)}.`
        : "";
    announce(`${eventChanged ? run.event.message : ""}${modeAnnouncement}`.trim());
  }
  playEventSound(eventType);
  if (eventType === "hurt" || eventType === "defeated") {
    elements.canvasFrame.classList.remove("is-hurt");
    void elements.canvasFrame.offsetWidth;
    elements.canvasFrame.classList.add("is-hurt");
  }

  updateInterface();
  if (run.status === "won" || run.status === "lost") {
    finishRun();
  }
}

function updateInterface() {
  renderer.render(run);
  const collected = run.echoes.filter((echo) => echo.collected).length;
  elements.seedValue.textContent = run.seed;
  elements.time.textContent = formatTime(run.elapsedMs);
  elements.moves.textContent = String(run.moves).padStart(3, "0");
  elements.echoCount.textContent = `${collected} / ${run.echoes.length}`;
  elements.vitalityCount.textContent =
    `${run.explorer.vitality} / ${run.explorer.maxVitality}`;
  elements.pulseCount.textContent = String(run.pulses);
  elements.pulse.disabled = run.pulses === 0 || run.status !== "active";
  elements.pause.textContent = run.status === "paused" ? "Resume" : "Pause";
  elements.pause.setAttribute("aria-pressed", String(run.status === "paused"));
  elements.runState.textContent = {
    active: run.gate.open ? "Gate open" : "Exploring",
    paused: "Paused",
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
  elements.best.textContent = bestRun
    ? `Best ${formatTime(bestRun.elapsedMs)} / ${bestRun.moves} moves / ${bestRun.seed}`
    : "No completed run yet. First escape sets the pace.";
}

function finishRun() {
  const won = run.status === "won";
  if (won) {
    runRecords = saveRunRecord({
      elapsedMs: run.elapsedMs,
      moves: run.moves,
      seed: run.seed
    });
    bestRun = runRecords[0] ?? null;
  }
  elements.resultKicker.textContent = won ? "Run complete" : "Run ended";
  elements.resultTitle.textContent = won
    ? "Gate reached."
    : "Warden contact ended the run.";
  elements.resultSummary.textContent = won
    ? "Saved to your local Run Records. Replay the seed to improve your route."
    : "Retry this seed to learn the route, or start a new maze.";
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
    hurt: "hurt",
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

function seedFromLocation() {
  return new URL(window.location.href).searchParams.get("seed");
}

/** @param {typeof run} [gameRun] */
function summarizeWardenMode(gameRun = run) {
  if (gameRun.wardens.some((warden) => warden.mode === "intercept")) {
    return "intercept";
  }
  if (gameRun.wardens.some((warden) => warden.mode === "hunt")) {
    return "hunt";
  }
  return "patrol";
}

/** @param {"patrol" | "hunt" | "intercept"} mode */
function wardenModeLabel(mode) {
  return {
    intercept: "Intercept active",
    hunt: "Hunt active",
    patrol: "Patrol"
  }[mode];
}

function renderRunRecords() {
  if (runRecords.length === 0) {
    const empty = document.createElement("li");
    empty.className = "run-records__empty";
    empty.textContent = "No escapes recorded yet.";
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

      title.textContent = `#${index + 1} ${formatTime(record.elapsedMs)}`;
      detail.textContent = `${record.moves} moves / ${record.seed}`;
      replay.type = "button";
      replay.className = "control-button";
      replay.dataset.seed = record.seed;
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
  if (run.status !== "won") {
    return "Not recorded";
  }

  const index = runRecords.findIndex((record) => record.seed === run.seed);
  if (index === -1) {
    return "Outside top 5";
  }

  const record = runRecords[index];
  return record.elapsedMs === run.elapsedMs && record.moves === run.moves
    ? `Personal #${index + 1}`
    : "Seed best kept";
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
