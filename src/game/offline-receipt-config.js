import { createOfflineReceiptVerifier } from "./offline-receipt-verify.js";

/** @param {unknown} value */
function parsePublicKeys(value) {
  if (!value) {
    return [];
  }
  let parsed;
  try {
    parsed = JSON.parse(String(value));
  } catch {
    throw new Error("VITE_OFFLINE_RECEIPT_PUBLIC_KEYS must be valid JSON.");
  }
  if (!Array.isArray(parsed) || parsed.length === 0) {
    throw new Error("VITE_OFFLINE_RECEIPT_PUBLIC_KEYS must be a JSON array.");
  }
  const seen = new Set();
  return parsed.map((entry) => {
    if (!entry || typeof entry !== "object") {
      throw new Error("Offline receipt public keys must be objects.");
    }
    const key = /** @type {Record<string, unknown>} */ (entry);
    if (
      key.kty !== "EC" ||
      key.crv !== "P-256" ||
      typeof key.kid !== "string" ||
      typeof key.x !== "string" ||
      typeof key.y !== "string" ||
      key.d !== undefined
    ) {
      throw new Error(
        "Offline receipt public keys must be public P-256 JWKs."
      );
    }
    if (seen.has(key.kid)) {
      throw new Error("Offline receipt public key ids must be unique.");
    }
    seen.add(key.kid);
    return {
      kty: key.kty,
      crv: key.crv,
      kid: key.kid,
      x: key.x,
      y: key.y
    };
  });
}

/**
 * @param {{ VITE_OFFLINE_RECEIPT_PUBLIC_KEYS?: string } | undefined} [env]
 */
export function loadOfflineReceiptPublicKeys(
  env = /** @type {{ VITE_OFFLINE_RECEIPT_PUBLIC_KEYS?: string }} */ (import.meta.env)
) {
  return parsePublicKeys(env?.VITE_OFFLINE_RECEIPT_PUBLIC_KEYS);
}

/**
 * @param {{
 *   env?: { VITE_OFFLINE_RECEIPT_PUBLIC_KEYS?: string },
 *   subtle?: SubtleCrypto
 * }} [options]
 */
export function createConfiguredOfflineReceiptVerifier({
  env = /** @type {{ VITE_OFFLINE_RECEIPT_PUBLIC_KEYS?: string }} */ (import.meta.env),
  subtle = globalThis.crypto?.subtle
} = {}) {
  const keys = loadOfflineReceiptPublicKeys(env);
  return keys.length > 0
    ? createOfflineReceiptVerifier({ keys, subtle })
    : null;
}
