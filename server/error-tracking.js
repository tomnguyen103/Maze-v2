import { scrubTelemetryEvent } from "../shared/telemetry-scrub.js";
import { safeErrorName } from "./safe-error-log.js";

/**
 * Env-gated Sentry. Unset `SENTRY_DSN` means the SDK is never even imported,
 * so local and test runs carry zero overhead. Initialisation failures are
 * swallowed with a warning — error tracking must never be why a request
 * fails.
 *
 * @param {NodeJS.ProcessEnv | Record<string, string | undefined>} [env]
 * @returns {Promise<typeof import("@sentry/node") | null>}
 */
export async function initErrorTracking(env = globalThis.process.env) {
  const dsn = env.SENTRY_DSN;
  if (!dsn) {
    return null;
  }
  try {
    const Sentry = await import("@sentry/node");
    Sentry.init({
      dsn,
      release: env.VERCEL_GIT_COMMIT_SHA || undefined,
      environment: env.VERCEL_ENV || "development",
      sendDefaultPii: false,
      // Tracing belongs to OpenTelemetry (server/tracing.js); Sentry does
      // errors only.
      tracesSampleRate: 0,
      beforeSend: (event) => scrubTelemetryEvent(event)
    });
    return Sentry;
  } catch (error) {
    console.warn("[error-tracking] disabled", { name: safeErrorName(error) });
    return null;
  }
}
