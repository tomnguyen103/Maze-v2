/**
 * @typedef {ReturnType<typeof import("./quest-atlas.js").projectQuestAtlas>} QuestAtlas
 */

/**
 * @param {{ onClose?: () => void }} [options]
 */
export function createQuestAtlasView({ onClose = () => {} } = {}) {
  const elements = {
    close: requiredElement("atlas-close", HTMLButtonElement),
    dialog: requiredElement("atlas-dialog", HTMLDialogElement),
    progress: requiredElement("atlas-progress", HTMLElement),
    regions: requiredElement("atlas-regions", HTMLElement),
    title: requiredElement("atlas-title", HTMLElement)
  };
  /** @type {HTMLElement | null} */
  let returnFocus = null;

  elements.close.addEventListener("click", () => elements.dialog.close());
  elements.dialog.addEventListener("click", (event) => {
    if (event.target === elements.dialog) {
      elements.dialog.close();
    }
  });
  elements.dialog.addEventListener("close", () => {
    const target = returnFocus;
    returnFocus = null;
    onClose();
    target?.focus();
  });

  return {
    /**
     * @param {QuestAtlas} atlas
     * @param {HTMLElement} trigger
     */
    show(atlas, trigger) {
      returnFocus = trigger;
      renderAtlas(elements, atlas);
      if (!elements.dialog.open) {
        elements.dialog.showModal();
      }
      elements.title.focus();
    },
    close() {
      if (elements.dialog.open) {
        elements.dialog.close();
      }
    }
  };
}

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
  progress.textContent = `Atlas ${atlas.completedLabyrinths} / ${atlas.totalLabyrinths}`;
  const state = document.createElement("span");
  state.dataset.atlasSummaryState = "";
  state.textContent = node?.stateLabel ?? "Quest position saved";
  const detail = document.createElement("span");
  detail.textContent = won && node?.milestone && region?.sigilRestored
    ? `${region.label} Sigil restored`
    : won
      ? `${region?.label ?? "Quest"} · Labyrinth ${finishedLabyrinthNumber} mapped`
      : `${region?.label ?? "Quest"} · Labyrinth ${nodeNumber} remains current`;
  container.replaceChildren(progress, state, detail);
}

/**
 * @param {{
 *   progress: HTMLElement,
 *   regions: HTMLElement
 * }} elements
 * @param {QuestAtlas} atlas
 */
function renderAtlas(elements, atlas) {
  const milestoneGuidance = atlas.complete
    ? "All five Sigils restored. Quest complete."
    : atlas.labyrinthsToNextMilestone === 0
      ? `Gate Warden here at Labyrinth ${atlas.nextMilestoneNumber}.`
      : `Gate Warden in ${atlas.labyrinthsToNextMilestone} Labyrinths at ` +
        `Labyrinth ${atlas.nextMilestoneNumber}.`;
  elements.progress.textContent =
    `${atlas.completedLabyrinths} of ${atlas.totalLabyrinths} Labyrinths mapped. ` +
    `${atlas.restoredSigils} of ${atlas.regions.length} Sigils restored. ` +
    milestoneGuidance;
  elements.regions.replaceChildren(
    ...atlas.regions.map((region) => {
      const section = document.createElement("section");
      section.className = "atlas-region";
      section.dataset.atlasRegion = region.id;

      const heading = document.createElement("div");
      heading.className = "atlas-region__heading";
      const title = document.createElement("h3");
      title.textContent = region.label;
      const range = document.createElement("span");
      range.textContent = region.rangeLabel;
      heading.append(title, range);

      const sigil = document.createElement("p");
      sigil.className = "atlas-sigil";
      sigil.dataset.restored = String(region.sigilRestored);
      sigil.textContent = region.sigilLabel;

      const nodes = document.createElement("ol");
      nodes.className = "atlas-nodes";
      nodes.start = region.nodes[0]?.labyrinthNumber ?? 1;
      nodes.append(
        ...region.nodes.map((node) => {
          const item = document.createElement("li");
          item.dataset.atlasNode = String(node.labyrinthNumber);
          item.dataset.state = node.state;
          item.setAttribute("aria-label", node.accessibleLabel);
          if (node.current) {
            item.setAttribute("aria-current", "step");
            item.tabIndex = 0;
          }
          const number = document.createElement("strong");
          number.textContent = String(node.labyrinthNumber);
          const milestoneMark = node.milestone
            ? document.createElement("span")
            : null;
          if (milestoneMark) {
            milestoneMark.className = "atlas-node__milestone";
            milestoneMark.dataset.milestoneMark = "";
            milestoneMark.setAttribute("aria-hidden", "true");
            milestoneMark.textContent = "◆";
          }
          const label = document.createElement("span");
          label.textContent = node.stateLabel;
          item.append(number);
          if (milestoneMark) {
            item.append(milestoneMark);
          }
          item.append(label);
          return item;
        })
      );
      section.append(heading, sigil, nodes);
      return section;
    })
  );
}

/**
 * @template {Element} T
 * @param {string} id
 * @param {{ new(): T }} type
 */
function requiredElement(id, type) {
  const element = document.getElementById(id);
  if (!(element instanceof type)) {
    throw new Error(`Missing #${id}.`);
  }
  return element;
}
