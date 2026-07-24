import { describe, expect, it } from "vitest";
import {
  clearPendingGuestDemo,
  hasCompletedGuestDemo,
  markGuestDemoComplete,
  markGuestDemoPendingAuthentication,
  requiresDemoAccount
} from "../src/game/demo-access.js";

/** @returns {{ getItem: (key: string) => string | null, setItem: (key: string, value: string) => void, removeItem: (key: string) => void }} */
function createStorage() {
  const values = new Map(/** @type {[string, string][]} */ ([]));
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key)
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

  it("does not break completion when browser storage is unavailable", () => {
    /** @type {{ getItem: (key: string) => string | null, setItem: (key: string, value: string) => void, removeItem: (key: string) => void }} */
    const storage = {
      getItem: () => null,
      setItem: () => {
        throw new Error("Storage is unavailable.");
      },
      removeItem: () => {}
    };

    expect(() => markGuestDemoComplete(storage)).not.toThrow();
  });

  it("removes a provisional completion after Clerk proves the Explorer is signed in", () => {
    const storage = createStorage();

    markGuestDemoPendingAuthentication(storage);
    expect(requiresDemoAccount(false, storage)).toBe(true);

    clearPendingGuestDemo(storage);

    expect(requiresDemoAccount(false, storage)).toBe(false);
  });

  it("keeps a confirmed guest completion after a signed-in check", () => {
    const storage = createStorage();

    markGuestDemoComplete(storage);
    clearPendingGuestDemo(storage);

    expect(requiresDemoAccount(false, storage)).toBe(true);
  });

  it("requires an account again when a completed-demo Explorer signs out", () => {
    const storage = createStorage();

    expect(requiresDemoAccount(false, storage)).toBe(false);
    markGuestDemoComplete(storage);

    expect(requiresDemoAccount(true, storage)).toBe(false);
    expect(requiresDemoAccount(false, storage)).toBe(true);
  });
});
