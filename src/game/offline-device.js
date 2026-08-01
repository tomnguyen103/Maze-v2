export const OFFLINE_DEVICE_NONCE_KEY =
  "echo-maze:offline-device-installation:v1";

/** @param {{ randomUUID?: () => string } | undefined} [cryptoLike] */
export function createOfflineDeviceInstallationNonce(cryptoLike = globalThis.crypto) {
  const randomUUID = cryptoLike?.randomUUID;
  if (typeof randomUUID !== "function") {
    throw new Error("Offline Continuity needs a secure device identifier.");
  }
  return randomUUID();
}

/**
 * @param {{
 *   getItem: (key: string) => string | null,
 *   setItem: (key: string, value: string) => unknown
 * }} storage
 * @param {{ randomUUID?: () => string } | undefined} [cryptoLike]
 */
export function loadOrCreateOfflineDeviceInstallationNonce(
  storage,
  cryptoLike = globalThis.crypto
) {
  const existing = storage.getItem(OFFLINE_DEVICE_NONCE_KEY);
  if (existing) {
    return existing;
  }
  const nonce = createOfflineDeviceInstallationNonce(cryptoLike);
  storage.setItem(OFFLINE_DEVICE_NONCE_KEY, nonce);
  return nonce;
}
