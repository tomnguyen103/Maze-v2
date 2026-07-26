import { describe, expect, it } from "vitest";
import {
  InputError,
  validateCloudQuestWrite
} from "../server/quest-progress-validation.js";
import { createQuestProgress } from "../src/game/quest-progress.js";

describe("Cloud Quest validation", () => {
  it("accepts only bounded boundary progress with an optimistic revision", () => {
    const progress = createQuestProgress(
      "trail-scout",
      4,
      "quest_validation_123"
    );

    expect(validateCloudQuestWrite({
      expectedRevision: 2,
      progress
    })).toEqual({ expectedRevision: 2, progress });
  });

  it("rejects in-progress Run fields and invalid revisions", () => {
    const progress = createQuestProgress(
      "trail-scout",
      4,
      "quest_validation_123"
    );

    expect(() =>
      validateCloudQuestWrite({
        expectedRevision: -1,
        progress
      })
    ).toThrow(InputError);
    expect(() =>
      validateCloudQuestWrite({
        expectedRevision: 0,
        progress: {
          ...progress,
          explorerPosition: { row: 1, col: 1 }
        }
      })
    ).toThrow(/boundary fields/i);
  });

  it("rejects legacy records until the browser assigns a Quest ID", () => {
    const legacy = /** @type {Partial<ReturnType<typeof createQuestProgress>>} */ ({
      ...createQuestProgress(
        "bright-start",
        1,
        "quest_validation_legacy"
      )
    });
    delete legacy.questId;

    expect(() =>
      validateCloudQuestWrite({
        expectedRevision: 0,
        progress: legacy
      })
    ).toThrow(/Quest ID/i);
  });
});
