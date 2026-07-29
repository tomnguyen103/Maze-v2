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
  });

  it("authors Region 2 presentation without changing Run rules", () => {
    const ruleset = {
      atlasRegionId: "developing",
      revision: "windways-v1",
      label: "Windways"
    };
    const before = structuredClone(ruleset);

    expect(getRegionTheme(ruleset.atlasRegionId)).toEqual({
      id: "windcall-ridge",
      name: "Windcall Ridge",
      motif: "Rising wind and bright trail ribbons",
      wardenGuild: "Kitewatch Guild",
      ambientLabel: "Windcall reed chorus",
      sigilName: "Rising Wind Sigil"
    });
    expect(ruleset).toEqual(before);
  });

  it("authors Region 3 presentation without changing Run rules", () => {
    const ruleset = {
      atlasRegionId: "capable",
      revision: "echo-bridges-v1",
      label: "Echo Bridges"
    };
    const before = structuredClone(ruleset);

    expect(getRegionTheme(ruleset.atlasRegionId)).toEqual({
      id: "sunspan-crossing",
      name: "Sunspan Crossing",
      motif: "Joined arches and clear blue spans",
      wardenGuild: "Spanwatch Guild",
      ambientLabel: "Sunspan string chorus",
      sigilName: "Joined Path Sigil"
    });
    expect(ruleset).toEqual(before);
    expect(getRegionTheme("advanced")).toEqual({
      id: "tideglass-reach",
      name: "Tideglass Reach",
      motif: "Sea-glass channels and alternating tide marks",
      wardenGuild: "Currentwatch Guild",
      ambientLabel: "Tideglass shell chorus",
      sigilName: "Turning Tide Sigil"
    });
  });

  it("authors Region 5 presentation without changing Run rules", () => {
    const ruleset = {
      atlasRegionId: "mastery",
      revision: "warden-bells-v1",
      label: "Warden Bells"
    };
    const before = structuredClone(ruleset);

    expect(getRegionTheme("mastery")).toEqual({
      id: "bellroot-summit",
      name: "Bellroot Summit",
      motif: "Beacon bells and resonant stone",
      wardenGuild: "Chimewatch Guild",
      ambientLabel: "Bellroot dusk chorus",
      sigilName: "Last Light Sigil"
    });
    expect(ruleset).toEqual(before);
    expect(getRegionTheme("unknown")).toBeNull();
  });
});
