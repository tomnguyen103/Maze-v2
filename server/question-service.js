import { selectReviewedDeckQuestion } from "../src/questions/learning-deck-selection.js";
import {
  LEARNING_OBJECTIVE_IDS,
  LEARNING_TOPIC_IDS
} from "../src/questions/learning-objectives.js";
import { normalizeQuestion } from "../src/questions/question-contract.js";
import { getQuestLevel } from "../src/questions/quest-levels.js";

export { normalizeQuestion };

/**
 * @typedef {{
 *   levelId: string,
 *   seed: string,
 *   wardenId: number,
 *   attempt: number,
 *   labyrinthNumber: number,
 *   questionOrdinal: number,
 *   challengeKind?: "warden" | "gate-warden",
 *   learningDeckId?: string | null,
 *   learningDeckRevision?: string | null,
 *   usedQuestionIds?: readonly string[]
 * }} QuestionRequest
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
 *   echoLens?: ReturnType<typeof normalizeQuestion>["echoLens"]
 * }} WardenQuestion
 * @typedef {{
 *   question: WardenQuestion,
 *   source: "ollama" | "gemini" | "database" | "bundled",
 *   learningDeckSource?: "focused" | "capstone" | "mixed-fallback" | "mixed"
 * }} QuestionResult
 * @typedef {{
 *   publishedQuestion: (lookup: {
 *     levelId: string,
 *     difficultyBand: string,
 *     questionOrdinal: number
 *   }) => Promise<WardenQuestion | null>
 * }} QuestionBank
 * @typedef {(input: string, init: RequestInit) => Promise<{
 *   ok: boolean,
 *   status?: number,
 *   json: () => Promise<any>
 * }>} FetchLike
 * @typedef {{ env: NodeJS.ProcessEnv, fetchImpl: FetchLike }} ProviderOptions
 */

export const QUESTION_SCHEMA = Object.freeze({
  type: "object",
  additionalProperties: false,
  properties: {
    id: { type: "string", maxLength: 80 },
    prompt: { type: "string", maxLength: 240 },
    choices: {
      type: "array",
      minItems: 3,
      maxItems: 3,
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          id: { type: "string", enum: ["a", "b", "c"] },
          label: { type: "string", maxLength: 80 }
        },
        required: ["id", "label"]
      }
    },
    answerId: { type: "string", enum: ["a", "b", "c"] },
    hint: { type: "string", maxLength: 120 },
    explanation: { type: "string", maxLength: 240 },
    difficultyBand: {
      type: "string",
      enum: ["foundation", "developing", "capable", "advanced", "mastery"]
    },
    difficultyRank: { type: "integer", minimum: 1, maximum: 99 },
    topicId: { type: "string", enum: LEARNING_TOPIC_IDS },
    learningObjectiveId: {
      type: "string",
      enum: LEARNING_OBJECTIVE_IDS
    }
  },
  required: [
    "id",
    "prompt",
    "choices",
    "answerId",
    "hint",
    "explanation",
    "difficultyBand",
    "difficultyRank",
    "topicId",
    "learningObjectiveId"
  ]
});

/**
 * @param {QuestionRequest} request
 * @param {WardenQuestion | undefined} previousQuestion
 * @param {WardenQuestion} reviewedQuestion
 */
function buildPrompt(request, previousQuestion, reviewedQuestion) {
  const level = getQuestLevel(request.levelId);

  return [
    "Prepare one reviewed, age-appropriate multiple-choice learning question for a child playing a maze adventure.",
    `Quest Level: ${level.name}.`,
    `Labyrinth: ${request.labyrinthNumber} of 20.`,
    `Difficulty Band: ${reviewedQuestion.difficultyBand}.`,
    `Difficulty guide: ${level.questionGuide}`,
    "Return the reviewed question below exactly. Do not add, remove, reword, or reorder child-facing content.",
    `Reviewed question: ${JSON.stringify({
      id: reviewedQuestion.id,
      prompt: reviewedQuestion.prompt,
      choices: reviewedQuestion.choices,
      answerId: reviewedQuestion.answerId,
      hint: reviewedQuestion.hint,
      explanation: reviewedQuestion.explanation,
      difficultyBand: reviewedQuestion.difficultyBand,
      difficultyRank: reviewedQuestion.difficultyRank,
      topicId: reviewedQuestion.topicId,
      learningObjectiveId: reviewedQuestion.learningObjectiveId
    })}`,
    previousQuestion
      ? `Do not repeat this previous question: ${previousQuestion.prompt} Choices: ${previousQuestion.choices.map((choice) => choice.label).join(", ")}.`
      : "This is the first question for this Warden.",
    `Variation key: ${request.seed}-${request.wardenId}-${request.attempt}-${request.questionOrdinal}.`
  ].join("\n");
}

/** @param {string} source @param {QuestionRequest} request */
function generatedId(source, request) {
  return `${source}-${request.levelId}-${request.seed}-${request.wardenId}-${request.attempt}-${request.questionOrdinal}`;
}

/**
 * @param {QuestionRequest} request
 * @param {ProviderOptions} options
 * @param {WardenQuestion | undefined} previousQuestion
 * @param {WardenQuestion} reviewedQuestion
 */
async function requestOllama(
  request,
  options,
  previousQuestion,
  reviewedQuestion
) {
  const baseUrl = options.env.OLLAMA_BASE_URL ?? "http://127.0.0.1:11434";
  const model = options.env.OLLAMA_MODEL ?? "mistral:latest";
  const response = await options.fetchImpl(`${baseUrl}/api/chat`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      model,
      messages: [
        {
          role: "user",
          content: buildPrompt(request, previousQuestion, reviewedQuestion)
        }
      ],
      stream: false,
      format: QUESTION_SCHEMA,
      options: { temperature: 0 }
    }),
    signal: globalThis.AbortSignal.timeout(5000)
  });

  if (!response.ok) {
    throw new Error(`Ollama returned ${response.status ?? "an error"}.`);
  }

  const payload = /** @type {any} */ (await response.json());
  return normalizeQuestion(
    JSON.parse(payload?.message?.content ?? ""),
    generatedId("ollama", request)
  );
}

/**
 * @param {QuestionRequest} request
 * @param {ProviderOptions} options
 * @param {WardenQuestion | undefined} previousQuestion
 * @param {WardenQuestion} reviewedQuestion
 */
async function requestGemini(
  request,
  options,
  previousQuestion,
  reviewedQuestion
) {
  const model = options.env.GEMINI_MODEL ?? "gemini-3.5-flash-lite";
  const apiKey = options.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("Gemini API key is missing.");
  }
  const response = await options.fetchImpl(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-goog-api-key": apiKey
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              {
                text: buildPrompt(
                  request,
                  previousQuestion,
                  reviewedQuestion
                )
              }
            ]
          }
        ],
        safetySettings: [
          {
            category: "HARM_CATEGORY_HARASSMENT",
            threshold: "BLOCK_LOW_AND_ABOVE"
          },
          {
            category: "HARM_CATEGORY_HATE_SPEECH",
            threshold: "BLOCK_LOW_AND_ABOVE"
          },
          {
            category: "HARM_CATEGORY_SEXUALLY_EXPLICIT",
            threshold: "BLOCK_LOW_AND_ABOVE"
          },
          {
            category: "HARM_CATEGORY_DANGEROUS_CONTENT",
            threshold: "BLOCK_LOW_AND_ABOVE"
          }
        ],
        generationConfig: {
          responseMimeType: "application/json",
          responseJsonSchema: QUESTION_SCHEMA,
          maxOutputTokens: 320
        }
      }),
      signal: globalThis.AbortSignal.timeout(5000)
    }
  );

  if (!response.ok) {
    throw new Error(`Gemini returned ${response.status ?? "an error"}.`);
  }

  const payload = /** @type {any} */ (await response.json());
  const content = payload?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
  return normalizeQuestion(
    JSON.parse(content),
    generatedId("gemini", request)
  );
}

/** @param {NodeJS.ProcessEnv} env */
function selectProvider(env) {
  if (env.QUESTION_PROVIDER) {
    return env.QUESTION_PROVIDER;
  }
  if (env.NODE_ENV === "production") {
    return env.GEMINI_API_KEY ? "gemini" : "bundled";
  }
  return "ollama";
}

/**
 * @param {{
 *   env?: NodeJS.ProcessEnv,
 *   fetchImpl?: FetchLike,
 *   onProviderError?: (error: unknown) => void,
 *   questionBank?: QuestionBank | null,
 *   onQuestionBankError?: (error: unknown) => void,
 *   now?: () => number,
 *   providerCooldownMs?: number
 * }} [options]
 */
export function createQuestionService(options = {}) {
  const env = options.env ?? globalThis.process.env;
  const questionBank = options.questionBank ?? null;
  const onQuestionBankError = options.onQuestionBankError ?? (() => {});
  const fetchImpl =
    options.fetchImpl ?? /** @type {FetchLike} */ (globalThis.fetch);
  const onProviderError = options.onProviderError ?? (() => {});
  const now = options.now ?? Date.now;
  const providerCooldownMs = options.providerCooldownMs ?? 30000;
  /** @type {Map<string, QuestionResult>} */
  const generatedCache = new Map();
  /** @type {Map<string, Promise<QuestionResult>>} */
  const inFlight = new Map();
  /** @type {Map<string, WardenQuestion>} */
  const previousQuestions = new Map();
  let providerRetryAt = 0;

  /** @param {string} encounterKey @param {WardenQuestion} question */
  function rememberPreviousQuestion(encounterKey, question) {
    previousQuestions.set(encounterKey, question);
    if (previousQuestions.size > 200) {
      const oldestEncounterKey = previousQuestions.keys().next().value;
      if (typeof oldestEncounterKey === "string") {
        previousQuestions.delete(oldestEncounterKey);
      }
    }
  }

  /**
   * The reviewed card this encounter is anchored to: the published database
   * version when a bank is configured and reachable, otherwise the bundled one.
   * Everything downstream — the template a generated Question must reproduce,
   * and the card served when no provider answers — reads this, so a published
   * edit reaches players through every path at once.
   *
   * @param {QuestionRequest} request
   * @returns {Promise<{
   *   question: WardenQuestion,
   *   fromDatabase: boolean,
   *   deckSource: "focused" | "capstone" | "mixed-fallback" | "mixed"
   * }>}
   */
  async function resolveReviewedQuestion(request) {
    const selection = selectReviewedDeckQuestion(request);
    const bundled = selection.question;
    // A focused Deck revision is itself the publishing authority for its own
    // content, so the bank never overrides it. Mixed content — including the
    // announced fallback — still reads the bank, or a published edit would
    // reach Mixed Trail Quests and not fallen-back focused ones.
    if (
      !questionBank ||
      request.challengeKind === "gate-warden" ||
      selection.source === "focused" ||
      selection.source === "capstone"
    ) {
      return {
        question: bundled,
        fromDatabase: false,
        deckSource: selection.source
      };
    }
    try {
      const published = await questionBank.publishedQuestion({
        levelId: request.levelId,
        difficultyBand: bundled.difficultyBand,
        questionOrdinal: request.questionOrdinal
      });
      if (published) {
        return {
          question: published,
          fromDatabase: true,
          deckSource: selection.source
        };
      }
    } catch (error) {
      // A database outage degrades to yesterday's content, never to no
      // content: the bundled bank ships in the deployment itself.
      onQuestionBankError(error);
    }
    return {
      question: bundled,
      fromDatabase: false,
      deckSource: selection.source
    };
  }

  /** @param {QuestionRequest} request @returns {Promise<QuestionResult>} */
  async function generateQuestion(request) {
    const provider = selectProvider(env);
    const encounterKey =
      `${request.levelId}:${request.seed}:${request.wardenId}`;
    const previousQuestion = previousQuestions.get(encounterKey);
    const reviewed = await resolveReviewedQuestion(request);
    const reviewedQuestion = reviewed.question;
    if (request.challengeKind === "gate-warden") {
      const result = {
        question: reviewedQuestion,
        source: /** @type {"bundled"} */ ("bundled"),
        learningDeckSource: reviewed.deckSource
      };
      rememberPreviousQuestion(encounterKey, result.question);
      return result;
    }

    try {
      if (now() >= providerRetryAt && provider === "ollama") {
        const generatedQuestion = await requestOllama(
          request,
          { env, fetchImpl },
          previousQuestion,
          reviewedQuestion
        );
        assertReviewedTemplate(generatedQuestion, reviewedQuestion);
        const question = bindReviewedAuthority(
          generatedQuestion,
          reviewedQuestion
        );
        assertFreshQuestion(question, previousQuestion);
        return rememberGenerated(request, encounterKey, {
          question,
          source: "ollama",
          learningDeckSource: reviewed.deckSource
        });
      }
      if (
        now() >= providerRetryAt &&
        provider === "gemini" &&
        env.GEMINI_API_KEY
      ) {
        const generatedQuestion = await requestGemini(
          request,
          { env, fetchImpl },
          previousQuestion,
          reviewedQuestion
        );
        assertReviewedTemplate(generatedQuestion, reviewedQuestion);
        const question = bindReviewedAuthority(
          generatedQuestion,
          reviewedQuestion
        );
        assertFreshQuestion(question, previousQuestion);
        return rememberGenerated(request, encounterKey, {
          question,
          source: "gemini",
          learningDeckSource: reviewed.deckSource
        });
      }
    } catch (error) {
      providerRetryAt = now() + providerCooldownMs;
      onProviderError(error);
    }

    const result = {
      question: reviewedQuestion,
      source: /** @type {"database" | "bundled"} */ (
        reviewed.fromDatabase ? "database" : "bundled"
      ),
      learningDeckSource: reviewed.deckSource
    };
    rememberPreviousQuestion(encounterKey, result.question);
    return result;
  }

  /**
   * @param {QuestionRequest} request
   * @param {string} encounterKey
   * @param {QuestionResult} result
   */
  function rememberGenerated(request, encounterKey, result) {
    const key = questionKey(request);
    generatedCache.set(key, result);
    rememberPreviousQuestion(encounterKey, result.question);
    if (generatedCache.size > 200) {
      const oldestKey = generatedCache.keys().next().value;
      if (typeof oldestKey === "string") {
        generatedCache.delete(oldestKey);
      }
    }
    return result;
  }

  return {
    /** @param {QuestionRequest} request */
    async getQuestion(request) {
      const key = questionKey(request);
      const cached = generatedCache.get(key);
      if (cached) {
        return cached;
      }
      const pending = inFlight.get(key);
      if (pending) {
        return pending;
      }

      const requestPromise = generateQuestion(request);
      inFlight.set(key, requestPromise);
      try {
        return await requestPromise;
      } finally {
        inFlight.delete(key);
      }
    }
  };
}

/** @param {QuestionRequest} request */
function questionKey(request) {
  // Deck identity is part of the key: two Decks at the same Run coordinates
  // ask different reviewed Questions and must never share a cache entry.
  return `${request.levelId}:${request.seed}:${request.wardenId}:${request.attempt}:${request.labyrinthNumber}:${request.questionOrdinal}:${request.challengeKind ?? "warden"}:${request.learningDeckId ?? "mixed-trail"}:${request.learningDeckRevision ?? ""}`;
}

/**
 * @param {WardenQuestion} question
 * @param {WardenQuestion | undefined} previousQuestion
 */
function assertFreshQuestion(question, previousQuestion) {
  if (
    previousQuestion &&
    question.prompt.trim().toLocaleLowerCase() ===
      previousQuestion.prompt.trim().toLocaleLowerCase()
  ) {
    throw new Error("Generated Question repeated the previous prompt.");
  }
}

/**
 * Providers may reproduce only the reviewed core. Revision identity and Lens
 * content always come from the database or bundled review authority.
 * @param {WardenQuestion} generatedQuestion
 * @param {WardenQuestion} reviewedQuestion
 */
function bindReviewedAuthority(generatedQuestion, reviewedQuestion) {
  const generatedCore = { ...generatedQuestion };
  delete generatedCore.reviewedRevisionId;
  delete generatedCore.echoLens;
  return normalizeQuestion({
    ...generatedCore,
    ...(reviewedQuestion.reviewedRevisionId
      ? { reviewedRevisionId: reviewedQuestion.reviewedRevisionId }
      : {}),
    ...(reviewedQuestion.echoLens
      ? { echoLens: reviewedQuestion.echoLens }
      : {})
  });
}

/**
 * Child-facing AI output may only reproduce a reviewed bundled template.
 * @param {WardenQuestion} question
 * @param {WardenQuestion} reviewedQuestion
 */
function assertReviewedTemplate(question, reviewedQuestion) {
  const contentMatches =
    question.id === reviewedQuestion.id &&
    question.prompt === reviewedQuestion.prompt &&
    question.answerId === reviewedQuestion.answerId &&
    question.hint === reviewedQuestion.hint &&
    question.explanation === reviewedQuestion.explanation &&
    question.difficultyBand === reviewedQuestion.difficultyBand &&
    question.difficultyRank === reviewedQuestion.difficultyRank &&
    question.topicId === reviewedQuestion.topicId &&
    question.learningObjectiveId === reviewedQuestion.learningObjectiveId &&
    question.choices.length === reviewedQuestion.choices.length &&
    question.choices.every(
      (choice, index) =>
        choice.id === reviewedQuestion.choices[index]?.id &&
        choice.label === reviewedQuestion.choices[index]?.label
    );
  if (!contentMatches) {
    throw new Error(
      "Generated Question changed reviewed kid-safe curriculum content."
    );
  }
}
