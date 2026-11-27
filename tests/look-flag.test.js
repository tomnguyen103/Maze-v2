import { readFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import config, { popupBarSwap, popupHeroSwap, resolveLook } from "../vite.config.mjs";

/** @param {string | undefined} look */
function aliasFor(look) {
  vi.stubEnv("VITE_LOOK", look ?? "");
  const resolved = /** @type {import("vite").UserConfigFn} */ (config)({
    mode: "test",
    command: "build"
  });
  return /** @type {{ resolve: { alias: Record<string, string> } }} */ (
    resolved
  ).resolve.alias["@look"];
}

afterEach(() => vi.unstubAllEnvs());

describe("look flag", () => {
  it("defaults to pilot when VITE_LOOK is empty", () => {
    expect(resolveLook(undefined)).toBe("pilot");
    expect(aliasFor(undefined)).toBe(
      fileURLToPath(new URL("../src/looks/pilot/", import.meta.url))
    );
  });

  it("points @look at the popup folder for popup", () => {
    expect(aliasFor("popup")).toBe(
      fileURLToPath(new URL("../src/looks/popup/", import.meta.url))
    );
  });

  it("rejects an unknown look with an error that names both looks", () => {
    expect(() => resolveLook("neon")).toThrow(/pilot.*popup/);
    expect(() => aliasFor("neon")).toThrow(/pilot.*popup/);
  });

  it("pins the look in each build and bundle script, so a stray VITE_LOOK cannot switch the Pilot gate", () => {
    const { scripts } = JSON.parse(
      readFileSync(new URL("../package.json", import.meta.url), "utf8")
    );
    expect(scripts.build).toBe("node scripts/build-look.mjs pilot");
    expect(scripts["build:popup"]).toBe("node scripts/build-look.mjs popup");
    expect(scripts["check:bundle"]).toBe("node scripts/check-bundle-budget.mjs pilot");
    expect(scripts["check:bundle:popup"]).toBe("node scripts/check-bundle-budget.mjs popup");
  });
});

describe("popup bar colours", () => {
  const pilot = { light: "oklch(99% 0.004 95)", dark: "oklch(21% 0.03 250)" };
  const popup = { light: "oklch(96.6% 0.024 85.8)", dark: "oklch(20% 0.05 310)" };
  const swap = popupBarSwap();

  for (const file of ["index.html", "public/theme-boot.js", "src/player/theme.js"]) {
    it(`swaps both Pilot bar colours in ${file} for the Popup ones`, () => {
      const text = readFileSync(
        fileURLToPath(new URL(`../${file}`, import.meta.url)),
        "utf8"
      );
      expect(text).toContain(pilot.light);
      expect(text).toContain(pilot.dark);
      const swapped = swap(text);
      expect(swapped).toContain(popup.light);
      expect(swapped).toContain(popup.dark);
      expect(swapped).not.toContain(pilot.light);
      expect(swapped).not.toContain(pilot.dark);
    });
  }
});

describe("popup landing hero", () => {
  const swap = popupHeroSwap();
  const read = (/** @type {string} */ file) =>
    readFileSync(fileURLToPath(new URL(`../${file}`, import.meta.url)), "utf8");

  for (const file of ["index.html", "src/landing/landing-controller.js"]) {
    it(`swaps both hero images and alts in ${file}`, () => {
      const text = read(file);
      expect(text).toContain("landing-chart-light.webp");
      expect(text).toContain("Echo Maze pilot chart");
      const swapped = swap(text);
      expect(swapped).toContain('src="/landing-popup-light.webp"');
      expect(swapped).toContain('src="/landing-popup-night.webp"');
      expect(swapped.match(/alt="Echo Maze board: paper tiles/g)).toHaveLength(2);
      expect(swapped).not.toContain("landing-chart-");
      expect(swapped).not.toContain("Echo Maze pilot chart");
    });
  }

  for (const name of ["light", "night"]) {
    it(`keeps landing-popup-${name}.webp within 40 KB and 640x480`, () => {
      const file = fileURLToPath(
        new URL(`../public/landing-popup-${name}.webp`, import.meta.url)
      );
      expect(statSync(file).size).toBeLessThanOrEqual(40960);
      const head = readFileSync(file).subarray(0, 32);
      expect(head.toString("ascii", 0, 4)).toBe("RIFF");
      expect(head.toString("ascii", 8, 12)).toBe("WEBP");
      const kind = head.toString("ascii", 12, 16);
      let size;
      if (kind === "VP8 ") {
        expect([...head.subarray(23, 26)]).toEqual([0x9d, 0x01, 0x2a]);
        size = [head.readUInt16LE(26) & 0x3fff, head.readUInt16LE(28) & 0x3fff];
      } else if (kind === "VP8L") {
        const bits = head.readUInt32LE(21);
        size = [(bits & 0x3fff) + 1, ((bits >> 14) & 0x3fff) + 1];
      } else {
        expect(kind).toBe("VP8X");
        size = [head.readUIntLE(24, 3) + 1, head.readUIntLE(27, 3) + 1];
      }
      expect(size).toEqual([640, 480]);
    });
  }
});

describe("look fonts (D9)", () => {
  /** @param {string} path */
  const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

  /** @param {string} path @param {RegExp} rule */
  const ruleBody = (path, rule) => {
    const match = read(path).match(rule);
    expect(match, `${path} has no rule ${rule}`).not.toBeNull();
    return match?.[1] ?? "";
  };

  it("defines --font-code as Geist Mono in both looks", () => {
    for (const path of ["src/looks/pilot/tokens.css", "src/looks/popup/tokens.css"]) {
      expect(read(path)).toContain('--font-code: "Geist Mono Variable", "Courier New", monospace;');
    }
  });

  it("sets the Popup readout font to Andika and keeps Geist in the Pilot one", () => {
    const popupUtility = ruleBody("src/looks/popup/tokens.css", /--font-utility: ([^;]+);/);
    expect(popupUtility).toContain("Andika");
    expect(popupUtility).not.toContain("Geist");
    expect(ruleBody("src/looks/pilot/tokens.css", /--font-utility: ([^;]+);/)).toContain(
      "Geist Mono Variable"
    );
  });

  it("sets the seed code and the admin textarea to --font-code", () => {
    expect(ruleBody("src/daylight.css", /\.seed-copy strong \{([^}]*)\}/)).toContain(
      "var(--font-code)"
    );
    expect(ruleBody("src/admin/admin.css", /\.admin-field textarea \{([^}]*)\}/)).toContain(
      "var(--font-code)"
    );
    expect(
      ruleBody("src/game/game-dialogs.css", /\.run-records \.run-records__seed \{([^}]*)\}/)
    ).toContain("var(--font-code)");
    expect(ruleBody("src/looks/popup/surface.css", /:root #result-seed \{([^}]*)\}/)).toContain(
      "var(--font-code)"
    );
  });
});
