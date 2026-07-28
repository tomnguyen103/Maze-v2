import { createHash } from "node:crypto";

/** The prev_hash of the first row in the chain. */
export const AUDIT_GENESIS_HASH = "0".repeat(64);

/**
 * Stable-key-order JSON. Two structurally equal values always serialize
 * identically, which is what makes a recomputed row_hash comparable.
 *
 * @param {unknown} value
 * @returns {string}
 */
export function canonicalAuditJson(value) {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value ?? null);
  }
  if (Array.isArray(value)) {
    return `[${value.map(canonicalAuditJson).join(",")}]`;
  }
  const entries = Object.entries(/** @type {Record<string, unknown>} */ (value))
    .filter(([, entryValue]) => entryValue !== undefined)
    .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0));
  return `{${entries
    .map(([key, entryValue]) => `${JSON.stringify(key)}:${canonicalAuditJson(entryValue)}`)
    .join(",")}}`;
}

/** @param {unknown} value */
function timestampText(value) {
  return value instanceof Date ? value.toISOString() : String(value ?? "");
}

/**
 * @typedef {{
 *   actorId: string,
 *   actorRole?: string,
 *   action: string,
 *   resourceType: string,
 *   resourceId?: string | null,
 *   before?: unknown,
 *   after?: unknown,
 *   requestId?: string | null,
 *   ipHash?: string | null,
 *   createdAt: string | Date
 * }} AuditEvent
 */

/** @param {AuditEvent} event */
export function auditEventFields(event) {
  return {
    action: event.action,
    actor_id: event.actorId,
    actor_role: event.actorRole ?? "player",
    after: event.after ?? null,
    before: event.before ?? null,
    created_at: timestampText(event.createdAt),
    ip_hash: event.ipHash ?? null,
    request_id: event.requestId ?? null,
    resource_id: event.resourceId ?? null,
    resource_type: event.resourceType
  };
}

/**
 * @param {string} prevHash
 * @param {Record<string, unknown>} fields
 */
export function auditRowHash(prevHash, fields) {
  return auditPayloadHash(prevHash, canonicalAuditJson(fields));
}

/**
 * @param {string} prevHash
 * @param {string} canonicalPayload
 */
function auditPayloadHash(prevHash, canonicalPayload) {
  return createHash("sha256")
    .update(prevHash)
    .update(canonicalPayload)
    .digest("hex");
}

/**
 * Rebuilds the hashed field set from a stored row by routing it back through
 * auditEventFields, so the field list exists in exactly one place.
 *
 * @param {Record<string, unknown>} row
 */
function storedFields(row) {
  return auditEventFields({
    action: String(row.action),
    actorId: String(row.actor_id),
    actorRole: String(row.actor_role),
    after: row.after ?? null,
    before: row.before ?? null,
    createdAt: timestampText(row.created_at),
    ipHash: row.ip_hash === undefined ? null : /** @type {string | null} */ (row.ip_hash),
    requestId:
      row.request_id === undefined ? null : /** @type {string | null} */ (row.request_id),
    resourceId:
      row.resource_id === undefined ? null : /** @type {string | null} */ (row.resource_id),
    resourceType: String(row.resource_type)
  });
}

/** @param {Record<string, unknown>} row */
function storedPayload(row) {
  if (typeof row.canonical_payload !== "string") {
    return canonicalAuditJson(storedFields(row));
  }
  try {
    const parsed = JSON.parse(row.canonical_payload);
    if (
      canonicalAuditJson(parsed) !== canonicalAuditJson(storedFields(row))
    ) {
      return null;
    }
  } catch {
    return null;
  }
  return row.canonical_payload;
}

/**
 * Walks the chain in id order and recomputes every hash.
 *
 * @param {Record<string, unknown>[]} rows
 * @param {{ expectedPrevHash?: string }} [options] Chain hash the first row must
 *   link to. Defaults to the genesis hash; batched verification passes the last
 *   hash of the previous batch.
 * @returns {{
 *   valid: boolean,
 *   checked: number,
 *   brokenAt?: number,
 *   reason?: "prev_hash" | "row_hash"
 * }}
 */
export function verifyAuditChain(rows, options = {}) {
  let expectedPrev = options.expectedPrevHash ?? AUDIT_GENESIS_HASH;
  let checked = 0;
  for (const row of rows) {
    checked += 1;
    if (String(row.prev_hash) !== expectedPrev) {
      return {
        valid: false,
        checked,
        brokenAt: Number(row.id),
        reason: "prev_hash"
      };
    }
    const payload = storedPayload(row);
    if (
      payload === null ||
      auditPayloadHash(expectedPrev, payload) !== String(row.row_hash)
    ) {
      return {
        valid: false,
        checked,
        brokenAt: Number(row.id),
        reason: "row_hash"
      };
    }
    expectedPrev = String(row.row_hash);
  }
  return { valid: true, checked };
}

const CHAIN_QUERY = `SELECT
   id,
   actor_id,
   actor_role,
   action,
   resource_type,
   resource_id,
   before,
   after,
   request_id,
   ip_hash,
   canonical_payload,
   created_at,
   prev_hash,
   row_hash
 FROM audit_events
 WHERE id > $1
 ORDER BY id ASC
 LIMIT $2`;

/**
 * Reads one ordered slice of the chain through any query-capable handle, so a
 * verifier can hold a single snapshot across every batch and the head read.
 *
 * @param {(
 *   sql: string,
 *   values?: unknown[]
 * ) => Promise<{ rows: Record<string, unknown>[] }>} query
 * @param {{ afterId?: number, limit?: number }} [options]
 */
export async function readAuditChain(query, { afterId = 0, limit = 10000 } = {}) {
  const result = await query(CHAIN_QUERY, [afterId, limit]);
  return result.rows;
}

/**
 * @param {{
 *   query: (
 *     sql: string,
 *     values?: unknown[]
 *   ) => Promise<{ rows: Record<string, unknown>[] }>
 * }} pool
 */
export function createAuditStore(pool) {
  return {
    /** @param {AuditEvent} event */
    async appendAudit(event) {
      const fields = auditEventFields(event);
      const inserted = await pool.query(
        `SELECT id, created_at, prev_hash, row_hash
         FROM append_audit_event($1)`,
        [canonicalAuditJson(fields)]
      );
      if (!inserted.rows[0]) {
        throw new Error("Privileged audit append returned no row.");
      }
      return inserted.rows[0];
    },

    /**
     * @param {{ afterId?: number, limit?: number }} [options]
     */
    readChain(options) {
      return readAuditChain(pool.query.bind(pool), options);
    }
  };
}
