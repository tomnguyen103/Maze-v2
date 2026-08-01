import { loadOfflineAssetPackage } from "../shared/offline-asset-package.js";

const CONFIG_KEYS = [
  "OFFLINE_DEVICE_HASH_SECRET",
  "OFFLINE_CONTENT_PACK_HASH",
  "OFFLINE_ASSET_PACKAGE"
];
const CONTENT_PACK_HASH_PATTERN = /^[a-f0-9]{64}$/;

/** @param {NodeJS.ProcessEnv | Record<string, string | undefined>} env */
export function loadOfflineContinuityConfig(env = process.env) {
  const configured = CONFIG_KEYS.some((key) => Boolean(env[key]));
  if (!configured) {
    return null;
  }
  const missing = CONFIG_KEYS.filter((key) => !env[key]);
  if (missing.length > 0) {
    throw new Error(
      `Offline Continuity configuration is incomplete: ${missing.join(", ")}.`
    );
  }
  const deviceHashSecret = /** @type {string} */ (
    env.OFFLINE_DEVICE_HASH_SECRET
  );
  if (deviceHashSecret.length < 32) {
    throw new Error("OFFLINE_DEVICE_HASH_SECRET must be at least 32 characters.");
  }
  const contentPackHash = /** @type {string} */ (env.OFFLINE_CONTENT_PACK_HASH);
  if (!CONTENT_PACK_HASH_PATTERN.test(contentPackHash)) {
    throw new Error("OFFLINE_CONTENT_PACK_HASH must be 64 lowercase hex characters.");
  }
  const assetPackage = loadOfflineAssetPackage(env);
  if (!assetPackage) {
    throw new Error("OFFLINE_ASSET_PACKAGE must be configured.");
  }
  return {
    deviceHashSecret,
    contentPackHash,
    assetPackage
  };
}
