import { describe, expect, it } from "vitest";
import { normalizeQuestion } from "../src/questions/question-contract.js";
import { normalizeEchoLens } from "../src/questions/echo-lens.js";

const QUESTION = {
  id: "lens-number-1",
  reviewedRevisionId: "reviewed_lens-number-1_v1",
  prompt: "What is 3 + 4?",
  choices: [
    { id: "a", label: "6" },
    { id: "b", label: "7" },
    { id: "c", label: "8" }
  ],
  answerId: "b",
  hint: "Count on four from three.",
  explanation: "Three plus four equals seven.",
  difficultyBand: "foundation",
  difficultyRank: 11,
  topicId: "arithmetic",
  learningObjectiveId: "bright-combine-groups",
  echoLens: {
    version: 1,
    kind: "number-line",
    title: "Count from three to seven",
    reasoning: "Start at 3 and make 4 one-step jumps. The last stop is 7.",
    steps: [
      "Start at 3.",
      "Move 4 steps to the right.",
      "Land on 7."
    ],
    visual: {
      start: 3,
      end: 7,
      markers: [
        { value: 3, label: "Start" },
        { value: 7, label: "Answer" }
      ]
    }
  }
};

describe("Reviewed Question Revision Echo Lens", () => {
  it("preserves one exact reviewed revision and a defensive Lens copy", () => {
    const normalized = normalizeQuestion(QUESTION);

    expect(normalized.reviewedRevisionId).toBe(
      "reviewed_lens-number-1_v1"
    );
    expect(normalized.echoLens).toEqual(QUESTION.echoLens);

    QUESTION.echoLens.steps[0] = "Changed after review.";
    QUESTION.echoLens.visual.markers[0].label = "Changed";

    expect(normalized.echoLens?.steps[0]).toBe("Start at 3.");
    const normalizedVisual =
      /** @type {{ markers: { label: string }[] }} */ (
        normalized.echoLens?.visual
      );
    expect(normalizedVisual.markers[0]?.label).toBe("Start");
  });

  it("accepts only the six reviewed visual primitive families", () => {
    const shared = {
      version: 1,
      title: "Reviewed model",
      reasoning: "The visible model and these words explain the same steps.",
      steps: ["Read the clue.", "Follow the model.", "Check the answer."]
    };
    const lenses = [
      QUESTION.echoLens,
      {
        ...shared,
        kind: "array",
        visual: { rows: 3, columns: 4, filled: 12 }
      },
      {
        ...shared,
        kind: "fraction-bar",
        visual: { numerator: 3, denominator: 4 }
      },
      {
        ...shared,
        kind: "word-highlight",
        visual: {
          text: "The careful fox moved quietly.",
          highlights: [{ text: "quietly", label: "tells how the fox moved" }]
        }
      },
      {
        ...shared,
        kind: "pattern",
        visual: { terms: ["2", "4", "6"], next: "8" }
      },
      {
        ...shared,
        kind: "diagram",
        visual: {
          nodes: [
            { id: "plant", label: "Plant" },
            { id: "rabbit", label: "Rabbit" }
          ],
          edges: [
            { from: "plant", to: "rabbit", label: "gives energy to" }
          ]
        }
      }
    ];

    expect(lenses.map((lens) => normalizeEchoLens(lens).kind)).toEqual([
      "number-line",
      "array",
      "fraction-bar",
      "word-highlight",
      "pattern",
      "diagram"
    ]);
  });

  it("rejects unreviewed fields, remote content, and mismatched visual facts", () => {
    expect(() =>
      normalizeQuestion({
        ...QUESTION,
        reviewedRevisionId: undefined
      })
    ).toThrow(/exact Reviewed Question Revision/i);
    expect(() =>
      normalizeQuestion({
        ...QUESTION,
        echoLens: {
          ...QUESTION.echoLens,
          sourceUrl: "https://example.com/model"
        }
      })
    ).toThrow(/unsupported fields/i);
    expect(() =>
      normalizeQuestion({
        ...QUESTION,
        echoLens: {
          ...QUESTION.echoLens,
          reasoning: "Open https://example.com for the answer."
        }
      })
    ).toThrow(/unsupported content/i);
    for (const url of [
      "mailto:teacher@example.com",
      "data:text/plain,answer",
      "file:///reviewed-answer.txt",
      "www.example.com/model",
      "//example.com/model",
      "example.com/model",
      "192.0.2.1/model",
      "[2001:db8::1]/model",
      "localhost:4173/model"
    ]) {
      expect(() =>
        normalizeQuestion({
          ...QUESTION,
          echoLens: {
            ...QUESTION.echoLens,
            reasoning: `Open ${url} for the answer.`
          }
        })
      ).toThrow(/unsupported content/i);
    }
    expect(() =>
      normalizeQuestion({
        ...QUESTION,
        echoLens: {
          ...QUESTION.echoLens,
          reasoning: "Use the weapon clue to choose."
        }
      })
    ).toThrow(/kid-safe/i);
    expect(() =>
      normalizeEchoLens({
        ...QUESTION.echoLens,
        visual: {
          start: 3,
          end: 7,
          markers: [
            { value: 3, label: "Start" },
            { value: 8, label: "Outside" }
          ]
        }
      })
    ).toThrow(/inside the number line/i);
  });
});
