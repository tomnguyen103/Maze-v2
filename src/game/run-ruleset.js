import { getDifficultyBand } from "../questions/quest-levels.js";

export const CLASSIC_RULESET_REVISION = "classic-v1";

/** @type {Readonly<Record<string, Readonly<{ atlasRegionId: string, revision: string, label: string }>>>} */
const QUEST_RULESETS = Object.freeze({
  foundation: Object.freeze({
    atlasRegionId: "foundation",
    revision: "echo-hush-v1",
    label: "Echo Hush"
  }),
  developing: Object.freeze({
    atlasRegionId: "developing",
    revision: "windways-v1",
    label: "Windways"
  }),
  capable: Object.freeze({
    atlasRegionId: "capable",
    revision: "echo-bridges-v1",
    label: "Echo Bridges"
  }),
  advanced: Object.freeze({
    atlasRegionId: "advanced",
    revision: "tide-doors-v1",
    label: "Tide Doors"
  }),
  mastery: Object.freeze({
    atlasRegionId: "mastery",
    revision: "warden-bells-v1",
    label: "Warden Bells"
  })
});
const ATLAS_REGION_IDS = Object.freeze(Object.keys(QUEST_RULESETS));

/** @param {number} labyrinthNumber */
export function getClassicRunRuleset(labyrinthNumber) {
  return {
    atlasRegionId: getDifficultyBand(labyrinthNumber).id,
    revision: CLASSIC_RULESET_REVISION,
    label: "Classic Rules"
  };
}

/** @param {number} labyrinthNumber */
export function getQuestRunRuleset(labyrinthNumber) {
  const region = getDifficultyBand(labyrinthNumber).id;
  const ruleset = QUEST_RULESETS[region];
  if (!ruleset) {
    throw new Error("Atlas Region ruleset is unavailable.");
  }
  return { ...ruleset };
}

/**
 * Missing ruleset identity is legacy Classic Rules. Present identity must
 * describe the exact Atlas Region implied by the Labyrinth Number.
 *
 * @param {unknown} value
 * @param {number} labyrinthNumber
 */
export function normalizeRunRuleset(value, labyrinthNumber) {
  const classic = getClassicRunRuleset(labyrinthNumber);
  if (value === undefined || value === null) {
    return classic;
  }
  const normalized = normalizeKnownRunRuleset(value);
  return normalized?.atlasRegionId === classic.atlasRegionId
    ? normalized
    : null;
}

/** @param {unknown} value */
export function normalizeKnownRunRuleset(value) {
  if (!value || typeof value !== "object") {
    return null;
  }
  const candidate = /** @type {Record<string, unknown>} */ (value);
  if (
    typeof candidate.atlasRegionId !== "string" ||
    !ATLAS_REGION_IDS.includes(candidate.atlasRegionId)
  ) {
    return null;
  }
  if (candidate.revision === CLASSIC_RULESET_REVISION) {
    return {
      atlasRegionId: candidate.atlasRegionId,
      revision: CLASSIC_RULESET_REVISION,
      label: "Classic Rules"
    };
  }
  const quest = QUEST_RULESETS[candidate.atlasRegionId];
  return quest && candidate.revision === quest.revision ? quest : null;
}
