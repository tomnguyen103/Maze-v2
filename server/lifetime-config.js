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
  return { appOrigin, priceId, secretKey, webhookSecret };
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
