/**
 * @typedef {ReturnType<typeof import("./quest-atlas.js").projectQuestAtlas>} QuestAtlas
 */

/**
 * @param {HTMLElement} container
 * @param {QuestAtlas} atlas
 * @param {{ finishedLabyrinthNumber: number, won: boolean }} result
 */
export function renderQuestAtlasSummary(
  container,
  atlas,
  { finishedLabyrinthNumber, won }
) {
  const nodeNumber = won
    ? finishedLabyrinthNumber
    : atlas.currentLabyrinthNumber ?? finishedLabyrinthNumber;
  const region = atlas.regions.find((candidate) =>
    candidate.nodes.some((node) => node.labyrinthNumber === nodeNumber)
  );
  const node = region?.nodes.find(
    (candidate) => candidate.labyrinthNumber === nodeNumber
  );
  const progress = document.createElement("strong");
  progress.textContent =
    `${atlas.contentPackLabel} · Atlas ${atlas.completedLabyrinths} / ${atlas.totalLabyrinths} · ` +
    atlas.learningDeckLabel;
  const state = document.createElement("span");
  state.dataset.atlasSummaryState = "";
  state.textContent = node?.stateLabel ?? "Quest position saved";
  const detail = document.createElement("span");
  detail.textContent = won && node?.milestone && region?.sigilRestored
    ? `${region.label} ${region.sigilLabel}`
    : won
      ? `${region?.label ?? "Quest"} · Labyrinth ${finishedLabyrinthNumber} mapped`
      : `${region?.label ?? "Quest"} · Labyrinth ${nodeNumber} remains current`;
  container.replaceChildren(progress, state, detail);
}
