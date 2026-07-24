import { describe, expect, it } from "vitest";
import {
  hasCompletedGuestDemo,
  markGuestDemoComplete,
  requiresDemoAccount
} from "../src/game/demo-access.js";

/** @returns {{ getItem: (key: string) => string | null, setItem: (key: string, value: string) => void }} */
function createStorage() {
  const values = new Map(/** @type {[string, string][]} */ ([]));
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value)
  };
}

describe("guest demo access", () => {
  it("keeps a completed guest demo across a reload", () => {
    const storage = createStorage();

    expect(hasCompletedGuestDemo(storage)).toBe(false);

    markGuestDemoComplete(storage);

    expect(hasCompletedGuestDemo(storage)).toBe(true);
  });

  it("treats malformed saved data as an unused demo", () => {
    /** @type {{ getItem: (key: string) => string | null, setItem: (key: string, value: string) => void }} */
    const storage = {
      getItem: () => "not valid json",
      setItem: () => {}
    };

    expect(hasCompletedGuestDemo(storage)).toBe(false);
  });

  it("requires an account again when a completed-demo Explorer signs out", () => {
    const storage = createStorage();

    expect(requiresDemoAccount(false, storage)).toBe(false);
    markGuestDemoComplete(storage);

    expect(requiresDemoAccount(true, storage)).toBe(false);
    expect(requiresDemoAccount(false, storage)).toBe(true);
  });
});
