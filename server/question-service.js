import { getBundledQuestion } from "../src/questions/question-bank.js";
import { getQuestLevel } from "../src/questions/quest-levels.js";

/**
 * @typedef {{
 *   levelId: string,
 *   seed: string,
 *   wardenId: number,
 *   attempt: number
 * }} QuestionRequest
 * @typedef {{
 *   id: string,
 *   prompt: string,
 *   choices: { id: string, label: string }[],
 *   answerId: string,
 *   explanation: string
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
    prompt: { type: "string", maxLength: 180 },
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
    explanation: { type: "string", maxLength: 240 }
  },
  required: ["prompt", "choices", "answerId", "explanation"]
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
  const prompt = requiredText(raw.prompt, "prompt", 180);
  if (/(?:^|\n)\s*[abc][).:]\s/iu.test(prompt)) {
    throw new Error("Question prompt must not repeat the answer choices.");
  }
  const explanation = requiredText(raw.explanation, "explanation", 240);
  const childFacingText = [
    prompt,
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
    `Difficulty guide: ${level.questionGuide}`,
    "Return the reviewed question below exactly. Do not add, remove, reword, or reorder child-facing content.",
    `Reviewed question: ${JSON.stringify({
      prompt: reviewedQuestion.prompt,
      choices: reviewedQuestion.choices,
      answerId: reviewedQuestion.answerId,
      explanation: reviewedQuestion.explanation
    })}`,
    previousQuestion
      ? `Do not repeat this previous question: ${previousQuestion.prompt} Choices: ${previousQuestion.choices.map((choice) => choice.label).join(", ")}.`
      : "This is the first question for this Warden.",
    `Variation key: ${request.seed}-${request.wardenId}-${request.attempt}.`
  ].join("\n");
}

/** @param {string} source @param {QuestionRequest} request */
function generatedId(source, request) {
  return `${source}-${request.levelId}-${request.seed}-${request.wardenId}-${request.attempt}`;
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
  return `${request.levelId}:${request.seed}:${request.wardenId}:${request.attempt}`;
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
    question.prompt === reviewedQuestion.prompt &&
    question.answerId === reviewedQuestion.answerId &&
    question.explanation === reviewedQuestion.explanation &&
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
