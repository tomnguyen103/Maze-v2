import {
  getDifficultyBand,
  isGateWardenMilestone
} from "../questions/quest-levels.js";
import { compareKeys } from "./compare-keys.js";

export const ECHO_FOSSIL_VERSION = 1;
export const MAX_FOSSILS_PER_QUEST = 40;

const FOSSIL_ID_PATTERN =
  /^fossil_[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const QUEST_ID_PATTERN = /^quest_[a-z0-9_-]{7,92}$/i;
const REGION_IDS = new Set([
  "foundation",
  "developing",
  "capable",
  "advanced",
  "mastery"
]);
const JOURNEY_STATES = new Set([
  "region-opening",
  "region-trail",
  "gate-milestone",
  "quest-complete"
]);
const WARDEN_OUTCOMES = new Set([
  "escaped-the-wardens",
  "warden-prevails"
]);
const FOSSIL_KEYS = [
  "version",
  "fossilId",
  "questId",
  "labyrinthNumber",
  "atlasRegionId",
  "regionMotif",
  "journeyState",
  "wardenOutcome",
  "fieldNoteId",
  "fieldNote",
  "visualStampId"
];
const COLLECTION_KEYS = ["version", "questId", "fossils"];

/** @typedef {"escaped" | "defeated"} FossilOutcome */
/** @typedef {"region-opening" | "region-trail" | "gate-milestone" | "quest-complete"} FossilJourneyState */
/** @typedef {"escaped-the-wardens" | "warden-prevails"} FossilWardenOutcome */
/**
 * @typedef {{
 *   version: 1,
 *   fossilId: string,
 *   questId: string,
 *   labyrinthNumber: number,
 *   atlasRegionId: string,
 *   regionMotif: string,
 *   journeyState: FossilJourneyState,
 *   wardenOutcome: FossilWardenOutcome,
 *   fieldNoteId: string,
 *   fieldNote: string,
 *   visualStampId: string
 * }} EchoFossil
 */
/**
 * @typedef {{ version: 1, questId: string, fossils: EchoFossil[] }} FossilCollection
 */

/** @type {readonly Record<string, string>[]} */
const REVIEWED_CATALOG = Object.freeze([
  {
    atlasRegionId: "foundation",
    regionMotif: "Lantern moss and quiet stone",
    visualStampId: "foundation-lantern-mark",
    outcome: "escaped",
    fieldNoteId: "foundation-escaped-v1",
    fieldNote: "The first Gate Warden yields to a steady trail."
  },
  {
    atlasRegionId: "foundation",
    regionMotif: "Lantern moss and quiet stone",
    visualStampId: "foundation-lantern-mark",
    outcome: "defeated",
    fieldNoteId: "foundation-defeated-v1",
    fieldNote: "The quiet stones remember where the trail turned difficult."
  },
  {
    atlasRegionId: "developing",
    regionMotif: "Rising wind and bright trail ribbons",
    visualStampId: "developing-ribbon-mark",
    outcome: "escaped",
    fieldNoteId: "developing-escaped-v1",
    fieldNote: "Bright ribbons carry a careful Explorer into open wind."
  },
  {
    atlasRegionId: "developing",
    regionMotif: "Rising wind and bright trail ribbons",
    visualStampId: "developing-ribbon-mark",
    outcome: "defeated",
    fieldNoteId: "developing-defeated-v1",
    fieldNote: "The wind keeps a place for the next brave attempt."
  },
  {
    atlasRegionId: "capable",
    regionMotif: "Joined arches and clear blue spans",
    visualStampId: "capable-arch-mark",
    outcome: "escaped",
    fieldNoteId: "capable-escaped-v1",
    fieldNote: "Joined arches turn separate steps into one clear crossing."
  },
  {
    atlasRegionId: "capable",
    regionMotif: "Joined arches and clear blue spans",
    visualStampId: "capable-arch-mark",
    outcome: "defeated",
    fieldNoteId: "capable-defeated-v1",
    fieldNote: "Even a hard crossing leaves a useful mark on the Atlas."
  },
  {
    atlasRegionId: "advanced",
    regionMotif: "Sea-glass channels and alternating tide marks",
    visualStampId: "advanced-tide-mark",
    outcome: "escaped",
    fieldNoteId: "advanced-escaped-v1",
    fieldNote: "The turning tide opens for an Explorer who keeps listening."
  },
  {
    atlasRegionId: "advanced",
    regionMotif: "Sea-glass channels and alternating tide marks",
    visualStampId: "advanced-tide-mark",
    outcome: "defeated",
    fieldNoteId: "advanced-defeated-v1",
    fieldNote: "The tide marks hold the shape of a lesson without naming one."
  },
  {
    atlasRegionId: "mastery",
    regionMotif: "Beacon bells and resonant stone",
    visualStampId: "mastery-beacon-mark",
    outcome: "escaped",
    fieldNoteId: "mastery-escaped-v1",
    fieldNote: "The last beacon answers a trail carried all the way home."
  },
  {
    atlasRegionId: "mastery",
    regionMotif: "Beacon bells and resonant stone",
    visualStampId: "mastery-beacon-mark",
    outcome: "defeated",
    fieldNoteId: "mastery-defeated-v1",
    fieldNote: "Resonant stone keeps the memory of a trail not yet finished."
  }
]);

/** @returns {readonly Record<string, string>[]} */
export function getReviewedFossilCatalog() {
  return REVIEWED_CATALOG.map((entry) => ({ ...entry }));
}

/**
 * @param {{
 *   questId: string,
 *   labyrinthNumber: number,
 *   atlasRegionId: string,
 *   outcome: FossilOutcome,
 *   fossilId?: string
 * }} input
 * @returns {EchoFossil}
 */
export function createEchoFossil(input) {
  const fossilId = input.fossilId ?? createFossilId();
  const candidate = {
    version: ECHO_FOSSIL_VERSION,
    fossilId,
    questId: input.questId,
    labyrinthNumber: input.labyrinthNumber,
    atlasRegionId: input.atlasRegionId,
    regionMotif: "",
    journeyState: journeyStateFor(input.labyrinthNumber),
    wardenOutcome:
      input.outcome === "escaped"
        ? "escaped-the-wardens"
        : "warden-prevails",
    fieldNoteId: "",
    fieldNote: "",
    visualStampId: ""
  };
  const entry = catalogEntry(input.atlasRegionId, input.outcome);
  if (!entry) {
    throw new Error("Echo Fossil inputs do not match reviewed content.");
  }
  candidate.regionMotif = entry.regionMotif;
  candidate.fieldNoteId = entry.fieldNoteId;
  candidate.fieldNote = entry.fieldNote;
  candidate.visualStampId = entry.visualStampId;
  const normalized = normalizeEchoFossil(candidate);
  if (!normalized) {
    throw new Error("Echo Fossil inputs are invalid.");
  }
  return normalized;
}

/** @param {unknown} value @returns {EchoFossil | null} */
export function normalizeEchoFossil(value) {
  if (!isRecord(value) || !hasExactKeys(value, FOSSIL_KEYS)) {
    return null;
  }
  const fossil = /** @type {Record<string, unknown>} */ (value);
  if (
    fossil.version !== ECHO_FOSSIL_VERSION ||
    typeof fossil.fossilId !== "string" ||
    !FOSSIL_ID_PATTERN.test(fossil.fossilId) ||
    typeof fossil.questId !== "string" ||
    !QUEST_ID_PATTERN.test(fossil.questId) ||
    !Number.isInteger(fossil.labyrinthNumber) ||
    Number(fossil.labyrinthNumber) < 1 ||
    Number(fossil.labyrinthNumber) > 20 ||
    typeof fossil.atlasRegionId !== "string" ||
    !REGION_IDS.has(fossil.atlasRegionId) ||
    typeof fossil.regionMotif !== "string" ||
    typeof fossil.journeyState !== "string" ||
    !JOURNEY_STATES.has(fossil.journeyState) ||
    typeof fossil.wardenOutcome !== "string" ||
    !WARDEN_OUTCOMES.has(fossil.wardenOutcome) ||
    typeof fossil.fieldNoteId !== "string" ||
    typeof fossil.fieldNote !== "string" ||
    typeof fossil.visualStampId !== "string"
  ) {
    return null;
  }
  const expectedRegion = getDifficultyBand(Number(fossil.labyrinthNumber)).id;
  const outcome = outcomeForWarden(
    /** @type {FossilWardenOutcome} */ (fossil.wardenOutcome)
  );
  const entry = catalogEntry(fossil.atlasRegionId, outcome);
  if (
    expectedRegion !== fossil.atlasRegionId ||
    journeyStateFor(Number(fossil.labyrinthNumber)) !== fossil.journeyState ||
    !entry ||
    entry.regionMotif !== fossil.regionMotif ||
    entry.fieldNoteId !== fossil.fieldNoteId ||
    entry.fieldNote !== fossil.fieldNote ||
    entry.visualStampId !== fossil.visualStampId
  ) {
    return null;
  }
  return {
    version: ECHO_FOSSIL_VERSION,
    fossilId: fossil.fossilId,
    questId: fossil.questId,
    labyrinthNumber: Number(fossil.labyrinthNumber),
    atlasRegionId: fossil.atlasRegionId,
    regionMotif: fossil.regionMotif,
    journeyState: /** @type {FossilJourneyState} */ (fossil.journeyState),
    wardenOutcome: /** @type {FossilWardenOutcome} */ (fossil.wardenOutcome),
    fieldNoteId: fossil.fieldNoteId,
    fieldNote: fossil.fieldNote,
    visualStampId: fossil.visualStampId
  };
}

/** @param {string} questId @returns {FossilCollection} */
export function createFossilCollection(questId) {
  if (!QUEST_ID_PATTERN.test(questId)) {
    throw new Error("Fossil Collection needs a valid Quest ID.");
  }
  return { version: ECHO_FOSSIL_VERSION, questId, fossils: [] };
}

/** @param {unknown} value @returns {FossilCollection | null} */
export function normalizeFossilCollection(value) {
  if (!isRecord(value) || !hasExactKeys(value, COLLECTION_KEYS)) {
    return null;
  }
  const collection = /** @type {Record<string, unknown>} */ (value);
  if (
    collection.version !== ECHO_FOSSIL_VERSION ||
    typeof collection.questId !== "string" ||
    !QUEST_ID_PATTERN.test(collection.questId) ||
    !Array.isArray(collection.fossils) ||
    collection.fossils.length > MAX_FOSSILS_PER_QUEST
  ) {
    return null;
  }
  const fossils = collection.fossils
    .map(normalizeEchoFossil)
    .filter((fossil) => fossil !== null);
  if (
    fossils.length !== collection.fossils.length ||
    new Set(fossils.map((fossil) => fossil.fossilId)).size !== fossils.length ||
    fossils.some((fossil) => fossil.questId !== collection.questId)
  ) {
    return null;
  }
  return {
    version: ECHO_FOSSIL_VERSION,
    questId: collection.questId,
    fossils: [...fossils].sort(compareFossils)
  };
}

/**
 * @param {FossilCollection} collection
 * @param {EchoFossil} fossil
 * @returns {FossilCollection}
 */
export function addEchoFossil(collection, fossil) {
  const normalizedCollection = normalizeFossilCollection(collection);
  const normalizedFossil = normalizeEchoFossil(fossil);
  if (!normalizedCollection || !normalizedFossil) {
    throw new Error("Cannot add an invalid Echo Fossil.");
  }
  if (normalizedCollection.questId !== normalizedFossil.questId) {
    throw new Error("Echo Fossil belongs to a different Quest.");
  }
  const existing = normalizedCollection.fossils.find(
    (candidate) => candidate.fossilId === normalizedFossil.fossilId
  );
  if (existing) {
    if (JSON.stringify(existing) !== JSON.stringify(normalizedFossil)) {
      throw new Error("Echo Fossil ID already contains different content.");
    }
    return normalizedCollection;
  }
  if (normalizedCollection.fossils.length >= MAX_FOSSILS_PER_QUEST) {
    return normalizedCollection;
  }
  return {
    ...normalizedCollection,
    fossils: [...normalizedCollection.fossils, normalizedFossil]
      .sort(compareFossils)
  };
}

/**
 * @param {FossilCollection} local
 * @param {FossilCollection} cloud
 * @returns {FossilCollection}
 */
export function mergeEchoFossilCollections(local, cloud) {
  const normalizedLocal = normalizeFossilCollection(local);
  const normalizedCloud = normalizeFossilCollection(cloud);
  if (!normalizedLocal || !normalizedCloud) {
    throw new Error("Fossil Collection merge requires valid records.");
  }
  if (normalizedLocal.questId !== normalizedCloud.questId) {
    throw new Error("Fossil Collections belong to different Quests.");
  }
  const byId = new Map();
  for (const fossil of [
    ...normalizedCloud.fossils,
    ...normalizedLocal.fossils
  ]) {
    const existing = byId.get(fossil.fossilId);
    if (existing && JSON.stringify(existing) !== JSON.stringify(fossil)) {
      throw new Error("Fossil Collection contains conflicting content.");
    }
    byId.set(fossil.fossilId, fossil);
  }
  return {
    version: ECHO_FOSSIL_VERSION,
    questId: normalizedLocal.questId,
    fossils: [...byId.values()].sort(compareFossils)
      .slice(0, MAX_FOSSILS_PER_QUEST)
  };
}

/**
 * @param {FossilCollection | null | undefined} collection
 * @param {number} labyrinthNumber
 */
export function fossilsForLabyrinth(collection, labyrinthNumber) {
  const normalized = normalizeFossilCollection(collection);
  if (!normalized || !Number.isInteger(labyrinthNumber)) {
    return [];
  }
  return normalized.fossils.filter(
    (fossil) => fossil.labyrinthNumber === labyrinthNumber
  );
}

/** @param {number} labyrinthNumber @returns {FossilJourneyState} */
function journeyStateFor(labyrinthNumber) {
  if (labyrinthNumber === 20) {
    return "quest-complete";
  }
  if (isGateWardenMilestone(labyrinthNumber)) {
    return "gate-milestone";
  }
  return labyrinthNumber <= 3 ? "region-opening" : "region-trail";
}

/** @param {FossilWardenOutcome} outcome */
function outcomeForWarden(outcome) {
  return outcome === "escaped-the-wardens" ? "escaped" : "defeated";
}

/** @param {string} regionId @param {FossilOutcome} outcome */
function catalogEntry(regionId, outcome) {
  return REVIEWED_CATALOG.find(
    (entry) => entry.atlasRegionId === regionId && entry.outcome === outcome
  ) ?? null;
}

/** @returns {string} */
function createFossilId() {
  const uuid = globalThis.crypto?.randomUUID?.();
  if (!uuid) {
    throw new Error("Echo Fossil identity is unavailable.");
  }
  return `fossil_${uuid}`;
}

/** @param {unknown} value @returns {value is Record<string, unknown>} */
function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

/** @param {Record<string, unknown>} value @param {string[]} keys */
function hasExactKeys(value, keys) {
  const actual = Object.keys(value).sort();
  return JSON.stringify(actual) === JSON.stringify([...keys].sort());
}

/** @param {EchoFossil} left @param {EchoFossil} right */
function compareFossils(left, right) {
  return compareKeys(left.fossilId, right.fossilId);
}
