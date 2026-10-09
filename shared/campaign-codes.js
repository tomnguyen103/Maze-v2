/**
 * The Campaign Codes a landing link may carry in `?c=`. A count stores only a
 * code from this list, so no raw URL or free text reaches the database.
 */
export const CAMPAIGN_CODES = Object.freeze([
  "facebook",
  "instagram",
  "newsletter",
  "partner",
  "pinterest",
  "reddit",
  "search",
  "tiktok",
  "youtube"
]);

/**
 * @param {unknown} value
 * @returns {string} The allowlisted Campaign Code, or "" for none.
 */
export function campaignCodeFor(value) {
  if (typeof value !== "string") return "";
  const code = value.trim().toLowerCase();
  return CAMPAIGN_CODES.includes(code) ? code : "";
}
