/** @type {Promise<ReturnType<typeof import("../daily-constellation-view.js").createDailyConstellationView>> | null} */
let viewPromise = null;
let viewRetry = false;
let failedTwice = false;

/**
 * Fills the Daily Constellation. Loaded when the Explorer first opens a Daily
 * with a recorded escape.
 * @param {{
 *   map: HTMLElement,
 *   status: HTMLElement,
 *   retry: HTMLButtonElement,
 *   load: () => Promise<Record<string, any>>,
 *   errorStatus: (error: unknown) => number,
 *   sizeFor: (daily: any) => number
 * }} parts
 * @param {{ date: string }} daily
 * @param {() => boolean} isStale
 */
export async function refreshDailyConstellation(parts, daily, isStale) {
  const { map, status, retry } = parts;
  /** @type {ReturnType<typeof import("../daily-constellation-view.js").createDailyConstellationView> | null} */
  let view = null;
  try {
    view = await loadView(parts);
    status.dataset.state = "";
    view.renderLoading();
    const projection = await parts.load();
    if (isStale()) {
      return;
    }
    if (projection.date !== daily.date) {
      // The UTC date turned over while the dialog was open. Rendering the new
      // Daily's map under the old heading would be a quiet lie.
      map.hidden = true;
      status.dataset.state = "error";
      status.textContent =
        "The UTC date changed. Reopen Daily for today’s Constellation.";
      return;
    }
    status.dataset.state = "";
    view.render(
      {
        published: projection.published === true,
        markers: Array.isArray(projection.markers) ? projection.markers : []
      },
      { size: parts.sizeFor(daily) }
    );
  } catch (error) {
    if (isStale()) {
      return;
    }
    // A chunk that will not load leaves no silent gap: the surface says so
    // and offers the retry, exactly like every other lazy view here.
    map.hidden = true;
    status.dataset.state = "error";
    status.textContent =
      view === null
        ? failedTwice
          ? "The Constellation is unavailable. Reload to try again."
          : "The Constellation could not be loaded. Your Daily result is unaffected."
        : parts.errorStatus(error) === 0
          ? "Network could not reach the Constellation. Your Daily result is unaffected."
          : "The Constellation is unavailable. Your Daily result is unaffected.";
    retry.hidden = failedTwice;
  }
}

/** @param {{ map: HTMLElement, status: HTMLElement }} parts */
function loadView({ map, status }) {
  if (!viewPromise) {
    const retrying = viewRetry;
    const viewModule = retrying
      // @ts-expect-error Vite treats the query as a distinct retry chunk.
      ? import("../daily-constellation-view.js?retry=1")
      : import("../daily-constellation-view.js");
    viewRetry = true;
    viewPromise = viewModule
      .then(({ createDailyConstellationView }) =>
        createDailyConstellationView({ map, status })
      )
      .catch((error) => {
        viewPromise = null;
        failedTwice ||= retrying;
        throw error;
      });
  }
  return viewPromise;
}
