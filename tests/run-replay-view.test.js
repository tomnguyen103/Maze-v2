// @vitest-environment happy-dom

import { beforeEach, describe, expect, it, vi } from "vitest";
import { createRunReplayView } from "../src/game/run-replay-view.js";

const TIMELINE = {
  states: [
    { status: "active", moves: 0 },
    { status: "active", moves: 1 },
    { status: "won", moves: 2 }
  ],
  events: [
    { index: 0, type: "start", label: "Trail begins.", elapsedMs: 0 },
    { index: 1, type: "move", label: "Moved right.", elapsedMs: 100 },
    { index: 2, type: "escaped", label: "Escaped.", elapsedMs: 200 }
  ],
  terminal: {
    outcome: "escaped",
    moves: 2,
    elapsedMs: 200,
    echoesCollected: 1,
    echoTotal: 1,
    wardensDefeated: 0,
    score: 550,
    vitality: 3
  },
  actionCount: 2
};

describe("Run Replay view", () => {
  beforeEach(() => {
    document.body.innerHTML = '<button id="trigger">Watch Trail</button>';
    vi.stubGlobal(
      "requestAnimationFrame",
      (/** @type {FrameRequestCallback} */ callback) => callback(0)
    );
    vi.stubGlobal("matchMedia", () => ({
      matches: false,
      addEventListener: () => {},
      removeEventListener: () => {}
    }));
  });

  it("steps, scrubs, restarts, and restores focus from one local timeline", () => {
    const render = vi.fn();
    const view = createRunReplayView({
      buildTimeline: () => TIMELINE,
      rendererFactory: () => ({ render, resize: vi.fn() })
    });
    const trigger = /** @type {HTMLButtonElement} */ (
      document.getElementById("trigger")
    );

    view.show({ seed: "TRAIL-1" }, trigger);

    const dialog = document.querySelector("[data-run-replay-dialog]");
    expect(dialog?.getAttribute("aria-label")).toBe("Watch Trail");
    expect(document.querySelector("[data-run-replay-event-list]")?.children)
      .toHaveLength(3);
    expect(render).toHaveBeenLastCalledWith(TIMELINE.states[0]);

    document.querySelector("[data-run-replay-step='next']")?.dispatchEvent(
      new MouseEvent("click", { bubbles: true })
    );
    expect(render).toHaveBeenLastCalledWith(TIMELINE.states[1]);
    expect(document.querySelector("[data-run-replay-status]")?.textContent)
      .toContain("Step 1 of 2");

    const scrub = /** @type {HTMLInputElement} */ (
      document.querySelector("[data-run-replay-scrub]")
    );
    scrub.value = "2";
    scrub.dispatchEvent(new Event("input", { bubbles: true }));
    expect(render).toHaveBeenLastCalledWith(TIMELINE.states[2]);
    expect(document.querySelector("[data-run-replay-step='next']"))
      .toHaveProperty("disabled", true);

    document.querySelector("[data-run-replay-restart]")?.dispatchEvent(
      new MouseEvent("click", { bubbles: true })
    );
    expect(render).toHaveBeenLastCalledWith(TIMELINE.states[0]);

    document.querySelector("[data-run-replay-close]")?.dispatchEvent(
      new MouseEvent("click", { bubbles: true })
    );
    expect(trigger).toBe(document.activeElement);
  });

  it("plays with pause semantics and uses single steps under Reduced Motion", () => {
    vi.useFakeTimers();
    const render = vi.fn();
    const view = createRunReplayView({
      buildTimeline: () => TIMELINE,
      rendererFactory: () => ({ render, resize: vi.fn() })
    });
    const trigger = /** @type {HTMLButtonElement} */ (
      document.getElementById("trigger")
    );
    view.show({ seed: "TRAIL-2" }, trigger);

    const play = /** @type {HTMLButtonElement} */ (
      document.querySelector("[data-run-replay-play]")
    );
    play.click();
    expect(play.textContent).toBe("Pause");
    vi.advanceTimersByTime(500);
    expect(render).toHaveBeenLastCalledWith(TIMELINE.states[1]);
    play.click();
    expect(play.textContent).toBe("Play");

    view.close();
    vi.stubGlobal("matchMedia", () => ({
      matches: true,
      addEventListener: () => {},
      removeEventListener: () => {}
    }));
    view.show({ seed: "TRAIL-2" }, trigger);
    play.click();
    expect(render).toHaveBeenLastCalledWith(TIMELINE.states[1]);
    expect(play.textContent).toBe("Play");
    vi.useRealTimers();
  });

  it("supports keyboard steps without stealing native control keys", () => {
    const render = vi.fn();
    const view = createRunReplayView({
      buildTimeline: () => TIMELINE,
      rendererFactory: () => ({ render, resize: vi.fn() })
    });
    const trigger = /** @type {HTMLButtonElement} */ (
      document.getElementById("trigger")
    );
    view.show({ seed: "TRAIL-3" }, trigger);
    const dialog = /** @type {HTMLDialogElement} */ (
      document.querySelector("[data-run-replay-dialog]")
    );

    dialog.dispatchEvent(new KeyboardEvent("keydown", {
      key: "ArrowRight",
      bubbles: true
    }));
    expect(render).toHaveBeenLastCalledWith(TIMELINE.states[1]);
    dialog.dispatchEvent(new KeyboardEvent("keydown", {
      key: "End",
      bubbles: true
    }));
    expect(render).toHaveBeenLastCalledWith(TIMELINE.states[2]);
  });
});
