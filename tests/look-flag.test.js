import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import config, { resolveLook } from "../vite.config.mjs";

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
