import { createHash } from "node:crypto";
import publicEmailDomainSnapshot from "../data/public-email-domains.json" with {
  type: "json"
};

const DOMAIN_PATTERN =
  /^(?=.{4,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;
export const PUBLIC_EMAIL_DOMAIN_SOURCE = publicEmailDomainSnapshot.source;
export const PUBLIC_EMAIL_DOMAINS = validatedPublicEmailDomains(
  publicEmailDomainSnapshot.domains,
  PUBLIC_EMAIL_DOMAIN_SOURCE
);

export class ClassroomDomainInputError extends Error {
  constructor(message = "Enter a valid school email domain.") {
    super(message);
    this.name = "ClassroomDomainInputError";
  }
}

export class ClassroomDomainConflictError extends Error {
  constructor() {
    super("That school email domain belongs to another Classroom.");
    this.name = "ClassroomDomainConflictError";
  }
}

/** @param {unknown} value */
export function normalizeEmailDomain(value) {
  const domain = typeof value === "string"
    ? value.trim().toLowerCase()
    : "";
  if (!DOMAIN_PATTERN.test(domain)) {
    throw new ClassroomDomainInputError();
  }
  return domain;
}

/** @param {unknown} value */
export function normalizeClassroomDomain(value) {
  const domain = normalizeEmailDomain(value);
  if (PUBLIC_EMAIL_DOMAINS.has(domain)) {
    throw new ClassroomDomainInputError(
      "Public email providers cannot become Classroom domains."
    );
  }
  return domain;
}

/** @param {unknown} value */
export function verifiedEmailDomain(value) {
  if (typeof value !== "string") {
    return null;
  }
  const separator = value.lastIndexOf("@");
  if (separator <= 0 || separator === value.length - 1) {
    return null;
  }
  try {
    return normalizeEmailDomain(value.slice(separator + 1));
  } catch {
    return null;
  }
}

/**
 * @param {{
 *   store: {
 *     classroomForDomain: (domain: string) => Promise<string | null>
 *   },
 *   provider: {
 *     autoJoinStudent: (input: {
 *       classroomId: string,
 *       userId: string
 *     }) => Promise<{ created: boolean, membershipId: string }>
 *   } | null
 * }} dependencies
 * @param {{ eventType: string, payload: unknown }} event
 */
export async function processClassroomAutoJoinEvent(
  { store, provider },
  event
) {
  if (
    event.eventType !== "user.created" &&
    event.eventType !== "user.updated"
  ) {
    return null;
  }
  if (!provider) {
    return null;
  }
  const payload = /** @type {Record<string, unknown>} */ (
    event.payload ?? {}
  );
  const userId = requiredString(payload.id);
  const domain = normalizeEmailDomain(payload.emailDomain);
  requiredTimestamp(payload.occurredAt);
  const classroomId = await store.classroomForDomain(domain);
  if (!classroomId) {
    return null;
  }
  const membership = await provider.autoJoinStudent({
    classroomId,
    userId
  });
  return {
    action: "org.autojoin",
    applied: membership.created,
    resource: {
      type: "classroom_membership",
      id: membership.membershipId
    },
    metadata: { classroomId, userId }
  };
}

/** @param {unknown} value */
function requiredString(value) {
  if (typeof value !== "string" || !value) {
    throw new Error("Clerk auto-join event is invalid.");
  }
  return value;
}

/** @param {unknown} value */
function requiredTimestamp(value) {
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value <= 0
  ) {
    throw new Error("Clerk auto-join timestamp is invalid.");
  }
  return value;
}

/**
 * @param {unknown} values
 * @param {unknown} source
 */
function validatedPublicEmailDomains(values, source) {
  if (!Array.isArray(values) || values.length === 0) {
    throw new Error("The public email domain snapshot is invalid.");
  }
  const domains = new Set();
  for (const value of values) {
    if (
      typeof value !== "string" ||
      value !== value.trim().toLowerCase() ||
      !DOMAIN_PATTERN.test(value) ||
      domains.has(value)
    ) {
      throw new Error("The public email domain snapshot is invalid.");
    }
    domains.add(value);
  }
  if (
    typeof source !== "object" ||
    source === null
  ) {
    throw new Error("The public email domain snapshot source is invalid.");
  }
  const sourceRecord = /** @type {Record<string, unknown>} */ (source);
  if (
    !Array.isArray(sourceRecord.reviewedSupplements) ||
    sourceRecord.canonicalization !==
      "sorted lowercase unique JSON array without whitespace" ||
    typeof sourceRecord.baseDomainsSha256 !== "string"
  ) {
    throw new Error("The public email domain snapshot source is invalid.");
  }
  const supplements = new Set(sourceRecord.reviewedSupplements);
  if (supplements.size !== sourceRecord.reviewedSupplements.length) {
    throw new Error("The public email domain supplements are invalid.");
  }
  for (const supplement of supplements) {
    if (
      typeof supplement !== "string" ||
      !domains.has(supplement) ||
      !DOMAIN_PATTERN.test(supplement)
    ) {
      throw new Error("The public email domain supplements are invalid.");
    }
  }
  const canonicalBaseDomains = [...domains]
    .filter((domain) => !supplements.has(domain))
    .sort();
  const digest = createHash("sha256")
    .update(JSON.stringify(canonicalBaseDomains))
    .digest("hex");
  if (digest !== sourceRecord.baseDomainsSha256) {
    throw new Error("The public email domain snapshot digest is invalid.");
  }
  return domains;
}
