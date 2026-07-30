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
  elements.progress.textContent =
    `${atlas.completedLabyrinths} of ${atlas.totalLabyrinths} Labyrinths mapped. ` +
    `${atlas.restoredSigils} of ${atlas.regions.length} Sigils restored. ` +
    milestoneGuidance;
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
        `${region.themeName} · ${region.rangeLabel} · ${region.motif}`;
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

function createAtlasIllustration() {
  const namespace = "http://www.w3.org/2000/svg";
  const illustration = document.createElementNS(namespace, "svg");
  illustration.classList.add("atlas-illustration");
  illustration.dataset.atlasIllustration = "";
  illustration.setAttribute("aria-hidden", "true");
  illustration.setAttribute("viewBox", "0 0 900 620");
  illustration.setAttribute("preserveAspectRatio", "none");

  const trail = document.createElementNS(namespace, "path");
  trail.classList.add("atlas-illustration__trail");
  trail.setAttribute(
    "d",
    "M130 155 C250 70 330 210 440 145 S650 80 770 170 " +
      "C690 270 585 305 500 385 S285 540 145 445"
  );
  illustration.append(trail);

  for (const pathData of [
    "M42 76 C95 18 210 34 248 102 C274 151 224 218 140 222 C58 226 8 145 42 76 Z",
    "M315 112 C362 44 486 50 531 121 C562 171 518 240 424 246 C338 252 278 181 315 112 Z",
    "M628 64 C706 16 829 55 858 133 C880 193 817 239 732 225 C646 211 580 112 628 64 Z",
    "M410 329 C469 270 582 285 616 354 C646 414 589 476 505 472 C420 468 356 384 410 329 Z",
    "M64 348 C127 286 250 306 282 380 C306 438 246 500 153 493 C66 486 18 393 64 348 Z"
  ]) {
    const region = document.createElementNS(namespace, "path");
    region.classList.add("atlas-illustration__region");
    region.dataset.atlasRegionArt = "";
    region.setAttribute("d", pathData);
    illustration.append(region);
  }
  return illustration;
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
