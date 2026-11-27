import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import config, { popupBarSwap, resolveLook } from "../vite.config.mjs";

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
