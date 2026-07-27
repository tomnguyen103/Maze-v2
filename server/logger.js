import { destination as pinoDestination, pino } from "pino";
import { safeErrorName } from "./safe-error-log.js";

/**
 * The one shape an error is allowed to take in a log line. Messages and
 * stacks routinely quote request payloads, and the Journal and audit rules
 * keep those out of storage — so only the safe class name survives, exactly
 * the semantics `safe-error-log.js` has always enforced.
 *
 * @param {unknown} error
 */
export function redactError(error) {
  return { name: safeErrorName(error) };
}

/**
 * JSON logger for the server. One line per event, redacting serializers for
 * anything error-shaped, level from `LOG_LEVEL`.
 *
 * @param {NodeJS.ProcessEnv | Record<string, string | undefined>} [env]
 * @param {import("pino").DestinationStream} [destination] test seam
 */
export function createLogger(env = globalThis.process.env, destination) {
  const options = {
    level: typeof env.LOG_LEVEL === "string" && env.LOG_LEVEL ? env.LOG_LEVEL : "info",
    base: undefined,
    serializers: {
      err: redactError,
      error: redactError
    },
    timestamp: pino.stdTimeFunctions.isoTime
  };
  // Synchronous stdout on purpose: the request line is written in a
  // response-finish listener, exactly the window where a serverless function
  // can be frozen after `end()` — pino's default async destination could
  // lose it.
  return pino(options, destination ?? pinoDestination({ sync: true }));
}
