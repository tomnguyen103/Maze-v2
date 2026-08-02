import { createHmac } from "node:crypto";

export const OFFLINE_DEVICE_NONCE_PATTERN = /^[A-Za-z0-9_-]{16,256}$/;

/** @param {unknown} value */
export function validateOfflineDeviceInstallationNonce(value) {
  if (
    typeof value !== "string" ||
    !OFFLINE_DEVICE_NONCE_PATTERN.test(value)
  ) {
    throw new Error(
      "Device installation nonce must be 16-256 URL-safe characters."
    );
  }
  return value;
}

/** @param {string} nonce @param {string} secret */
export function deriveOfflineDeviceHash(nonce, secret) {
  validateOfflineDeviceInstallationNonce(nonce);
  if (typeof secret !== "string" || secret.length < 32) {
    throw new Error("Offline device hash secret is invalid.");
  }
  return createHmac("sha256", secret).update(nonce, "utf8").digest("hex");
}
