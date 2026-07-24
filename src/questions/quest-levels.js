/** @typedef {"bright-start" | "trail-scout" | "maze-master"} QuestLevelId */
/**
 * @typedef {{
 *   id: QuestLevelId,
 *   number: number,
 *   name: string,
 *   badge: string,
 *   description: string,
 *   audience: string,
 *   questionGuide: string,
 *   config: {
 *     size: number,
 *     echoCount: number,
 *     wardenCount: number,
 *     vitality: number,
 *     pulses: number
 *   },
 *   progression: {
 *     sizes: readonly number[],
 *     echoCounts: readonly number[],
 *     wardenCounts: readonly number[]
 *   }
 * }} QuestLevel
 */

export const QUEST_LABYRINTH_COUNT = 20;
export const DIFFICULTY_BANDS = Object.freeze([
  "foundation",
  "developing",
  "capable",
  "advanced",
  "mastery"
]);

const DIFFICULTY_BAND_LABELS = Object.freeze({
  foundation: "Foundation",
  developing: "Developing",
  capable: "Capable",
  advanced: "Advanced",
  mastery: "Mastery"
});

/** @type {QuestLevel[]} */
const LEVELS = [
  {
    id: "bright-start",
    number: 1,
    name: "Bright Start",
    badge: "Gentle",
    description: "Friendly learning foundations across twenty growing Labyrinths.",
    audience: "Early explorer",
    questionGuide:
      "Use addition and subtraction within 20, familiar word meanings, colors, shapes, and everyday nature facts.",
    config: {
      size: 11,
      echoCount: 2,
      wardenCount: 1,
      vitality: 4,
      pulses: 3
    },
    progression: {
      sizes: [11, 11, 13, 13, 15],
      echoCounts: [2, 2, 3, 3, 4],
      wardenCounts: [1, 1, 2, 2, 3]
    }
  },
  {
    id: "trail-scout",
    number: 2,
    name: "Trail Scout",
    badge: "Balanced",
    description: "Balanced reasoning across twenty expanding Labyrinths.",
    audience: "Growing explorer",
    questionGuide:
      "Use multiplication within 10, short reading inferences, basic life science, and age-appropriate logic.",
    config: {
      size: 13,
      echoCount: 3,
      wardenCount: 2,
      vitality: 3,
      pulses: 2
    },
    progression: {
      sizes: [13, 15, 15, 17, 19],
      echoCounts: [3, 4, 4, 5, 6],
      wardenCounts: [2, 2, 3, 3, 4]
    }
  },
  {
    id: "maze-master",
    number: 3,
    name: "Maze Master",
    badge: "Bold",
    description: "Advanced mastery across twenty formidable Labyrinths.",
    audience: "Confident explorer",
    questionGuide:
      "Use simple fractions, multi-step arithmetic, earth and space science, vocabulary in context, and logic puzzles.",
    config: {
      size: 15,
      echoCount: 4,
      wardenCount: 3,
      vitality: 3,
      pulses: 2
    },
    progression: {
      sizes: [15, 17, 19, 21, 23],
      echoCounts: [4, 5, 6, 7, 8],
      wardenCounts: [3, 4, 4, 5, 6]
    }
  }
];

export const QUEST_LEVELS = Object.freeze(
  LEVELS.map((level) =>
    Object.freeze({
      ...level,
      config: Object.freeze({ ...level.config }),
      progression: Object.freeze({
        sizes: Object.freeze([...level.progression.sizes]),
        echoCounts: Object.freeze([...level.progression.echoCounts]),
        wardenCounts: Object.freeze([...level.progression.wardenCounts])
      })
    })
  )
);

/** @param {string | null | undefined} levelId @returns {Readonly<QuestLevel>} */
export function getQuestLevel(levelId) {
  const level =
    QUEST_LEVELS.find((level) => level.id === levelId) ??
    QUEST_LEVELS.find((level) => level.id === "trail-scout");
  if (!level) {
    throw new Error("Trail Scout Quest Level is missing.");
  }
  return level;
}

/**
 * @param {number} labyrinthNumber
 * @returns {{ id: string, index: number, label: string }}
 */
export function getDifficultyBand(labyrinthNumber) {
  const normalized = normalizeLabyrinthNumber(labyrinthNumber);
  const index = Math.floor((normalized - 1) / 4);
  const id = DIFFICULTY_BANDS[index];
  if (!id) {
    throw new Error("Difficulty Band is missing.");
  }
  return {
    id,
    index,
    label:
      DIFFICULTY_BAND_LABELS[
        /** @type {keyof typeof DIFFICULTY_BAND_LABELS} */ (id)
      ]
  };
}

/**
 * @param {string | null | undefined} levelId
 * @param {number} labyrinthNumber
 */
export function getLabyrinthConfig(levelId, labyrinthNumber) {
  const level = getQuestLevel(levelId);
  const band = getDifficultyBand(labyrinthNumber);
  return Object.freeze({
    size: level.progression.sizes[band.index],
    echoCount: level.progression.echoCounts[band.index],
    wardenCount: level.progression.wardenCounts[band.index],
    vitality: level.config.vitality,
    pulses: level.config.pulses
  });
}

/** @param {number} labyrinthNumber */
function normalizeLabyrinthNumber(labyrinthNumber) {
  if (
    !Number.isInteger(labyrinthNumber) ||
    labyrinthNumber < 1 ||
    labyrinthNumber > QUEST_LABYRINTH_COUNT
  ) {
    throw new RangeError(
      `Labyrinth Number must be between 1 and ${QUEST_LABYRINTH_COUNT}.`
    );
  }
  return labyrinthNumber;
}
