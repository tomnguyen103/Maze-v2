import {
  getDifficultyBand,
  getQuestLevel
} from "./quest-levels.js";
import { getLearningMetadata } from "./learning-objectives.js";
import { normalizeQuestion } from "./question-contract.js";
import { getReviewedEchoLens } from "./reviewed-echo-lenses.js";
import {
  createReviewedQuestionRevisionId,
  reviewedQuestionContentDigest
} from "./reviewed-question-revision.js";

/**
 * @typedef {{
 *   id: string,
 *   prompt: string,
 *   choices: { id: string, label: string }[],
 *   answerId: string,
 *   hint: string,
 *   explanation: string,
 *   difficultyBand: string,
 *   difficultyRank: number,
 *   topicId: string,
 *   learningObjectiveId: string,
 *   reviewedRevisionId?: string,
 *   echoLens?: import("./question-contract.js").WardenQuestion["echoLens"]
 * }} WardenQuestion
 * @typedef {Omit<WardenQuestion, "topicId" | "learningObjectiveId">} BaseWardenQuestion
 * @typedef {{
 *   levelId: string,
 *   seed: string,
 *   wardenId: number,
 *   attempt?: number,
 *   labyrinthNumber?: number,
 *   questionOrdinal?: number,
 *   challengeKind?: "warden" | "gate-warden"
 * }} QuestionRequest
 * @typedef {readonly [
 *   string,
 *   readonly string[],
 *   number,
 *   string,
 *   string
 * ]} CurriculumCard
 */

const NAMES = Object.freeze([
  "Ari",
  "Bea",
  "Cal",
  "Devi",
  "Eli",
  "Faye",
  "Gus",
  "Hana",
  "Ivo",
  "Jia",
  "Kai",
  "Lina",
  "Milo",
  "Nia",
  "Omar",
  "Pia",
  "Quin",
  "Ravi",
  "Sora",
  "Tess"
]);

const ITEMS = Object.freeze([
  "acorns",
  "buttons",
  "chalk pieces",
  "feathers",
  "glass beads",
  "leaf cards",
  "marbles",
  "paper stars",
  "pebbles",
  "pinecones",
  "ribbons",
  "shells",
  "stickers",
  "story cards",
  "tiles",
  "tokens",
  "toy blocks",
  "wooden rings",
  "wool balls",
  "yellow flags"
]);

const PLACES = Object.freeze([
  "bridge",
  "camp",
  "garden",
  "gate",
  "grove",
  "library",
  "meadow",
  "observatory",
  "river path",
  "workshop"
]);

const BRIGHT_LIMITS = Object.freeze([10, 14, 16, 18, 20]);
const SCOUT_FACTORS = Object.freeze([5, 7, 9, 10, 10]);
const MASTER_FACTORS = Object.freeze([6, 8, 10, 12, 15]);

const CURRICULUM_QUESTIONS = Object.freeze({
  bright: Object.freeze([
    Object.freeze([
      ["Which word means the same as glad?", ["happy", "empty", "rough"], 0, "Look for a feeling of joy.", "Glad and happy describe the same feeling."],
      ["Which plant part usually grows below the soil?", ["roots", "flowers", "fruit"], 0, "It holds the plant and takes in water.", "Roots usually grow below the soil."],
      ["Which shape has three straight sides?", ["triangle", "circle", "square"], 0, "Count the sides of each shape.", "A triangle has three straight sides."],
      ["Boots and an umbrella are ready by the door. What weather is likely?", ["rainy", "windless", "dry"], 0, "Use the clothing and object as clues.", "Boots and an umbrella are useful in rainy weather."]
    ]),
    Object.freeze([
      ["Which word means the opposite of narrow?", ["wide", "quiet", "tiny"], 0, "Think about how much room there is from side to side.", "Wide is the opposite of narrow."],
      ["What do most seeds need before they can sprout?", ["water", "music", "paint"], 0, "Think about what makes dry soil damp.", "Most seeds need water to begin sprouting."],
      ["Which shape has four equal sides?", ["square", "triangle", "oval"], 0, "Look for four sides with matching lengths.", "A square has four equal sides."],
      ["A path is shiny and puddles fill its dips. What probably happened?", ["it rained", "leaves fell", "the sun rose"], 0, "The puddles are the strongest clue.", "Rain can leave a path shiny with puddles."]
    ]),
    Object.freeze([
      ["In the sentence 'The rabbit dashed home,' what does dashed mean?", ["ran quickly", "slept", "whispered"], 0, "Use the trip home to judge the action.", "Dashed means ran quickly."],
      ["Why do many flowers have bright petals?", ["to attract pollinators", "to hide underground", "to freeze water"], 0, "Think about visitors that carry pollen.", "Bright petals can attract pollinators."],
      ["Which description matches a rectangle?", ["four sides and four corners", "three sides", "no corners"], 0, "Count both sides and corners.", "A rectangle has four sides and four corners."],
      ["A lunchbox is empty and crumbs cover the table. What most likely happened?", ["lunch was eaten", "class just began", "the table was washed"], 0, "Combine the empty box with the crumbs.", "The clues suggest that lunch was eaten."]
    ]),
    Object.freeze([
      ["Which word best completes 'The careful fox moved ___'?", ["quietly", "purple", "tomorrow"], 0, "Choose a word that tells how the fox moved.", "Quietly tells how the fox moved."],
      ["What change usually happens to water when it gets very cold?", ["it freezes", "it glows", "it becomes soil"], 0, "Think about an ice tray.", "Very cold water freezes into ice."],
      ["Two equal squares share one side. What larger shape can they make?", ["rectangle", "triangle", "circle"], 0, "Picture the squares side by side.", "Two equal squares side by side form a rectangle."],
      ["A library sign says CLOSED and every light is off. What should a visitor infer?", ["come back later", "whisper louder", "open every door"], 0, "Use both the sign and the dark building.", "The clues mean the visitor should come back later."]
    ]),
    Object.freeze([
      ["In 'Mina examined the shell,' what does examined mean?", ["looked at carefully", "threw away", "forgot"], 0, "Think about studying small details.", "Examined means looked at carefully."],
      ["Which simple food chain order makes sense?", ["plant, rabbit, fox", "fox, plant, rabbit", "rabbit, fox, plant"], 0, "Begin with the living thing that makes its own food.", "A plant can feed a rabbit, which can feed a fox."],
      ["Which shape can be split into two matching triangles by one diagonal?", ["square", "circle", "oval"], 0, "Imagine a line joining opposite corners.", "A square diagonal makes two matching triangles."],
      ["A note says 'Meet after the second bell.' The first bell rings. What should happen next?", ["wait for one more bell", "leave immediately", "ring both bells"], 0, "Track how many bells the note requires.", "One more bell must ring before the meeting."]
    ])
  ]),
  scout: Object.freeze([
    Object.freeze([
      ["A character packs a map before a hike. Why?", ["to find the route", "to make lunch", "to predict a score"], 0, "Connect the object to travel.", "A map helps a hiker find the route."],
      ["Which body part beats to move oxygen and nutrients around the body?", ["heart", "lungs", "stomach"], 0, "Think about the organ with a steady beat.", "The heart beats to move oxygen and nutrients around the body."],
      ["Lee is ahead of Jo, and Jo is ahead of Sam. Who is last?", ["Sam", "Jo", "Lee"], 0, "Follow the order from front to back.", "Sam is behind both Jo and Lee."],
      ["In 'The trail was steep,' steep means the trail had a ___ slope.", ["sharp", "flat", "silent"], 0, "Picture a path that climbs quickly.", "A steep trail has a sharp slope."]
    ]),
    Object.freeze([
      ["A character closes the window as dark clouds arrive. Why?", ["rain may enter", "the room is too bright", "a book is missing"], 0, "Use the clouds and open window together.", "Dark clouds suggest rain may enter."],
      ["What job do leaves mainly perform for a plant?", ["make food", "anchor roots", "carry seeds"], 0, "Think about sunlight reaching the plant.", "Leaves use light to help make food."],
      ["Red is left of blue, and green is right of blue. What is in the middle?", ["blue", "red", "green"], 0, "Place the three colors in order.", "Blue lies between red and green."],
      ["In 'The clue was scarce,' scarce means ___ available.", ["hardly any", "plenty", "always"], 0, "Think of something difficult to find.", "Scarce means hardly any is available."]
    ]),
    Object.freeze([
      ["A character rereads the final paragraph before answering. What trait is shown?", ["carefulness", "impatience", "forgetfulness"], 0, "Notice the extra effort before responding.", "Rereading before answering shows carefulness."],
      ["Why are fungi important in many habitats?", ["they break down dead matter", "they create moonlight", "they stop all rain"], 0, "Think about how old leaves return nutrients to soil.", "Many fungi break down dead matter."],
      ["Every bronze key is heavy. This key is bronze. What must be true?", ["it is heavy", "it is wooden", "it is lost"], 0, "Apply the rule to this key.", "The rule says every bronze key is heavy."],
      ["In 'The team reached a unanimous choice,' unanimous means ___ agreed.", ["everyone", "nobody", "only one person"], 0, "Think of a decision with no disagreement.", "Unanimous means everyone agreed."]
    ]),
    Object.freeze([
      ["A narrator mentions a cold wind three times. What mood does that detail build?", ["uneasy", "silly", "celebratory"], 0, "Notice how repeated cold wind might feel.", "Repeated cold wind can build an uneasy mood."],
      ["Which change is an adaptation rather than a learned behavior?", ["thick polar-bear fur", "a dog sitting on command", "a student reading"], 0, "Look for a body feature inherited at birth.", "Thick fur is an inherited adaptation."],
      ["No silver doors are unlocked. Door C is silver. What follows?", ["Door C is locked", "Door C is open", "Door C is wooden"], 0, "Apply the statement about every silver door.", "A silver door cannot be unlocked under the rule."],
      ["In 'The evidence contradicted the guess,' contradicted means ___ it.", ["disagreed with", "copied", "decorated"], 0, "Compare whether the evidence supports the guess.", "Contradicted means disagreed with."]
    ]),
    Object.freeze([
      ["The author reveals the broken compass only at the end. What does that explain?", ["why the group got lost", "why lunch was late", "why the sky was blue"], 0, "Connect the final object to the earlier problem.", "A broken compass explains why the group got lost."],
      ["How can two species compete in the same habitat?", ["they need the same limited food", "they share no resources", "they live in different eras"], 0, "Look for a resource both populations need.", "Species compete when they need the same limited resource."],
      ["If P implies Q and Q is false, what must be true about P?", ["P is false", "P is always true", "P equals Q"], 0, "A true first statement could not lead to a false result.", "If P guaranteed Q, a false Q rules out P."],
      ["In 'Her response was concise yet complete,' concise means ___", ["brief", "confusing", "unfinished"], 0, "The response used few words without missing meaning.", "Concise means brief."]
    ])
  ]),
  master: Object.freeze([
    Object.freeze([
      ["Which object orbits Earth?", ["Moon", "Sun", "Mars"], 0, "Think about the bright neighbor seen changing shape.", "The Moon orbits Earth."],
      ["In 'The result was evident,' evident means ___", ["clear", "hidden", "impossible"], 0, "Choose the word meaning easy to see or understand.", "Evident means clear."],
      ["All Echoes glow. This object does not glow. What follows?", ["it is not an Echo", "it is an Echo", "all objects glow"], 0, "Use the rule in reverse to rule something out.", "A non-glowing object cannot be an Echo under the rule."],
      ["Which phrase represents one half?", ["one of two equal parts", "one of three equal parts", "two whole parts"], 0, "Focus on the denominator represented by the number of equal parts.", "One half is one of two equal parts."]
    ]),
    Object.freeze([
      ["Why does Earth have day and night?", ["Earth rotates", "the Moon disappears", "the Sun circles Earth daily"], 0, "Think about Earth turning on its axis.", "Earth's rotation causes day and night."],
      ["In context, 'The plan was feasible' means the plan was ___", ["possible", "finished", "secret"], 0, "Judge whether the plan can realistically be done.", "Feasible means possible."],
      ["Either the north or east Gate is open. The north Gate is closed. What follows?", ["the east Gate is open", "both are closed", "the north Gate is open"], 0, "Eliminate the option known to be closed.", "The east Gate must be open."],
      ["Which fraction is greater than one half?", ["three fourths", "one fourth", "two fifths"], 0, "Compare each amount with two equal quarters.", "Three fourths is greater than one half."]
    ]),
    Object.freeze([
      ["What mainly drives Earth's water cycle?", ["energy from the Sun", "moonlight", "Earth's magnetic field"], 0, "Think about what heats surface water.", "Solar energy drives evaporation in the water cycle."],
      ["In 'The pattern was ambiguous,' ambiguous means ___", ["open to more than one meaning", "perfectly clear", "mathematically equal"], 0, "Think of wording that can be understood in different ways.", "Ambiguous means open to more than one meaning."],
      ["Exactly one of A or B is true. A is true. What is B?", ["false", "true", "unknown forever"], 0, "The rule allows only one true statement.", "If A is true, B must be false."],
      ["Which pair of fractions is equivalent?", ["two thirds and four sixths", "one half and one third", "three fourths and two fifths"], 0, "Multiply the top and bottom by the same number.", "Two thirds becomes four sixths when both parts double."]
    ]),
    Object.freeze([
      ["Why do seasons occur on Earth?", ["Earth's axis is tilted as it orbits", "Earth changes distance each day", "the Moon blocks sunlight"], 0, "Think about sunlight angles during Earth's yearly path.", "Earth's axial tilt during its orbit causes seasons."],
      ["In 'The claim required corroboration,' corroboration means ___", ["supporting evidence", "a shorter sentence", "a different topic"], 0, "Think about what makes a claim more trustworthy.", "Corroboration is supporting evidence."],
      ["If every R is S and no S is T, which statement must hold?", ["no R is T", "every T is R", "some R is T"], 0, "Follow R into S, then apply the rule about T.", "Anything in R is in S, so it cannot be in T."],
      ["Which value lies between two thirds and three fourths?", ["seven tenths", "one half", "four fifths"], 0, "Use decimal or common-denominator comparisons.", "Seven tenths is 0.7, between about 0.667 and 0.75."]
    ]),
    Object.freeze([
      ["What evidence best supports plate tectonics?", ["matching fossils on separated continents", "daily cloud shapes", "phases of the Moon"], 0, "Look for a clue that continents were once joined.", "Matching fossils across continents support plate tectonics."],
      ["In 'The two accounts were mutually exclusive,' the phrase means ___", ["they cannot both be true", "they tell the same story", "they are unfinished"], 0, "Decide whether both accounts can hold at once.", "Mutually exclusive claims cannot both be true."],
      ["If A implies B, and B implies C, while C is false, what follows?", ["A is false", "A is true", "B and C are true"], 0, "Trace the chain and rule out causes of a false result.", "A would force B and then C, so A must be false."],
      ["Which operation always preserves a fraction's value?", ["multiply numerator and denominator equally", "add only to the numerator", "subtract only from the denominator"], 0, "The top and bottom must change by the same factor.", "Multiplying both parts by the same nonzero number preserves value."]
    ])
  ])
});

const CAPSTONE_QUESTIONS = Object.freeze({
  "bright-start": Object.freeze([
    ["Which word means the same as tiny?", ["small", "loud", "late"], 0, "Think about something that takes up very little room.", "Tiny and small describe the same size."],
    ["Which word means the opposite of begin?", ["borrow", "finish", "whisper"], 1, "Think about what happens when an activity is complete.", "Finish is the opposite of begin."],
    ["In the sentence 'Nia glanced at the map,' what does glanced mean?", ["folded carefully", "forgot completely", "looked quickly"], 2, "Picture a short look before moving on.", "Glanced means looked quickly."],
    ["A fragile shell must be carried carefully. What does fragile mean?", ["easily broken", "very noisy", "hard to find"], 0, "Think about why the shell needs gentle hands.", "Fragile means easily broken."],
    ["The Explorer was reluctant to cross before checking the map. What does reluctant mean?", ["ready immediately", "not eager to act", "unable to read"], 1, "The Explorer needs more confidence before moving.", "Reluctant means not eager or willing to act."]
  ]),
  "trail-scout": Object.freeze([
    ["Boots are muddy and an umbrella is dripping by the door. What most likely happened?", ["it rained recently", "the room was painted", "a meal was cooked"], 0, "Combine the clues from both objects.", "Mud and a dripping umbrella suggest recent rain."],
    ["Cal packs a flashlight, sleeping bag, and tent. What is Cal probably planning?", ["a short swim", "an overnight camp", "a music lesson"], 1, "Think about one activity that uses all three items.", "A flashlight, sleeping bag, and tent are useful for an overnight camp."],
    ["At a fork in the trail, Bea checks the map before walking. Why?", ["to count the trees", "to fold the paper", "to choose the correct trail"], 2, "Ask what a map helps a traveler decide.", "Checking the map helps Bea choose the correct trail."],
    ["Several seedlings bend toward a sunny window. What is the best inference?", ["the plants are growing toward light", "the window is getting smaller", "the soil is turning to glass"], 0, "Notice what all the seedlings are facing.", "The seedlings bend toward the light from the window."],
    ["A bridge notice says the crossing is unsafe, so the group takes a longer route. What does this show?", ["the map was lost", "evidence changed the plan", "the longer route is always faster"], 1, "Connect the warning to the group's next choice.", "The safety notice provided evidence that changed the group's plan."]
  ]),
  "maze-master": Object.freeze([
    ["What causes the regular cycle of day and night on Earth?", ["Earth rotates on its axis", "the Moon blocks the Sun", "the Sun circles Earth each day"], 0, "Think about which body turns during one day.", "Earth's rotation brings different places into and out of sunlight."],
    ["Water vapor cools high in the atmosphere and forms cloud droplets. Which process occurred?", ["evaporation", "condensation", "erosion"], 1, "Think about a gas changing into liquid droplets.", "Condensation changes cooled water vapor into liquid droplets."],
    ["Why do Earth’s seasons repeat each year?", ["Earth spins faster in summer", "clouds move between hemispheres", "Earth's tilted axis changes sunlight angles during its orbit"], 2, "Consider both Earth's tilt and its yearly path.", "Earth's axial tilt changes sunlight angles as Earth orbits the Sun."],
    ["Matching fossils are found on continents now separated by an ocean. What idea does this best support?", ["the continents were once joined", "all fossils formed underwater", "the ocean has never changed"], 0, "Ask how the same organisms could appear on distant land.", "Matching fossils support the idea that the continents were once connected."],
    ["If the atmosphere gains more heat-trapping gas while other conditions stay similar, what is the most direct effect?", ["less sunlight reaches space", "more outgoing heat is retained", "Earth stops rotating"], 1, "Track what a heat-trapping gas does to energy leaving Earth.", "More heat-trapping gas retains more outgoing heat in the atmosphere."]
  ])
});

/** @param {number} ordinal */
function scenarioFor(ordinal) {
  const sequence = Math.floor(ordinal / 4);
  return {
    name: NAMES[sequence % NAMES.length],
    item: ITEMS[Math.floor(sequence / NAMES.length) % ITEMS.length],
    place:
      PLACES[
        Math.floor(sequence / (NAMES.length * ITEMS.length)) % PLACES.length
      ],
    sequence
  };
}

/**
 * @param {number} answer
 * @param {number} spread
 * @param {number} ordinal
 */
function numericChoices(answer, spread, ordinal) {
  const lower = Math.max(0, answer - spread);
  const upper = answer + spread;
  const values = [lower, answer, upper];
  const answerIndex = ordinal % values.length;
  const rotated = [
    values[(3 - answerIndex) % 3],
    values[(4 - answerIndex) % 3],
    values[(5 - answerIndex) % 3]
  ];
  const ids = ["a", "b", "c"];
  const correctIndex = rotated.indexOf(answer);
  return {
    choices: ids.map((id, index) => ({
      id,
      label: String(rotated[index])
    })),
    answerId: ids[correctIndex]
  };
}

/**
 * @param {string} id
 * @param {string} prompt
 * @param {number} answer
 * @param {number} spread
 * @param {number} ordinal
 * @param {string} hint
 * @param {string} explanation
 * @param {string} difficultyBand
 * @param {number} difficultyRank
 * @returns {BaseWardenQuestion}
 */
function createNumericQuestion(
  id,
  prompt,
  answer,
  spread,
  ordinal,
  hint,
  explanation,
  difficultyBand,
  difficultyRank
) {
  return {
    id,
    prompt,
    ...numericChoices(answer, Math.max(1, spread), ordinal),
    hint,
    explanation,
    difficultyBand,
    difficultyRank
  };
}

/**
 * @param {string} id
 * @param {{ name: string, item: string, place: string }} scenario
 * @param {CurriculumCard} card
 * @param {string} difficultyBand
 * @param {number} difficultyRank
 * @returns {BaseWardenQuestion}
 */
function createCurriculumQuestion(
  id,
  scenario,
  card,
  difficultyBand,
  difficultyRank
) {
  const [prompt, labels, answerIndex, hint, explanation] = card;
  const ids = ["a", "b", "c"];
  return {
    id,
    prompt:
      `${scenario.name} opens a Question scroll at the ${scenario.place} beside the ${scenario.item}. ${prompt}`,
    choices: labels.map((label, index) => ({ id: ids[index], label })),
    answerId: ids[answerIndex],
    hint,
    explanation,
    difficultyBand,
    difficultyRank
  };
}

/**
 * @param {number} bandIndex
 * @param {number} ordinal
 * @param {string} bandId
 * @param {number} rank
 */
function createBrightQuestion(bandIndex, ordinal, bandId, rank) {
  const { name, item, place, sequence } = scenarioFor(ordinal);
  const limit = BRIGHT_LIMITS[bandIndex];
  const template = ordinal % 8;
  const first = 1 + (sequence * 7 + bandIndex * 3) % Math.max(2, limit - 2);
  const second =
    1 + (sequence * 5 + bandIndex * 2) % Math.max(1, limit - first);
  const total = first + second;
  const id = `bright-${bandId}-${ordinal}`;

  if (template === 0) {
    return createNumericQuestion(
      id,
      `At the ${place}, ${name} finds ${first} ${item} and then ${second} more. How many ${item} are there altogether?`,
      total,
      Math.max(1, bandIndex + 1),
      ordinal,
      "Combine the two groups by counting on.",
      `${first} plus ${second} equals ${total}.`,
      bandId,
      rank
    );
  }
  if (template === 1) {
    const start = Math.min(limit, total + bandIndex + 2);
    const removed = Math.min(first, start - 1);
    const answer = start - removed;
    return createNumericQuestion(
      id,
      `${name} carries ${start} ${item} from the ${place} and gives away ${removed}. How many remain?`,
      answer,
      Math.max(1, bandIndex + 1),
      ordinal,
      "Start with the whole group, then count back.",
      `${start} minus ${removed} equals ${answer}.`,
      bandId,
      rank
    );
  }
  if (template === 2) {
    return createNumericQuestion(
      id,
      `${name} needs ${total} ${item} at the ${place} and already has ${first}. How many more are needed?`,
      second,
      Math.max(1, bandIndex + 1),
      ordinal,
      "Count from the amount already held up to the goal.",
      `${first} plus ${second} reaches ${total}.`,
      bandId,
      rank
    );
  }
  if (template === 3) {
    const step = bandIndex + 1;
    const patternStart =
      1 + (sequence * 7 + bandIndex * 3) % Math.max(1, 20 - step * 3);
    const answer = patternStart + step * 3;
    return createNumericQuestion(
      id,
      `${name} writes this growing pattern at the ${place}: ${patternStart}, ${patternStart + step}, ${patternStart + step * 2}. What number comes next?`,
      answer,
      step,
      ordinal,
      "Look for the same amount added each time.",
      `The pattern adds ${step} each time, so the next number is ${answer}.`,
      bandId,
      rank
    );
  }
  return createCurriculumQuestion(
    id,
    { name, item, place },
    /** @type {CurriculumCard} */ (
      /** @type {unknown} */ (
        CURRICULUM_QUESTIONS.bright[bandIndex][template - 4]
      )
    ),
    bandId,
    rank
  );
}

/**
 * @param {number} bandIndex
 * @param {number} ordinal
 * @param {string} bandId
 * @param {number} rank
 */
function createScoutQuestion(bandIndex, ordinal, bandId, rank) {
  const { name, item, place, sequence } = scenarioFor(ordinal);
  const maxFactor = SCOUT_FACTORS[bandIndex];
  const template = ordinal % 8;
  const groups = 2 + (sequence * 3 + bandIndex) % Math.max(2, maxFactor - 1);
  const each = 2 + (sequence * 5 + bandIndex * 2) % Math.max(2, maxFactor - 1);
  const product = groups * each;
  const id = `scout-${bandId}-${ordinal}`;

  if (template === 0) {
    return createNumericQuestion(
      id,
      `At the ${place}, ${name} fills ${groups} bags with ${each} ${item} in each bag. How many ${item} are packed?`,
      product,
      groups,
      ordinal,
      "Use equal groups and multiply.",
      `${groups} groups of ${each} make ${product}.`,
      bandId,
      rank
    );
  }
  if (template === 1) {
    return createNumericQuestion(
      id,
      `${name} shares ${product} ${item} equally among ${groups} teams at the ${place}. How many does each team receive?`,
      each,
      Math.max(1, bandIndex + 1),
      ordinal,
      "Split the total into equal groups.",
      `${product} divided into ${groups} equal groups gives ${each} per group.`,
      bandId,
      rank
    );
  }
  if (template === 2) {
    const extra = 1 + (sequence + bandIndex) % (bandIndex + 4);
    const answer = product + extra;
    return createNumericQuestion(
      id,
      `${name} arranges ${groups} rows of ${each} ${item} at the ${place}, then adds ${extra} more. How many are there now?`,
      answer,
      groups,
      ordinal,
      "Find the equal rows first, then add the extras.",
      `${groups} times ${each} is ${product}; adding ${extra} makes ${answer}.`,
      bandId,
      rank
    );
  }
  if (template === 3) {
    const width = 2 + (sequence + bandIndex) % maxFactor;
    const length = 3 + (sequence * 2 + bandIndex) % maxFactor;
    const perimeter = 2 * (width + length);
    return createNumericQuestion(
      id,
      `${name} marks a rectangular ${place} plot ${length} steps long and ${width} steps wide. How many steps go around its edge?`,
      perimeter,
      2 + bandIndex,
      ordinal,
      "Add all four sides of the rectangle.",
      `Two lengths and two widths give ${perimeter} steps around the edge.`,
      bandId,
      rank
    );
  }
  return createCurriculumQuestion(
    id,
    { name, item, place },
    /** @type {CurriculumCard} */ (
      /** @type {unknown} */ (
        CURRICULUM_QUESTIONS.scout[bandIndex][template - 4]
      )
    ),
    bandId,
    rank
  );
}

/**
 * @param {number} bandIndex
 * @param {number} ordinal
 * @param {string} bandId
 * @param {number} rank
 */
function createMasterQuestion(bandIndex, ordinal, bandId, rank) {
  const { name, item, place, sequence } = scenarioFor(ordinal);
  const maxFactor = MASTER_FACTORS[bandIndex];
  const template = ordinal % 8;
  const first = 3 + (sequence * 5 + bandIndex) % maxFactor;
  const second = 2 + (sequence * 7 + bandIndex) % Math.max(3, maxFactor - 1);
  const id = `master-${bandId}-${ordinal}`;

  if (template === 0) {
    const denominator = 2 + (sequence + bandIndex) % (bandIndex + 3);
    const groups = 2 + (sequence * 3) % maxFactor;
    const total = denominator * groups;
    const numerator = 1 + (sequence * 5) % (denominator - 1);
    const answer = groups * numerator;
    return createNumericQuestion(
      id,
      `${name} sorts ${total} ${item} at the ${place}. How many are ${numerator}/${denominator} of the total?`,
      answer,
      groups,
      ordinal,
      "Find one equal part first, then take the needed parts.",
      `One ${denominator}th is ${groups}; ${numerator} parts make ${answer}.`,
      bandId,
      rank
    );
  }
  if (template === 1) {
    const product = first * second;
    const removed = 1 + (sequence + bandIndex) % second;
    const answer = product - removed;
    return createNumericQuestion(
      id,
      `${name} prepares ${first} trays with ${second} ${item} each at the ${place}, then removes ${removed}. How many remain?`,
      answer,
      first,
      ordinal,
      "Multiply for the trays before subtracting what was removed.",
      `${first} times ${second} is ${product}; minus ${removed} leaves ${answer}.`,
      bandId,
      rank
    );
  }
  if (template === 2) {
    const multiplier = 2 + (sequence + bandIndex) % (bandIndex + 3);
    const numerator = 1 + (sequence * 3) % Math.max(1, multiplier - 1);
    const equivalentNumerator = numerator * multiplier;
    const equivalentDenominator = multiplier * multiplier;
    return createNumericQuestion(
      id,
      `${name} labels a set of ${item} ${numerator}/${multiplier} at the ${place}. What numerator makes an equivalent fraction with denominator ${equivalentDenominator}?`,
      equivalentNumerator,
      multiplier,
      ordinal,
      "Multiply the top and bottom by the same amount.",
      `Multiplying both parts by ${multiplier} gives ${equivalentNumerator}/${equivalentDenominator}.`,
      bandId,
      rank
    );
  }
  if (template === 3) {
    const step = 2 + bandIndex;
    const start = first * step;
    const answer = start + step * 3;
    return createNumericQuestion(
      id,
      `${name} records this pattern at the ${place}: ${start}, ${start + step}, ${start + step * 2}. What number comes next?`,
      answer,
      step,
      ordinal,
      "Find the constant difference between neighboring numbers.",
      `Each number grows by ${step}, so the next number is ${answer}.`,
      bandId,
      rank
    );
  }
  return createCurriculumQuestion(
    id,
    { name, item, place },
    /** @type {CurriculumCard} */ (
      /** @type {unknown} */ (
        CURRICULUM_QUESTIONS.master[bandIndex][template - 4]
      )
    ),
    bandId,
    rank
  );
}

/** @param {unknown} question @returns {WardenQuestion} */
function bindBundledReviewedRevision(question) {
  const normalized = normalizeQuestion(question);
  const contentKey =
    `bundled-content:${normalized.id}:` +
    reviewedQuestionContentDigest(normalized, null);
  const echoLens = getReviewedEchoLens(contentKey);
  const reviewedRevisionId = createReviewedQuestionRevisionId(
    normalized,
    "bundled",
    echoLens
  );
  return normalizeQuestion({
    ...normalized,
    reviewedRevisionId,
    ...(echoLens ? { echoLens } : {})
  });
}

/**
 * @param {QuestionRequest} request
 * @param {{ capstoneQuestions?: Record<string, readonly unknown[]> }} [options]
 * @returns {WardenQuestion}
 */
export function getBundledQuestion({
  levelId,
  attempt = 0,
  labyrinthNumber = 1,
  questionOrdinal = attempt,
  challengeKind = "warden"
}, options = {}) {
  const level = getQuestLevel(levelId);
  const band = getDifficultyBand(labyrinthNumber);
  const ordinal = Math.max(0, Math.trunc(questionOrdinal));
  const difficultyRank = level.number * 10 + band.index + 1;
  if (challengeKind === "gate-warden") {
    const capstoneQuestions =
      options.capstoneQuestions ?? CAPSTONE_QUESTIONS;
    const deck = capstoneQuestions[level.id];
    const card = Array.isArray(deck) ? deck[band.index] : undefined;
    if (card) {
      try {
        return bindBundledReviewedRevision({
          ...createCurriculumQuestion(
            `capstone-${level.id}-${band.id}`,
            scenarioFor(level.number * 100 + band.index),
            /** @type {CurriculumCard} */ (card),
            band.id,
            difficultyRank
          ),
          ...getLearningMetadata(level.id, 4)
        });
      } catch {
        // Curated content must never strand a Run. Fall through to the
        // ordinary reviewed generator at the same Level, Band, and ordinal.
      }
    }
  }
  let question;
  if (level.id === "bright-start") {
    question = createBrightQuestion(
      band.index,
      ordinal,
      band.id,
      difficultyRank
    );
  } else if (level.id === "trail-scout") {
    question = createScoutQuestion(
      band.index,
      ordinal,
      band.id,
      difficultyRank
    );
  } else if (level.id === "maze-master") {
    question = createMasterQuestion(
      band.index,
      ordinal,
      band.id,
      difficultyRank
    );
  } else {
    throw new Error(`Unsupported Quest Level: ${level.id}`);
  }

  return bindBundledReviewedRevision({
    ...question,
    ...getLearningMetadata(level.id, ordinal)
  });
}
