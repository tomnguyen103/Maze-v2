/**
 * A 503 from this API always means "a dependency this route needs is not
 * usable", never "this request is wrong". Two things produce one: a transient
 * outage, and a dependency that was never configured for this deployment.
 * Neither is fixed by the caller changing the request, so the advisory below
 * is a re-check interval rather than a promise of recovery — a client that
 * retries blind, with no interval at all, is the thing being avoided.
 *
 * Kept deliberately short: the routes that emit 503 are guarding a database or
 * an object store, not a long batch job.
 */
export const SERVICE_UNAVAILABLE_RETRY_SECONDS = 30;

/**
 * Sets `retry-after` when the status invites a retry. Called from each route
 * module's `sendJson` so the advisory cannot drift per route.
 *
 * Rate limiting sets its own, budget-derived `retry-after` on 429
 * (`server/rate-limit-request.js`); this helper never touches that path.
 *
 * @param {import("node:http").ServerResponse} response
 * @param {number} status
 */
export function setRetryAfter(response, status) {
  if (status === 503) {
    response.setHeader(
      "retry-after",
      String(SERVICE_UNAVAILABLE_RETRY_SECONDS)
    );
  }
}
