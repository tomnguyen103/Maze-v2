import { describe, expect, it } from "vitest";
import {
  DEFAULT_ACCESS_SETTINGS
} from "../src/player/access-settings.js";
import {
  createQuietExpeditionSettings,
  isQuietExpeditionSettings
} from "../src/player/quiet-expedition.js";

describe("Quiet Expedition presentation preset", () => {
  it("combines the three calm presentation choices and preserves the rest", () => {
    const current = /** @type {ReturnType<typeof import("../src/player/access-settings.js").loadAccessSettings>} */ ({
      ...DEFAULT_ACCESS_SETTINGS,
      highContrast: true,
      largeMarks: true,
      narrationPace: "slower"
    });

    expect(createQuietExpeditionSettings(current)).toEqual({
      ...current,
      readerFriendlyQuestions: true,
      reducedEffects: true,
      trailCompassEnabled: true
    });
  });

  it("identifies Quiet Expedition only when every component is enabled", () => {
    const base = { ...DEFAULT_ACCESS_SETTINGS };
    expect(isQuietExpeditionSettings(base)).toBe(false);
    expect(
      isQuietExpeditionSettings(
        createQuietExpeditionSettings(base)
      )
    ).toBe(true);
    expect(
      isQuietExpeditionSettings({
        ...base,
        readerFriendlyQuestions: true,
        reducedEffects: true
      })
    ).toBe(false);
  });
});
