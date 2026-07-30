import { normalizeEchoLens } from "./echo-lens.js";

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
  })
});

/** @param {string} reviewedQuestionContentKey */
export function getReviewedEchoLens(reviewedQuestionContentKey) {
  const lens = REVIEWED_ECHO_LENSES[reviewedQuestionContentKey];
  return lens ? normalizeEchoLens(lens) : null;
}
