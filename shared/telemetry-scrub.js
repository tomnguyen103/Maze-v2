// Shared by the server and browser Sentry setups so both scrub identically.

/**
 * Strips everything personal from an outgoing Sentry event: the user is
 * reduced to their id, and request headers, cookies, bodies, and query
 * strings never leave the process. Applied as `beforeSend`, so nothing an
 * SDK integration collects can bypass it.
 *
 * @template {Record<string, any>} TEvent
 * @param {TEvent} event
 * @returns {TEvent}
 */
export function scrubTelemetryEvent(event) {
  if (event.user) {
    const id = event.user.id;
    /** @type {any} */ (event).user =
      typeof id === "string" || typeof id === "number" ? { id } : undefined;
  }
  if (event.request) {
    delete event.request.headers;
    delete event.request.cookies;
    delete event.request.data;
    delete event.request.query_string;
    if (typeof event.request.url === "string") {
      event.request.url = event.request.url.split("?")[0];
    }
  }
  return event;
}
