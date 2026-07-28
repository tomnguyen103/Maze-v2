import { describe, expect, it } from "vitest";
import {
  clearSelectedClassroom,
  loadSelectedClassroom,
  saveSelectedClassroom
} from "../src/classroom/classroom-selection.js";

function memoryStorage() {
  /** @type {Map<string, string>} */
  const values = new Map();
  return {
    /** @param {string} key */
    getItem: (key) => values.get(key) ?? null,
    /** @param {string} key @param {string} value */
    setItem: (key, value) => values.set(key, value),
    /** @param {string} key */
    removeItem: (key) => values.delete(key)
  };
}

describe("Class Play selection", () => {
  it("persists only a valid Clerk Organization id", () => {
    const storage = memoryStorage();
    expect(
      saveSelectedClassroom("org_class_1", storage, "user_first_1")
    ).toBe(true);
    expect(loadSelectedClassroom(storage, "user_first_1")).toBe(
      "org_class_1"
    );
    expect(
      saveSelectedClassroom("../other", storage, "user_first_1")
    ).toBe(false);
    expect(loadSelectedClassroom(storage, "user_first_1")).toBeNull();
  });

  it("clears selection for Personal Play", () => {
    const storage = memoryStorage();
    saveSelectedClassroom("org_class_1", storage, "user_first_1");
    clearSelectedClassroom(storage, "user_first_1");
    expect(loadSelectedClassroom(storage, "user_first_1")).toBeNull();
  });

  it("isolates selections between accounts sharing one browser", () => {
    const storage = memoryStorage();
    saveSelectedClassroom("org_first_1", storage, "user_first_1");
    saveSelectedClassroom("org_second_1", storage, "user_second_1");

    expect(loadSelectedClassroom(storage, "user_first_1")).toBe(
      "org_first_1"
    );
    expect(loadSelectedClassroom(storage, "user_second_1")).toBe(
      "org_second_1"
    );
  });
});
