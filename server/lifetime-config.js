export class LifetimeConfigurationError extends Error {}

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

/**
 * Whether Run Access enforcement is both requested and achievable.
 *
 * These are two different questions and used to be answered as one. Asking
 * for enforcement without a usable billing configuration returned `null`
 * here, enforcement quietly resolved to `false`, and `/api/access/config`
 * then reported a state operators read as an intentional billing-disable. A
 * live `sk_live_` key is exactly that case: it fails the `sk_test_` check, so
 * turning enforcement on with real credentials turned it off instead.
 *
 * Returns the decision and, when it is refused, the reason — rather than
 * throwing. The composition root decides what to do with a refusal, because
 * the right answer differs by deployment: a long-running server should refuse
 * to boot, while a serverless function is constructed at module load for
 * every route, so throwing there would take the Scoreboard, the Runs, and
 * the Stripe webhook needed to fix the billing state down with it.
 *
 * @param {Record<string, string | undefined>} env
 * @returns {{ enabled: boolean, refusal: string | null }}
 */
export function resolveEnforcement(env) {
  if (env.RUN_ACCESS_ENFORCEMENT_ENABLED !== "true") {
    return { enabled: false, refusal: null };
  }
  const { config, refusal } = describeLifetimeConfig(env);
  if (config === null) {
    return {
      enabled: false,
      refusal: `${ENFORCEMENT_REFUSAL} Reason: ${refusal ?? "incomplete_configuration"}.`
    };
  }
  return { enabled: true, refusal: null };
}

export const ENFORCEMENT_REFUSAL =
  "RUN_ACCESS_ENFORCEMENT_ENABLED is true but the Lifetime Membership configuration is incomplete or refused. Enforcement without a usable checkout would lock every Explorer out of a Run they cannot buy. Fix STRIPE_SECRET_KEY, STRIPE_PRICE_ID, STRIPE_WEBHOOK_SECRET and ECHO_MAZE_APP_ORIGIN, or set RUN_ACCESS_ENFORCEMENT_ENABLED to false deliberately.";

/**
 * The boot-time form: refuse to start. Used by the long-running server, where
 * failing loudly is right and nothing else is taken down with it.
 *
 * @param {Record<string, string | undefined>} env
 * @returns {boolean}
 * @throws {LifetimeConfigurationError}
 */
export function resolveEnforcementEnabled(env) {
  const decision = resolveEnforcement(env);
  if (decision.refusal) {
    throw new LifetimeConfigurationError(decision.refusal);
  }
  return decision.enabled;
}

/**
 * Refuses a Billing Mode the deployment may not run, whether or not
 * enforcement is requested. An incomplete configuration is not a refusal.
 *
 * @param {Record<string, string | undefined>} env
 * @throws {LifetimeConfigurationError}
 */
export function resolveBillingConfiguration(env) {
  const decision = describeLifetimeConfig(env);
  if (decision.refusal) {
    throw new LifetimeConfigurationError(
      `Billing Mode refused: ${decision.refusal}.`
    );
  }
  return decision;
}

/**
 * Resolves the Billing Mode and the configuration that mode allows. A refusal
 * names its reason and carries no config. An incomplete configuration carries
 * no refusal, so the caller reports the gap instead of failing.
 *
 * @param {Record<string, string | undefined>} env
 * @returns {{
 *   mode: "test" | "live" | null,
 *   config: {
 *     appOrigin: string,
 *     priceId: string,
 *     secretKey: string,
 *     webhookSecret: string,
 *     expedition: { basePriceId: string, extensionPriceId: string } | null
 *   } | null,
 *   refusal: string | null
 * }}
 */
export function describeLifetimeConfig(env) {
  const mode = env.ECHO_MAZE_BILLING_MODE ?? "test";
  if (mode !== "test" && mode !== "live") {
    return { mode: null, config: null, refusal: "invalid_mode" };
  }
  const secretKey = env.STRIPE_SECRET_KEY?.trim() ?? "";
  const keyIsLive = secretKey.startsWith("sk_live_");
  const keyIsTest = secretKey.startsWith("sk_test_");
  if ((mode === "live" && keyIsTest) || (mode === "test" && keyIsLive)) {
    return { mode, config: null, refusal: "key_mode_mismatch" };
  }
  if (mode === "live" && (env.VERCEL_ENV || env.NODE_ENV) !== "production") {
    return { mode, config: null, refusal: "live_requires_production" };
  }
  const rawOrigin = env.ECHO_MAZE_APP_ORIGIN ?? "";
  if (mode === "live" && !isHttpsPublicOrigin(rawOrigin)) {
    return { mode, config: null, refusal: "live_requires_https_origin" };
  }
  const priceId = env.STRIPE_PRICE_ID?.trim() ?? "";
  const webhookSecret = env.STRIPE_WEBHOOK_SECRET?.trim() ?? "";
  const appOrigin = normalizeAppOrigin(rawOrigin);
  const keyMatchesMode = mode === "live" ? keyIsLive : keyIsTest;
  if (
    !keyMatchesMode ||
    !priceId.startsWith("price_") ||
    !webhookSecret.startsWith("whsec_") ||
    !appOrigin
  ) {
    return { mode, config: null, refusal: null };
  }
  return {
    mode,
    config: {
      appOrigin,
      priceId,
      secretKey,
      webhookSecret,
      expedition: loadExpeditionPrices(env)
    },
    refusal: null
  };
}

/**
 * @param {Record<string, string | undefined>} env
 */
export function loadLifetimeConfig(env) {
  return describeLifetimeConfig(env).config;
}

/**
 * Class Expedition License prices are optional: without both test prices the
 * sponsor purchase surface reports itself unconfigured instead of guessing.
 * The same sk_test_-only gate above still applies to every checkout.
 *
 * @param {Record<string, string | undefined>} env
 */
function loadExpeditionPrices(env) {
  const basePriceId = env.STRIPE_EXPEDITION_PRICE_ID?.trim() ?? "";
  const extensionPriceId =
    env.STRIPE_EXPEDITION_EXTENSION_PRICE_ID?.trim() ?? "";
  if (
    !basePriceId.startsWith("price_") ||
    !extensionPriceId.startsWith("price_")
  ) {
    return null;
  }
  return { basePriceId, extensionPriceId };
}

/** @param {string} value */
function isHttpsPublicOrigin(value) {
  try {
    const url = new URL(value.trim());
    return url.protocol === "https:" && !LOCAL_HOSTS.has(url.hostname);
  } catch {
    return false;
  }
}

/** @param {string} value */
function normalizeAppOrigin(value) {
  try {
    const url = new URL(value.trim());
    if (url.protocol !== "https:" && !LOCAL_HOSTS.has(url.hostname)) {
      return null;
    }
    if (url.username || url.password || url.search || url.hash) {
      return null;
    }
    return url.origin;
  } catch {
    return null;
  }
}
