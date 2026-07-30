// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from "vitest";
import { renderEchoLensContent } from "../src/learning/echo-lens-view.js";

const SHARED = {
  version: 1,
  title: "Reviewed model",
  reasoning: "The words explain the same reasoning as the visual model.",
  steps: ["Read the clue.", "Follow the model.", "Check the answer."]
};

const LENSES = [
  {
    ...SHARED,
    kind: "number-line",
    visual: {
      start: 0,
      end: 4,
      markers: [
        { value: 0, label: "Zero" },
        { value: 2, label: "Start" },
        { value: 4, label: "Answer" }
      ]
    }
  },
  {
    ...SHARED,
    kind: "array",
    visual: { rows: 2, columns: 3, filled: 6 }
  },
  {
    ...SHARED,
    kind: "fraction-bar",
    visual: { numerator: 2, denominator: 3 }
  },
  {
    ...SHARED,
    kind: "word-highlight",
    visual: {
      text: "The careful fox moved quietly.",
      highlights: [{ text: "quietly", label: "tells how the fox moved" }]
    }
  },
  {
    ...SHARED,
    kind: "pattern",
    visual: { terms: ["2", "4", "6"], next: "8" }
  },
  {
    ...SHARED,
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

/** @type {HTMLElement} */
let content;

beforeEach(() => {
  document.body.innerHTML = "<div id='content'></div>";
  content = /** @type {HTMLElement} */ (document.getElementById("content"));
});

describe("post-answer Echo Lens view", () => {
  it("renders all six allowlisted visual families with equivalent reasoning", () => {
    for (const lens of LENSES) {
      renderEchoLensContent(content, lens);

      const visual = content.querySelector("[data-lens-kind]");
      expect(visual?.getAttribute("data-lens-kind")).toBe(lens.kind);
      expect(visual?.getAttribute("role")).toBe("img");
      expect(visual?.getAttribute("aria-label")).not.toBe("");
      expect(content.textContent).toContain(lens.reasoning);
      for (const step of lens.steps) {
        expect(content.textContent).toContain(step);
      }
    }
  });

  it("replaces the prior explanation without retaining an answer transcript", () => {
    renderEchoLensContent(content, LENSES[0]);
    renderEchoLensContent(content, {
      ...LENSES[4],
      title: "A fresh reviewed model"
    });

    expect(content.textContent).toContain("A fresh reviewed model");
    expect(content.querySelectorAll("[data-lens-kind]")).toHaveLength(1);
    expect(content.innerHTML).not.toMatch(/answerId|answeredAt|timestamp/i);
  });
});
