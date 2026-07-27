import { initTracing } from "./tracing.js";
import { initErrorTracking } from "./error-tracking.js";

// First import of server/player-api.js. A top-level await here does NOT
// stop later sibling imports from evaluating (async ESM graphs run
// non-dependent siblings concurrently), so `pg` may well load before the
// SDK starts. That is acceptable: `pg` is CommonJS, and OpenTelemetry's
// InstrumentationBase patches already-required CommonJS modules when the
// SDK enables it — the only gap is spans missing from work done during the
// cold-start window itself. Both calls resolve immediately when their env
// vars are unset.
export const tracingSdk = await initTracing();
export const errorTracking = await initErrorTracking();
