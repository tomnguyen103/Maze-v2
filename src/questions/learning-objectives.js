const TOPICS = Object.freeze({
  arithmetic: "Number paths",
  patterns: "Patterns",
  language: "Words and meaning",
  "life-science": "Living systems",
  geometry: "Shapes and space",
  inference: "Clues and conclusions",
  logic: "Reasoning",
  fractions: "Fractions",
  "earth-science": "Earth and sky"
});

const LEVEL_OBJECTIVES = Object.freeze({
  "bright-start": Object.freeze([
    ["arithmetic", "bright-combine-groups", "Combine groups"],
    ["arithmetic", "bright-take-away", "Take away from a group"],
    ["arithmetic", "bright-missing-addend", "Find a missing part"],
    ["patterns", "bright-growing-patterns", "Continue a growing pattern"],
    ["language", "bright-word-meaning", "Use word meaning"],
    ["life-science", "bright-living-things", "Notice living things"],
    ["geometry", "bright-shape-properties", "Describe shapes"],
    ["inference", "bright-everyday-inference", "Use everyday clues"]
  ]),
  "trail-scout": Object.freeze([
    ["arithmetic", "scout-equal-groups", "Multiply equal groups"],
    ["arithmetic", "scout-equal-sharing", "Divide by sharing equally"],
    ["arithmetic", "scout-multistep-arithmetic", "Solve two-step quantities"],
    ["geometry", "scout-perimeter", "Find perimeter"],
    ["inference", "scout-reading-inference", "Infer from a passage"],
    ["life-science", "scout-biology", "Explain living systems"],
    ["logic", "scout-order-and-rules", "Follow order and rules"],
    ["language", "scout-context-vocabulary", "Use context vocabulary"]
  ]),
  "maze-master": Object.freeze([
    ["fractions", "master-fraction-of-quantity", "Find a fraction of a quantity"],
    ["arithmetic", "master-multistep-arithmetic", "Solve multi-step arithmetic"],
    ["fractions", "master-equivalent-fractions", "Build equivalent fractions"],
    ["patterns", "master-linear-patterns", "Continue number patterns"],
    ["earth-science", "master-earth-systems", "Explain Earth systems"],
    ["language", "master-academic-vocabulary", "Use academic vocabulary"],
    ["logic", "master-formal-reasoning", "Apply formal reasoning"],
    ["fractions", "master-fraction-reasoning", "Compare and reason with fractions"]
  ])
});

export const LEARNING_TOPIC_IDS = Object.freeze(Object.keys(TOPICS));
export const LEARNING_OBJECTIVE_IDS = Object.freeze(
  Object.values(LEVEL_OBJECTIVES)
    .flat()
    .map(([, objectiveId]) => objectiveId)
);

/**
 * @param {string} levelId
 * @param {number} questionOrdinal
 */
export function getLearningMetadata(levelId, questionOrdinal) {
  const objectives =
    LEVEL_OBJECTIVES[
      /** @type {keyof typeof LEVEL_OBJECTIVES} */ (levelId)
    ];
  if (!objectives) {
    throw new Error(`Unsupported Quest Level: ${levelId}`);
  }
  const ordinal = Math.max(0, Math.trunc(questionOrdinal));
  const [topicId, learningObjectiveId] = objectives[ordinal % 8];
  return { topicId, learningObjectiveId };
}

/** @param {string} learningObjectiveId */
export function getLearningObjective(learningObjectiveId) {
  for (const objectives of Object.values(LEVEL_OBJECTIVES)) {
    const objective = objectives.find(([, id]) => id === learningObjectiveId);
    if (objective) {
      return {
        topicId: objective[0],
        topicLabel:
          TOPICS[/** @type {keyof typeof TOPICS} */ (objective[0])],
        learningObjectiveId: objective[1],
        label: objective[2]
      };
    }
  }
  return null;
}

/**
 * @param {string} topicId
 * @param {string} learningObjectiveId
 */
export function isLearningMetadata(topicId, learningObjectiveId) {
  return (
    LEARNING_TOPIC_IDS.includes(topicId) &&
    getLearningObjective(learningObjectiveId)?.topicId === topicId
  );
}
