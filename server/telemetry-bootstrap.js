import { initTracing } from "./tracing.js";
import { initErrorTracking } from "./error-tracking.js";

// Evaluated as the FIRST import of server/player-api.js, before pg or any
// http client loads, because OpenTelemetry's instrumentations patch modules
// as they are required. ESM guarantees this module (including its top-level
// awaits) finishes before later imports evaluate. Both calls resolve
// immediately when their env vars are unset.
export const tracingSdk = await initTracing();
export const errorTracking = await initErrorTracking();
