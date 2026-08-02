import {
  CONSTELLATION_MARKER_THRESHOLD,
  CONSTELLATION_PUBLISH_THRESHOLD,
  constellationBand
} from "./constellation.js";

/**
 * Class Constellation deliberately reuses the Daily threshold policy while
 * projecting fixed Class Expedition milestones instead of maze positions.
 * The input counts stay server-side; this result is the only shape the
 * Classroom route may serialize.
 *
 * @typedef {{ labyrinthNumber: number, contributorCount: number }} ClassMarkerCount
 * @typedef {{ labyrinthNumber: number, band: "quiet" | "glowing" | "bright" }} ClassConstellationMarker
 */

export const CLASS_CONSTELLATION_PUBLISH_THRESHOLD =
  CONSTELLATION_PUBLISH_THRESHOLD;
export const CLASS_CONSTELLATION_MARKER_THRESHOLD =
  CONSTELLATION_MARKER_THRESHOLD;

/**
 * @param {{
 *   escapedStudentCount: number,
 *   markers: ClassMarkerCount[]
 * }} input
 * @returns {{ published: boolean, markers: ClassConstellationMarker[] }}
 */
export function projectClassConstellation({ escapedStudentCount, markers }) {
  const forming = { published: false, markers: [] };
  if (escapedStudentCount < CLASS_CONSTELLATION_PUBLISH_THRESHOLD) {
    return forming;
  }

  const visible = markers
    .filter(
      (marker) =>
        Number.isInteger(marker.labyrinthNumber) &&
        marker.labyrinthNumber >= 1 &&
        marker.labyrinthNumber <= 20 &&
        Number.isFinite(marker.contributorCount) &&
        marker.contributorCount >= CLASS_CONSTELLATION_MARKER_THRESHOLD
    )
    .sort((left, right) => left.labyrinthNumber - right.labyrinthNumber);
  if (visible.length === 0) {
    return forming;
  }

  const peak = visible.reduce(
    (highest, marker) => Math.max(highest, marker.contributorCount),
    0
  );
  return {
    published: true,
    markers: visible.map((marker) => ({
      labyrinthNumber: marker.labyrinthNumber,
      band: constellationBand(marker.contributorCount, peak)
    }))
  };
}
