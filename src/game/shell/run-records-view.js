import { getQuestLevel } from "../../questions/quest-levels.js";
import { getClassicRunRuleset, normalizeRunRuleset } from "../run-ruleset.js";

/**
 * Fills the Records dialog list. Loaded when the Explorer first opens Records.
 * @param {HTMLOListElement} list
 * @param {ReturnType<typeof import("../storage.js").loadRunRecords>} runRecords
 * @param {{
 *   formatTime: (elapsedMs: number) => string,
 *   formatRunRulesetLabel: (ruleset: any, labyrinthNumber: number) => string
 * }} format
 */
export function renderRunRecords(list, runRecords, { formatTime, formatRunRulesetLabel }) {
  if (runRecords.length === 0) {
    const empty = document.createElement("li");
    empty.className = "run-records__empty";
    empty.textContent = "No finished Runs recorded yet.";
    list.replaceChildren(empty);
    return;
  }

  list.replaceChildren(
    ...runRecords.map((record, index) => {
      const item = document.createElement("li");
      const summary = document.createElement("div");
      const title = document.createElement("strong");
      const detail = document.createElement("span");
      const actions = document.createElement("div");
      const replay = document.createElement("button");
      const copy = document.createElement("button");
      const watch = record.replay
        ? document.createElement("button")
        : null;

      const outcome = record.outcome === "escaped" ? "Escaped" : "Defeated";
      const level = getQuestLevel(record.questLevelId);
      const ruleset =
        normalizeRunRuleset(
          record.atlasRegionId || record.rulesetRevision
            ? {
                atlasRegionId: record.atlasRegionId,
                revision: record.rulesetRevision
              }
            : undefined,
          record.labyrinthNumber ?? 1
        ) ?? getClassicRunRuleset(record.labyrinthNumber ?? 1);
      title.textContent =
        `#${index + 1} ${outcome} / ${level.name} / ${formatTime(record.elapsedMs)}`;
      detail.textContent =
        `Labyrinth ${record.labyrinthNumber ?? 1} / ${formatRunRulesetLabel(ruleset, record.labyrinthNumber ?? 1)} / ${record.echoesCollected} / ${record.echoTotal ?? 3} Echoes / ${record.moves} moves / ${record.seed}`;
      replay.type = "button";
      replay.className = "control-button";
      replay.dataset.seed = record.seed;
      replay.dataset.level = record.questLevelId ?? "trail-scout";
      replay.dataset.labyrinth = String(record.labyrinthNumber ?? 1);
      replay.dataset.region = ruleset.atlasRegionId;
      replay.dataset.ruleset = ruleset.revision;
      replay.dataset.recordIndex = String(index);
      replay.dataset.recordAction = "replay";
      replay.textContent = "Play This Seed";
      replay.setAttribute("aria-label", `Play seed ${record.seed}`);
      if (watch) {
        watch.type = "button";
        watch.className = "primary-button";
        watch.dataset.seed = record.seed;
        watch.dataset.recordAction = "watch";
        watch.dataset.recordIndex = String(index);
        watch.textContent = "Watch Trail";
        watch.setAttribute(
          "aria-label",
          `Watch retained Trail for seed ${record.seed}`
        );
      }
      copy.type = "button";
      copy.className = "control-button";
      copy.dataset.seed = record.seed;
      copy.dataset.level = record.questLevelId ?? "trail-scout";
      copy.dataset.labyrinth = String(record.labyrinthNumber ?? 1);
      copy.dataset.region = ruleset.atlasRegionId;
      copy.dataset.ruleset = ruleset.revision;
      copy.dataset.recordAction = "copy";
      copy.textContent = "Copy Share Link";
      copy.setAttribute("aria-label", `Copy share link for seed ${record.seed}`);
      summary.append(title, detail);
      actions.className = "run-records__actions";
      actions.append(copy);
      if (watch) {
        actions.append(watch);
      }
      actions.append(replay);
      item.append(summary, actions);
      return item;
    })
  );
}

/**
 * Copies the share link of one Records row. Rows exist only after this module
 * has rendered them, so the module is already loaded.
 * @param {HTMLButtonElement} button
 * @param {(message: string) => void} announce
 */
export async function copyRecordShareLink(button, announce) {
  const { seed = "", level = "trail-scout", labyrinth = "1" } = button.dataset;
  try {
    const ruleset = normalizeRunRuleset(
      { atlasRegionId: button.dataset.region, revision: button.dataset.ruleset },
      Number(labyrinth)
    );
    if (!ruleset) {
      throw new Error("Run ruleset identity is invalid.");
    }
    const url = new URL("/play", window.location.origin);
    url.searchParams.set("seed", seed);
    url.searchParams.set("level", level);
    url.searchParams.set("labyrinth", String(Number(labyrinth)));
    url.searchParams.set("region", ruleset.atlasRegionId);
    url.searchParams.set("rules", ruleset.revision);
    await navigator.clipboard.writeText(url.toString());
    button.textContent = "Copied";
    announce(`Share link for seed ${seed} copied.`);
    window.setTimeout(() => {
      if (button.isConnected) {
        button.textContent = "Copy Share Link";
      }
    }, 1400);
  } catch {
    announce(`Copy failed. Seed ${seed} is visible.`);
  }
}
