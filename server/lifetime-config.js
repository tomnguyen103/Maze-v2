/**
 * @param {Record<string, string | undefined>} env
 */
export function loadLifetimeConfig(env) {
  const secretKey = env.STRIPE_SECRET_KEY?.trim() ?? "";
  const priceId = env.STRIPE_PRICE_ID?.trim() ?? "";
  const webhookSecret = env.STRIPE_WEBHOOK_SECRET?.trim() ?? "";
  const appOrigin = normalizeAppOrigin(env.ECHO_MAZE_APP_ORIGIN ?? "");
  if (
    !secretKey.startsWith("sk_test_") ||
    !priceId.startsWith("price_") ||
    !webhookSecret.startsWith("whsec_") ||
    !appOrigin
  ) {
    return null;
  }
  return {
    appOrigin,
    priceId,
    secretKey,
    webhookSecret,
    expedition: loadExpeditionPrices(env)
  };
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
function normalizeAppOrigin(value) {
  try {
    const url = new URL(value.trim());
    const localHosts = new Set(["localhost", "127.0.0.1", "[::1]"]);
    if (url.protocol !== "https:" && !localHosts.has(url.hostname)) {
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
