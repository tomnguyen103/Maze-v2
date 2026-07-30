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
    const catalog = await import(
      "../src/questions/learning-deck-catalog.js"
    );

    expect(catalog.getPublishedLearningDeckOptions()).toHaveLength(2);
    expect(questionBank.getBundledQuestion).not.toHaveBeenCalled();

    const decks = await import("../src/questions/learning-decks.js");
    expect(
      decks.getPublishedLearningDeckRevision("mixed-trail")?.deckId
    ).toBe("mixed-trail");
    expect(questionBank.getBundledQuestion).toHaveBeenCalledTimes(15);
  });

  it("keeps child-visible options aligned with the lightweight Quest identities", async () => {
    const [{ getPublishedLearningDeckOptions }, identity] = await Promise.all([
      import("../src/questions/learning-deck-catalog.js"),
      import("../src/questions/learning-deck-identity.js")
    ]);

    for (const option of getPublishedLearningDeckOptions()) {
      expect(
        identity.getPublishedLearningDeckRevisionId(option.deckId)
      ).toBe(option.revisionId);
      // A new Quest pins the newest published revision, and every revision
      // this Deck has published stays readable for Quests that pinned it.
      expect(option.publishedRevisionIds.at(-1)).toBe(option.revisionId);
      for (const revisionId of option.publishedRevisionIds) {
        expect(
          identity.isPublishedLearningDeckRevision(option.deckId, revisionId)
        ).toBe(true);
      }
      expect(
        identity.isPublishedLearningDeckRevision(
          option.deckId,
          `${option.revisionId}-draft`
        )
      ).toBe(false);
    }
    expect(
      identity.isPublishedLearningDeckRevision("constructor", "anything")
    ).toBe(false);
  });
});
