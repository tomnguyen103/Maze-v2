import * as Sentry from "@sentry/browser";
import { scrubTelemetryEvent } from "../shared/telemetry-scrub.js";

/**
 * Loaded lazily from app.js, and only when `VITE_SENTRY_DSN` was set at
 * build time — an unset DSN removes this chunk from the build entirely, so
 * the game bundle budget is untouched by default.
 */
export function initBrowserErrorTracking() {
  Sentry.init({
    dsn: import.meta.env.VITE_SENTRY_DSN,
    release: import.meta.env.VITE_SENTRY_RELEASE || undefined,
    sendDefaultPii: false,
    beforeSend: (event) => scrubTelemetryEvent(event)
  });
}
