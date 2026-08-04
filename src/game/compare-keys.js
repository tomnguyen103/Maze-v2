/**
 * Total order on two identifier strings that every engine reproduces exactly.
 *
 * `String.prototype.localeCompare` does not qualify: its result depends on the
 * runtime's collation data, so two devices can disagree about a tie-break —
 * and a tie-break inside a Run rule decides which tile a Warden takes. Use
 * `localeCompare` for text a person reads, and this for anything replay,
 * verification, or a stored order depends on.
 *
 * @param {string} left
 * @param {string} right
 * @returns {-1 | 0 | 1}
 */
export function compareKeys(left, right) {
  if (left === right) return 0;
  return left < right ? -1 : 1;
}
