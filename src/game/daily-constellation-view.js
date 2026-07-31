/**
 * Daily Trail Constellation projection surface.
 *
 * Shows where today's Explorers walked as three density bands over the Daily
 * Labyrinth. It receives a projection that already carries nothing but band
 * labels — no counts, no percentages, no identities, no times — so this module
 * has nothing to redact; its job is to render bands and to say plainly when
 * there is not yet enough shared movement to show anything at all.
 *
 * @typedef {import("../../shared/constellation.js").ConstellationMarker} ConstellationMarker
 */

export const CONSTELLATION_FORMING_MESSAGE = "Paths are still forming.";
const READY_MESSAGE = "Today’s shared paths are showing.";
const LOADING_MESSAGE = "Reading today’s Constellation…";
const UNAVAILABLE_MESSAGE =
  "The Constellation could not be loaded. Your Daily result is unaffected.";
const MAP_LABEL =
  "Daily Trail Constellation: shared paths shown as three density bands.";

/**
 * @param {{ map: HTMLElement, status: HTMLElement }} elements
 */
export function createDailyConstellationView({ map, status }) {
  map.setAttribute("aria-label", MAP_LABEL);

  return { render, renderLoading, renderUnavailable };

  function renderLoading() {
    clear();
    status.textContent = LOADING_MESSAGE;
  }

  function renderUnavailable() {
    clear();
    status.textContent = UNAVAILABLE_MESSAGE;
  }

  /**
   * @param {{ published: boolean, markers: ConstellationMarker[] }} projection
   * @param {{ size: number }} labyrinth
   */
  function render(projection, { size }) {
    clear();
    if (!projection.published || projection.markers.length === 0) {
      status.textContent = CONSTELLATION_FORMING_MESSAGE;
      return;
    }
    map.style.setProperty("--constellation-size", String(size));
    map.append(
      ...projection.markers.map((marker) => {
        const tile = document.createElement("span");
        tile.className = "daily-constellation__tile";
        tile.dataset.band = marker.band;
        tile.dataset.kind = marker.kind;
        // Coerced here as well as in the store: this is the one hop where a
        // response value reaches a CSS custom property.
        tile.style.setProperty("--constellation-x", String(Number(marker.x)));
        tile.style.setProperty("--constellation-y", String(Number(marker.y)));
        // The map is one image to assistive technology; a per-tile label
        // would read out geometry an Explorer cannot act on.
        tile.setAttribute("aria-hidden", "true");
        return tile;
      })
    );
    map.hidden = false;
    status.textContent = READY_MESSAGE;
  }

  function clear() {
    map.replaceChildren();
    map.hidden = true;
  }
}
