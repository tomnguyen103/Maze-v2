import {
  OFFLINE_RECEIPT_ALGORITHM,
  OFFLINE_RECEIPT_SCHEMA,
  offlineReceiptSigningInput
} from "../../shared/offline-receipt.js";

/**
 * Browser-side Offline Continuity Receipt verification.
 *
 * The bundle carries public keys only; the signing key never leaves the
 * server. This runs before any offline play begins, so a receipt that was
 * edited on the device — or minted by something that is not this server —
 * cannot start a Run.
 *
 * @typedef {import("../../shared/offline-receipt.js").OfflineReceipt} OfflineReceipt
 */

const KEY_ALGORITHM = Object.freeze({ name: "ECDSA", namedCurve: "P-256" });
const VERIFY_ALGORITHM = Object.freeze({ name: "ECDSA", hash: "SHA-256" });

/**
 * @param {{
 *   keys: Record<string, unknown>[],
 *   subtle?: SubtleCrypto
 * }} config
 */
export function createOfflineReceiptVerifier({
  keys,
  subtle = globalThis.crypto?.subtle
}) {
  if (!subtle) {
    throw new Error("Offline receipt verification needs Web Crypto.");
  }
  /** @type {Map<string, Promise<CryptoKey | null>>} */
  const imported = new Map();
  for (const jwk of keys) {
    // A key that arrives with a private component is a packaging fault, not a
    // usable verification key.
    if (jwk.d !== undefined) {
      throw new Error("A bundled verification key must carry no secret.");
    }
    imported.set(
      String(jwk.kid),
      subtle.importKey("jwk", jwk, KEY_ALGORITHM, false, ["verify"]).catch(
        () =>
          // A key that will not import is a packaging fault, but it must
          // surface as a failed verification rather than as an unhandled
          // rejection at construction time.
          null
      )
    );
  }

  return {
    /**
     * @param {unknown} value
     * @returns {Promise<{ valid: true } | { valid: false, reason: string }>}
     */
    async verify(value) {
      if (!value || typeof value !== "object") {
        return { valid: false, reason: "schema" };
      }
      const receipt = /** @type {OfflineReceipt} */ (value);
      if (
        receipt.schema !== OFFLINE_RECEIPT_SCHEMA ||
        receipt.algorithm !== OFFLINE_RECEIPT_ALGORITHM ||
        typeof receipt.keyId !== "string" ||
        typeof receipt.signature !== "string" ||
        !receipt.binding ||
        typeof receipt.binding !== "object"
      ) {
        return { valid: false, reason: "schema" };
      }
      const pending = imported.get(receipt.keyId);
      if (!pending) {
        return { valid: false, reason: "key" };
      }
      const key = await pending;
      if (!key) {
        return { valid: false, reason: "key" };
      }
      try {
        const signed = await subtle.verify(
          VERIFY_ALGORITHM,
          key,
          base64UrlToBytes(receipt.signature),
          new TextEncoder().encode(offlineReceiptSigningInput(receipt))
        );
        return signed ? { valid: true } : { valid: false, reason: "signature" };
      } catch {
        // A malformed signature is a failed verification, not a crash.
        return { valid: false, reason: "signature" };
      }
    }
  };
}

/** @param {string} value */
function base64UrlToBytes(value) {
  const padded = value.replaceAll("-", "+").replaceAll("_", "/");
  const binary = atob(padded.padEnd(Math.ceil(padded.length / 4) * 4, "="));
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}
