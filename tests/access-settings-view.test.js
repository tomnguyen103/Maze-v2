// @vitest-environment happy-dom

import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  ACCESS_SETTINGS_STORAGE_KEY,
  DEFAULT_ACCESS_SETTINGS
} from "../src/player/access-settings.js";
import { createAccessSettingsView } from "../src/player/access-settings-view.js";

/** @param {Record<string, unknown> | null} [initial] */
function createStorage(initial = null) {
  /** @type {Map<string, string>} */
  const values = new Map();
  if (initial) {
    values.set(ACCESS_SETTINGS_STORAGE_KEY, JSON.stringify(initial));
  }
  return {
    /** @param {string} key */
    getItem: (key) => values.get(key) ?? null,
    /** @param {string} key */
    removeItem: (key) => values.delete(key),
    /** @param {string} key @param {string} value */
    setItem: (key, value) => values.set(key, value)
  };
}

describe("Explorer Access Settings dialog", () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <button id="settings-trigger" type="button">Settings</button>
      <dialog id="access-settings-dialog" aria-labelledby="access-settings-title">
        <h2 id="access-settings-title" tabindex="-1">Explorer Access Settings</h2>
        <form id="access-settings-form">
          <input id="access-high-contrast" name="highContrast" type="checkbox" />
          <input id="access-large-marks" name="largeMarks" type="checkbox" />
          <input id="access-reader-type" name="readerFriendlyQuestions" type="checkbox" />
          <input id="access-reduced-effects" name="reducedEffects" type="checkbox" />
          <p id="access-settings-status"></p>
          <button id="access-settings-reset" type="button">Reset</button>
          <button id="access-settings-save" type="submit">Save settings</button>
          <button id="access-settings-close" type="button">Cancel</button>
        </form>
      </dialog>
    `;
  });

  it("previews changes without persisting and restores saved settings on cancel", () => {
    const saved = {
      ...DEFAULT_ACCESS_SETTINGS,
      highContrast: true
    };
    const storage = createStorage(saved);
    const onApply = vi.fn();
    const view = createAccessSettingsView({ storage, onApply });
    const trigger = /** @type {HTMLButtonElement} */ (
      document.getElementById("settings-trigger")
    );

    view.show(trigger);
    expect(document.activeElement?.id).toBe("access-settings-title");
    const readerType = /** @type {HTMLInputElement} */ (
      document.getElementById("access-reader-type")
    );
    readerType.checked = true;
    readerType.dispatchEvent(new Event("change", { bubbles: true }));

    expect(onApply).toHaveBeenLastCalledWith({
      ...saved,
      readerFriendlyQuestions: true
    });
    expect(
      JSON.parse(storage.getItem(ACCESS_SETTINGS_STORAGE_KEY) ?? "null")
    ).toEqual(saved);

    document.getElementById("access-settings-close")?.click();
    expect(onApply).toHaveBeenLastCalledWith(saved);
    expect(document.activeElement).toBe(trigger);
  });

  it("saves the preview and reset commits the canonical design", () => {
    const storage = createStorage();
    const onApply = vi.fn();
    const view = createAccessSettingsView({ storage, onApply });
    const trigger = /** @type {HTMLButtonElement} */ (
      document.getElementById("settings-trigger")
    );
    const largeMarks = /** @type {HTMLInputElement} */ (
      document.getElementById("access-large-marks")
    );

    view.show(trigger);
    largeMarks.checked = true;
    largeMarks.dispatchEvent(new Event("change", { bubbles: true }));
    document.getElementById("access-settings-form")?.dispatchEvent(
      new SubmitEvent("submit", { bubbles: true, cancelable: true })
    );
    expect(
      JSON.parse(storage.getItem(ACCESS_SETTINGS_STORAGE_KEY) ?? "null")
    ).toMatchObject({ largeMarks: true });

    view.show(trigger);
    document.getElementById("access-settings-reset")?.click();
    expect(
      JSON.parse(storage.getItem(ACCESS_SETTINGS_STORAGE_KEY) ?? "null")
    ).toEqual(DEFAULT_ACCESS_SETTINGS);
    expect(largeMarks.checked).toBe(false);
    expect(document.getElementById("access-settings-status")?.textContent).toBe(
      "Canonical design restored."
    );
  });
});
