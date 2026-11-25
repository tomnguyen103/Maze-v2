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

function openWorkshop() {
  const onNavigate = vi.fn();
  const view = createLanternTrailView({ onNavigate });
  const trigger = button("trigger");
  view.show({
    levelId: "bright-start",
    difficultyBand: "foundation",
    origin: "journal",
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

  it("closes to the same origin as the footer Close button", () => {
    const header = openWorkshop();
    button("practice-header-close").click();
    expect(header.onNavigate).toHaveBeenCalledExactlyOnceWith(
      "journal",
      header.trigger
    );

    const footer = openWorkshop();
    button("practice-close").click();
    expect(footer.onNavigate).toHaveBeenCalledExactlyOnceWith(
      "journal",
      footer.trigger
    );
  });

  it("hides the header Close in the Tactics Lab and shows it after the trail clears", () => {
    openWorkshop();
    const headerClose = button("practice-header-close");
    expect(headerClose.hidden).toBe(false);

    button("practice-tactics-open").click();
    expect(headerClose.hidden).toBe(true);

    button("practice-tactics-exit").click();
    expect(headerClose.hidden).toBe(false);
  });
});
