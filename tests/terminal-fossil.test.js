import { describe, expect, it } from "vitest";
import { createTerminalFossil } from "../src/game/terminal-fossil.js";

const INPUT = {
  questId: "quest_terminal_fossil_123",
  labyrinthNumber: 4,
  atlasRegionId: "foundation"
};

describe("terminal Echo Fossil eligibility", () => {
  it("creates one reviewed fossil for a Personal terminal outcome", () => {
    const fossil = createTerminalFossil({
      ...INPUT,
      playMode: "personal",
      outcome: "escaped",
      fossilId: "fossil_00000000-0000-4000-8000-000000000401"
    });

    expect(fossil?.questId).toBe(INPUT.questId);
    expect(fossil?.labyrinthNumber).toBe(INPUT.labyrinthNumber);
    expect(fossil?.wardenOutcome).toBe("escaped-the-wardens");
  });

  it.each(["first-light", "daily", "classroom"])(
    "creates no fossil for %s play",
    (playMode) => {
      expect(createTerminalFossil({
        ...INPUT,
        playMode: /** @type {"first-light" | "daily" | "classroom"} */ (playMode),
        outcome: "defeated",
        fossilId: "fossil_00000000-0000-4000-8000-000000000402"
      })).toBeNull();
    }
  );
});
