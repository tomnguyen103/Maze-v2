// @vitest-environment happy-dom

import { beforeEach, describe, expect, it, vi } from "vitest";
import { projectQuestAtlas } from "../src/game/quest-atlas.js";
import {
  createQuestAtlasView,
  renderQuestAtlasSummary
} from "../src/game/quest-atlas-view.js";
import {
  advanceQuest,
  createQuestProgress
} from "../src/game/quest-progress.js";

describe("Echo Atlas view", () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <button id="atlas-trigger">Quest Atlas</button>
      <dialog id="atlas-dialog" aria-labelledby="atlas-title">
        <div>
          <h2 id="atlas-title" tabindex="-1">Echo Atlas</h2>
          <button id="atlas-close" type="button">Close</button>
        </div>
        <p id="atlas-progress"></p>
        <div id="atlas-regions"></div>
      </dialog>
      <div id="result-atlas"></div>
    `;
  });

  it("renders five labeled regions and twenty discoverable node states", () => {
    const view = createQuestAtlasView();
    const trigger = /** @type {HTMLButtonElement} */ (
      document.getElementById("atlas-trigger")
    );

    view.show(
      projectQuestAtlas(createQuestProgress("trail-scout", 4)),
      trigger
    );

    expect(document.querySelectorAll("[data-atlas-region]")).toHaveLength(5);
    expect(document.querySelectorAll("[data-atlas-node]")).toHaveLength(20);
    expect(document.querySelector("[data-atlas-node='4']")?.textContent)
      .toContain("Current Gate Warden milestone");
    expect(document.querySelector("[data-atlas-node='4']")?.getAttribute(
      "aria-label"
    )).toBe("Labyrinth 4, Current Gate Warden milestone");
    expect(document.querySelector("[data-atlas-node='4']")?.getAttribute(
      "tabindex"
    )).toBe("0");
    expect(document.querySelector("[data-atlas-node='4'] [data-milestone-mark]")
      ?.textContent).toBe("◆");
    expect(document.querySelector("[data-atlas-region='foundation']")
      ?.textContent).toContain("Sigil sealed");
    expect(document.activeElement?.id).toBe("atlas-title");
  });

  it("restores focus and reports closure through the view boundary", () => {
    const onClose = vi.fn();
    const view = createQuestAtlasView({ onClose });
    const trigger = /** @type {HTMLButtonElement} */ (
      document.getElementById("atlas-trigger")
    );
    trigger.focus();
    view.show(projectQuestAtlas(createQuestProgress("bright-start")), trigger);

    document.getElementById("atlas-close")?.click();

    expect(onClose).toHaveBeenCalledOnce();
    expect(document.activeElement).toBe(trigger);
  });

  it("renders a compact milestone result without duplicating Quest state", () => {
    const completedMilestone = advanceQuest(
      createQuestProgress("maze-master", 4)
    );
    const container = /** @type {HTMLElement} */ (
      document.getElementById("result-atlas")
    );

    renderQuestAtlasSummary(
      container,
      projectQuestAtlas(completedMilestone),
      { finishedLabyrinthNumber: 4, won: true }
    );

    expect(container.textContent).toContain("Atlas 4 / 20");
    expect(container.textContent).toContain("Foundation Sigil restored");
    expect(container.querySelector("[data-atlas-summary-state]")
      ?.textContent).toContain("Gate Warden milestone completed");
  });
});
