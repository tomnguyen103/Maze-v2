import { createPrivateKey, createPublicKey } from "node:crypto";

/**
 * Offline Continuity Receipt key configuration, on the
 * `server/audit-checkpoint-config.js` model: absent configuration returns null
 * so the feature is simply unavailable, and partial configuration throws
 * rather than signing with half a key set.
 *
 * `OFFLINE_RECEIPT_PRIVATE_KEY` is a PKCS#8 PEM and stays server-side.
 * `VITE_OFFLINE_RECEIPT_PUBLIC_KEYS` is the JSON array of public JWKs the
 * browser bundles; it is the only half that may be public, and every key it
 * has ever contained must stay there until the last receipt signed by that key
 * is past its submission deadline.
 */
const CONFIG_KEYS = [
  "OFFLINE_RECEIPT_PRIVATE_KEY",
  "OFFLINE_RECEIPT_KEY_ID",
  "VITE_OFFLINE_RECEIPT_PUBLIC_KEYS"
];

/** @param {NodeJS.ProcessEnv | Record<string, string | undefined>} env */
export function loadOfflineReceiptConfig(env = process.env) {
  const configured = CONFIG_KEYS.some((key) => Boolean(env[key]));
  if (!configured) {
    return null;
  }
  const missing = CONFIG_KEYS.filter((key) => !env[key]);
  if (missing.length) {
    throw new Error("Offline receipt configuration is incomplete.");
  }

  const keys = parsePublicKeys(
    /** @type {string} */ (env.VITE_OFFLINE_RECEIPT_PUBLIC_KEYS)
  );
  const keyId = /** @type {string} */ (env.OFFLINE_RECEIPT_KEY_ID);
  if (!keys.some((jwk) => jwk.kid === keyId)) {
    // Signing with a key the browser cannot verify would issue receipts that
    // no client could ever use.
    throw new Error(
      "The offline receipt signing key id is not among the published keys."
    );
  }

  // Parsed here rather than at first use: a PEM that is not an EC P-256
  // private key would otherwise fail on the first Explorer's admission
  // rather than on the deploy that misconfigured it.
  const privateKey = createPrivateKey(
    /** @type {string} */ (env.OFFLINE_RECEIPT_PRIVATE_KEY)
  );
  if (
    privateKey.asymmetricKeyType !== "ec" ||
    privateKey.asymmetricKeyDetails?.namedCurve !== "prime256v1"
  ) {
    throw new Error("The offline receipt signing key must be ECDSA P-256.");
  }

  // A rotation that swaps the private key without republishing its public half
  // would sign receipts that every browser rejects.
  const derived = /** @type {{ x?: string, y?: string }} */ (
    createPublicKey(/** @type {never} */ (privateKey)).export({ format: "jwk" })
  );
  const published = /** @type {{ x: string, y: string }} */ (
    keys.find((jwk) => jwk.kid === keyId)
  );
  if (derived.x !== published.x || derived.y !== published.y) {
    throw new Error(
      "The offline receipt signing key does not match its published key."
    );
  }

  return { privateKey, keyId, keys };
}

/** @param {string} value */
function parsePublicKeys(value) {
  /** @type {unknown} */
  let parsed;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new Error("Offline receipt public keys must be a JSON array.");
  }
  if (!Array.isArray(parsed) || parsed.length === 0) {
    throw new Error("Offline receipt public keys must be a JSON array.");
  }
  const seen = new Set();
  return parsed.map((entry) => {
    const jwk = /** @type {Record<string, unknown>} */ (entry);
    if (
      !jwk ||
      typeof jwk !== "object" ||
      jwk.kty !== "EC" ||
      jwk.crv !== "P-256" ||
      typeof jwk.kid !== "string" ||
      typeof jwk.x !== "string" ||
      typeof jwk.y !== "string"
    ) {
      throw new Error("Offline receipt public keys must be P-256 JWKs.");
    }
    if (seen.has(jwk.kid)) {
      // Two keys under one id: the signing-key check would pass or fail on
      // whichever came first, and the browser would pick just as arbitrarily.
      throw new Error("Offline receipt public key ids must be unique.");
    }
    seen.add(jwk.kid);
    if (jwk.d !== undefined) {
      // The one mistake that would put a signing key in every browser bundle.
      throw new Error(
        "An offline receipt public key must not carry private key material."
      );
    }
    return { kty: jwk.kty, crv: jwk.crv, kid: jwk.kid, x: jwk.x, y: jwk.y };
  });
}
