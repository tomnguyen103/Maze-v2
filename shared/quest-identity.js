/**
 * Quest identity comparison, in one place.
 *
 * This predicate decides whether a stored Quest and a presented one are the
 * same Quest, and three separate boundaries ask it: offline receipt binding,
 * Active Run Recovery, and Run Access. It existed seven times — twice as
 * module functions in `shared/`, four times inside `src/game/`, and once in
 * `server/offline-receipt-route.js` — in two different spellings, with nothing
 * keeping them in step. The A+ audit filed that as `Q-64`.
 *
 * `shared/` is the right home: the browser, the server and the service worker
 * all import from here, and this module imports nothing, so it stays at the
 * bottom of the stack where the module-boundary guard requires it.
 */

/**
 * Quest II Quest IDs are prefixed at creation (`src/game/quest-content.js`).
 * Anything else — including a value that is not a string — is Quest I.
 *
 * @param {unknown} value
 * @returns {boolean}
 */
export function isQuestIIQuestId(value) {
  return typeof value === "string" && /^quest_ii_/iu.test(value);
}

/**
 * Whether two Quest identities refer to the same Quest.
 *
 * Exact equality, or one side absent against a Quest I identity. The
 * asymmetry is deliberate and predates this consolidation: a record written
 * before Quest IDs existed carries no Quest ID at all, and treating that as a
 * match for a Quest I Quest is what lets an Explorer keep an in-progress Run
 * across the upgrade. A Quest II identity has no such history, so an absent
 * side never matches one — silently binding a receipt or a recovered Run to
 * the wrong Quest would be worse than refusing.
 *
 * Both sides absent is a match: neither names a Quest, so neither contradicts
 * the other.
 *
 * @param {unknown} left
 * @param {unknown} right
 * @returns {boolean}
 */
export function questIdentityMatches(left, right) {
  return (
    left === right ||
    (left === undefined && !isQuestIIQuestId(right)) ||
    (right === undefined && !isQuestIIQuestId(left))
  );
}
