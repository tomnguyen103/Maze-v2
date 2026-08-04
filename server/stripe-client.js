/**
 * Stripe, imported the first time a route actually needs it.
 *
 * `server/player-api.js` composes every route in this API, and eleven of the
 * twelve Vercel functions import it. A static `import Stripe from "stripe"`
 * at the top of that module meant all eleven paid a measured 90.20 ms for the
 * SDK on every cold start — the Scoreboard, the Runs, the health check —
 * while only the Lifetime and Class Expedition routes ever use it.
 *
 * The client is built once per process and reused, so the cost lands on the
 * first checkout or webhook rather than on everything.
 *
 * @param {string} secretKey
 * @returns {() => Promise<import("stripe").default>}
 */
export function createLazyStripe(secretKey) {
  /** @type {Promise<import("stripe").default> | null} */
  let client = null;
  return () => {
    client ??= import("stripe").then(({ default: Stripe }) => new Stripe(secretKey));
    return client;
  };
}
