import {
  getQuestContentPackId,
  getQuestIIRegion,
  QUEST_II_CONTENT_PACK_ID
} from "../game/quest-content.js";
import {
  getDifficultyBand,
  getQuestLevel
} from "./quest-levels.js";
import { getLearningMetadata } from "./learning-objectives.js";
import { normalizeQuestion } from "./question-contract.js";
import {
  createReviewedQuestionRevisionId
} from "./reviewed-question-revision.js";

/**
 * These are reviewed variation values, not a runtime content generator. The
 * question frames below combine one fixed scene row with one fixed curriculum
 * move, then bind the expanded card to its own reviewed revision digest.
 */
/** @typedef {{ name: string, item: string, a: number, b: number, word: string, synonym: string, opposite?: string, shape: string, sides: number, living: string }} QuestIIScene */
/** @type {readonly QuestIIScene[]} */
const QUEST_II_SCENES = Object.freeze([
  Object.freeze({ name: "Ari", item: "seed cups", a: 2, b: 3, word: "glad", synonym: "happy", shape: "triangle", sides: 3, living: "A young tree needs water and light to grow." }),
  Object.freeze({ name: "Bea", item: "trail ribbons", a: 3, b: 4, word: "tiny", synonym: "small", shape: "square", sides: 4, living: "Bees carry pollen between flowers." }),
  Object.freeze({ name: "Cal", item: "smooth stones", a: 4, b: 2, word: "swift", synonym: "quick", shape: "rectangle", sides: 4, living: "Roots take in water from the soil." }),
  Object.freeze({ name: "Devi", item: "shell tiles", a: 5, b: 2, word: "silent", synonym: "quiet", shape: "triangle", sides: 3, living: "A seed can grow into a new plant." }),
  Object.freeze({ name: "Eli", item: "bell tokens", a: 4, b: 5, word: "brave", synonym: "bold", shape: "square", sides: 4, living: "Fish use gills to take in oxygen from water." }),
  Object.freeze({ name: "Faye", item: "moss cards", a: 6, b: 3, word: "rapid", synonym: "fast", shape: "rectangle", sides: 4, living: "Leaves help many plants use sunlight." }),
  Object.freeze({ name: "Gus", item: "kite flags", a: 5, b: 4, word: "begin", synonym: "start", shape: "triangle", sides: 3, living: "Most birds have feathers that help them fly." }),
  Object.freeze({ name: "Hana", item: "bridge beads", a: 7, b: 2, word: "ancient", synonym: "old", shape: "square", sides: 4, living: "Plants make seeds so new plants can grow." }),
  Object.freeze({ name: "Ivo", item: "tide pebbles", a: 6, b: 5, word: "enormous", synonym: "huge", shape: "rectangle", sides: 4, living: "A habitat gives living things food and shelter." }),
  Object.freeze({ name: "Jia", item: "signal chimes", a: 8, b: 2, word: "observe", synonym: "notice", shape: "triangle", sides: 3, living: "Water moves through a plant from roots to leaves." }),
  Object.freeze({ name: "Kai", item: "apple markers", a: 7, b: 4, word: "protect", synonym: "guard", shape: "square", sides: 4, living: "A food chain begins with energy from the Sun." }),
  Object.freeze({ name: "Lina", item: "reed hoops", a: 9, b: 3, word: "assist", synonym: "help", shape: "rectangle", sides: 4, living: "Mammals feed their young with milk." }),
  Object.freeze({ name: "Milo", item: "arch stones", a: 8, b: 5, word: "select", synonym: "choose", shape: "triangle", sides: 3, living: "A frog begins life in water before changing form." }),
  Object.freeze({ name: "Nia", item: "glass drops", a: 9, b: 4, word: "steady", synonym: "firm", shape: "square", sides: 4, living: "The Moon's gravity helps cause ocean tides." }),
  Object.freeze({ name: "Omar", item: "beacon beads", a: 10, b: 3, word: "cautious", synonym: "careful", shape: "rectangle", sides: 4, living: "Decomposers return nutrients to the soil." }),
  Object.freeze({ name: "Pia", item: "lantern leaves", a: 8, b: 6, word: "repair", synonym: "fix", shape: "triangle", sides: 3, living: "A habitat can change when water or shelter changes." }),
  Object.freeze({ name: "Quin", item: "wind tags", a: 11, b: 3, word: "predict", synonym: "forecast", shape: "square", sides: 4, living: "Weather can affect how animals find food." }),
  Object.freeze({ name: "Ravi", item: "sun beads", a: 9, b: 7, word: "combine", synonym: "join", shape: "rectangle", sides: 4, living: "A community includes different living things in one place." }),
  Object.freeze({ name: "Sora", item: "current cards", a: 12, b: 4, word: "compare", synonym: "contrast", shape: "triangle", sides: 3, living: "Clouds form when water vapor cools into droplets." }),
  Object.freeze({ name: "Tess", item: "resonant stones", a: 10, b: 8, word: "conclude", synonym: "decide", shape: "square", sides: 4, living: "The water cycle moves water through air, land, and seas." })
]);

const BRIGHT_TEMPLATE_OBJECTIVES = Object.freeze([0, 4, 6, 5]);
const SCOUT_TEMPLATE_OBJECTIVES = Object.freeze([0, 3, 4, 5]);
const MASTER_TEMPLATE_OBJECTIVES = Object.freeze([0, 1, 3, 4]);

/** @param {{ id: string, prompt: string, answer: string, wrongOne: string, wrongTwo: string, hint: string, explanation: string, bandId: string, rank: number, levelId: string, template: number }} input */
function createReviewedCard({
  id,
  prompt,
  answer,
  wrongOne,
  wrongTwo,
  hint,
  explanation,
  bandId,
  rank,
  levelId,
  template
}) {
  const metadata = getLearningMetadata(
    levelId,
    /** @type {number[]} */ (
      levelId === "bright-start"
        ? BRIGHT_TEMPLATE_OBJECTIVES
        : levelId === "trail-scout"
          ? SCOUT_TEMPLATE_OBJECTIVES
          : MASTER_TEMPLATE_OBJECTIVES
    )[template]
  );
  return normalizeQuestion({
    id,
    prompt,
    choices: [
      { id: "a", label: answer },
      { id: "b", label: wrongOne },
      { id: "c", label: wrongTwo }
    ],
    answerId: "a",
    hint,
    explanation,
    difficultyBand: bandId,
    difficultyRank: rank,
    ...metadata
  });
}

/** @param {{ levelId: string, labyrinthNumber: number, questionOrdinal?: number, challengeKind?: "warden" | "gate-warden" }} input */
export function getQuestIIQuestion({
  levelId,
  labyrinthNumber,
  questionOrdinal = 0,
  challengeKind = "warden"
}) {
  const level = getQuestLevel(levelId);
  const band = getDifficultyBand(labyrinthNumber);
  const ordinal = Math.max(0, Math.trunc(questionOrdinal));
  const scene = QUEST_II_SCENES[ordinal % QUEST_II_SCENES.length];
  const region = getQuestIIRegion(labyrinthNumber);
  const template = ordinal % 4;
  const id = `quest-ii-${level.id}-${band.id}-${ordinal}`;
  const rank = level.number * 10 + band.index + 1;

  if (challengeKind === "gate-warden") {
    return getQuestIICapstone({
      levelId: level.id,
      bandId: band.id,
      bandIndex: band.index,
      rank,
      region,
      scene,
      template: (band.index + 2) % 4
    });
  }

  if (level.id === "bright-start") {
    return bindQuestIIReviewedRevision(
      brightCard({ id, band, rank, scene, region, template, bandIndex: band.index })
    );
  }
  if (level.id === "trail-scout") {
    return bindQuestIIReviewedRevision(
      scoutCard({ id, band, rank, scene, region, template, bandIndex: band.index })
    );
  }
  return bindQuestIIReviewedRevision(
    masterCard({ id, band, rank, scene, region, template, bandIndex: band.index })
  );
}

/** @param {ReturnType<typeof normalizeQuestion>} question */
function bindQuestIIReviewedRevision(question) {
  return normalizeQuestion({
    ...question,
    reviewedRevisionId: createReviewedQuestionRevisionId(question, "quest-ii")
  });
}

/** @param {{ id: string, band: { id: string }, rank: number, scene: typeof QUEST_II_SCENES[number], region: ReturnType<typeof getQuestIIRegion>, template: number, bandIndex: number }} input */
function brightCard({ id, band, rank, scene, region, template, bandIndex }) {
  const first = scene.a + bandIndex;
  const second = scene.b + (bandIndex % 2);
  if (template === 0) {
    const answer = first + second;
    return createReviewedCard({
      id,
      prompt: `${scene.name} finds ${first} ${scene.item} and then ${second} more in ${region.name}. How many ${scene.item} are there altogether?`,
      answer: String(answer),
      wrongOne: String(answer - 1),
      wrongTwo: String(answer + 2),
      hint: "Combine the two groups by counting on.",
      explanation: `${first} plus ${second} equals ${answer}.`,
      bandId: band.id,
      rank,
      levelId: "bright-start",
      template
    });
  }
  if (template === 1) {
    const answer = scene.synonym;
    return createReviewedCard({
      id,
      prompt: `The ${region.name} guide says a path is ${scene.word}. Which word means the same as ${scene.word}?`,
      answer,
      wrongOne: scene.opposite ?? "rough",
      wrongTwo: "empty",
      hint: "Choose the word with the same meaning.",
      explanation: `${answer} means the same as ${scene.word}.`,
      bandId: band.id,
      rank,
      levelId: "bright-start",
      template
    });
  }
  if (template === 2) {
    const answer = scene.shape;
    return createReviewedCard({
      id,
      prompt: `A marker in ${region.name} has ${scene.sides} straight sides. Which shape is it?`,
      answer,
      wrongOne: answer === "triangle" ? "square" : "triangle",
      wrongTwo: "circle",
      hint: "Count the straight sides.",
      explanation: `A ${answer} has ${scene.sides} straight sides.`,
      bandId: band.id,
      rank,
      levelId: "bright-start",
      template
    });
  }
  return createReviewedCard({
    id,
    prompt: `${scene.living} Which idea does this describe in ${region.name}?`,
    answer: "a living thing grows and uses what it needs",
    wrongOne: "a stone grows by listening",
    wrongTwo: "a bell becomes a plant",
    hint: "Think about what plants need to live.",
    explanation: "Living things grow and use resources such as water and light.",
    bandId: band.id,
    rank,
    levelId: "bright-start",
    template
  });
}

/** @param {{ id: string, band: { id: string }, rank: number, scene: typeof QUEST_II_SCENES[number], region: ReturnType<typeof getQuestIIRegion>, template: number, bandIndex: number }} input */
function scoutCard({ id, band, rank, scene, region, template, bandIndex }) {
  const groups = 2 + (scene.a % 3) + bandIndex;
  const each = 2 + (scene.b % 3) + Math.floor(bandIndex / 2);
  if (template === 0) {
    const answer = groups * each;
    return createReviewedCard({
      id,
      prompt: `${scene.name} packs ${groups} trail bags with ${each} ${scene.item} in each bag at ${region.name}. How many are packed?`,
      answer: String(answer),
      wrongOne: String(answer - each),
      wrongTwo: String(answer + groups),
      hint: "Use equal groups and multiply.",
      explanation: `${groups} groups of ${each} make ${answer}.`,
      bandId: band.id,
      rank,
      levelId: "trail-scout",
      template
    });
  }
  if (template === 1) {
    const width = 2 + (scene.a % 4) + bandIndex;
    const length = 3 + (scene.b % 4) + bandIndex;
    const answer = 2 * (width + length);
    return createReviewedCard({
      id,
      prompt: `${scene.name} marks a rectangular plot ${length} steps long and ${width} steps wide at ${region.name}. How many steps go around its edge?`,
      answer: String(answer),
      wrongOne: String(width + length),
      wrongTwo: String(answer + 2),
      hint: "Add all four sides of the rectangle.",
      explanation: `Two lengths and two widths give ${answer} steps around the edge.`,
      bandId: band.id,
      rank,
      levelId: "trail-scout",
      template
    });
  }
  if (template === 2) {
    return createReviewedCard({
      id,
      prompt: `The ${region.name} path is wet, and dark clouds cover the sky. What weather is most likely?`,
      answer: "rainy",
      wrongOne: "sunny",
      wrongTwo: "windless",
      hint: "Use both clues together.",
      explanation: "Wet paths and dark clouds are clues that rain is likely.",
      bandId: band.id,
      rank,
      levelId: "trail-scout",
      template
    });
  }
  return createReviewedCard({
    id,
    prompt: `${scene.name} sees that ${scene.living.toLowerCase()} What is the best reason this matters to a living system?`,
    answer: "living things depend on connected needs",
    wrongOne: "stones need to eat",
    wrongTwo: "bells make roots",
    hint: "Connect the living thing with what supports it.",
    explanation: "Living systems connect needs such as food, water, shelter, and energy.",
    bandId: band.id,
    rank,
    levelId: "trail-scout",
    template
  });
}

/** @param {{ id: string, band: { id: string }, rank: number, scene: typeof QUEST_II_SCENES[number], region: ReturnType<typeof getQuestIIRegion>, template: number, bandIndex: number }} input */
function masterCard({ id, band, rank, scene, region, template, bandIndex }) {
  const denominator = 2 + (bandIndex % 3);
  const groups = 3 + (scene.a % 3) + bandIndex;
  const total = denominator * groups;
  if (template === 0) {
    const numerator = denominator - 1;
    const answer = groups * numerator;
    return createReviewedCard({
      id,
      prompt: `${scene.name} sorts ${total} ${scene.item} at ${region.name}. How many are ${numerator}/${denominator} of the total?`,
      answer: String(answer),
      wrongOne: String(groups),
      wrongTwo: String(total),
      hint: "Find one equal part first, then take the needed parts.",
      explanation: `One ${denominator}th is ${groups}; ${numerator} parts make ${answer}.`,
      bandId: band.id,
      rank,
      levelId: "maze-master",
      template
    });
  }
  if (template === 1) {
    const trays = 3 + (scene.b % 4) + bandIndex;
    const perTray = 2 + (scene.a % 4);
    const removed = 1 + (bandIndex % 3);
    const answer = trays * perTray - removed;
    return createReviewedCard({
      id,
      prompt: `${scene.name} prepares ${trays} trays with ${perTray} ${scene.item} each at ${region.name}, then removes ${removed}. How many remain?`,
      answer: String(answer),
      wrongOne: String(trays * perTray),
      wrongTwo: String(answer + removed),
      hint: "Multiply for the trays before subtracting.",
      explanation: `${trays} times ${perTray} is ${trays * perTray}; minus ${removed} leaves ${answer}.`,
      bandId: band.id,
      rank,
      levelId: "maze-master",
      template
    });
  }
  if (template === 2) {
    const step = 2 + bandIndex;
    const start = scene.a + bandIndex;
    const answer = start + step * 3;
    return createReviewedCard({
      id,
      prompt: `${scene.name} records this pattern at ${region.name}: ${start}, ${start + step}, ${start + step * 2}. What number comes next?`,
      answer: String(answer),
      wrongOne: String(answer - step),
      wrongTwo: String(answer + step),
      hint: "Find the constant difference between neighbors.",
      explanation: `Each number grows by ${step}, so the next number is ${answer}.`,
      bandId: band.id,
      rank,
      levelId: "maze-master",
      template
    });
  }
  return createReviewedCard({
    id,
    prompt: `At ${region.name}, ${scene.name} notices that clouds form when water vapor cools. Which Earth system idea is shown?`,
    answer: "water changes form in a cycle",
    wrongOne: "rocks grow from sound",
    wrongTwo: "bells create sunlight",
    hint: "Think about water moving between air, land, and seas.",
    explanation: "The water cycle includes water changing form and moving through Earth systems.",
    bandId: band.id,
    rank,
    levelId: "maze-master",
    template
  });
}

/** @param {{ levelId: string, bandId: string, bandIndex: number, rank: number, region: ReturnType<typeof getQuestIIRegion>, scene: typeof QUEST_II_SCENES[number], template: number }} input */
function getQuestIICapstone({ levelId, bandId, bandIndex, rank, region, scene, template }) {
  const id = `quest-ii-capstone-${levelId}-${bandId}`;
  const base =
    levelId === "bright-start"
      ? brightCard({ id, band: { id: bandId }, rank, scene, region, template, bandIndex })
      : levelId === "trail-scout"
        ? scoutCard({ id, band: { id: bandId }, rank, scene, region, template, bandIndex })
        : masterCard({ id, band: { id: bandId }, rank, scene, region, template, bandIndex });
  const capstone = normalizeQuestion({
    ...base,
    id,
    prompt: `Gate Warden at ${region.name}: ${base.prompt}`
  });
  return normalizeQuestion({
    ...capstone,
    reviewedRevisionId: createReviewedQuestionRevisionId(
      capstone,
      "quest-ii"
    )
  });
}

/** @param {string} levelId @returns {ReturnType<typeof getQuestIIQuestion>[]} */
export function getQuestIIQuestionSet(levelId) {
  const questions = Array.from({ length: 20 }, (_, index) =>
    getQuestIIQuestion({
      levelId,
      labyrinthNumber: index + 1,
      questionOrdinal: index
    })
  );
  const capstones = [1, 5, 9, 13, 17].map((labyrinthNumber) =>
    getQuestIIQuestion({
      levelId,
      labyrinthNumber,
      questionOrdinal: labyrinthNumber - 1,
      challengeKind: "gate-warden"
    })
  );
  return [...questions, ...capstones];
}

/** @param {string | undefined | null} questId */
export function isQuestIIQuestionRequest(questId) {
  return getQuestContentPackId(questId) === QUEST_II_CONTENT_PACK_ID;
}
