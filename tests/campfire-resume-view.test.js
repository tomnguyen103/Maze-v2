// @vitest-environment happy-dom

import { beforeEach, describe, expect, it, vi } from "vitest";
import { createRun } from "../src/game/game-session.js";
import { createCampfireResumeView } from "../src/game/active-run-recovery.js";
import { getLabyrinthConfig } from "../src/questions/quest-levels.js";

describe("Campfire Resume view", () => {
  beforeEach(() => {
    document.body.replaceChildren();
  });

  it("names the immutable Learning Deck in the recovery handoff", () => {
    const run = createRun("DECK-RECOVERY", {
      ...getLabyrinthConfig("trail-scout", 5)
    });
    const view = createCampfireResumeView({
      onContinue: vi.fn(),
      onRestart: vi.fn()
    });

    view.show(run, {
      levelName: "Trail Scout",
      learningDeckName: "Word Trail",
      labyrinthNumber: 5
    });

    expect(document.getElementById("campfire-resume-summary")?.textContent)
      .toContain("Trail Scout · Word Trail · Labyrinth 5");
  });
});
