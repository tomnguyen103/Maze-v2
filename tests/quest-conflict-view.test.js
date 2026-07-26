// @vitest-environment happy-dom

import { beforeEach, describe, expect, it, vi } from "vitest";
import { createQuestConflictView } from "../src/player/quest-conflict-view.js";
import {
  advanceQuest,
  createQuestProgress
} from "../src/game/quest-progress.js";

describe("Quest conflict dialog", () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <button id="quest-conflict-trigger">Sync Quest</button>
      <dialog
        id="quest-conflict-dialog"
        aria-labelledby="quest-conflict-title"
        aria-describedby="quest-conflict-intro"
      >
        <h2 id="quest-conflict-title" tabindex="-1">Choose which Quest to keep</h2>
        <p id="quest-conflict-intro"></p>
        <section id="quest-conflict-local"></section>
        <section id="quest-conflict-cloud"></section>
        <button id="quest-conflict-use-local" type="button"></button>
        <button id="quest-conflict-use-cloud" type="button"></button>
      </dialog>
    `;
  });

  it("shows both different Quests without choosing silently", () => {
    const onChoose = vi.fn();
    const local = advanceQuest(
      createQuestProgress("trail-scout", 4, "quest_local_123")
    );
    const cloud = {
      progress: createQuestProgress("maze-master", 8, "quest_cloud_456"),
      revision: 3,
      updatedAt: "2026-07-26T04:00:00.000Z"
    };

    createQuestConflictView({ onChoose }).show({ local, cloud });

    expect(document.getElementById("quest-conflict-local")?.textContent)
      .toContain("Trail Scout");
    expect(document.getElementById("quest-conflict-local")?.textContent)
      .toContain("4 of 20 complete");
    expect(document.getElementById("quest-conflict-cloud")?.textContent)
      .toContain("Maze Master");
    expect(document.getElementById("quest-conflict-cloud")?.textContent)
      .toContain("7 of 20 complete");
    expect(onChoose).not.toHaveBeenCalled();
    expect(document.activeElement?.id).toBe("quest-conflict-title");
  });

  it.each([
    ["quest-conflict-use-local", "local"],
    ["quest-conflict-use-cloud", "cloud"]
  ])("reports the explicit %s choice and closes", (buttonId, choice) => {
    const onChoose = vi.fn();
    const trigger = /** @type {HTMLButtonElement} */ (
      document.getElementById("quest-conflict-trigger")
    );
    trigger.focus();
    const view = createQuestConflictView({ onChoose });
    view.show({
      local: createQuestProgress("bright-start", 2, "quest_local_123"),
      cloud: {
        progress: createQuestProgress("trail-scout", 3, "quest_cloud_456"),
        revision: 2,
        updatedAt: "2026-07-26T04:00:00.000Z"
      }
    }, trigger);

    document.getElementById(buttonId)?.click();

    expect(onChoose).toHaveBeenCalledWith(choice);
    expect(
      /** @type {HTMLDialogElement} */ (
        document.getElementById("quest-conflict-dialog")
      ).open
    ).toBe(false);
    expect(document.activeElement).toBe(trigger);
  });

  it("cannot be dismissed without choosing one Quest", () => {
    const view = createQuestConflictView();
    const dialog = /** @type {HTMLDialogElement} */ (
      document.getElementById("quest-conflict-dialog")
    );
    view.show({
      local: createQuestProgress("bright-start", 2, "quest_local_123"),
      cloud: {
        progress: createQuestProgress("trail-scout", 3, "quest_cloud_456"),
        revision: 2,
        updatedAt: "2026-07-26T04:00:00.000Z"
      }
    });
    const event = new Event("cancel", { cancelable: true });

    dialog.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
    expect(dialog.open).toBe(true);
  });
});
