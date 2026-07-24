/**
 * @typedef {{
 *   id: string,
 *   prompt: string,
 *   choices: { id: string, label: string }[],
 *   answerId: string,
 *   explanation: string
 * }} WardenQuestion
 * @typedef {{
 *   levelId: string,
 *   seed: string,
 *   wardenId: number,
 *   attempt?: number
 * }} QuestionRequest
 */

const QUESTION_BANK = Object.freeze({
  "bright-start": Object.freeze([
    {
      id: "bright-math-01",
      prompt: "What is 8 + 5?",
      choices: [
        { id: "a", label: "11" },
        { id: "b", label: "13" },
        { id: "c", label: "15" }
      ],
      answerId: "b",
      explanation: "Eight plus five equals thirteen."
    },
    {
      id: "bright-words-01",
      prompt: "Which word means the opposite of tiny?",
      choices: [
        { id: "a", label: "Huge" },
        { id: "b", label: "Quiet" },
        { id: "c", label: "Soft" }
      ],
      answerId: "a",
      explanation: "Huge means very big, which is the opposite of tiny."
    },
    {
      id: "bright-nature-01",
      prompt: "Which part of a plant usually grows under the soil?",
      choices: [
        { id: "a", label: "Flower" },
        { id: "b", label: "Leaf" },
        { id: "c", label: "Root" }
      ],
      answerId: "c",
      explanation: "Roots usually grow under the soil and help the plant drink water."
    },
    {
      id: "bright-shapes-01",
      prompt: "Which shape has three straight sides?",
      choices: [
        { id: "a", label: "Circle" },
        { id: "b", label: "Triangle" },
        { id: "c", label: "Square" }
      ],
      answerId: "b",
      explanation: "A triangle has three straight sides."
    }
  ]),
  "trail-scout": Object.freeze([
    {
      id: "scout-math-01",
      prompt: "A spider has 8 legs. How many legs do 3 spiders have?",
      choices: [
        { id: "a", label: "16" },
        { id: "b", label: "24" },
        { id: "c", label: "32" }
      ],
      answerId: "b",
      explanation: "Three groups of eight make twenty-four."
    },
    {
      id: "scout-reading-01",
      prompt:
        "Mina packed a raincoat when she saw dark clouds. What did she expect?",
      choices: [
        { id: "a", label: "Rain" },
        { id: "b", label: "Snow" },
        { id: "c", label: "Strong sunshine" }
      ],
      answerId: "a",
      explanation: "Dark clouds and a raincoat are clues that Mina expected rain."
    },
    {
      id: "scout-science-01",
      prompt: "Which animal begins life as a tadpole?",
      choices: [
        { id: "a", label: "Frog" },
        { id: "b", label: "Turtle" },
        { id: "c", label: "Robin" }
      ],
      answerId: "a",
      explanation: "A tadpole grows and changes into a frog."
    }
  ]),
  "maze-master": Object.freeze([
    {
      id: "master-fractions-01",
      prompt: "Which fraction is the same as one half?",
      choices: [
        { id: "a", label: "2/4" },
        { id: "b", label: "2/3" },
        { id: "c", label: "3/4" }
      ],
      answerId: "a",
      explanation: "Two out of four equal parts is the same amount as one half."
    },
    {
      id: "master-space-01",
      prompt: "Why does the Moon seem to shine at night?",
      choices: [
        { id: "a", label: "It reflects sunlight" },
        { id: "b", label: "It is made of fire" },
        { id: "c", label: "It stores daylight" }
      ],
      answerId: "a",
      explanation: "The Moon looks bright because its surface reflects light from the Sun."
    },
    {
      id: "master-logic-01",
      prompt:
        "All glimmers are blue. This pebble is a glimmer. What must be true?",
      choices: [
        { id: "a", label: "The pebble is blue" },
        { id: "b", label: "The pebble can fly" },
        { id: "c", label: "The pebble is heavy" }
      ],
      answerId: "a",
      explanation: "If every glimmer is blue and the pebble is a glimmer, the pebble must be blue."
    }
  ])
});

/** @param {string} value */
function stableHash(value) {
  let hash = 0;

  for (const character of value) {
    hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  }

  return hash;
}

/** @param {WardenQuestion} question @returns {WardenQuestion} */
function cloneQuestion(question) {
  return {
    ...question,
    choices: question.choices.map((choice) => ({ ...choice }))
  };
}

/** @param {QuestionRequest} request @returns {WardenQuestion} */
export function getBundledQuestion({
  levelId,
  seed,
  wardenId,
  attempt = 0
}) {
  const deck =
    levelId === "bright-start"
      ? QUESTION_BANK["bright-start"]
      : levelId === "maze-master"
        ? QUESTION_BANK["maze-master"]
        : QUESTION_BANK["trail-scout"];
  const firstIndex = stableHash(`${seed}:${wardenId}`) % deck.length;
  const question = deck[(firstIndex + attempt) % deck.length];

  return cloneQuestion(question);
}
