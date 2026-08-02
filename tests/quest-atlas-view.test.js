// @vitest-environment happy-dom

import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { projectQuestAtlas } from "../src/game/quest-atlas.js";
import {
  addEchoFossil,
  createEchoFossil,
  createFossilCollection
} from "../src/game/quest-fossils.js";
import {
  createQuestAtlasView,
  renderQuestAtlasSummary
} from "../src/game/quest-atlas-view.js";
import {
  advanceQuest,
  createQuestProgress
} from "../src/game/quest-progress.js";
import { getPublishedLearningDeckOptions } from "../src/questions/learning-deck-catalog.js";

const NUMBER_TRAIL = getPublishedLearningDeckOptions().find(
  ({ deckId }) => deckId === "number-trail"
);

describe("Echo Atlas view", () => {
  beforeEach(() => {
    window.history.replaceState(null, "", "/play");
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
    expect(document.querySelectorAll("[data-atlas-landmark]")).toHaveLength(20);
    expect(document.querySelector("[data-atlas-illustration]")
      ?.getAttribute("aria-hidden")).toBe("true");
    expect(document.querySelectorAll("[data-atlas-region-art]")).toHaveLength(5);
    expect(document.querySelector("[data-atlas-node='1'] [data-state-mark]")
      ?.getAttribute("data-state-mark")).toBe("stamp");
    expect(document.querySelector("[data-atlas-node='4'] [data-state-mark]")
      ?.getAttribute("data-state-mark")).toBe("signal");
    expect(document.querySelector("[data-atlas-node='5'] [data-state-mark]")
      ?.getAttribute("data-state-mark")).toBe("waypoint");
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
      ?.textContent).toContain("First Echo Sigil restores at Labyrinth 4");
    expect(document.getElementById("atlas-progress")?.textContent).toContain(
      "Gate Warden here at Labyrinth 4"
    );
    expect(document.activeElement?.id).toBe("atlas-title");
  });

  it("names the selected Learning Deck in Atlas and result summaries", () => {
    if (!NUMBER_TRAIL) {
      throw new Error("Published Number Trail fixture is missing.");
    }
    const progress = createQuestProgress(
      "trail-scout",
      4,
      "quest_number_summary",
      NUMBER_TRAIL
    );
    const atlas = projectQuestAtlas(progress);
    const trigger = /** @type {HTMLButtonElement} */ (
      document.getElementById("atlas-trigger")
    );

    createQuestAtlasView().show(atlas, trigger);
    expect(document.getElementById("atlas-progress")?.textContent)
      .toContain("Number Trail");

    renderQuestAtlasSummary(
      /** @type {HTMLElement} */ (
        document.getElementById("result-atlas")
      ),
      atlas,
      { finishedLabyrinthNumber: 4, won: true }
    );
    expect(document.getElementById("result-atlas")?.textContent)
      .toContain("Number Trail");
  });

  it("shows a reviewed fossil stamp and note only on its completed landmark", () => {
    const progress = advanceQuest(
      createQuestProgress("trail-scout", 4, "quest_atlas_fossil_123")
    );
    const fossil = createEchoFossil({
      questId: progress.questId,
      labyrinthNumber: 4,
      atlasRegionId: "foundation",
      outcome: "escaped",
      fossilId: "fossil_00000000-0000-4000-8000-000000000403"
    });
    const atlas = projectQuestAtlas(progress, {
      fossilCollection: addEchoFossil(
        createFossilCollection(progress.questId),
        fossil
      )
    });
    const trigger = /** @type {HTMLButtonElement} */ (
      document.getElementById("atlas-trigger")
    );

    createQuestAtlasView().show(atlas, trigger);
    expect(document.querySelector(
      "[data-atlas-landmark='foundation-4'] [data-fossil-mark]"
    )).not.toBeNull();
    /** @type {HTMLButtonElement | null} */ (
      document.querySelector("[data-atlas-landmark='foundation-4']")
    )?.click();
    expect(document.querySelector("[data-atlas-fossils]")?.textContent)
      .toContain("The first Gate Warden yields to a steady trail.");
    expect(document.querySelector("[data-visual-stamp='foundation-lantern-mark']"))
      .not.toBeNull();
    /** @type {HTMLButtonElement | null} */ (
      document.querySelector("[data-atlas-landmark='foundation-1']")
    )?.click();
    expect(document.querySelector("[data-atlas-fossils]")).toBeNull();
  });

  it("removes landmark press movement when reduced motion is requested", () => {
    const styles = readFileSync("src/game/quest-atlas.css", "utf8");
    const reducedMotion = styles.match(
      /@media \(prefers-reduced-motion: reduce\) \{([\s\S]*)\}\s*$/
    )?.[1];

    expect(reducedMotion).toMatch(
      /\.atlas-dialog button:active:not\(:disabled\),[\s\S]*\{\s*transform:\s*none;\s*\}/
    );
  });

  it("keeps map and list semantics on one landmark collection", () => {
    const view = createQuestAtlasView();
    const trigger = /** @type {HTMLButtonElement} */ (
      document.getElementById("atlas-trigger")
    );

    view.show(
      projectQuestAtlas(createQuestProgress("trail-scout", 4)),
      trigger
    );

    const collection = document.querySelector("[data-atlas-landmarks]");
    expect(document.querySelector("[role='toolbar']")
      ?.getAttribute("aria-label")).toBe("Atlas view controls");
    expect(collection?.getAttribute("data-view")).toBe("map");
    document.querySelector("[data-atlas-view='list']")?.dispatchEvent(
      new MouseEvent("click", { bubbles: true })
    );
    expect(collection?.getAttribute("data-view")).toBe("list");
    expect(document.querySelectorAll("[data-atlas-landmark]")).toHaveLength(20);
    expect(document.querySelector("[data-atlas-landmark='foundation-4']")
      ?.textContent).toContain("Current Gate Warden milestone");
    expect(document.querySelector("[data-atlas-zoom='in']"))
      .toHaveProperty("disabled", true);
    expect(document.querySelector("[data-atlas-zoom='out']"))
      .toHaveProperty("disabled", true);
    expect(document.querySelector("[data-atlas-center-current]"))
      .toHaveProperty("disabled", true);
  });

  it("disables zoom limits and Center Current when no landmark is current", () => {
    const view = createQuestAtlasView();
    const trigger = /** @type {HTMLButtonElement} */ (
      document.getElementById("atlas-trigger")
    );
    let progress = createQuestProgress("trail-scout", 20);
    progress = advanceQuest(progress);

    view.show(projectQuestAtlas(progress), trigger);

    expect(document.querySelector("[data-atlas-center-current]"))
      .toHaveProperty("disabled", true);
    const zoomIn = /** @type {HTMLButtonElement} */ (
      document.querySelector("[data-atlas-zoom='in']")
    );
    zoomIn.click();
    zoomIn.click();
    expect(zoomIn.disabled).toBe(true);
    expect(document.querySelector("[data-atlas-zoom='out']"))
      .toHaveProperty("disabled", false);
  });

  it("restores stable URL selection and exposes only the current action", () => {
    window.history.replaceState(null, "", "/play?atlas=developing-7");
    const onContinue = vi.fn();
    const view = createQuestAtlasView({ onContinue });
    const trigger = /** @type {HTMLButtonElement} */ (
      document.getElementById("atlas-trigger")
    );

    view.show(
      projectQuestAtlas(createQuestProgress("trail-scout", 4)),
      trigger
    );

    expect(document.querySelector("[data-atlas-detail-title]")?.textContent)
      .toContain("Labyrinth 7");
    expect(document.querySelector("[data-atlas-detail-action]")).toBeNull();

    document.querySelector("[data-atlas-landmark='foundation-4']")
      ?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(new URL(window.location.href).searchParams.get("atlas"))
      .toBe("foundation-4");
    expect(document.querySelector("[data-atlas-detail]")?.textContent)
      .toContain("Continue Quest");
    document.querySelector("[data-atlas-detail-action]")?.dispatchEvent(
      new MouseEvent("click", { bubbles: true })
    );
    expect(onContinue).toHaveBeenCalledOnce();
  });

  it("keeps retained Trail inspection inside the selected Atlas landmark", () => {
    const onWatchTrail = vi.fn();
    const view = createQuestAtlasView({ onWatchTrail });
    const trigger = /** @type {HTMLButtonElement} */ (
      document.getElementById("atlas-trigger")
    );
    view.show(
      projectQuestAtlas(createQuestProgress("trail-scout", 4), {
        watchTrailLandmarkIds: new Set([
          "foundation-2",
          "foundation-4",
          "developing-5"
        ])
      }),
      trigger
    );

    const landmark = /** @type {HTMLButtonElement} */ (
      document.querySelector("[data-atlas-landmark='foundation-2']")
    );
    landmark.click();
    document.querySelector("[data-atlas-view='list']")?.dispatchEvent(
      new MouseEvent("click", { bubbles: true })
    );
    const action = /** @type {HTMLButtonElement | null} */ (
      document.querySelector("[data-atlas-watch-trail]")
    );
    expect(action?.textContent).toBe("Watch Trail");
    action?.click();
    expect(onWatchTrail).toHaveBeenCalledWith("foundation-2", landmark);
    expect(document.getElementById("atlas-dialog")).toHaveProperty(
      "open",
      true
    );
    expect(document.querySelector("[data-atlas-landmarks]")
      ?.getAttribute("data-view")).toBe("list");
    expect(new URL(window.location.href).searchParams.get("atlas"))
      .toBe("foundation-2");

    const returnTarget = onWatchTrail.mock.calls[0]?.[1];
    returnTarget?.focus();
    expect(document.activeElement).toBe(landmark);

    document.querySelector("[data-atlas-landmark='foundation-4']")
      ?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(document.querySelector("[data-atlas-watch-trail]")).toBeNull();
    document.querySelector("[data-atlas-landmark='developing-5']")
      ?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(document.querySelector("[data-atlas-watch-trail]")).toBeNull();

    view.show(
      projectQuestAtlas(createQuestProgress("trail-scout", 4)),
      trigger
    );
    document.querySelector("[data-atlas-landmark='foundation-2']")
      ?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(document.querySelector("[data-atlas-watch-trail]")).toBeNull();
  });

  it("supports focus-safe landmark keys and explicit map controls", () => {
    const view = createQuestAtlasView();
    const trigger = /** @type {HTMLButtonElement} */ (
      document.getElementById("atlas-trigger")
    );
    view.show(
      projectQuestAtlas(createQuestProgress("trail-scout", 4)),
      trigger
    );

    const current = /** @type {HTMLButtonElement} */ (
      document.querySelector("[data-atlas-landmark='foundation-4']")
    );
    current.focus();
    current.dispatchEvent(new KeyboardEvent("keydown", {
      key: "ArrowRight",
      bubbles: true
    }));
    expect(document.activeElement?.getAttribute("data-atlas-landmark"))
      .toBe("developing-5");
    expect(new URL(window.location.href).searchParams.get("atlas"))
      .toBe("developing-5");

    document.querySelector("[data-atlas-zoom='in']")?.dispatchEvent(
      new MouseEvent("click", { bubbles: true })
    );
    expect(document.querySelector("[data-atlas-canvas]")
      ?.getAttribute("data-zoom")).toBe("1.2");
    const viewport = /** @type {HTMLElement} */ (
      document.querySelector(".atlas-viewport")
    );
    viewport.focus();
    viewport.dispatchEvent(new KeyboardEvent("keydown", {
      key: "ArrowRight",
      shiftKey: true,
      bubbles: true
    }));
    expect(document.querySelector("[data-atlas-canvas]")
      ?.getAttribute("style")).toContain("translate(-48px, 0px)");
    document.querySelector("[data-atlas-center-current]")?.dispatchEvent(
      new MouseEvent("click", { bubbles: true })
    );
    expect(document.querySelector("[data-atlas-landmark='foundation-4']")
      ?.getAttribute("aria-current")).toBe("step");
  });

  it("reveals the next Gate Warden and celebrates a completed Atlas", () => {
    const view = createQuestAtlasView();
    const trigger = /** @type {HTMLButtonElement} */ (
      document.getElementById("atlas-trigger")
    );

    view.show(
      projectQuestAtlas(createQuestProgress("trail-scout")),
      trigger
    );
    expect(document.getElementById("atlas-progress")?.textContent).toContain(
      "Gate Warden in 3 Labyrinths at Labyrinth 4"
    );
    view.close();

    view.show(
      projectQuestAtlas({
        ...createQuestProgress("trail-scout", 20),
        completedLabyrinths: 20,
        complete: true
      }),
      trigger
    );
    expect(document.getElementById("atlas-progress")?.textContent).toContain(
      "All five Sigils restored. Quest complete."
    );
  });

  it("restores focus and reports closure through the view boundary", () => {
    const onClose = vi.fn();
    const view = createQuestAtlasView({ onClose });
    const trigger = /** @type {HTMLButtonElement} */ (
      document.getElementById("atlas-trigger")
    );
    trigger.focus();
    view.show(projectQuestAtlas(createQuestProgress("bright-start")), trigger);
    document.querySelector("[data-atlas-landmark='foundation-2']")
      ?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(new URL(window.location.href).searchParams.get("atlas"))
      .toBe("foundation-2");

    document.getElementById("atlas-close")?.click();

    expect(onClose).toHaveBeenCalledOnce();
    expect(new URL(window.location.href).searchParams.has("atlas")).toBe(false);
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
    expect(container.textContent).toContain(
      "Foundation First Echo Sigil restored"
    );
    expect(container.querySelector("[data-atlas-summary-state]")
      ?.textContent).toContain("Gate Warden milestone completed");
  });
});
