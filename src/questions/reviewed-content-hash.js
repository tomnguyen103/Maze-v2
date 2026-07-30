/** @param {unknown} value @returns {string} */
function canonicalJson(value) {
  if (value === undefined) {
    throw new Error("Reviewed content cannot contain undefined values.");
  }
  if (value === null || typeof value !== "object") {
    const encoded = JSON.stringify(value);
    if (encoded === undefined) {
      throw new Error("Reviewed content contains an unsupported value.");
    }
    return encoded;
  }
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(",")}]`;
  }
  const record = /** @type {Record<string, unknown>} */ (value);
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
    .join(",")}}`;
}

/** @param {unknown} value */
export function reviewedContentDigest(value) {
  const content = canonicalJson(value);
  let first = 1_779_033_703;
  let second = 3_144_134_277;
  let third = 1_013_904_242;
  let fourth = 2_773_480_762;
  for (let index = 0; index < content.length; index += 1) {
    const code = content.charCodeAt(index);
    first = second ^ Math.imul(first ^ code, 597_399_067);
    second = third ^ Math.imul(second ^ code, 2_869_860_233);
    third = fourth ^ Math.imul(third ^ code, 951_274_213);
    fourth = first ^ Math.imul(fourth ^ code, 2_716_044_179);
  }
  first = Math.imul(third ^ (first >>> 18), 597_399_067);
  second = Math.imul(fourth ^ (second >>> 22), 2_869_860_233);
  third = Math.imul(first ^ (third >>> 17), 951_274_213);
  fourth = Math.imul(second ^ (fourth >>> 19), 2_716_044_179);
  const words = [
    first ^ second ^ third ^ fourth,
    second ^ first,
    third ^ first,
    fourth ^ first
  ];
  return words
    .map((word) => (word >>> 0).toString(16).padStart(8, "0"))
    .join("");
}
