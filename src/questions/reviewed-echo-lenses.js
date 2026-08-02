import { LENS_KINDS, normalizeEchoLens } from "./echo-lens.js";
import { normalizeQuestion } from "./question-contract.js";
import {
  createReviewedQuestionRevisionId,
  reviewedQuestionContentDigest
} from "./reviewed-question-revision.js";
import { reviewedContentDigest } from "./reviewed-content-hash.js";

/** @type {Readonly<Record<string, unknown>>} */
const REVIEWED_ECHO_LENSES = Object.freeze({
  "bundled-content:bright-foundation-0:7e84039805bc7a7268351b3a130d62d0": Object.freeze({
    version: 1,
    kind: "number-line",
    title: "See one more",
    reasoning:
      "Start at 1 and move one step forward. The next stop is 2, so 1 plus 1 equals 2.",
    steps: Object.freeze([
      "Start at 1.",
      "Move one step forward.",
      "Land on 2."
    ]),
    visual: Object.freeze({
      start: 0,
      end: 2,
      markers: Object.freeze([
        Object.freeze({ value: 0, label: "Zero" }),
        Object.freeze({ value: 1, label: "Start" }),
        Object.freeze({ value: 2, label: "Answer" })
      ])
    })
  }),
  "bundled-content:master-foundation-1:24d83c8734a9c8e262ff8194728e75f1": Object.freeze({
    version: 1,
    kind: "array",
    title: "See six take away one",
    reasoning:
      "Three trays of two acorns make six, then taking one away leaves five.",
    steps: Object.freeze([
      "Make three rows of two.",
      "Count the six acorns in the rows.",
      "Take one away and count five."
    ]),
    visual: Object.freeze({ rows: 3, columns: 2, filled: 5 })
  }),
  "bundled-content:master-foundation-2:a5118a5488c10e37584450d37594d4b0": Object.freeze({
    version: 1,
    kind: "fraction-bar",
    title: "See equal fraction parts",
    reasoning:
      "One half is one of two equal parts. Multiplying both parts by two makes two fourths.",
    steps: Object.freeze([
      "Start with one half.",
      "Split the bar into two equal parts.",
      "Make two equal copies of the top and bottom."
    ]),
    visual: Object.freeze({ numerator: 2, denominator: 4 })
  }),
  "bundled-content:bright-foundation-4:ba36e0007e473e5bcbeecb800f9f15db": Object.freeze({
    version: 1,
    kind: "word-highlight",
    title: "See matching meaning",
    reasoning:
      "Glad and happy are feeling words that share the same meaning.",
    steps: Object.freeze([
      "Read the word glad.",
      "Notice that it names a joyful feeling.",
      "Match it with happy."
    ]),
    visual: Object.freeze({
      text: "Glad means happy.",
      highlights: Object.freeze([
        Object.freeze({ text: "Glad", label: "the clue word" }),
        Object.freeze({ text: "happy", label: "the matching meaning" })
      ])
    })
  }),
  "bundled-content:bright-foundation-3:7508bf2126b7cba1e0f12779b34e53f9": Object.freeze({
    version: 1,
    kind: "pattern",
    title: "See the growing pattern",
    reasoning:
      "The pattern adds one each time, so the next term follows the same step.",
    steps: Object.freeze([
      "Compare the first two terms.",
      "Notice the increase of one.",
      "Continue that same increase."
    ]),
    visual: Object.freeze({
      terms: Object.freeze(["1", "2", "3"]),
      next: "4"
    })
  }),
  "bundled-content:scout-capable-5:ab314b3c1b9e9852c5947304753ba06a": Object.freeze({
    version: 1,
    kind: "diagram",
    title: "See how fungi help",
    reasoning:
      "Fungi break down dead matter and return nutrients to the soil.",
    steps: Object.freeze([
      "Start with dead matter.",
      "Follow it to fungi.",
      "See nutrients return to soil."
    ]),
    visual: Object.freeze({
      nodes: Object.freeze([
        Object.freeze({ id: "dead-matter", label: "Dead matter" }),
        Object.freeze({ id: "fungi", label: "Fungi" }),
        Object.freeze({ id: "soil", label: "Soil nutrients" })
      ]),
      edges: Object.freeze([
        Object.freeze({
          from: "dead-matter",
          to: "fungi",
          label: "is broken down by"
        }),
        Object.freeze({
          from: "fungi",
          to: "soil",
          label: "returns nutrients to"
        })
      ])
    })
  })
});

/** @param {string} reviewedQuestionContentKey */
export function getReviewedEchoLens(reviewedQuestionContentKey) {
  const lens = REVIEWED_ECHO_LENSES[reviewedQuestionContentKey];
  return lens ? normalizeEchoLens(lens) : null;
}

/**
 * Recompute the published content keys and exact bundled revision bindings.
 * The question list is intentionally supplied by the caller so this verifier
 * can be used by a deterministic content test without making the question
 * bank depend on itself.
 *
 * @param {readonly unknown[]} reviewedQuestions
 */
export function getReviewedEchoLensCoverage(reviewedQuestions) {
  if (!Array.isArray(reviewedQuestions) || reviewedQuestions.length === 0) {
    throw new Error("Echo Lens coverage requires reviewed Questions.");
  }

  const entries = Object.entries(REVIEWED_ECHO_LENSES).map(
    ([contentKey, rawLens]) => {
      if (
        !/^bundled-content:[a-z0-9-]+:[a-f0-9]{32}$/iu.test(contentKey)
      ) {
        throw new Error("Echo Lens content key is not a reviewed bundle key.");
      }
      return Object.freeze({
        contentKey,
        lens: normalizeEchoLens(rawLens)
      });
    }
  );
  const publishedKinds = entries.map((entry) => entry.lens.kind);
  if (
    new Set(publishedKinds).size !== publishedKinds.length ||
    publishedKinds.length !== LENS_KINDS.size ||
    publishedKinds.some((kind) => !LENS_KINDS.has(kind)) ||
    [...LENS_KINDS].some((kind) => !publishedKinds.includes(kind))
  ) {
    throw new Error("Echo Lens pack does not cover every reviewed primitive.");
  }

  const questions = reviewedQuestions.map((question) =>
    normalizeQuestion(question)
  );
  const questionByContentKey = new Map(
    questions.map((question) => [contentKeyFor(question), question])
  );
  const boundEntries = entries.map((entry) => {
    const question = questionByContentKey.get(entry.contentKey);
    if (!question || !question.echoLens || !question.reviewedRevisionId) {
      throw new Error(
        `Echo Lens entry is not bound to ${entry.contentKey}.`
      );
    }
    const expectedRevisionId = createReviewedQuestionRevisionId(
      question,
      "bundled",
      entry.lens
    );
    if (
      question.reviewedRevisionId !== expectedRevisionId ||
      reviewedContentDigest(question.echoLens) !==
        reviewedContentDigest(entry.lens)
    ) {
      throw new Error(
        `Echo Lens entry does not match the reviewed revision for ${entry.contentKey}.`
      );
    }
    return Object.freeze({
      contentKey: entry.contentKey,
      reviewedRevisionId: question.reviewedRevisionId,
      kind: entry.lens.kind
    });
  });
  const publishedKeys = new Set(entries.map((entry) => entry.contentKey));
  const unsupportedCount = questions.filter(
    (question) => !publishedKeys.has(contentKeyFor(question))
  ).length;

  return Object.freeze({
    version: 1,
    publishedCount: entries.length,
    coveredKinds: Object.freeze([...publishedKinds]),
    boundCount: boundEntries.length,
    unsupportedCount,
    entries: Object.freeze(boundEntries)
  });
}

/** @param {ReturnType<typeof normalizeQuestion>} question */
function contentKeyFor(question) {
  return (
    `bundled-content:${question.id}:` +
    reviewedQuestionContentDigest(question, null)
  );
}
