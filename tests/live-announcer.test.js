// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { announceInto } from "../src/game/live-announcer.js";

describe("Live announcer (B-52)", () => {
  afterEach(() => {
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

    dialog.showModal();
    announceInto(region, "Wrong answer.");
    // The move happens at once; the text waits one frame.
    expect(region.parentElement).toBe(dialog);
    expect(region.textContent).toBe("");
    frames.shift()?.(0);
    expect(region.textContent).toBe("Wrong answer.");

    dialog.close();
    announceInto(region, "Back on the board.");
    expect(region.parentElement).toBe(root);
    expect(region.nextElementSibling?.id).toBe("after");
    frames.shift()?.(0);
    expect(region.textContent).toBe("Back on the board.");
  });

  it("prefers the open dialog that holds focus", () => {
    document.body.innerHTML = `
      <dialog id="upper"><button id="focus-me">B</button></dialog>
      <dialog id="lower"></dialog>
      <p id="live" aria-live="polite"></p>`;
    const region = /** @type {HTMLElement} */ (document.getElementById("live"));
    vi.spyOn(window, "requestAnimationFrame").mockImplementation(() => 0);
    const upper = /** @type {HTMLDialogElement} */ (document.getElementById("upper"));
    const lower = /** @type {HTMLDialogElement} */ (document.getElementById("lower"));
    lower.show();
    upper.show();
    document.getElementById("focus-me")?.focus();
    announceInto(region, "Hello.");
    expect(region.parentElement).toBe(upper);
  });
});
