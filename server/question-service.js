import { getBundledQuestion } from "../src/questions/question-bank.js";
import {
  LEARNING_OBJECTIVE_IDS,
  LEARNING_TOPIC_IDS,
  isLearningMetadata
} from "../src/questions/learning-objectives.js";
import { getQuestLevel } from "../src/questions/quest-levels.js";

/**
 * @typedef {{
 *   levelId: string,
 *   seed: string,
 *   wardenId: number,
 *   attempt: number,
 *   labyrinthNumber: number,
 *   questionOrdinal: number
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
 *   learningObjectiveId: string
 * }} WardenQuestion
 * @typedef {{
 *   question: WardenQuestion,
 *   source: "ollama" | "gemini" | "bundled"
 * }} QuestionResult
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

/** @param {unknown} value @param {string} name @param {number} maxLength */
function requiredText(value, name, maxLength) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`Question ${name} must be text.`);
  }

  const text = value.trim();
  if (text.length > maxLength) {
    throw new Error(`Question ${name} is too long.`);
  }

  return text;
}

/**
 * @param {unknown} rawQuestion
 * @param {string} [fallbackId]
 * @returns {WardenQuestion}
 */
export function normalizeQuestion(rawQuestion, fallbackId = "generated-question") {
  if (!rawQuestion || typeof rawQuestion !== "object") {
    throw new Error("Question must be an object.");
  }
  const raw = /** @type {Record<string, unknown>} */ (rawQuestion);
  if (!Array.isArray(raw.choices) || raw.choices.length !== 3) {
    throw new Error("Question must have exactly three choices.");
  }

  const choices = raw.choices.map((choice) => {
    if (!choice || typeof choice !== "object") {
      throw new Error("Each Question choice must be an object.");
    }
    const candidate = /** @type {Record<string, unknown>} */ (choice);

    return {
      id: requiredText(candidate.id, "choice id", 12),
      label: requiredText(candidate.label, "choice label", 80)
    };
  });
  const choiceIds = choices.map((choice) => choice.id);
  if (new Set(choiceIds).size !== choiceIds.length) {
    throw new Error("Question choice ids must be unique.");
  }

  const answerId = requiredText(raw.answerId, "answer", 12);
  if (!choiceIds.includes(answerId)) {
    throw new Error("Question answer must match a choice.");
  }
  const prompt = requiredText(raw.prompt, "prompt", 240);
  if (/(?:^|\n)\s*[abc][).:]\s/iu.test(prompt)) {
    throw new Error("Question prompt must not repeat the answer choices.");
  }
  const hint = requiredText(raw.hint, "hint", 120);
  const explanation = requiredText(raw.explanation, "explanation", 240);
  const difficultyBand = requiredText(
    raw.difficultyBand,
    "difficulty band",
    20
  );
  if (
    !["foundation", "developing", "capable", "advanced", "mastery"].includes(
      difficultyBand
    )
  ) {
    throw new Error("Question difficulty band is not supported.");
  }
  const difficultyRank = Number(raw.difficultyRank);
  if (
    !Number.isInteger(difficultyRank) ||
    difficultyRank < 1 ||
    difficultyRank > 99
  ) {
    throw new Error("Question difficulty rank is not valid.");
  }
  const topicId = requiredText(raw.topicId, "topic id", 40);
  const learningObjectiveId = requiredText(
    raw.learningObjectiveId,
    "learning objective id",
    80
  );
  if (!isLearningMetadata(topicId, learningObjectiveId)) {
    throw new Error("Question learning metadata is not reviewed.");
  }
  const childFacingText = [
    prompt,
    hint,
    explanation,
    ...choices.map((choice) => choice.label)
  ].join(" ");
  if (
    /\b(?:alcohol|blood|drug|gun|hate|kill|murder|nude|racist|sex|suicide|weapon)\b/iu.test(
      childFacingText
    ) ||
    /\b(?:your address|your name|your password|your phone|where do you live)\b/iu.test(
      childFacingText
    )
  ) {
    throw new Error("Question did not pass kid-safe content checks.");
  }

  return {
    id:
      typeof raw.id === "string" && raw.id.trim()
        ? raw.id.trim().slice(0, 80)
        : fallbackId,
    prompt,
    choices,
    answerId,
    hint,
    difficultyBand,
    difficultyRank,
    topicId,
    learningObjectiveId,
    explanation
  };
}

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
 *   now?: () => number,
 *   providerCooldownMs?: number
 * }} [options]
 */
export function createQuestionService(options = {}) {
  const env = options.env ?? globalThis.process.env;
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

  /** @param {QuestionRequest} request @returns {Promise<QuestionResult>} */
  async function generateQuestion(request) {
    const provider = selectProvider(env);
    const encounterKey =
      `${request.levelId}:${request.seed}:${request.wardenId}`;
    const previousQuestion = previousQuestions.get(encounterKey);
    const reviewedQuestion = getBundledQuestion(request);

    try {
      if (now() >= providerRetryAt && provider === "ollama") {
        const question = await requestOllama(
          request,
          { env, fetchImpl },
          previousQuestion,
          reviewedQuestion
        );
        assertReviewedTemplate(question, reviewedQuestion);
        assertFreshQuestion(question, previousQuestion);
        return rememberGenerated(request, encounterKey, {
          question,
          source: "ollama"
        });
      }
      if (
        now() >= providerRetryAt &&
        provider === "gemini" &&
        env.GEMINI_API_KEY
      ) {
        const question = await requestGemini(
          request,
          { env, fetchImpl },
          previousQuestion,
          reviewedQuestion
        );
        assertReviewedTemplate(question, reviewedQuestion);
        assertFreshQuestion(question, previousQuestion);
        return rememberGenerated(request, encounterKey, {
          question,
          source: "gemini"
        });
      }
    } catch (error) {
      providerRetryAt = now() + providerCooldownMs;
      onProviderError(error);
    }

    const result = {
      question: getBundledQuestion(request),
      source: /** @type {"bundled"} */ ("bundled")
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
  return `${request.levelId}:${request.seed}:${request.wardenId}:${request.attempt}:${request.labyrinthNumber}:${request.questionOrdinal}`;
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
