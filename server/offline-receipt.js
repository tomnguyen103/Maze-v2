import {
  createPrivateKey,
  createPublicKey,
  sign as signBytes,
  verify as verifyBytes
} from "node:crypto";
import {
  OFFLINE_RECEIPT_ALGORITHM,
  OFFLINE_RECEIPT_SCHEMA,
  offlineReceiptSigningInput,
  offlineReceiptWindows
} from "../shared/offline-receipt.js";

/**
 * Server-side Offline Continuity Receipt signing and verification.
 *
 * The private key lives here and only here — no module under `src/` may import
 * this file, and `tests/offline-receipt.test.js` asserts both that and the
 * absence of private key material from the built output. The browser gets the
 * public JWK and verifies with `crypto.subtle`.
 *
 * Signatures use the IEEE P1363 encoding (raw r‖s) rather than the DER default,
 * because that is the only encoding WebCrypto's ECDSA verify accepts. A DER
 * signature here would verify in Node and fail in every browser.
 *
 * @typedef {import("../shared/offline-receipt.js").OfflineReceipt} OfflineReceipt
 * @typedef {import("../shared/offline-receipt.js").OfflineReceiptBinding} OfflineReceiptBinding
 */

const SIGNATURE_ENCODING = "ieee-p1363";

/**
 * Turns the configured PKCS#8 PEM into the key object the signer takes. Kept
 * at this edge so the signer itself never has to decide whether it was handed
 * a key or a string that looks like one.
 *
 * @param {string} pem
 */
export function offlineSigningKeyFrom(pem) {
  return createPrivateKey(pem);
}

/**
 * @param {import("node:crypto").KeyObject} publicKey
 * @param {string} keyId
 */
export function publicJwkFor(publicKey, keyId) {
  const jwk = publicKey.export({ format: "jwk" });
  if (jwk.d !== undefined) {
    throw new Error("A public JWK must not carry private key material.");
  }
  return { ...jwk, kid: keyId };
}

/**
 * @param {{
 *   privateKey: import("node:crypto").KeyObject,
 *   keyId: string
 * }} config
 */
export function createOfflineReceiptSigner({ privateKey, keyId }) {
  if (!keyId) {
    throw new Error("Offline receipt signing needs a key id.");
  }

  return {
    /**
     * Issues one receipt for one admitted Run.
     *
     * @param {{
     *   runId: string,
     *   playerId: string | null,
     *   classroomId: string | null,
     *   deviceInstallationHash: string,
     *   seed: string,
     *   levelId: "bright-start" | "trail-scout" | "maze-master",
     *   labyrinthNumber: number,
     *   rulesetRevision: string,
     *   contentPackHash: string
     * }} admission
     * @param {{ issuedAt?: string }} [options]
     * @returns {OfflineReceipt}
     */
    issue(admission, { issuedAt = new Date().toISOString() } = {}) {
      if (admission.classroomId) {
        // ADR 0034: a disconnected client cannot establish that Membership and
        // assignment authority are still active, so Class Play must fail
        // closed rather than carry an offline warrant.
        throw new Error(
          "Classroom Run Grants are not eligible for Offline Continuity Receipts."
        );
      }
      const windows = offlineReceiptWindows(issuedAt);
      /** @type {OfflineReceiptBinding} */
      const binding = {
        runId: admission.runId,
        playerId: admission.playerId ?? null,
        deviceInstallationHash: admission.deviceInstallationHash,
        seed: admission.seed,
        levelId: admission.levelId,
        labyrinthNumber: admission.labyrinthNumber,
        rulesetRevision: admission.rulesetRevision,
        contentPackHash: admission.contentPackHash,
        issuedAt,
        playExpiresAt: windows.playExpiresAt,
        submissionExpiresAt: windows.submissionExpiresAt
      };
      const unsigned = {
        schema: OFFLINE_RECEIPT_SCHEMA,
        algorithm: OFFLINE_RECEIPT_ALGORITHM,
        keyId,
        binding
      };
      const signature = signBytes(
        "sha256",
        Buffer.from(offlineReceiptSigningInput(unsigned), "utf8"),
        { key: privateKey, dsaEncoding: SIGNATURE_ENCODING }
      );
      return { ...unsigned, signature: signature.toString("base64url") };
    }
  };
}

/**
 * Verification holds a set of keys, not one. A retiring key stays in the set
 * until the last receipt it signed is past its submission deadline, which is
 * what keeps a rotation from invalidating outstanding receipts.
 *
 * @param {{ keys: Record<string, unknown>[] }} config
 */
export function createOfflineReceiptVerifier({ keys }) {
  const byKeyId = new Map(
    keys.map((jwk) => [
      String(jwk.kid),
      createPublicKey({
        key: /** @type {import("node:crypto").JsonWebKeyInput["key"]} */ (jwk),
        format: "jwk"
      })
    ])
  );

  return {
    /**
     * @param {unknown} value
     * @returns {{ valid: true } | { valid: false, reason: string }}
     */
    verify(value) {
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
      const key = byKeyId.get(receipt.keyId);
      if (!key) {
        return { valid: false, reason: "key" };
      }
      try {
        const signed = verifyBytes(
          "sha256",
          Buffer.from(offlineReceiptSigningInput(receipt), "utf8"),
          { key, dsaEncoding: SIGNATURE_ENCODING },
          Buffer.from(receipt.signature, "base64url")
        );
        return signed ? { valid: true } : { valid: false, reason: "signature" };
      } catch {
        // A malformed signature is a failed verification, not a server fault.
        return { valid: false, reason: "signature" };
      }
    }
  };
}
