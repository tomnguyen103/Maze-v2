import { getLearningMetadata } from "./learning-objectives.js";
import { getBundledQuestion } from "./question-bank.js";
import { normalizeQuestion } from "./question-contract.js";
import {
  getDifficultyBand,
  getLabyrinthConfig,
  QUEST_LEVELS
} from "./quest-levels.js";
import { reviewedContentDigest } from "./reviewed-content-hash.js";
import {
  createReviewedQuestionRevisionId,
  reviewedQuestionPresentationDigest
} from "./reviewed-question-revision.js";

/** @typedef {ReturnType<typeof normalizeQuestion>} WardenQuestion */
/**
 * @typedef {{
 *   levelId: string,
 *   levelLabel: string,
 *   regionNumber: number,
 *   bandId: string,
 *   labyrinthStart: number,
 *   labyrinthEnd: number,
 *   correctFirstDemand: number,
 *   minimumFocusedQuestions: number
 * }} DemandRegion
 * @typedef {{
 *   levelId: string,
 *   levelLabel: string,
 *   correctFirstDemand: number,
 *   regions: DemandRegion[]
 * }} LevelDemand
 * @typedef {{
 *   levelId: string,
 *   regionNumber: number,
 *   bandId: string,
 *   labyrinthStart: number,
 *   labyrinthEnd: number,
 *   correctFirstDemand: number,
 *   minimumFocusedQuestions: number,
 *   focusedObjectiveIds: string[],
 *   normalQuestions: WardenQuestion[],
 *   capstoneQuestion: WardenQuestion
 * }} LearningDeckRegion
 * @typedef {{
 *   deckId: string,
 *   label: string,
 *   status: "published",
 *   kind: "mixed" | "focused",
 *   normalQuestionSource:
 *     | "unbounded-reviewed-mixed"
 *     | "finite-reviewed-focus",
 *   revisionId: string,
 *   regions: LearningDeckRegion[]
 * }} LearningDeckRevision
 */

const REGION_STARTS = Object.freeze([1, 5, 9, 13, 17]);

const DECK_DEFINITIONS = Object.freeze([
  Object.freeze({
    deckId: "mixed-trail",
    label: "Mixed Trail",
    kind: /** @type {"mixed"} */ ("mixed"),
    focusTopics: Object.freeze([]),
    revisionId: "deck:mixed-trail:v1:d0647e88de6cbe1dea606b07e468ab92"
  }),
  Object.freeze({
    deckId: "number-trail",
    label: "Number Trail",
    kind: /** @type {"focused"} */ ("focused"),
    focusTopics: Object.freeze([
      "arithmetic",
      "fractions",
      "geometry",
      "patterns"
    ]),
    revisionId: "deck:number-trail:v1:67aa6e0169885d41ba784245b45a7105"
  }),
  Object.freeze({
    deckId: "word-trail",
    label: "Word Trail",
    kind: /** @type {"focused"} */ ("focused"),
    focusTopics: Object.freeze(["inference", "language", "logic"]),
    revisionId: "deck:word-trail:v1:daa862d93131ed0af4edb0ca1f743f19"
  }),
  Object.freeze({
    deckId: "nature-trail",
    label: "Nature Trail",
    kind: /** @type {"focused"} */ ("focused"),
    focusTopics: Object.freeze(["earth-science", "life-science"]),
    revisionId: "deck:nature-trail:v1:d6a6da5d0eb0aa49d4a225c30cb455d7"
  })
]);

/**
 * Freeze the authored publication graph so callers cannot mutate a published
 * revision after it becomes Quest or Classroom identity.
 *
 * @template T
 * @param {T} value
 * @returns {T}
 */
function deepFreeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const nested of Object.values(
      /** @type {Record<string, unknown>} */ (value)
    )) {
      deepFreeze(nested);
    }
    Object.freeze(value);
  }
  return value;
}

/** @type {LevelDemand[]} */
const CORRECT_FIRST_DEMAND = QUEST_LEVELS.map((level) => {
  const regions = REGION_STARTS.map((labyrinthStart, regionIndex) => {
    const band = getDifficultyBand(labyrinthStart);
    const correctFirstDemand = [0, 1, 2, 3].reduce(
      (total, offset) =>
        total +
        getLabyrinthConfig(level.id, labyrinthStart + offset).wardenCount,
      0
    );
    return {
      levelId: level.id,
      levelLabel: level.name,
      regionNumber: regionIndex + 1,
      bandId: band.id,
      labyrinthStart,
      labyrinthEnd: labyrinthStart + 3,
      correctFirstDemand,
      minimumFocusedQuestions: Math.ceil(correctFirstDemand * 0.7)
    };
  });
  return {
    levelId: level.id,
    levelLabel: level.name,
    correctFirstDemand: regions.reduce(
      (total, region) => total + region.correctFirstDemand,
      0
    ),
    regions
  };
});
deepFreeze(CORRECT_FIRST_DEMAND);

/** @param {string} deckId */
function getDeckDefinition(deckId) {
  return DECK_DEFINITIONS.find((definition) => definition.deckId === deckId);
}

/**
 * @param {string} deckId
 * @param {string} levelId
 */
function getFocusedObjectiveIds(deckId, levelId) {
  const definition = getDeckDefinition(deckId);
  if (!definition || definition.kind !== "focused") {
    return [];
  }
  return Array.from(
    new Set(
      Array.from({ length: 8 }, (_, questionOrdinal) =>
        getLearningMetadata(levelId, questionOrdinal)
      )
        .filter(({ topicId }) => definition.focusTopics.includes(topicId))
        .map(({ learningObjectiveId }) => learningObjectiveId)
    )
  );
}

/**
 * @param {string} levelId
 * @param {number} labyrinthNumber
 * @param {readonly string[]} focusedObjectiveIds
 * @param {number} count
 * @param {number} [startOrdinal]
 * @param {Set<string>} [usedPresentationDigests]
 */
function collectFocusedQuestions(
  levelId,
  labyrinthNumber,
  focusedObjectiveIds,
  count,
  startOrdinal = 0,
  usedPresentationDigests = new Set()
) {
  /** @type {WardenQuestion[]} */
  const questions = [];
  let questionOrdinal = startOrdinal;
  const searchLimit = startOrdinal + count * 16 + 64;
  while (questions.length < count && questionOrdinal < searchLimit) {
    const question = getBundledQuestion({
      levelId,
      seed: "PUBLISHED-LEARNING-DECK",
      wardenId: 0,
      labyrinthNumber,
      questionOrdinal
    });
    const presentationDigest =
      reviewedQuestionPresentationDigest(question);
    if (
      focusedObjectiveIds.includes(question.learningObjectiveId) &&
      !usedPresentationDigests.has(presentationDigest)
    ) {
      questions.push(question);
      usedPresentationDigests.add(presentationDigest);
    }
    questionOrdinal += 1;
  }
  if (questions.length !== count) {
    throw new Error(
      `Learning Deck focus is missing reviewed content for ${levelId}.`
    );
  }
  return questions;
}

/**
 * @param {WardenQuestion} source
 * @param {string} capstoneId
 */
function createFocusedCapstone(source, capstoneId) {
  const content = normalizeQuestion({
    id: capstoneId,
    prompt: source.prompt,
    choices: source.choices,
    answerId: source.answerId,
    hint: source.hint,
    explanation: source.explanation,
    difficultyBand: source.difficultyBand,
    difficultyRank: source.difficultyRank,
    topicId: source.topicId,
    learningObjectiveId: source.learningObjectiveId
  });
  return normalizeQuestion({
    ...content,
    reviewedRevisionId: createReviewedQuestionRevisionId(
      content,
      "learning-deck"
    )
  });
}

/** @param {Omit<LearningDeckRevision, "revisionId">} revision */
function learningDeckRevisionId(revision) {
  return (
    `deck:${revision.deckId}:v1:` +
    reviewedContentDigest({
      deckId: revision.deckId,
      label: revision.label,
      status: revision.status,
      kind: revision.kind,
      normalQuestionSource: revision.normalQuestionSource,
      regions: revision.regions
    })
  );
}

/** @param {(typeof DECK_DEFINITIONS)[number]} definition */
function buildLearningDeckRevision(definition) {
  /** @type {LearningDeckRegion[]} */
  const regions = [];
  for (const level of CORRECT_FIRST_DEMAND) {
    const usedPresentationDigests = new Set();
    for (const demand of level.regions) {
      const focusedObjectiveIds = getFocusedObjectiveIds(
        definition.deckId,
        level.levelId
      );
      const normalQuestions =
        definition.kind === "focused"
          ? collectFocusedQuestions(
              level.levelId,
              demand.labyrinthStart,
              focusedObjectiveIds,
              demand.minimumFocusedQuestions,
              0,
              usedPresentationDigests
            )
          : [];
      const capstoneQuestion =
        definition.kind === "focused"
          ? createFocusedCapstone(
              collectFocusedQuestions(
                level.levelId,
                demand.labyrinthStart,
                focusedObjectiveIds,
                1,
                1_000 +
                  DECK_DEFINITIONS.indexOf(definition) * 500 +
                  level.regions.indexOf(demand) * 32,
                usedPresentationDigests
              )[0],
              `capstone-${definition.deckId}-${level.levelId}-${demand.bandId}`
            )
          : getBundledQuestion({
              levelId: level.levelId,
              seed: "PUBLISHED-MIXED-CAPSTONE",
              wardenId: 0,
              labyrinthNumber: demand.labyrinthStart,
              questionOrdinal: demand.labyrinthStart - 1,
              challengeKind: "gate-warden"
            });
      regions.push({
        levelId: level.levelId,
        regionNumber: demand.regionNumber,
        bandId: demand.bandId,
        labyrinthStart: demand.labyrinthStart,
        labyrinthEnd: demand.labyrinthEnd,
        correctFirstDemand: demand.correctFirstDemand,
        minimumFocusedQuestions: demand.minimumFocusedQuestions,
        focusedObjectiveIds,
        normalQuestions,
        capstoneQuestion
      });
    }
  }

  const withoutRevision = {
    deckId: definition.deckId,
    label: definition.label,
    status: /** @type {"published"} */ ("published"),
    kind: definition.kind,
    normalQuestionSource:
      definition.kind === "focused"
        ? /** @type {"finite-reviewed-focus"} */ ("finite-reviewed-focus")
        : /** @type {"unbounded-reviewed-mixed"} */ (
            "unbounded-reviewed-mixed"
          ),
    regions
  };
  const computedRevisionId = learningDeckRevisionId(withoutRevision);
  if (computedRevisionId !== definition.revisionId) {
    throw new Error(
      `${definition.label} content changed; publish ${computedRevisionId}.`
    );
  }
  return {
    ...withoutRevision,
    revisionId: definition.revisionId
  };
}

const REVISION_FIELDS = Object.freeze([
  "deckId",
  "kind",
  "label",
  "normalQuestionSource",
  "regions",
  "revisionId",
  "status"
]);
const REGION_FIELDS = Object.freeze([
  "bandId",
  "capstoneQuestion",
  "correctFirstDemand",
  "focusedObjectiveIds",
  "labyrinthEnd",
  "labyrinthStart",
  "levelId",
  "minimumFocusedQuestions",
  "normalQuestions",
  "regionNumber"
]);

/**
 * @param {unknown} value
 * @param {readonly string[]} allowedFields
 * @param {string} name
 */
function assertClosedRecord(value, allowedFields, name) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${name} must be an object.`);
  }
  const fields = Object.keys(value).sort();
  if (
    fields.length !== allowedFields.length ||
    fields.some((field, index) => field !== allowedFields[index])
  ) {
    throw new Error(`${name} contains undeclared fields.`);
  }
}

/** @param {unknown} rawQuestion */
function normalizePublishedQuestion(rawQuestion) {
  const question = normalizeQuestion(rawQuestion);
  if (
    reviewedContentDigest(rawQuestion) !== reviewedContentDigest(question)
  ) {
    throw new Error(
      "Published Learning Deck Question contains undeclared fields."
    );
  }
  return question;
}

/**
 * Validate the complete publishable artifact. There is deliberately no draft
 * or arbitrary authoring surface in the player-facing manifest.
 *
 * @param {unknown} rawRevision
 */
export function validateLearningDeckRevision(rawRevision) {
  assertClosedRecord(rawRevision, REVISION_FIELDS, "Learning Deck revision");
  const revision = /** @type {LearningDeckRevision} */ (rawRevision);
  const definition = getDeckDefinition(revision.deckId);
  if (
    !definition ||
    revision.label !== definition.label ||
    revision.kind !== definition.kind ||
    revision.status !== "published"
  ) {
    throw new Error("Learning Deck revision is not in the launch roster.");
  }
  const expectedSource =
    definition.kind === "focused"
      ? "finite-reviewed-focus"
      : "unbounded-reviewed-mixed";
  if (revision.normalQuestionSource !== expectedSource) {
    throw new Error("Learning Deck Question source is not valid.");
  }

  const expectedRegions = CORRECT_FIRST_DEMAND.flatMap(
    ({ regions }) => regions
  );
  if (
    !Array.isArray(revision.regions) ||
    revision.regions.length !== expectedRegions.length
  ) {
    throw new Error("Learning Deck must publish every Level and Region.");
  }

  const normalQuestionIds = new Set();
  const capstoneIds = new Set();
  /** @type {Map<string, Set<string>>} */
  const presentationDigestsByLevel = new Map();
  for (let index = 0; index < expectedRegions.length; index += 1) {
    const expected = expectedRegions[index];
    const region = revision.regions[index];
    assertClosedRecord(region, REGION_FIELDS, "Learning Deck Region");
    if (
      !region ||
      region.levelId !== expected.levelId ||
      region.regionNumber !== expected.regionNumber ||
      region.bandId !== expected.bandId ||
      region.labyrinthStart !== expected.labyrinthStart ||
      region.labyrinthEnd !== expected.labyrinthEnd ||
      region.correctFirstDemand !== expected.correctFirstDemand ||
      region.minimumFocusedQuestions !== expected.minimumFocusedQuestions
    ) {
      throw new Error("Learning Deck Region demand does not match game rules.");
    }

    const focusedObjectiveIds = getFocusedObjectiveIds(
      revision.deckId,
      region.levelId
    );
    if (
      !Array.isArray(region.focusedObjectiveIds) ||
      region.focusedObjectiveIds.join("|") !== focusedObjectiveIds.join("|")
    ) {
      throw new Error("Learning Deck reviewed objective mix does not match.");
    }
    if (!Array.isArray(region.normalQuestions)) {
      throw new Error("Learning Deck normal Questions must be a list.");
    }
    if (
      definition.kind === "focused" &&
      region.normalQuestions.length < region.minimumFocusedQuestions
    ) {
      throw new Error(
        "Learning Deck revision does not meet 70% focused coverage."
      );
    }
    if (
      definition.kind === "mixed" &&
      region.normalQuestions.length !== 0
    ) {
      throw new Error("Mixed Trail must use its unbounded reviewed source.");
    }

    const presentationDigests =
      presentationDigestsByLevel.get(region.levelId) ?? new Set();
    presentationDigestsByLevel.set(region.levelId, presentationDigests);
    for (const question of region.normalQuestions) {
      const normalized = normalizePublishedQuestion(question);
      if (
        normalized.difficultyBand !== region.bandId ||
        !focusedObjectiveIds.includes(normalized.learningObjectiveId)
      ) {
        throw new Error(
          "Learning Deck normal Question is outside its reviewed focus."
        );
      }
      if (
        normalized.reviewedRevisionId !==
        createReviewedQuestionRevisionId(normalized, "bundled")
      ) {
        throw new Error(
          "Learning Deck normal Question revision is not exact."
        );
      }
      if (normalQuestionIds.has(normalized.id)) {
        throw new Error("Learning Deck normal Question IDs must be distinct.");
      }
      normalQuestionIds.add(normalized.id);
      const presentationDigest =
        reviewedQuestionPresentationDigest(normalized);
      if (presentationDigests.has(presentationDigest)) {
        throw new Error(
          "Learning Deck coverage requires distinct reviewed content."
        );
      }
      presentationDigests.add(presentationDigest);
    }

    if (!region.capstoneQuestion) {
      throw new Error("Learning Deck is missing a deck-matched Capstone.");
    }
    const capstone = normalizePublishedQuestion(region.capstoneQuestion);
    const expectedCapstoneId =
      definition.kind === "focused"
        ? `capstone-${revision.deckId}-${region.levelId}-${region.bandId}`
        : `capstone-${region.levelId}-${region.bandId}`;
    if (
      capstone.id !== expectedCapstoneId ||
      capstone.difficultyBand !== region.bandId ||
      (definition.kind === "focused" &&
        !focusedObjectiveIds.includes(capstone.learningObjectiveId))
    ) {
      throw new Error("Learning Deck is missing a deck-matched Capstone.");
    }
    const capstoneNamespace =
      definition.kind === "focused" ? "learning-deck" : "bundled";
    if (
      capstone.reviewedRevisionId !==
      createReviewedQuestionRevisionId(capstone, capstoneNamespace)
    ) {
      throw new Error("Learning Deck Capstone revision is not exact.");
    }
    if (capstoneIds.has(capstone.id)) {
      throw new Error("Learning Deck Capstone IDs must be distinct.");
    }
    capstoneIds.add(capstone.id);
    const capstonePresentationDigest =
      reviewedQuestionPresentationDigest(capstone);
    if (presentationDigests.has(capstonePresentationDigest)) {
      throw new Error(
        "Learning Deck coverage requires distinct reviewed content."
      );
    }
    presentationDigests.add(capstonePresentationDigest);
  }

  const expectedRevisionId = learningDeckRevisionId({
    deckId: revision.deckId,
    label: revision.label,
    status: revision.status,
    kind: revision.kind,
    normalQuestionSource: revision.normalQuestionSource,
    regions: revision.regions
  });
  if (
    revision.revisionId !== expectedRevisionId ||
    revision.revisionId !== definition.revisionId
  ) {
    throw new Error("Learning Deck revision does not match its exact content.");
  }
  return true;
}

/** @type {Map<string, LearningDeckRevision>} */
const PUBLISHED_REVISION_CACHE = new Map();

/** @param {(typeof DECK_DEFINITIONS)[number]} definition */
function getOrBuildPublishedRevision(definition) {
  const cached = PUBLISHED_REVISION_CACHE.get(definition.deckId);
  if (cached) {
    return cached;
  }
  const revision = buildLearningDeckRevision(definition);
  validateLearningDeckRevision(revision);
  const published = deepFreeze(revision);
  PUBLISHED_REVISION_CACHE.set(definition.deckId, published);
  return published;
}

const PUBLISHED_OPTIONS = deepFreeze(
  DECK_DEFINITIONS.map((definition) => ({
    deckId: definition.deckId,
    label: definition.label,
    revisionId: definition.revisionId
  }))
);

export function getCorrectFirstDemandReport() {
  return CORRECT_FIRST_DEMAND;
}

export function getPublishedLearningDeckRevisions() {
  return deepFreeze(
    DECK_DEFINITIONS.map((definition) =>
      getOrBuildPublishedRevision(definition)
    )
  );
}

export function getPublishedLearningDeckOptions() {
  return PUBLISHED_OPTIONS;
}

/**
 * @param {string} deckId
 * @param {string} [revisionId]
 */
export function getPublishedLearningDeckRevision(deckId, revisionId) {
  const definition = getDeckDefinition(deckId);
  if (
    !definition ||
    (revisionId !== undefined && revisionId !== definition.revisionId)
  ) {
    return null;
  }
  return getOrBuildPublishedRevision(definition);
}

export function getLearningDeckCoverageReport() {
  return deepFreeze(
    getPublishedLearningDeckRevisions().map((revision) => ({
      deckId: revision.deckId,
      label: revision.label,
      revisionId: revision.revisionId,
      status: revision.status,
      kind: revision.kind,
      regions: revision.regions.map((region) => ({
        levelId: region.levelId,
        regionNumber: region.regionNumber,
        bandId: region.bandId,
        correctFirstDemand: region.correctFirstDemand,
        minimumFocusedQuestions: region.minimumFocusedQuestions,
        focusedQuestionCount: region.normalQuestions.length,
        hasCapstone: Boolean(region.capstoneQuestion)
      }))
    }))
  );
}
