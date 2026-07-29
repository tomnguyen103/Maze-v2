import { describe, expect, it } from "vitest";
import { getRegionTheme } from "../src/game/region-theme.js";

describe("Region Theme", () => {
  it("authors Region 1 presentation without changing Run rules", () => {
    const ruleset = {
      atlasRegionId: "foundation",
      revision: "echo-hush-v1",
      label: "Echo Hush"
    };
    const before = structuredClone(ruleset);

    expect(getRegionTheme(ruleset.atlasRegionId)).toEqual({
      id: "mosslight-grove",
      name: "Mosslight Grove",
      motif: "Lantern moss and quiet stone",
      wardenGuild: "Bramblewatch Guild",
      ambientLabel: "Mosslight night chorus",
      sigilName: "First Echo Sigil"
    });
    expect(ruleset).toEqual(before);
    expect(getRegionTheme("developing")).toBeNull();
  });
});
