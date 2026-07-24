/** @typedef {"bright-start" | "trail-scout" | "maze-master"} QuestLevelId */
/**
 * @typedef {{
 *   id: QuestLevelId,
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
 *   }
 * }} QuestLevel
 */

/** @type {QuestLevel[]} */
const LEVELS = [
  {
    id: "bright-start",
    name: "Bright Start",
    badge: "Gentle",
    description: "Short paths, one Warden, and friendly warm-up questions.",
    audience: "Early explorer",
    questionGuide:
      "Use addition and subtraction within 20, familiar word meanings, colors, shapes, and everyday nature facts.",
    config: {
      size: 11,
      echoCount: 2,
      wardenCount: 1,
      vitality: 4,
      pulses: 3
    }
  },
  {
    id: "trail-scout",
    name: "Trail Scout",
    badge: "Balanced",
    description: "A balanced expedition with two clever Wardens.",
    audience: "Growing explorer",
    questionGuide:
      "Use multiplication within 10, short reading inferences, basic life science, and age-appropriate logic.",
    config: {
      size: 15,
      echoCount: 3,
      wardenCount: 2,
      vitality: 3,
      pulses: 2
    }
  },
  {
    id: "maze-master",
    name: "Maze Master",
    badge: "Bold",
    description: "A larger maze, three Wardens, and brainy challenges.",
    audience: "Confident explorer",
    questionGuide:
      "Use simple fractions, multi-step arithmetic, earth and space science, vocabulary in context, and logic puzzles.",
    config: {
      size: 17,
      echoCount: 4,
      wardenCount: 3,
      vitality: 3,
      pulses: 2
    }
  }
];

export const QUEST_LEVELS = Object.freeze(
  LEVELS.map((level) =>
    Object.freeze({
      ...level,
      config: Object.freeze({ ...level.config })
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
