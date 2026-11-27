// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { announceInto } from "../src/game/live-announcer.js";

describe("Live announcer (B-52)", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("moves into the open modal dialog and returns to its first place after the close", () => {
    document.body.innerHTML = `
      <dialog id="challenge"><button id="answer">A</button></dialog>
      <main id="game-root"><p id="live" aria-live="polite"></p><p id="after"></p></main>`;
    const region = /** @type {HTMLElement} */ (document.getElementById("live"));
    const root = document.getElementById("game-root");
    const dialog = /** @type {HTMLDialogElement} */ (
      document.getElementById("challenge")
    );
    /** @type {FrameRequestCallback[]} */
    const frames = [];
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      frames.push(callback);
      return frames.length;
    });

    // Production order: a Move starts a Challenge, the announcement runs,
    // then showModal() opens the dialog in the same task.
    announceInto(region, "A Warden blocks the path.");
    dialog.showModal();
    frames.shift()?.(0);
    // The move waits one frame; the text waits one more.
    expect(region.parentElement).toBe(dialog);
    expect(region.textContent).toBe("");
    frames.shift()?.(0);
    expect(region.textContent).toBe("A Warden blocks the path.");

    // Production order: a correct answer is announced, then the dialog closes.
    announceInto(region, "Correct answer.");
    dialog.close();
    frames.shift()?.(0);
    expect(region.parentElement).toBe(root);
    expect(region.nextElementSibling?.id).toBe("after");
    frames.shift()?.(0);
    expect(region.textContent).toBe("Correct answer.");
  });

  it("prefers the open dialog that holds focus", () => {
    document.body.innerHTML = `
      <dialog id="upper"><button id="focus-me">B</button></dialog>
      <dialog id="lower"></dialog>
      <p id="live" aria-live="polite"></p>`;
    const region = /** @type {HTMLElement} */ (document.getElementById("live"));
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      callback(0);
      return 0;
    });
    const upper = /** @type {HTMLDialogElement} */ (document.getElementById("upper"));
    const lower = /** @type {HTMLDialogElement} */ (document.getElementById("lower"));
    lower.show();
    upper.show();
    document.getElementById("focus-me")?.focus();
    announceInto(region, "Hello.");
    expect(region.parentElement).toBe(upper);
  });

  it("drops an older message when a newer call starts between its frames", () => {
    document.body.innerHTML = `<p id="live" aria-live="polite"></p>`;
    const region = /** @type {HTMLElement} */ (document.getElementById("live"));
    /** @type {FrameRequestCallback[]} */
    const frames = [];
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      frames.push(callback);
      return frames.length;
    });

    announceInto(region, "Old.");
    frames.shift()?.(0);
    announceInto(region, "New.");
    // Run the queued frames first in, first out. The old text must never appear.
    while (frames.length > 0) {
      frames.shift()?.(0);
      expect(region.textContent).not.toBe("Old.");
    }
    expect(region.textContent).toBe("New.");
  });

  it("uses a timer when the tab is hidden", () => {
    vi.useFakeTimers();
    vi.spyOn(document, "hidden", "get").mockReturnValue(true);
    const frame = vi.spyOn(window, "requestAnimationFrame");
    document.body.innerHTML = `<p id="live" aria-live="polite"></p>`;
    const region = /** @type {HTMLElement} */ (document.getElementById("live"));

    announceInto(region, "Hidden.");
    vi.runAllTimers();
    expect(region.textContent).toBe("Hidden.");
    expect(frame).not.toHaveBeenCalled();
  });
});
