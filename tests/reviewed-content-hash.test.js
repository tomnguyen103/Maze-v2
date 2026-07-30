import { describe, expect, it } from "vitest";
import { reviewedContentDigest } from "../src/questions/reviewed-content-hash.js";

describe("Reviewed Question Revision content identity", () => {
  it("is stable across key order and changes when its Echo Lens changes", () => {
    const first = {
      question: "What is 1 + 1?",
      echoLens: { title: "See one more", steps: ["Start at 1.", "Land on 2."] }
    };
    const reordered = {
      echoLens: { steps: ["Start at 1.", "Land on 2."], title: "See one more" },
      question: "What is 1 + 1?"
    };
    const editedLens = {
      ...first,
      echoLens: { ...first.echoLens, title: "Count one more" }
    };

    expect(reviewedContentDigest(first)).toMatch(/^[a-f0-9]{32}$/);
    expect(reviewedContentDigest(reordered)).toBe(
      reviewedContentDigest(first)
    );
    expect(reviewedContentDigest(editedLens)).not.toBe(
      reviewedContentDigest(first)
    );
  });
});
