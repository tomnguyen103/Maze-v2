import { describe, expect, it, vi } from "vitest";
import { getBundledQuestion } from "../src/questions/question-bank.js";
import {
  QUESTION_SCHEMA,
  createQuestionService,
  normalizeQuestion
} from "../server/question-service.js";

const EVAL_REQUEST = Object.freeze({
  levelId: "trail-scout",
  seed: "EVAL-SEED-2026",
  wardenId: 1,
  attempt: 0,
  labyrinthNumber: 1,
  questionOrdinal: 0
});

const REVIEWED_QUESTION = getBundledQuestion(EVAL_REQUEST);

describe("Gemini 3.8 Flash Contract & Schema Evals", () => {
  it("Assertion 1: Endpoint URL formatting targets /v1beta/models/gemini-3.8-flash:generateContent", async () => {
    /** @type {{ url: string, options: RequestInit }[]} */
    const calls = [];
    const service = createQuestionService({
      env: {
        NODE_ENV: "production",
        GEMINI_API_KEY: "test-eval-key"
      },
      fetchImpl: async (url, options) => {
        calls.push({ url, options });
        return {
          ok: true,
          json: async () => ({
            candidates: [
              {
                content: {
                  parts: [{ text: JSON.stringify(REVIEWED_QUESTION) }]
                }
              }
            ]
          })
        };
      }
    });

    const result = await service.getQuestion(EVAL_REQUEST);
    expect(result.source).toBe("gemini");
    expect(calls).toHaveLength(1);

    const targetUrl = new URL(calls[0].url);
    expect(targetUrl.origin).toBe("https://generativelanguage.googleapis.com");
    expect(targetUrl.pathname).toBe(
      "/v1beta/models/gemini-3.8-flash:generateContent"
    );
    expect(calls[0].options.method).toBe("POST");
    expect(
      new globalThis.Headers(calls[0].options.headers).get("x-goog-api-key")
    ).toBe("test-eval-key");
  });

  it("Assertion 2: Strict JSON schema compliance matching QUESTION_SCHEMA (prompt, options, answerIndex, explanation)", async () => {
    expect(QUESTION_SCHEMA.type).toBe("object");
    expect(QUESTION_SCHEMA.additionalProperties).toBe(false);
    expect(QUESTION_SCHEMA.properties).toHaveProperty("prompt");
    expect(QUESTION_SCHEMA.properties).toHaveProperty("choices");
    expect(QUESTION_SCHEMA.properties).toHaveProperty("answerId");
    expect(QUESTION_SCHEMA.properties).toHaveProperty("explanation");

    for (const field of ["prompt", "choices", "answerId", "explanation"]) {
      expect(QUESTION_SCHEMA.required).toContain(field);
    }

    expect(QUESTION_SCHEMA.properties.choices.type).toBe("array");
    expect(QUESTION_SCHEMA.properties.choices.minItems).toBe(3);
    expect(QUESTION_SCHEMA.properties.choices.maxItems).toBe(3);
    expect(QUESTION_SCHEMA.properties.choices.items.required).toEqual([
      "id",
      "label"
    ]);

    /** @type {{ url: string, options: RequestInit }[]} */
    const calls = [];
    const service = createQuestionService({
      env: {
        NODE_ENV: "production",
        GEMINI_API_KEY: "test-eval-key"
      },
      fetchImpl: async (url, options) => {
        calls.push({ url, options });
        return {
          ok: true,
          json: async () => ({
            candidates: [
              {
                content: {
                  parts: [{ text: JSON.stringify(REVIEWED_QUESTION) }]
                }
              }
            ]
          })
        };
      }
    });

    await service.getQuestion(EVAL_REQUEST);
    const body = JSON.parse(String(calls[0].options.body));
    expect(body.generationConfig.responseMimeType).toBe("application/json");
    expect(body.generationConfig.responseJsonSchema).toEqual(QUESTION_SCHEMA);

    const normalized = normalizeQuestion(REVIEWED_QUESTION, "eval-test");
    expect(normalized.prompt).toBe(REVIEWED_QUESTION.prompt);
    expect(normalized.choices).toHaveLength(3);
    expect(normalized.answerId).toBe(REVIEWED_QUESTION.answerId);
    expect(normalized.explanation).toBe(REVIEWED_QUESTION.explanation);

    expect(() =>
      normalizeQuestion({ ...REVIEWED_QUESTION, prompt: "" })
    ).toThrow();
    expect(() =>
      normalizeQuestion({
        ...REVIEWED_QUESTION,
        choices: [{ id: "a", label: "A" }]
      })
    ).toThrow();
    expect(() =>
      normalizeQuestion({ ...REVIEWED_QUESTION, answerId: "z" })
    ).toThrow();
  });

  it("Assertion 3: Safety filter policy integrity enforces BLOCK_LOW_AND_ABOVE on all 4 harm categories", async () => {
    /** @type {{ url: string, options: RequestInit }[]} */
    const calls = [];
    const service = createQuestionService({
      env: {
        NODE_ENV: "production",
        GEMINI_API_KEY: "test-eval-key"
      },
      fetchImpl: async (url, options) => {
        calls.push({ url, options });
        return {
          ok: true,
          json: async () => ({
            candidates: [
              {
                content: {
                  parts: [{ text: JSON.stringify(REVIEWED_QUESTION) }]
                }
              }
            ]
          })
        };
      }
    });

    await service.getQuestion(EVAL_REQUEST);
    const body = JSON.parse(String(calls[0].options.body));
    /** @type {{ category: string, threshold: string }[]} */
    const safetySettings = body.safetySettings;

    expect(safetySettings).toHaveLength(4);
    const expectedCategories = [
      "HARM_CATEGORY_HARASSMENT",
      "HARM_CATEGORY_HATE_SPEECH",
      "HARM_CATEGORY_SEXUALLY_EXPLICIT",
      "HARM_CATEGORY_DANGEROUS_CONTENT"
    ];

    for (const category of expectedCategories) {
      const match = safetySettings.find(
        (setting) => setting.category === category
      );
      expect(match).toBeDefined();
      expect(match?.threshold).toBe("BLOCK_LOW_AND_ABOVE");
    }
  });

  it("Assertion 4: Token & latency budget constraints cap maxOutputTokens to 320 and timeout signal to 5000ms", async () => {
    /** @type {{ url: string, options: RequestInit }[]} */
    const calls = [];
    const service = createQuestionService({
      env: {
        NODE_ENV: "production",
        GEMINI_API_KEY: "test-eval-key"
      },
      fetchImpl: async (url, options) => {
        calls.push({ url, options });
        return {
          ok: true,
          json: async () => ({
            candidates: [
              {
                content: {
                  parts: [{ text: JSON.stringify(REVIEWED_QUESTION) }]
                }
              }
            ]
          })
        };
      }
    });

    const timeoutSpy = vi.spyOn(globalThis.AbortSignal, "timeout");
    try {
      await service.getQuestion(EVAL_REQUEST);
      const body = JSON.parse(String(calls[0].options.body));

      expect(body.generationConfig.maxOutputTokens).toBe(320);
      expect(timeoutSpy).toHaveBeenCalledWith(5000);

      const signal = calls[0].options.signal;
      expect(signal).toBeInstanceOf(globalThis.AbortSignal);
      expect(signal?.aborted).toBe(false);
    } finally {
      timeoutSpy.mockRestore();
    }
  });

  it("Assertion 5: Deterministic fallback guarantee seamlessly returns bundled questions without throwing", async () => {
    const errorScenarios = [
      { name: "HTTP 500 server error", response: { ok: false, status: 500 } },
      { name: "HTTP 429 rate limited", response: { ok: false, status: 429 } },
      {
        name: "malformed JSON payload",
        response: {
          ok: true,
          json: async () => ({
            candidates: [{ content: { parts: [{ text: "not-json" }] } }]
          })
        }
      },
      {
        name: "network timeout rejection",
        throwError: new Error("Network timeout")
      }
    ];

    for (const scenario of errorScenarios) {
      const service = createQuestionService({
        env: {
          NODE_ENV: "production",
          GEMINI_API_KEY: "test-eval-key"
        },
        fetchImpl: async () => {
          if (scenario.throwError) {
            throw scenario.throwError;
          }
          return {
            ok: scenario.response.ok,
            status: scenario.response.status,
            json: scenario.response.json ?? (async () => ({}))
          };
        }
      });

      const result = await service.getQuestion(EVAL_REQUEST);
      const expectedBundled = getBundledQuestion(EVAL_REQUEST);

      expect(result.source).toBe("bundled");
      expect(result.question).toEqual(expectedBundled);
      expect(result.question.prompt).toBeTruthy();
      expect(result.question.choices).toHaveLength(3);
      expect(result.question.answerId).toBeTruthy();
    }
  });
});
