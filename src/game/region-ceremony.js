const REGION_CEREMONY_STORAGE_KEY = "echo-maze:region-ceremonies:v1";

/**
 * @typedef {{
 *   getItem(key: string): string | null,
 *   setItem(key: string, value: string): void
 * }} RegionCeremonyStorage
 */

/**
 * Claim the full ceremony for one Region in the active Quest. This is
 * presentation state only; it never enters Quest Progress or Run identity.
 *
 * @param {string} questId
 * @param {string} regionId
 * @param {RegionCeremonyStorage} [storage]
 * @returns {"full" | "compact"}
 */
export function claimRegionCeremony(
  questId,
  regionId,
  storage = globalThis.localStorage
) {
  let seenRegionIds = [];
  try {
    const candidate = JSON.parse(
      storage.getItem(REGION_CEREMONY_STORAGE_KEY) ?? "null"
    );
    if (
      candidate &&
      typeof candidate === "object" &&
      candidate.version === 1 &&
      candidate.questId === questId &&
      Array.isArray(candidate.seenRegionIds)
    ) {
      seenRegionIds = candidate.seenRegionIds.filter(
        /** @param {unknown} value */ (value) => typeof value === "string"
      );
    }
  } catch {
    // Storage failures may replay presentation, but never block the Run result.
  }

  if (seenRegionIds.includes(regionId)) {
    return "compact";
  }

  try {
    storage.setItem(
      REGION_CEREMONY_STORAGE_KEY,
      JSON.stringify({
        version: 1,
        questId,
        seenRegionIds: [...seenRegionIds, regionId]
      })
    );
  } catch {
    // Storage failures may replay presentation, but never block the Run result.
  }
  return "full";
}
