import "./quest-atlas.css";

/**
 * @typedef {ReturnType<typeof import("./quest-atlas.js").projectQuestAtlas>} QuestAtlas
 */
export { renderQuestAtlasSummary } from "./quest-atlas-summary.js";

/**
 * @param {{
 *   onClose?: () => void,
 *   onContinue?: () => void,
 *   onWatchTrail?: (
 *     landmarkId: string,
 *     returnTarget: HTMLElement
 *   ) => void,
 *   onWorkshop?: (
 *     selection: { levelId: string, difficultyBand: string },
 *     returnTarget: HTMLElement
 *   ) => void
 * }} [options]
 */
export function createQuestAtlasView({
  onClose = () => {},
  onContinue = () => {},
  onWatchTrail = () => {},
  onWorkshop = () => {}
} = {}) {
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
    const url = new URL(window.location.href);
    url.searchParams.delete("atlas");
    window.history.replaceState(window.history.state, "", url);
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
      renderAtlas(elements, atlas, {
        onContinue,
        onWatchTrail,
        onWorkshop
      });
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
 * @param {{
 *   progress: HTMLElement,
 *   regions: HTMLElement,
 *   dialog: HTMLDialogElement
 * }} elements
 * @param {QuestAtlas} atlas
 * @param {{
 *   onContinue: () => void,
 *   onWatchTrail: (
 *     landmarkId: string,
 *     returnTarget: HTMLElement
 *   ) => void,
 *   onWorkshop: (
 *     selection: { levelId: string, difficultyBand: string },
 *     returnTarget: HTMLElement
 *   ) => void
 * }} options
 */
function renderAtlas(
  elements,
  atlas,
  { onContinue, onWatchTrail, onWorkshop }
) {
  const milestoneGuidance = atlas.complete
    ? "All five Sigils restored. Quest complete."
    : atlas.labyrinthsToNextMilestone === 0
      ? `Gate Warden here at Labyrinth ${atlas.nextMilestoneNumber}.`
      : `Gate Warden in ${atlas.labyrinthsToNextMilestone} Labyrinths at ` +
        `Labyrinth ${atlas.nextMilestoneNumber}.`;
  const fossilGuidance = atlas.fossilStatus === "unavailable"
    ? "Fossil memory sync unavailable; local play continues."
    : atlas.fossilStatus === "syncing"
      ? "Fossil memories syncing."
      : atlas.fossilCount === 0
        ? "No Echo Fossil memories yet."
        : `${atlas.fossilCount} Echo Fossil ${
            atlas.fossilCount === 1 ? "memory" : "memories"
          } kept.`;
  elements.progress.textContent =
    `${atlas.contentPackLabel}. ${atlas.learningDeckLabel}. ` +
    `${atlas.completedLabyrinths} of ${atlas.totalLabyrinths} Labyrinths mapped. ` +
    `${atlas.restoredSigils} of ${atlas.regions.length} Sigils restored. ` +
    `${fossilGuidance} ${milestoneGuidance}`;
  const shell = document.createElement("div");
  shell.className = "atlas-shell";
  const toolbar = document.createElement("div");
  toolbar.className = "atlas-toolbar";
  toolbar.setAttribute("role", "toolbar");
  toolbar.setAttribute("aria-label", "Atlas view controls");

  const mapView = controlButton("Map view");
  mapView.dataset.atlasView = "map";
  const listView = controlButton("List view");
  listView.dataset.atlasView = "list";
  const zoomOut = controlButton("Zoom out");
  zoomOut.dataset.atlasZoom = "out";
  const zoomIn = controlButton("Zoom in");
  zoomIn.dataset.atlasZoom = "in";
  const center = controlButton("Center Current");
  center.dataset.atlasCenterCurrent = "";
  toolbar.append(mapView, listView, zoomOut, zoomIn, center);

  const viewport = document.createElement("div");
  viewport.className = "atlas-viewport";
  viewport.tabIndex = 0;
  viewport.setAttribute("role", "group");
  viewport.setAttribute(
    "aria-label",
    "Echo Atlas map. Shift plus arrow keys pans the map."
  );
  const canvas = document.createElement("div");
  canvas.className = "atlas-canvas";
  canvas.dataset.atlasCanvas = "";
  canvas.dataset.zoom = "1";
  canvas.append(createAtlasIllustration());
  const collection = document.createElement("div");
  collection.className = "atlas-regions";
  collection.dataset.atlasLandmarks = "";
  collection.dataset.view = "map";
  /** @type {HTMLButtonElement[]} */
  const buttons = [];

  collection.append(
    ...atlas.regions.map((region) => {
      const section = document.createElement("section");
      section.className = "atlas-region";
      section.dataset.atlasRegion = region.id;

      const heading = document.createElement("div");
      heading.className = "atlas-region__heading";
      const title = document.createElement("h3");
      title.textContent = region.label;
      const range = document.createElement("span");
      range.textContent =
        `${region.arcName ? `${region.arcName} · ` : ""}${region.themeName} · ${region.rangeLabel} · ${region.motif}`;
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
          const button = document.createElement("button");
          button.type = "button";
          button.className = "atlas-landmark";
          button.dataset.atlasNode = String(node.labyrinthNumber);
          button.dataset.atlasLandmark = node.id;
          button.dataset.state = node.state;
          button.setAttribute("aria-label", node.accessibleLabel);
          button.setAttribute("aria-pressed", "false");
          if (node.current) {
            button.setAttribute("aria-current", "step");
            button.tabIndex = 0;
          }
          const number = document.createElement("strong");
          number.textContent = String(node.labyrinthNumber);
          const stateMark = document.createElement("span");
          stateMark.className = "atlas-node__state-mark";
          stateMark.dataset.stateMark = node.current
            ? "signal"
            : node.completed
              ? "stamp"
              : "waypoint";
          stateMark.setAttribute("aria-hidden", "true");
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
          button.append(number, stateMark);
          if (milestoneMark) {
            button.append(milestoneMark);
          }
          button.append(label);
          if (node.fossilCount > 0) {
            const fossilMark = document.createElement("span");
            fossilMark.className = "atlas-node__fossil";
            fossilMark.dataset.fossilMark = "";
            fossilMark.setAttribute("aria-hidden", "true");
            fossilMark.textContent = node.fossilCount === 1
              ? "Fossil"
              : `${node.fossilCount} Fossils`;
            button.append(fossilMark);
            button.setAttribute(
              "aria-label",
              `${node.accessibleLabel}, ${node.fossilCount} Echo ${
                node.fossilCount === 1 ? "Fossil" : "Fossils"
              }`
            );
          }
          item.append(button);
          buttons.push(button);
          return item;
        })
      );
      section.append(heading, sigil, nodes);
      return section;
    })
  );
  canvas.append(collection);
  viewport.append(canvas);

  const detail = document.createElement("aside");
  detail.className = "atlas-detail";
  detail.dataset.atlasDetail = "";
  detail.setAttribute("aria-live", "polite");

  shell.append(toolbar, viewport, detail);
  elements.regions.replaceChildren(shell);

  let zoom = 1;
  let panX = 0;
  let panY = 0;

  function applyTransform() {
    canvas.dataset.zoom = String(zoom);
    canvas.style.transform =
      `translate(${panX}px, ${panY}px) scale(${zoom})`;
  }

  function syncControlAvailability() {
    const mapActive = collection.dataset.view === "map";
    zoomOut.disabled = !mapActive || zoom <= 0.8;
    zoomIn.disabled = !mapActive || zoom >= 1.4;
    center.disabled =
      !mapActive ||
      !buttons.some((button) => button.hasAttribute("aria-current"));
  }

  /**
   * @param {string} nodeId
   * @param {{ focus?: boolean, updateUrl?: boolean }} [selectionOptions]
   */
  function select(
    nodeId,
    { focus = false, updateUrl = true } = {}
  ) {
    const node = atlas.regions
      .flatMap((region) => region.nodes)
      .find((candidate) => candidate.id === nodeId);
    const button = buttons.find(
      (candidate) => candidate.dataset.atlasLandmark === nodeId
    );
    if (!node || !button) {
      return;
    }
    for (const candidate of buttons) {
      candidate.setAttribute(
        "aria-pressed",
        String(candidate === button)
      );
    }
    renderDetail(detail, node, {
      onContinue,
      onWatchTrail: (landmarkId) => onWatchTrail(landmarkId, button),
      onWorkshop: (selection) => onWorkshop(selection, button),
      levelId: atlas.levelId,
      close: elements.dialog.close.bind(elements.dialog)
    });
    if (updateUrl) {
      const url = new URL(window.location.href);
      url.searchParams.set("atlas", node.id);
      window.history.replaceState(window.history.state, "", url);
    }
    if (focus) {
      button.focus({ preventScroll: true });
    }
  }

  for (const [index, button] of buttons.entries()) {
    button.addEventListener("click", () => {
      select(button.dataset.atlasLandmark ?? "");
    });
    button.addEventListener("keydown", (event) => {
      if (!event.key.startsWith("Arrow") && event.key !== "Home" &&
        event.key !== "End") {
        return;
      }
      if (event.shiftKey && event.key.startsWith("Arrow")) {
        return;
      }
      event.preventDefault();
      const nextIndex = event.key === "Home"
        ? 0
        : event.key === "End"
          ? buttons.length - 1
          : event.key === "ArrowLeft" || event.key === "ArrowUp"
            ? Math.max(0, index - 1)
            : Math.min(buttons.length - 1, index + 1);
      select(buttons[nextIndex].dataset.atlasLandmark ?? "", { focus: true });
    });
  }

  viewport.addEventListener("keydown", (event) => {
    if (!event.shiftKey || !event.key.startsWith("Arrow")) {
      return;
    }
    event.preventDefault();
    panX += event.key === "ArrowLeft"
      ? 48
      : event.key === "ArrowRight"
        ? -48
        : 0;
    panY += event.key === "ArrowUp"
      ? 48
      : event.key === "ArrowDown"
        ? -48
        : 0;
    applyTransform();
  });

  mapView.addEventListener("click", () => {
    collection.dataset.view = "map";
    mapView.setAttribute("aria-pressed", "true");
    listView.setAttribute("aria-pressed", "false");
    syncControlAvailability();
  });
  listView.addEventListener("click", () => {
    zoom = 1;
    panX = 0;
    panY = 0;
    applyTransform();
    collection.dataset.view = "list";
    mapView.setAttribute("aria-pressed", "false");
    listView.setAttribute("aria-pressed", "true");
    syncControlAvailability();
  });
  mapView.setAttribute("aria-pressed", "true");
  listView.setAttribute("aria-pressed", "false");
  syncControlAvailability();

  zoomIn.addEventListener("click", () => {
    zoom = Math.min(1.4, Number((zoom + 0.2).toFixed(1)));
    applyTransform();
    syncControlAvailability();
  });
  zoomOut.addEventListener("click", () => {
    zoom = Math.max(0.8, Number((zoom - 0.2).toFixed(1)));
    applyTransform();
    syncControlAvailability();
  });
  center.addEventListener("click", () => {
    const current = buttons.find((button) => button.hasAttribute("aria-current"));
    if (!current) {
      return;
    }
    canvas.style.transition = "none";
    applyTransform();
    void canvas.offsetWidth;
    const viewportBounds = viewport.getBoundingClientRect();
    const currentBounds = current.getBoundingClientRect();
    panX +=
      (viewportBounds.left + viewportBounds.width / 2 -
        (currentBounds.left + currentBounds.width / 2));
    panY +=
      (viewportBounds.top + viewportBounds.height / 2 -
        (currentBounds.top + currentBounds.height / 2));
    applyTransform();
    void canvas.offsetWidth;
    canvas.style.removeProperty("transition");
    select(current.dataset.atlasLandmark ?? "", { focus: true });
  });

  const requested = new URL(window.location.href).searchParams.get("atlas");
  const current = atlas.regions
    .flatMap((region) => region.nodes)
    .find((node) => node.current);
  const first = atlas.regions[0]?.nodes[0];
  const selected = atlas.regions
    .flatMap((region) => region.nodes)
    .some((node) => node.id === requested)
    ? requested
    : current?.id ?? first?.id;
  if (selected) {
    select(selected, { updateUrl: false });
  }
  applyTransform();
}

const ATLAS_REGION_IDS = ["foundation", "developing", "capable", "advanced", "mastery"];
// Hand-cut outlines, each with its landmark stamp and Gate flag, in Region order.
const ATLAS_TERRITORIES = Object.freeze([
  { d: "M42 96 L120 40 L212 58 L248 128 L212 204 L120 222 L52 170 Z", stamp: [140, 128], gate: [236, 122] },
  { d: "M330 118 L402 52 L508 66 L536 128 L498 226 L392 240 L318 188 Z", stamp: [420, 146], gate: [500, 96] },
  { d: "M628 72 L722 34 L834 70 L862 146 L806 214 L700 226 L640 170 Z", stamp: [740, 136], gate: [806, 88] },
  { d: "M414 332 L492 274 L592 300 L622 370 L576 452 L480 470 L414 412 Z", stamp: [520, 372], gate: [606, 326] },
  { d: "M62 352 L150 300 L260 326 L286 398 L240 486 L144 500 L70 440 Z", stamp: [158, 408], gate: [270, 346] }
]);

/**
 * Returns the Atlas illustration as SVG markup. Equal Region ids give equal markup.
 * An unknown Region id draws the neutral wash. The CSS owns every fill, so the markup carries no inline style.
 * @param {readonly string[]} regionIds one Region id per territory, in Region order
 * @returns {string}
 */
export function renderAtlasIllustrationMarkup(regionIds) {
  const territories = ATLAS_TERRITORIES.map(({ d, stamp, gate }, index) => {
    const regionId = regionIds[index];
    const region = ATLAS_REGION_IDS.includes(regionId) ? ` data-region="${regionId}"` : "";
    const [sx, sy] = stamp;
    const [gx, gy] = gate;
    return [
      `<path class="atlas-illustration__territory" data-atlas-region-art${region} d="${d}"/>`,
      `<path class="atlas-illustration__stamp" d="M${sx} ${sy - 12} L${sx + 9} ${sy} L${sx} ${sy + 12} L${sx - 9} ${sy} Z"/>`,
      `<path class="atlas-illustration__gate" d="M${gx} ${gy + 30} V${gy} L${gx + 16} ${gy + 6} L${gx} ${gy + 12}"/>`
    ].join("");
  }).join("");
  return `<svg class="atlas-illustration" data-atlas-illustration aria-hidden="true" viewBox="0 0 900 620" preserveAspectRatio="none"><path class="atlas-illustration__trail" d="M130 155 C250 70 330 210 440 145 S650 80 770 170 C690 270 585 305 500 385 S285 540 145 445"/>${territories}</svg>`;
}

function createAtlasIllustration() {
  const template = document.createElement("template");
  template.innerHTML = renderAtlasIllustrationMarkup(ATLAS_REGION_IDS);
  return /** @type {Element} */ (template.content.firstElementChild);
}

/**
 * @param {HTMLElement} detail
 * @param {QuestAtlas["regions"][number]["nodes"][number]} node
 * @param {{
 *   onContinue: () => void,
 *   onWatchTrail: (landmarkId: string) => void,
 *   onWorkshop: (
 *     selection: { levelId: string, difficultyBand: string }
 *   ) => void,
 *   levelId: string,
 *   close: () => void
 * }} options
 */
function renderDetail(
  detail,
  node,
  { onContinue, onWatchTrail, onWorkshop, levelId, close }
) {
  const kicker = document.createElement("span");
  kicker.className = "section-label";
  kicker.textContent = node.difficultyBand;
  const title = document.createElement("h3");
  title.dataset.atlasDetailTitle = "";
  title.textContent = `Labyrinth ${node.labyrinthNumber}`;
  const state = document.createElement("strong");
  state.textContent = node.stateLabel;
  const facts = document.createElement("dl");
  facts.className = "atlas-detail__facts";
  appendFact(facts, "Difficulty Band", node.difficultyBand);
  appendFact(facts, "Gate Warden", node.milestone ? "Milestone" : "No");
  appendFact(facts, "Learning focus", node.learningFocus);
  const note = document.createElement("p");
  note.className = "atlas-detail__note";
  note.textContent = node.fieldNote;
  detail.replaceChildren(kicker, title, state, facts, note);
  if (node.storylet) {
    const storylet = document.createElement("section");
    storylet.className = "atlas-detail__storylet";
    storylet.dataset.atlasStorylet = node.storylet.id;
    const storyletLabel = document.createElement("span");
    storyletLabel.className = "section-label";
    storyletLabel.textContent = `${node.storylet.beat} beat`;
    const storyletTitle = document.createElement("h4");
    storyletTitle.dataset.atlasStoryletTitle = "";
    storyletTitle.textContent = node.storylet.title;
    const storyletBody = document.createElement("p");
    storyletBody.textContent = node.storylet.body;
    const storyletTie = document.createElement("p");
    storyletTie.dataset.atlasStoryletTie = "";
    storyletTie.textContent = `Gameplay tie: ${node.storylet.gameplayTie}`;
    storylet.append(storyletLabel, storyletTitle, storyletBody, storyletTie);
    detail.append(storylet);
  }
  if (node.fossils.length > 0) {
    const fossilSection = document.createElement("section");
    fossilSection.className = "atlas-detail__fossils";
    fossilSection.dataset.atlasFossils = "";
    const fossilHeading = document.createElement("h4");
    fossilHeading.textContent = node.fossils.length === 1
      ? "Echo Fossil"
      : "Echo Fossils";
    const fossilList = document.createElement("ul");
    fossilList.className = "atlas-detail__fossil-list";
    for (const fossil of node.fossils) {
      const fossilItem = document.createElement("li");
      fossilItem.dataset.atlasFossil = fossil.fossilId;
      const stamp = document.createElement("span");
      stamp.className = "atlas-fossil-stamp";
      stamp.dataset.visualStamp = fossil.visualStampId;
      stamp.textContent = fossil.wardenOutcome === "escaped-the-wardens"
        ? "Trail kept — escaped"
        : "Trail kept — defeated";
      const fossilNote = document.createElement("p");
      fossilNote.textContent = fossil.fieldNote;
      fossilItem.append(stamp, fossilNote);
      fossilList.append(fossilItem);
    }
    fossilSection.append(fossilHeading, fossilList);
    detail.append(fossilSection);
  }
  if (node.current) {
    const action = controlButton("Continue Quest");
    action.classList.add("primary-button");
    action.dataset.atlasDetailAction = "";
    action.addEventListener("click", () => {
      onContinue();
      close();
    });
    detail.append(action);
  } else if (node.watchTrailAvailable) {
    const action = controlButton("Watch Trail");
    action.classList.add("primary-button");
    action.dataset.atlasWatchTrail = "";
    action.addEventListener("click", () => {
      onWatchTrail(node.id);
    });
    detail.append(action);
  } else {
    const preview = document.createElement("p");
    preview.className = "atlas-detail__availability";
    preview.textContent = node.completed
      ? "Completed landmark. No retained Trail is available."
      : "Preview only. Continue the current Labyrinth to reach this landmark.";
    detail.append(preview);
  }
  const workshop = controlButton("Open Workshop");
  workshop.dataset.atlasWorkshop = "";
  workshop.addEventListener("click", () => {
    onWorkshop({
      levelId,
      difficultyBand: node.difficultyBandId
    });
    close();
  });
  detail.append(workshop);
}

/**
 * @param {HTMLDListElement} list
 * @param {string} term
 * @param {string} description
 */
function appendFact(list, term, description) {
  const dt = document.createElement("dt");
  dt.textContent = term;
  const dd = document.createElement("dd");
  dd.textContent = description;
  list.append(dt, dd);
}

/** @param {string} label */
function controlButton(label) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "control-button";
  button.textContent = label;
  return button;
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
