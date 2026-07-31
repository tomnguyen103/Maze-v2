/**
 * Daily Trail Constellation threshold policy.
 *
 * The numbers are the contract's, not an implementation detail: ADR 0033 fixes
 * 20 distinct contributors before a Daily publishes at all, 5 before any one
 * position becomes visible, and 10 new contributors before the published
 * snapshot advances. They live here rather than in SQL so each boundary can be
 * proved by test; the migration re-applies the same gates as defence in depth.
 *
 * @typedef {"quiet" | "glowing" | "bright"} ConstellationBand
 * @typedef {{
 *   kind: "cell" | "passage" | "pulse",
 *   x: number,
 *   y: number,
 *   contributorCount: number
 * }} ConstellationCounter
 * @typedef {{
 *   kind: "cell" | "passage" | "pulse",
 *   x: number,
 *   y: number,
 *   band: ConstellationBand
 * }} ConstellationMarker
 */

export const CONSTELLATION_PUBLISH_THRESHOLD = 20;
export const CONSTELLATION_MARKER_THRESHOLD = 5;
export const CONSTELLATION_BATCH_THRESHOLD = 10;

/**
 * A published snapshot only advances once a whole batch of new contributors
 * has arrived, so no single escape can be seen as a single-Explorer delta.
 *
 * @param {{ contributors: number, published: number }} counts
 */
export function shouldPublishBatch({ contributors, published }) {
  return contributors - published >= CONSTELLATION_BATCH_THRESHOLD;
}

/**
 * Turns published density counts into the three bands the surface may show.
 * Counts never leave this function: a marker carries its band and nothing
 * else, and a Daily that cannot show at least one marker is reported as still
 * forming rather than as a sparse map.
 *
 * @param {{
 *   publishedContributors: number,
 *   markers: ConstellationCounter[]
 * }} input
 * @returns {{ published: boolean, markers: ConstellationMarker[] }}
 */
export function projectConstellation({ publishedContributors, markers }) {
  const unpublished = { published: false, markers: [] };
  if (publishedContributors < CONSTELLATION_PUBLISH_THRESHOLD) {
    return unpublished;
  }
  const visible = markers.filter(
    (marker) => marker.contributorCount >= CONSTELLATION_MARKER_THRESHOLD
  );
  if (visible.length === 0) {
    return unpublished;
  }
  const peak = visible.reduce(
    (highest, marker) => Math.max(highest, marker.contributorCount),
    0
  );
  return {
    published: true,
    markers: visible.map((marker) => ({
      kind: marker.kind,
      x: marker.x,
      y: marker.y,
      band: band(marker.contributorCount, peak)
    }))
  };
}

/**
 * @param {number} count
 * @param {number} peak
 * @returns {ConstellationBand}
 */
function band(count, peak) {
  if (count * 3 >= peak * 2) {
    return "bright";
  }
  if (count * 3 >= peak) {
    return "glowing";
  }
  return "quiet";
}
