import "@fontsource-variable/bricolage-grotesque";
import "@fontsource-variable/geist";
import "@fontsource-variable/geist-mono";
import "./styles.css";

import { EchoAudio } from "./game/audio.js";
import { createCanvasRenderer } from "./game/canvas-renderer.js";
import { applyAction, createRun } from "./game/game-session.js";
import { loadBestRun, saveBestRun } from "./game/storage.js";

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
  seedCopy: requiredElement("seed-copy", HTMLButtonElement),
  seedValue: requiredElement("seed-value", HTMLElement),
  sound: requiredElement("sound-toggle", HTMLButtonElement),
  time: requiredElement("time-value", HTMLElement),
  vitalityCount: requiredElement("vitality-count", HTMLElement),
  vitalityMeter: requiredElement("vitality-meter", HTMLElement)
};

let run = createRun(seedFromLocation() ?? createSeed());
let bestRun = loadBestRun();
let lastTick = performance.now();
let eventTimer = 0;
/** @type {{ x: number, y: number } | null} */
let touchStart = null;

startRun(run.seed);
requestAnimationFrame(tick);

document.addEventListener("keydown", (event) => {
  if (elements.resultDialog.open || isNativeControl(event.target)) {
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
  elements.resultDialog.close();
  updateInterface();
  canvas.focus({ preventScroll: true });
  announce(`New maze ${seed}. Three Echoes remain.`);
  showEvent("The Labyrinth is listening.");
}

function restartRun() {
  run = applyAction(run, { type: "restart" });
  lastTick = performance.now();
  updateInterface();
  canvas.focus({ preventScroll: true });
  announce(`Maze ${run.seed} restarted.`);
  showEvent("Your footsteps fade. The maze remembers its shape.");
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
  run = applyAction(run, action);
  const eventType = run.event.type;

  if (eventType !== previous.event.type || run.moves !== previous.moves) {
    showEvent(run.event.message);
    announce(run.event.message);
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
  elements.fieldNote.textContent = run.event.message;
  renderPips(elements.echoMeter, run.echoes.length, collected, "echo-pip");
  renderPips(
    elements.vitalityMeter,
    run.explorer.maxVitality,
    run.explorer.vitality,
    "vitality-pip"
  );
  elements.best.textContent = bestRun
    ? `Best passage ${formatTime(bestRun.elapsedMs)} · ${bestRun.moves} moves · ${bestRun.seed}`
    : "No completed passage recorded.";
}

function finishRun() {
  const won = run.status === "won";
  if (won) {
    bestRun = saveBestRun({
      elapsedMs: run.elapsedMs,
      moves: run.moves,
      seed: run.seed
    });
  }
  elements.resultKicker.textContent = won ? "Passage complete" : "Final light lost";
  elements.resultTitle.textContent = won
    ? "You carried the Echoes out."
    : "The Wardens found you.";
  elements.resultSummary.textContent = won
    ? "The Gate knows your footsteps now. This exact maze can be crossed again with its seed."
    : "The map remains. Return with a new route, or ask the stone to shift.";
  elements.resultTime.textContent = formatTime(run.elapsedMs);
  elements.resultMoves.textContent = String(run.moves).padStart(3, "0");
  elements.resultSeed.textContent = run.seed;
  elements.resultRank.textContent = rankRun();
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

function rankRun() {
  if (run.explorer.vitality === run.explorer.maxVitality && run.moves <= 90) {
    return "Lightkeeper";
  }
  if (run.explorer.vitality > 1) {
    return "Wayfinder";
  }
  return "Survivor";
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
