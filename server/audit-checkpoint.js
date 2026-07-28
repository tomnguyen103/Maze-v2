import { createHmac, timingSafeEqual } from "node:crypto";
import { AUDIT_GENESIS_HASH } from "./audit-store.js";

export const AUDIT_CHECKPOINT_SCHEMA = "echo-maze-audit-checkpoint/1";
const HASH_PATTERN = /^[a-f0-9]{64}$/;
const MIN_SIGNING_KEY_BYTES = 32;

export class AuditCheckpointExistsError extends Error {
  constructor() {
    super("Audit checkpoint key already exists.");
    this.name = "AuditCheckpointExistsError";
  }
}

/**
 * @param {number} maxId
 * @param {string} rowHash
 */
function signatureInput(maxId, rowHash) {
  return `${maxId}:${rowHash}`;
}

/** @param {string} signingKey */
function requireSigningKey(signingKey) {
  if (Buffer.byteLength(signingKey) < MIN_SIGNING_KEY_BYTES) {
    throw new Error(
      `Audit checkpoint signing key must be at least ${MIN_SIGNING_KEY_BYTES} bytes.`
    );
  }
}

/**
 * @param {{
 *   maxId: number,
 *   rowHash: string,
 *   signingKey: string,
 *   createdAt: Date
 * }} input
 */
export function buildAuditCheckpoint({
  maxId,
  rowHash,
  signingKey,
  createdAt
}) {
  if (!Number.isSafeInteger(maxId) || maxId < 0) {
    throw new Error("Audit checkpoint max id is invalid.");
  }
  if (!HASH_PATTERN.test(rowHash)) {
    throw new Error("Audit checkpoint row hash is invalid.");
  }
  if (Number.isNaN(createdAt.getTime())) {
    throw new Error("Audit checkpoint time is invalid.");
  }
  requireSigningKey(signingKey);
  return {
    schema: AUDIT_CHECKPOINT_SCHEMA,
    algorithm: "hmac-sha256",
    created_at: createdAt.toISOString(),
    max_id: maxId,
    row_hash: rowHash,
    signature: createHmac("sha256", signingKey)
      .update(signatureInput(maxId, rowHash))
      .digest("hex")
  };
}

/** @param {unknown} value @param {string} signingKey */
export function verifyAuditCheckpoint(value, signingKey) {
  requireSigningKey(signingKey);
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { valid: false, reason: "schema" };
  }
  const checkpoint = /** @type {Record<string, unknown>} */ (value);
  if (
    checkpoint.schema !== AUDIT_CHECKPOINT_SCHEMA ||
    checkpoint.algorithm !== "hmac-sha256" ||
    !Number.isSafeInteger(checkpoint.max_id) ||
    Number(checkpoint.max_id) < 0 ||
    typeof checkpoint.row_hash !== "string" ||
    !HASH_PATTERN.test(checkpoint.row_hash) ||
    typeof checkpoint.created_at !== "string" ||
    Number.isNaN(Date.parse(checkpoint.created_at)) ||
    typeof checkpoint.signature !== "string" ||
    !HASH_PATTERN.test(checkpoint.signature)
  ) {
    return { valid: false, reason: "schema" };
  }
  const expected = createHmac("sha256", signingKey)
    .update(signatureInput(Number(checkpoint.max_id), checkpoint.row_hash))
    .digest();
  const supplied = Buffer.from(checkpoint.signature, "hex");
  return supplied.length === expected.length && timingSafeEqual(supplied, expected)
    ? { valid: true }
    : { valid: false, reason: "signature" };
}

/**
 * @param {{
 *   schema: string,
 *   created_at: string,
 *   max_id: number,
 *   row_hash: string
 * }} checkpoint
 */
export function auditCheckpointKey(checkpoint) {
  const utcDate = checkpoint.created_at.slice(0, 10);
  return `audit-checkpoints/v1/${utcDate}/${String(checkpoint.max_id).padStart(20, "0")}-${checkpoint.row_hash}.json`;
}

/**
 * @param {{
 *   checkpoint: Record<string, unknown>,
 *   key: string,
 *   signingKey: string,
 *   query: (
 *     sql: string,
 *     values?: unknown[]
 *   ) => Promise<{ rows: Record<string, unknown>[] }>
 * }} dependencies
 */
export async function verifyAuditCheckpointAnchor({
  checkpoint,
  key,
  signingKey,
  query
}) {
  const signature = verifyAuditCheckpoint(checkpoint, signingKey);
  if (!signature.valid) {
    return signature;
  }
  const typed = /** @type {{
   *   schema: string,
   *   created_at: string,
   *   max_id: number,
   *   row_hash: string
   * }} */ (/** @type {unknown} */ (checkpoint));
  if (auditCheckpointKey(typed) !== key) {
    return { valid: false, reason: "key" };
  }
  if (typed.max_id === 0) {
    return typed.row_hash === AUDIT_GENESIS_HASH
      ? { valid: true }
      : { valid: false, reason: "anchor_mismatch" };
  }
  const result = await query(
    "SELECT row_hash FROM audit_events WHERE id = $1",
    [typed.max_id]
  );
  if (!result.rows[0]) {
    return { valid: false, reason: "anchor_missing" };
  }
  return String(result.rows[0].row_hash) === typed.row_hash
    ? { valid: true }
    : { valid: false, reason: "anchor_mismatch" };
}

/**
 * Every retained anchor matters. Checking only the newest would let a later
 * checkpoint hide a database rewrite that conflicts with an older object.
 *
 * @param {{
 *   objects: { key: string, body: string }[],
 *   signingKey: string,
 *   query: (
 *     sql: string,
 *     values?: unknown[]
 *   ) => Promise<{ rows: Record<string, unknown>[] }>
 * }} dependencies
 */
export async function verifyRetainedAuditCheckpoints({
  objects,
  signingKey,
  query
}) {
  let checked = 0;
  for (const object of objects) {
    const checkpoint = parseCheckpoint(object.body);
    const anchored = await verifyAuditCheckpointAnchor({
      checkpoint,
      key: object.key,
      signingKey,
      query
    });
    checked += 1;
    if (!anchored.valid) {
      return { ...anchored, key: object.key, checked };
    }
  }
  return { valid: true, checked };
}

/**
 * @param {{
 *   query: (
 *     sql: string,
 *     values?: unknown[]
 *   ) => Promise<{ rows: Record<string, unknown>[] }>,
 *   sink: {
 *     put: (input: {
 *       key: string,
 *       body: string,
 *       retainUntil: Date
 *     }) => Promise<void>,
 *     get: (key: string) => Promise<string>
 *   },
 *   signingKey: string,
 *   retentionDays: number,
 *   now?: () => Date
 * }} dependencies
 */
export function createAuditCheckpointService({
  query,
  sink,
  signingKey,
  retentionDays,
  now = () => new Date()
}) {
  requireSigningKey(signingKey);
  if (!Number.isInteger(retentionDays) || retentionDays < 1) {
    throw new Error("Audit checkpoint retention days must be a positive integer.");
  }
  return {
    async create() {
      const result = await query(
        `SELECT
           (SELECT COALESCE(MAX(id), 0) FROM audit_events) AS max_id,
           row_hash
         FROM audit_chain_head
         WHERE id = 1`
      );
      const maxId = Number(result.rows[0]?.max_id ?? 0);
      const rowHash = String(
        result.rows[0]?.row_hash ?? AUDIT_GENESIS_HASH
      );
      const createdAt = now();
      const checkpoint = buildAuditCheckpoint({
        maxId,
        rowHash,
        signingKey,
        createdAt
      });
      const key = auditCheckpointKey(checkpoint);
      const body = JSON.stringify(checkpoint);
      const retainUntil = new Date(
        createdAt.getTime() + retentionDays * 24 * 60 * 60 * 1000
      );
      try {
        await sink.put({ key, body, retainUntil });
        return { key, maxId, rowHash, duplicate: false, retainUntil };
      } catch (error) {
        if (!(error instanceof AuditCheckpointExistsError)) {
          throw error;
        }
        const existing = parseCheckpoint(await sink.get(key));
        const verified = verifyAuditCheckpoint(existing, signingKey);
        if (
          !verified.valid ||
          Number(existing.max_id) !== maxId ||
          existing.row_hash !== rowHash
        ) {
          throw new Error(
            "Existing audit checkpoint does not match the committed chain head.",
            { cause: error }
          );
        }
        return { key, maxId, rowHash, duplicate: true, retainUntil: null };
      }
    }
  };
}

/** @param {string} body */
function parseCheckpoint(body) {
  try {
    const value = JSON.parse(body);
    if (value && typeof value === "object" && !Array.isArray(value)) {
      return /** @type {Record<string, unknown>} */ (value);
    }
  } catch {
    // Replaced with the stable mismatch error at the call site.
  }
  return {};
}
