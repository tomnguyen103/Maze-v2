import { describe, expect, it, vi } from "vitest";
import {
  QUEST_LEVELS,
  getQuestLevel
} from "../src/questions/quest-levels.js";
import { getBundledQuestion } from "../src/questions/question-bank.js";
import {
  createQuestionService,
  normalizeQuestion
} from "../server/question-service.js";
import {
  createQuestionRateLimiter,
  parseQuestionBody,
  parseQuestionRequest
} from "../server/question-route.js";
import { getPublishedLearningDeckOption } from "../src/questions/learning-deck-catalog.js";
import { getPublishedLearningDeckRevision } from "../src/questions/learning-decks.js";

const GENERATED_QUESTION = {
  id: "generated-math",
  prompt: "What is 6 × 4?",
  choices: [
    { id: "a", label: "18" },
    { id: "b", label: "24" },
    { id: "c", label: "28" }
  ],
  answerId: "b",
  hint: "Use equal groups and multiply.",
  difficultyBand: "foundation",
  difficultyRank: 21,
  topicId: "arithmetic",
  learningObjectiveId: "scout-equal-groups",
  explanation: "Six groups of four make twenty-four."
};

const REQUEST = {
  levelId: "trail-scout",
  seed: "STORY-17",
  wardenId: 1,
  attempt: 0,
  labyrinthNumber: 1,
  questionOrdinal: 0
};
const PROVIDER_QUESTION = getBundledQuestion(REQUEST);

describe("Quest Questions", () => {
  it("maps each Quest Level to a Run configuration and Question guide", () => {
    expect(QUEST_LEVELS.map((level) => level.id)).toEqual([
      "bright-start",
      "trail-scout",
      "maze-master"
    ]);
    expect(getQuestLevel("bright-start")).toMatchObject({
      name: "Bright Start",
      config: {
        size: 11,
        echoCount: 2,
        wardenCount: 1,
        vitality: 4,
        pulses: 3
      }
    });
    expect(getQuestLevel("unknown")).toEqual(getQuestLevel("trail-scout"));
  });

  it("returns deterministic bundled Questions without repeating after a wrong answer", () => {
    const first = getBundledQuestion(REQUEST);
    const replay = getBundledQuestion(REQUEST);
    const retry = getBundledQuestion({
      ...REQUEST,
      attempt: 1,
      questionOrdinal: 1
    });

    expect(replay).toEqual(first);
    expect(retry.id).not.toBe(first.id);
    expect(first.choices).toHaveLength(3);
    expect(first.choices.map((choice) => choice.id)).toContain(first.answerId);
    const brightRetries = Array.from({ length: 4 }, (_, attempt) =>
      getBundledQuestion({
        ...REQUEST,
        levelId: "bright-start",
        attempt,
        questionOrdinal: attempt
      })
    );
    expect(new Set(brightRetries.map((question) => question.id)).size).toBe(4);
  });

  it("rejects malformed generated Questions", () => {
    expect(() =>
      normalizeQuestion({
        ...GENERATED_QUESTION,
        answerId: "missing"
      })
    ).toThrow(/answer/i);
    expect(() =>
      normalizeQuestion({
        ...GENERATED_QUESTION,
        choices: [
          { id: "a", label: "18" },
          { id: "a", label: "24" },
          { id: "c", label: "28" }
        ]
      })
    ).toThrow(/unique/i);
    expect(() =>
      normalizeQuestion({
        ...GENERATED_QUESTION,
        prompt: "Pick one:\na) First\nb) Second\nc) Third"
      })
    ).toThrow(/choices/i);
    expect(() =>
      normalizeQuestion({
        ...GENERATED_QUESTION,
        prompt: "Which weapon would hurt someone the most?"
      })
    ).toThrow(/kid-safe/i);
  });

  it("uses local Ollama by default during development", async () => {
    /** @type {{ url: string, options: RequestInit }[]} */
    const calls = [];
    const service = createQuestionService({
      env: { NODE_ENV: "development" },
      fetchImpl: async (url, options) => {
        calls.push({ url, options });
        return {
          ok: true,
          json: async () => ({
            message: { content: JSON.stringify(PROVIDER_QUESTION) }
          })
        };
      }
    });

    const result = await service.getQuestion(REQUEST);
    const cached = await service.getQuestion(REQUEST);

    expect(result.source).toBe("ollama");
    expect(cached).toEqual(result);
    expect(result.question).toMatchObject(PROVIDER_QUESTION);
    const ollamaCall = calls[0];
    expect(ollamaCall?.url).toBe("http://127.0.0.1:11434/api/chat");
    expect(JSON.parse(String(ollamaCall?.options.body)).model).toBe(
      "mistral:latest"
    );
    expect(calls).toHaveLength(1);
  });

  it("uses Gemini 3.5 Flash-Lite for production generation", async () => {
    /** @type {{ url: string, options: RequestInit }[]} */
    const calls = [];
    const service = createQuestionService({
      env: {
        NODE_ENV: "production",
        GEMINI_API_KEY: "test-key"
      },
      fetchImpl: async (url, options) => {
        calls.push({ url, options });
        return {
          ok: true,
          json: async () => ({
            candidates: [
              {
                content: {
                  parts: [{ text: JSON.stringify(PROVIDER_QUESTION) }]
                }
              }
            ]
          })
        };
      }
    });

    const result = await service.getQuestion(REQUEST);

    expect(result.source).toBe("gemini");
    const geminiCall = calls[0];
    expect(geminiCall?.url).toContain(
      "gemini-3.5-flash-lite:generateContent"
    );
    expect(
      new globalThis.Headers(geminiCall?.options.headers).get("x-goog-api-key")
    ).toBe("test-key");
    const geminiBody = JSON.parse(String(geminiCall?.options.body));
    expect(geminiBody.generationConfig).not.toHaveProperty("temperature");
  });

  it("falls back to the bundled deck when a provider is unavailable", async () => {
    let attempts = 0;
    let now = 1000;
    const service = createQuestionService({
      env: { NODE_ENV: "development" },
      now: () => now,
      providerCooldownMs: 30000,
      fetchImpl: async () => {
        attempts += 1;
        throw new Error("Ollama is offline");
      }
    });

    const result = await service.getQuestion(REQUEST);
    const retry = await service.getQuestion({
      ...REQUEST,
      attempt: 1,
      questionOrdinal: 1
    });
    now += 30001;
    await service.getQuestion({
      ...REQUEST,
      attempt: 2,
      questionOrdinal: 2
    });

    expect(result.source).toBe("bundled");
    expect(result.question).toEqual(getBundledQuestion(REQUEST));
    expect(retry.source).toBe("bundled");
    expect(attempts).toBe(2);
  });

  it("falls back when a provider repeats the previous Question", async () => {
    let attempts = 0;
    const service = createQuestionService({
      env: { NODE_ENV: "development" },
      fetchImpl: async () => {
        attempts += 1;
        return {
          ok: true,
          json: async () => ({
            message: { content: JSON.stringify(PROVIDER_QUESTION) }
          })
        };
      }
    });

    const first = await service.getQuestion(REQUEST);
    const retry = await service.getQuestion({
      ...REQUEST,
      attempt: 1,
      questionOrdinal: 1
    });

    expect(first.source).toBe("ollama");
    expect(retry.source).toBe("bundled");
    expect(retry.question.prompt).not.toBe(first.question.prompt);
    expect(attempts).toBe(2);
  });

  it("evicts old Warden history instead of growing without a bound", async () => {
    /** @type {import("../server/question-service.js").QuestionRequest} */
    let activeRequest = REQUEST;
    /** @type {string[]} */
    const prompts = [];
    const service = createQuestionService({
      env: { NODE_ENV: "development" },
      fetchImpl: async (_url, options) => {
        const body = JSON.parse(String(options.body));
        prompts.push(body.messages[0].content);
        return {
          ok: true,
          json: async () => ({
            message: {
              content: JSON.stringify(getBundledQuestion(activeRequest))
            }
          })
        };
      }
    });

    for (let index = 0; index < 201; index += 1) {
      activeRequest = { ...REQUEST, seed: `CACHE-${index}` };
      await service.getQuestion(activeRequest);
    }
    activeRequest = { ...REQUEST, seed: "CACHE-0", attempt: 1 };
    await service.getQuestion(activeRequest);

    expect(prompts.at(-1)).toContain("This is the first question");
  });

  it("serves each Learning Deck its own reviewed Question at one coordinate", async () => {
    const service = createQuestionService({
      env: { NODE_ENV: "production" },
      questionBank: null
    });
    const coordinate = {
      levelId: "trail-scout",
      seed: "STORY-17",
      wardenId: 2,
      attempt: 0,
      labyrinthNumber: 5,
      questionOrdinal: 0,
      challengeKind: /** @type {const} */ ("warden"),
      usedQuestionIds: []
    };
    const numberTrail = getPublishedLearningDeckOption("number-trail");
    const wordTrail = getPublishedLearningDeckOption("word-trail");

    const first = await service.getQuestion({
      ...coordinate,
      learningDeckId: numberTrail?.deckId,
      learningDeckRevision: numberTrail?.revisionId
    });
    const second = await service.getQuestion({
      ...coordinate,
      learningDeckId: wordTrail?.deckId,
      learningDeckRevision: wordTrail?.revisionId
    });

    // Same Run coordinate, different Decks: a shared cache entry would serve
    // one Deck's reviewed content under the other Deck's identity.
    expect(first.learningDeckSource).toBe("focused");
    expect(second.learningDeckSource).toBe("focused");
    expect(first.question.id).not.toBe(second.question.id);
    expect(first.question.topicId).not.toBe(second.question.topicId);
  });

  it("continues an exhausted focused Region on announced Mixed Trail content", async () => {
    const service = createQuestionService({
      env: { NODE_ENV: "production" },
      questionBank: null
    });
    const numberTrail = getPublishedLearningDeckOption("number-trail");
    const spent = getPublishedLearningDeckRevision("number-trail")
      ?.regions.find(
        (region) =>
          region.levelId === "bright-start" && region.regionNumber === 1
      )
      ?.normalQuestions.map((question) => question.id) ?? [];

    const result = await service.getQuestion({
      levelId: "bright-start",
      seed: "STORY-17",
      wardenId: 1,
      attempt: 0,
      labyrinthNumber: 2,
      questionOrdinal: spent.length,
      challengeKind: "warden",
      learningDeckId: numberTrail?.deckId,
      learningDeckRevision: numberTrail?.revisionId,
      usedQuestionIds: spent
    });

    expect(spent.length).toBeGreaterThan(0);
    expect(result.learningDeckSource).toBe("mixed-fallback");
    expect(spent).not.toContain(result.question.id);
    expect(result.question.difficultyBand).toBe("foundation");
  });

  it("accepts a posted Learning Deck identity and used-Question ledger", () => {
    const numberTrail = getPublishedLearningDeckOption("number-trail");

    expect(
      parseQuestionBody({
        levelId: "trail-scout",
        seed: "STORY-17",
        wardenId: 2,
        attempt: 0,
        labyrinthNumber: 5,
        questionOrdinal: 7,
        challengeKind: "warden",
        learningDeckId: numberTrail?.deckId,
        learningDeckRevision: numberTrail?.revisionId,
        usedQuestionIds: ["scout-developing-0"]
      })
    ).toMatchObject({
      learningDeckId: "number-trail",
      learningDeckRevision: numberTrail?.revisionId,
      usedQuestionIds: ["scout-developing-0"]
    });
  });

  it("rejects unusable Learning Deck identity and ledger input", () => {
    const numberTrail = getPublishedLearningDeckOption("number-trail");
    const base = {
      levelId: "trail-scout",
      seed: "STORY-17",
      wardenId: 2,
      attempt: 0,
      labyrinthNumber: 5,
      questionOrdinal: 7,
      challengeKind: "warden"
    };

    // A Deck without its exact revision cannot pin anything.
    expect(() =>
      parseQuestionBody({ ...base, learningDeckId: "number-trail" })
    ).toThrow(/revision/i);
    expect(() =>
      parseQuestionBody({
        ...base,
        learningDeckId: "number-trail",
        learningDeckRevision: "deck:number-trail:v1:not-a-digest"
      })
    ).toThrow(/revision/i);
    expect(() =>
      parseQuestionBody({
        ...base,
        learningDeckId: numberTrail?.deckId,
        learningDeckRevision: numberTrail?.revisionId,
        usedQuestionIds: ["fine", { id: "hostile" }]
      })
    ).toThrow(/Used Question identifiers/);
    expect(() =>
      parseQuestionBody({
        ...base,
        usedQuestionIds: Array.from({ length: 5001 }, (_, index) => `q-${index}`)
      })
    ).toThrow(/Used Question identifiers/);
  });

  it("accepts only bounded Quest Question request parameters", () => {
    expect(
      parseQuestionRequest(
        new URL(
          "http://local/api/question?level=bright-start&seed=STORY-17&warden=2&attempt=1&labyrinth=5&question=7&challenge=gate-warden"
        )
      )
    ).toEqual({
      levelId: "bright-start",
      seed: "STORY-17",
      wardenId: 2,
      attempt: 1,
      labyrinthNumber: 5,
      questionOrdinal: 7,
      challengeKind: "gate-warden",
      learningDeckId: null,
      learningDeckRevision: null,
      usedQuestionIds: []
    });
    expect(
      parseQuestionRequest(
        new URL(
          "http://local/api/question?level=bright-start&seed=STORY-17&warden=2&attempt=1&labyrinth=5&question=7"
        )
      ).challengeKind
    ).toBe("warden");
    expect(() =>
      parseQuestionRequest(
        new URL(
          "http://local/api/question?level=unknown&seed=STORY-17&warden=2&attempt=1&labyrinth=5&question=7"
        )
      )
    ).toThrow(/level/i);
    expect(() =>
      parseQuestionRequest(
        new URL(
          "http://local/api/question?level=bright-start&seed=bad%20seed&warden=2&attempt=1&labyrinth=5&question=7"
        )
      )
    ).toThrow(/seed/i);
    expect(() =>
      parseQuestionRequest(
        new URL(
          "http://local/api/question?level=bright-start&seed=STORY-17&warden=2&attempt=1&labyrinth=21&question=7"
        )
      )
    ).toThrow(/Labyrinth/i);
    expect(() =>
      parseQuestionRequest(
        new URL(
          "http://local/api/question?level=bright-start&seed=STORY-17&warden=2&attempt=1&labyrinth=5&question=7&challenge=unknown"
        )
      )
    ).toThrow(/challenge/i);
  });

  it("limits public Question generation requests per server window", () => {
    let now = 1000;
    const limiter = createQuestionRateLimiter({
      maxRequests: 2,
      windowMs: 60000,
      now: () => now
    });

    expect(limiter.allow()).toBe(true);
    expect(limiter.allow()).toBe(true);
    expect(limiter.allow()).toBe(false);
    now += 60001;
    expect(limiter.allow()).toBe(true);
  });
});

describe("question bank in Postgres", () => {
  const DATABASE_QUESTION = {
    ...GENERATED_QUESTION,
    id: "db-scout-1",
    prompt: "What is 7 × 3?",
    choices: [
      { id: "a", label: "18" },
      { id: "b", label: "21" },
      { id: "c", label: "24" }
    ],
    answerId: "b",
    explanation: "Seven groups of three make twenty-one."
  };

  it("serves the published database card when a bank is configured", async () => {
    /** @type {Record<string, unknown>[]} */
    const lookups = [];
    const service = createQuestionService({
      env: { QUESTION_PROVIDER: "bundled" },
      questionBank: {
        async publishedQuestion(lookup) {
          lookups.push(lookup);
          return DATABASE_QUESTION;
        }
      }
    });

    const result = await service.getQuestion(REQUEST);

    expect(result.source).toBe("database");
    expect(result.question).toMatchObject({ id: "db-scout-1" });
    expect(lookups).toEqual([
      {
        levelId: "trail-scout",
        difficultyBand: getBundledQuestion(REQUEST).difficultyBand,
        questionOrdinal: 0
      }
    ]);
  });

  it("serves the curated Gate Warden capstone without provider or database replacement", async () => {
    const publishedQuestion = vi.fn(async () => DATABASE_QUESTION);
    const fetchImpl = vi.fn();
    /** @type {import("../server/question-service.js").QuestionRequest} */
    const request = {
      ...REQUEST,
      challengeKind: "gate-warden"
    };
    const service = createQuestionService({
      env: { NODE_ENV: "development" },
      questionBank: { publishedQuestion },
      fetchImpl
    });

    const result = await service.getQuestion(request);

    expect(result.source).toBe("bundled");
    expect(result.question).toEqual(getBundledQuestion(request));
    expect(result.question.id).toBe("capstone-trail-scout-foundation");
    expect(publishedQuestion).not.toHaveBeenCalled();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("falls back to the bundled deck when the database is unreachable", async () => {
    /** @type {unknown[]} */
    const errors = [];
    const service = createQuestionService({
      env: { QUESTION_PROVIDER: "bundled" },
      onQuestionBankError: (error) => errors.push(error),
      questionBank: {
        async publishedQuestion() {
          throw new Error("connection terminated unexpectedly");
        }
      }
    });

    const result = await service.getQuestion(REQUEST);

    expect(result.source).toBe("bundled");
    expect(result.question).toEqual(getBundledQuestion(REQUEST));
    expect(errors).toHaveLength(1);
  });

  it("falls back to the bundled deck when nothing is published yet", async () => {
    const service = createQuestionService({
      env: { QUESTION_PROVIDER: "bundled" },
      questionBank: {
        async publishedQuestion() {
          return null;
        }
      }
    });

    const result = await service.getQuestion(REQUEST);

    expect(result.source).toBe("bundled");
    expect(result.question).toEqual(getBundledQuestion(REQUEST));
  });

  it("anchors provider output to the published card, not the bundled one", async () => {
    // The reviewed template a generated Question must reproduce comes from the
    // bank when one is configured; otherwise a published edit would be ignored
    // by every AI-served card.
    /** @type {string[]} */
    const prompts = [];
    const service = createQuestionService({
      env: { NODE_ENV: "development" },
      questionBank: {
        async publishedQuestion() {
          return DATABASE_QUESTION;
        }
      },
      fetchImpl: async (_url, options) => {
        prompts.push(String(options.body));
        return {
          ok: true,
          json: async () => ({
            message: { content: JSON.stringify(DATABASE_QUESTION) }
          })
        };
      }
    });

    const result = await service.getQuestion(REQUEST);

    expect(result.source).toBe("ollama");
    expect(prompts[0]).toContain("What is 7 × 3?");
  });

  it("keeps revision identity and Echo Lens outside provider authority", async () => {
    const reviewedEchoLens = {
      version: /** @type {1} */ (1),
      kind: "array",
      title: "Seven groups of three",
      reasoning: "Seven equal groups with three in each group make twenty-one.",
      steps: ["Make seven rows.", "Place three in each row.", "Count 21."],
      visual: { rows: 7, columns: 3, filled: 21 }
    };
    const reviewedQuestion = {
      ...DATABASE_QUESTION,
      reviewedRevisionId: "database:db-scout-1:v4",
      echoLens: reviewedEchoLens
    };
    const service = createQuestionService({
      env: { NODE_ENV: "development" },
      questionBank: {
        async publishedQuestion() {
          return reviewedQuestion;
        }
      },
      fetchImpl: async () => ({
        ok: true,
        json: async () => ({
          message: {
            content: JSON.stringify({
              ...DATABASE_QUESTION,
              reviewedRevisionId: "provider:invented:v1",
              echoLens: {
                ...reviewedEchoLens,
                title: "Provider replacement"
              }
            })
          }
        })
      })
    });

    const result = await service.getQuestion(REQUEST);

    expect(result.source).toBe("ollama");
    expect(result.question.reviewedRevisionId).toBe(
      reviewedQuestion.reviewedRevisionId
    );
    expect(result.question.echoLens).toEqual(reviewedEchoLens);
  });
});
