// @vitest-environment happy-dom

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createLanternTrailView } from "../src/learning/lantern-trail-view.js";

const WORKSHOP_MARKUP = /<dialog[^>]*id="practice-dialog"[\s\S]*?<\/dialog>/.exec(
  readFileSync(resolve(process.cwd(), "index.html"), "utf8")
)?.[0];

/** @param {string} id */
function button(id) {
  return /** @type {HTMLButtonElement} */ (document.getElementById(id));
}

/** @param {"play" | "journal" | "atlas"} origin */
function openWorkshop(origin) {
  const onNavigate = vi.fn();
  const view = createLanternTrailView({ onNavigate });
  const trigger = button("trigger");
  view.show({
    levelId: "bright-start",
    difficultyBand: "foundation",
    origin,
    trigger
  });
  return { onNavigate, trigger };
}

describe("Lantern Trail Workshop header Close", () => {
  beforeEach(() => {
    document.body.innerHTML = `<button id="trigger">Open</button>${WORKSHOP_MARKUP}`;
    vi.stubGlobal(
      "requestAnimationFrame",
      (/** @type {FrameRequestCallback} */ callback) => callback(0)
    );
  });

  // Atlas is neither the default origin nor the Workshop Journal button target.
  it("closes the header Close to the Workshop origin", () => {
    const { onNavigate, trigger } = openWorkshop("atlas");
    button("practice-header-close").click();
    expect(onNavigate).toHaveBeenCalledExactlyOnceWith("atlas", trigger);
  });

  it("closes the footer Close to the same origin", () => {
    const { onNavigate, trigger } = openWorkshop("atlas");
    button("practice-close").click();
    expect(onNavigate).toHaveBeenCalledExactlyOnceWith("atlas", trigger);
  });

  it("hides the header Close in the Tactics Lab and shows it after the trail clears", () => {
    openWorkshop("journal");
    const headerClose = button("practice-header-close");
    expect(headerClose.hidden).toBe(false);

    button("practice-tactics-open").click();
    expect(headerClose.hidden).toBe(true);

    button("practice-tactics-exit").click();
    expect(headerClose.hidden).toBe(false);
  });
});
