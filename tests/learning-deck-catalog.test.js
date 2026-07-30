import { afterEach, describe, expect, it, vi } from "vitest";

describe("Learning Deck catalog loading", () => {
  afterEach(() => {
    vi.doUnmock("../src/questions/question-bank.js");
    vi.resetModules();
  });

  it("lists options without building Questions and builds only the requested Deck", async () => {
    vi.resetModules();
    vi.doMock("../src/questions/question-bank.js", async () => {
      const actual = /** @type {typeof import("../src/questions/question-bank.js")} */ (
        await vi.importActual("../src/questions/question-bank.js")
      );
      return {
        ...actual,
        getBundledQuestion: vi.fn(actual.getBundledQuestion)
      };
    });
    const questionBank = await import(
      "../src/questions/question-bank.js"
    );
    const decks = await import("../src/questions/learning-decks.js");

    expect(decks.getPublishedLearningDeckOptions()).toHaveLength(4);
    expect(questionBank.getBundledQuestion).not.toHaveBeenCalled();

    expect(
      decks.getPublishedLearningDeckRevision("mixed-trail")?.deckId
    ).toBe("mixed-trail");
    expect(questionBank.getBundledQuestion).toHaveBeenCalledTimes(15);
  });
});
