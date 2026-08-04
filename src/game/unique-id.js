/**
 * The one declared entropy seam inside the deterministic game core.
 *
 * `tests/deterministic-core.test.js` fails the gate on any clock or entropy
 * read under `src/game/` and `shared/`, and names this file as the single
 * exemption. Run rules must never call it: the ids it produces are metadata
 * that identify a Run or a Quest, never state that replay has to reproduce.
 * `server/run-replay.js` rebuilds a Run from its seed and action log alone and
 * reads none of these values.
 */

/**
 * One opaque identifier, from the platform's CSPRNG when it is available.
 *
 * `crypto.randomUUID` needs a secure context; a browser served over plain HTTP
 * on a LAN address does not get one, so the fallback keeps sign-in-free play
 * working there. It is weaker, and deliberately so — nothing authorizes off
 * one of these strings. The server issues its own Run Grant identifiers.
 *
 * @returns {string}
 */
export function uniqueId() {
  if (globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}
