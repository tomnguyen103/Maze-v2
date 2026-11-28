// @vitest-environment happy-dom

import { afterEach, describe, expect, it, vi } from "vitest";
import { MissingBoardTokenError } from "../src/game/canvas-renderer.js";

vi.mock("../src/looks/popup/fonts.js", () => ({}));
vi.mock("../src/landing/landing-controller.js", () => ({ renderLanding: () => {} }));
vi.mock("../src/main.js", () => ({
  gameReady: Promise.reject(new MissingBoardTokenError("--color-passage"))
}));

describe("startGameplay", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("US-04.1 logs the board token error when the gameplay start fails", async () => {
    document.body.innerHTML = `<div id="game-root"></div><template id="game-template"></template>`;
    window.history.replaceState({}, "", "/play");
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});

    await import("../src/app.js");
    await vi.waitFor(() => expect(document.querySelector("#landing-main")).not.toBeNull());

    expect(errors).toHaveBeenCalledWith("Echo Maze gameplay failed to load.");
    expect(errors.mock.calls.some(([first]) => first instanceof MissingBoardTokenError && first.token === "--color-passage")).toBe(true);
  });
});
