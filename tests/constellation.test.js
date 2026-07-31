import { describe, expect, it } from "vitest";
import {
  CONSTELLATION_BATCH_THRESHOLD,
  CONSTELLATION_MARKER_THRESHOLD,
  CONSTELLATION_PUBLISH_THRESHOLD,
  projectConstellation,
  shouldPublishBatch
} from "../shared/constellation.js";

/**
 * @param {number} count
 * @returns {import("../shared/constellation.js").ConstellationCounter[]}
 */
function markersAt(count) {
  return [
    { kind: "cell", x: 1, y: 1, contributorCount: count },
    { kind: "cell", x: 3, y: 1, contributorCount: count }
  ];
}

describe("Daily Trail Constellation thresholds", () => {
  it("names the three thresholds the contract fixes", () => {
    expect(CONSTELLATION_PUBLISH_THRESHOLD).toBe(20);
    expect(CONSTELLATION_MARKER_THRESHOLD).toBe(5);
    expect(CONSTELLATION_BATCH_THRESHOLD).toBe(10);
  });

  it("publishes nothing at 19 contributors and publishes at 20", () => {
    const below = projectConstellation({
      publishedContributors: 19,
      markers: markersAt(19)
    });
    const at = projectConstellation({
      publishedContributors: 20,
      markers: markersAt(20)
    });

    expect(below.published).toBe(false);
    expect(below.markers).toEqual([]);
    expect(at.published).toBe(true);
    expect(at.markers).toHaveLength(2);
  });

  it("suppresses a marker at 4 contributors and shows it at 5", () => {
    const projection = projectConstellation({
      publishedContributors: 20,
      markers: [
        { kind: "cell", x: 1, y: 1, contributorCount: 4 },
        { kind: "cell", x: 3, y: 1, contributorCount: 5 }
      ]
    });

    expect(projection.markers).toEqual([
      { kind: "cell", x: 3, y: 1, band: "bright" }
    ]);
  });

  it("holds the published batch until ten new contributors arrive", () => {
    expect(shouldPublishBatch({ contributors: 9, published: 0 })).toBe(false);
    expect(shouldPublishBatch({ contributors: 10, published: 0 })).toBe(true);
    expect(shouldPublishBatch({ contributors: 29, published: 20 })).toBe(false);
    expect(shouldPublishBatch({ contributors: 30, published: 20 })).toBe(true);
  });

  it("renders three bands relative to the busiest visible marker", () => {
    const projection = projectConstellation({
      publishedContributors: 40,
      markers: [
        { kind: "cell", x: 1, y: 1, contributorCount: 30 },
        { kind: "cell", x: 3, y: 1, contributorCount: 15 },
        { kind: "passage", x: 2, y: 1, contributorCount: 9 },
        { kind: "pulse", x: 5, y: 5, contributorCount: 5 }
      ]
    });

    expect(projection.markers.map((marker) => marker.band)).toEqual([
      "bright",
      "glowing",
      "quiet",
      "quiet"
    ]);
  });

  it("never lets a count, ratio, or identity into the projection", () => {
    const projection = projectConstellation({
      publishedContributors: 25,
      markers: markersAt(12)
    });

    for (const marker of projection.markers) {
      expect(Object.keys(marker).sort()).toEqual(["band", "kind", "x", "y"]);
    }
    expect(Object.keys(projection).sort()).toEqual(["markers", "published"]);
  });

  it("treats a published Daily with every marker suppressed as forming", () => {
    const projection = projectConstellation({
      publishedContributors: 40,
      markers: markersAt(4)
    });

    expect(projection.published).toBe(false);
    expect(projection.markers).toEqual([]);
  });

  it("cannot reconstruct one Explorer's path from a small cohort", () => {
    // A cohort of exactly the publication threshold where one Explorer walked
    // a corridor nobody else touched. Their private cells sit at one
    // contributor each and are suppressed; only the shared spine survives, so
    // subtracting their own known path from the projection yields nothing.
    /** @type {import("../shared/constellation.js").ConstellationCounter[]} */
    const shared = [
      { kind: "cell", x: 1, y: 1, contributorCount: 20 },
      { kind: "cell", x: 3, y: 1, contributorCount: 18 }
    ];
    /** @type {import("../shared/constellation.js").ConstellationCounter[]} */
    const soloCorridor = [
      { kind: "cell", x: 9, y: 9, contributorCount: 1 },
      { kind: "cell", x: 11, y: 9, contributorCount: 1 },
      { kind: "pulse", x: 11, y: 9, contributorCount: 1 }
    ];

    const projection = projectConstellation({
      publishedContributors: 20,
      markers: [...shared, ...soloCorridor]
    });

    expect(projection.published).toBe(true);
    for (const marker of soloCorridor) {
      expect(
        projection.markers.some(
          (visible) =>
            visible.kind === marker.kind &&
            visible.x === marker.x &&
            visible.y === marker.y
        )
      ).toBe(false);
    }
  });
});
