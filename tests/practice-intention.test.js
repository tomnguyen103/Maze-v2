import { describe, expect, it } from "vitest";
import {
  DEFAULT_PRACTICE_INTENTION,
  PRACTICE_INTENTIONS,
  validatePracticeIntention
} from "../src/player/practice-intention.js";

describe("Practice Intention contract", () => {
  it("publishes exactly Review, Explore, and Challenge with Explore as neutral", () => {
    expect(PRACTICE_INTENTIONS.map(({ id }) => id)).toEqual([
      "review",
      "explore",
      "challenge"
    ]);
    expect(DEFAULT_PRACTICE_INTENTION).toBe("explore");
  });

  it("keeps Review on the current Level and reviewed Deck", () => {
    expect(
      validatePracticeIntention({
        intention: "review",
        selectedLevelNumber: 2,
        currentLevelNumber: 2,
        selectedDeckId: "number-trail",
        currentDeckId: "number-trail"
      })
    ).toEqual({ valid: true, message: "Review choice is ready." });
    expect(
      validatePracticeIntention({
        intention: "review",
        selectedLevelNumber: 3,
        currentLevelNumber: 2,
        selectedDeckId: "number-trail",
        currentDeckId: "number-trail"
      }).valid
    ).toBe(false);
    expect(
      validatePracticeIntention({
        intention: "review",
        selectedLevelNumber: 2,
        currentLevelNumber: 2,
        selectedDeckId: "mixed-trail",
        currentDeckId: "number-trail"
      }).valid
    ).toBe(false);
  });

  it("leaves Explore open and requires a higher Level for Challenge", () => {
    expect(
      validatePracticeIntention({
        intention: "explore",
        selectedLevelNumber: 1,
        currentLevelNumber: 3,
        selectedDeckId: "mixed-trail",
        currentDeckId: "number-trail"
      }).valid
    ).toBe(true);
    expect(
      validatePracticeIntention({
        intention: "challenge",
        selectedLevelNumber: 3,
        currentLevelNumber: 3,
        selectedDeckId: "mixed-trail",
        currentDeckId: "number-trail"
      })
    ).toEqual({
      valid: false,
      message: "Choose a higher Quest Level for Challenge."
    });
    expect(
      validatePracticeIntention({
        intention: "challenge",
        selectedLevelNumber: 3,
        currentLevelNumber: 2,
        selectedDeckId: "mixed-trail",
        currentDeckId: "number-trail"
      }).valid
    ).toBe(true);
  });

  it("rejects undeclared intention values", () => {
    expect(
      validatePracticeIntention({
        intention: "adaptive",
        selectedLevelNumber: 2,
        currentLevelNumber: 2,
        selectedDeckId: "mixed-trail",
        currentDeckId: "mixed-trail"
      })
    ).toEqual({ valid: false, message: "Choose a Practice Intention." });
  });
});
