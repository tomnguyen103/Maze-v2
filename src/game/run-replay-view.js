import "./run-replay.css";
import { createCanvasRenderer } from "./canvas-renderer.js";
import { buildRunReplayTimeline } from "./run-replay.js";

/**
 * @param {{
 *   buildTimeline?: (record: Record<string, unknown>) => {
 *     states: unknown[],
 *     events: { index: number, type: string, label: string, elapsedMs: number }[],
 *     terminal: Record<string, unknown>,
 *     actionCount: number
 *   },
 *   rendererFactory?: (canvas: HTMLCanvasElement) => {
 *     render: (state: any) => void,
 *     resize: () => void
 *   },
 *   onClose?: () => void
 * }} [options]
 */
export function createRunReplayView({
  buildTimeline = buildRunReplayTimeline,
  rendererFactory = createCanvasRenderer,
  onClose = () => {}
} = {}) {
  const elements = createElements();
  const renderer = rendererFactory(elements.canvas);
  /** @type {{
   *   states: any[],
   *   events: { index: number, type: string, label: string, elapsedMs: number }[],
   *   terminal: Record<string, unknown>,
   *   actionCount: number
   * } | null} */
  let timeline = null;
  /** @type {HTMLElement | null} */
  let returnFocus = null;
  let index = 0;
  let timer = 0;

  elements.close.addEventListener("click", close);
  elements.restart.addEventListener("click", () => showIndex(0));
  elements.previous.addEventListener("click", () => showIndex(index - 1));
  elements.next.addEventListener("click", () => showIndex(index + 1));
  elements.play.addEventListener("click", togglePlayback);
  elements.scrub.addEventListener("input", () => {
    stopPlayback();
    showIndex(Number(elements.scrub.value));
  });
  elements.dialog.addEventListener("cancel", (event) => {
    event.preventDefault();
    close();
  });
  elements.dialog.addEventListener("close", () => {
    stopPlayback();
    onClose();
    const target = returnFocus;
    returnFocus = null;
    target?.focus();
  });
  elements.dialog.addEventListener("keydown", (event) => {
    if (isNativeControl(event.target)) {
      return;
    }
    const nextIndex = {
      ArrowLeft: index - 1,
      ArrowRight: index + 1,
      Home: 0,
      End: timeline?.actionCount ?? 0
    }[event.key];
    if (nextIndex === undefined) {
      return;
    }
    event.preventDefault();
    stopPlayback();
    showIndex(nextIndex);
  });
  window.addEventListener("resize", () => {
    if (elements.dialog.open && timeline) {
      renderer.resize();
      renderer.render(timeline.states[index]);
    }
  });

  return {
    /**
     * @param {Parameters<typeof buildTimeline>[0]} record
     * @param {HTMLElement} trigger
     */
    show(record, trigger) {
      stopPlayback();
      const nextTimeline = buildTimeline(record);
      timeline = nextTimeline;
      returnFocus = trigger;
      index = 0;
      renderEventList();
      elements.scrub.max = String(nextTimeline.actionCount);
      elements.scrub.setAttribute(
        "aria-valuemax",
        String(nextTimeline.actionCount)
      );
      showIndex(0);
      if (!elements.dialog.open) {
        elements.dialog.showModal();
      }
      requestAnimationFrame(() => {
        elements.title.focus({ preventScroll: true });
        renderer.resize();
        if (timeline) {
          renderer.render(timeline.states[index]);
        }
      });
    },
    close
  };

  function close() {
    if (elements.dialog.open) {
      elements.dialog.close();
    }
  }

  function togglePlayback() {
    if (!timeline || index >= timeline.actionCount) {
      showIndex(0);
    }
    if (prefersReducedMotion()) {
      showIndex(index + 1);
      return;
    }
    if (timer) {
      stopPlayback();
      return;
    }
    elements.play.textContent = "Pause";
    elements.play.setAttribute("aria-pressed", "true");
    timer = window.setInterval(() => {
      if (!timeline || index >= timeline.actionCount) {
        stopPlayback();
        return;
      }
      showIndex(index + 1);
      if (index >= timeline.actionCount) {
        stopPlayback();
      }
    }, 500);
  }

  function stopPlayback() {
    if (timer) {
      window.clearInterval(timer);
      timer = 0;
    }
    elements.play.textContent = "Play";
    elements.play.setAttribute("aria-pressed", "false");
  }

  /** @param {number} requestedIndex */
  function showIndex(requestedIndex) {
    if (!timeline) {
      return;
    }
    index = Math.max(0, Math.min(timeline.actionCount, requestedIndex));
    const state = timeline.states[index];
    const event = timeline.events[index];
    renderer.resize();
    renderer.render(state);
    elements.scrub.value = String(index);
    elements.scrub.setAttribute("aria-valuenow", String(index));
    elements.status.textContent =
      `Step ${index} of ${timeline.actionCount}. ${event.label}`;
    elements.previous.disabled = index === 0;
    elements.next.disabled = index === timeline.actionCount;
    elements.restart.disabled = index === 0;
    for (const [eventIndex, item] of [
      ...elements.eventList.querySelectorAll("li")
    ].entries()) {
      if (eventIndex === index) {
        item.setAttribute("aria-current", "step");
      } else {
        item.removeAttribute("aria-current");
      }
    }
  }

  function renderEventList() {
    if (!timeline) {
      return;
    }
    elements.eventList.replaceChildren(
      ...timeline.events.map((event) => {
        const item = document.createElement("li");
        const step = document.createElement("strong");
        const label = document.createElement("span");
        step.textContent = String(event.index);
        label.textContent = event.label;
        item.dataset.runReplayEvent = String(event.index);
        item.append(step, label);
        return item;
      })
    );
  }
}

function createElements() {
  const dialog = document.createElement("dialog");
  dialog.className = "run-replay-dialog";
  dialog.dataset.runReplayDialog = "";
  dialog.setAttribute("aria-label", "Watch Trail");

  const heading = document.createElement("div");
  heading.className = "dialog-heading";
  const headingCopy = document.createElement("div");
  const kicker = document.createElement("span");
  kicker.className = "section-label";
  kicker.textContent = "Device-local Run Replay";
  const title = document.createElement("h2");
  title.tabIndex = -1;
  title.textContent = "Watch Trail";
  const close = controlButton("Close");
  close.dataset.runReplayClose = "";
  headingCopy.append(kicker, title);
  heading.append(headingCopy, close);

  const intro = document.createElement("p");
  intro.className = "dialog-intro";
  intro.textContent =
    "Outcome-only playback. It contains no selected answers or Question text.";
  const layout = document.createElement("div");
  layout.className = "run-replay-layout";
  const stage = document.createElement("section");
  stage.className = "run-replay-stage";
  stage.setAttribute("aria-label", "Trail playback");
  const canvas = document.createElement("canvas");
  canvas.className = "run-replay-canvas";
  canvas.setAttribute(
    "aria-label",
    "Reconstructed maze state for the selected Trail step."
  );
  canvas.textContent = "Run Replay maze state.";
  const status = document.createElement("p");
  status.className = "run-replay-status";
  status.dataset.runReplayStatus = "";
  status.setAttribute("aria-live", "polite");
  const controls = document.createElement("div");
  controls.className = "run-replay-controls";
  controls.setAttribute("role", "toolbar");
  controls.setAttribute("aria-label", "Run Replay controls");
  const previous = controlButton("Previous step");
  previous.dataset.runReplayStep = "previous";
  const play = controlButton("Play");
  play.dataset.runReplayPlay = "";
  play.setAttribute("aria-pressed", "false");
  const next = controlButton("Next step");
  next.dataset.runReplayStep = "next";
  const restart = controlButton("Restart");
  restart.dataset.runReplayRestart = "";
  const scrubLabel = document.createElement("label");
  scrubLabel.textContent = "Trail position";
  const scrub = document.createElement("input");
  scrub.type = "range";
  scrub.min = "0";
  scrub.value = "0";
  scrub.step = "1";
  scrub.dataset.runReplayScrub = "";
  scrubLabel.append(scrub);
  controls.append(previous, play, next, restart, scrubLabel);
  stage.append(canvas, status, controls);

  const events = document.createElement("aside");
  events.className = "run-replay-events";
  const eventsTitle = document.createElement("h3");
  eventsTitle.textContent = "Trail events";
  const eventList = document.createElement("ol");
  eventList.dataset.runReplayEventList = "";
  events.append(eventsTitle, eventList);
  layout.append(stage, events);
  dialog.append(heading, intro, layout);
  document.body.append(dialog);
  return {
    dialog,
    title,
    close,
    canvas,
    status,
    previous,
    play,
    next,
    restart,
    scrub,
    eventList
  };
}

/** @param {string} label */
function controlButton(label) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "control-button";
  button.textContent = label;
  return button;
}

function prefersReducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** @param {EventTarget | null} target */
function isNativeControl(target) {
  return target instanceof HTMLButtonElement ||
    target instanceof HTMLInputElement;
}
