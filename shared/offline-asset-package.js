/**
 * The small, explicit manifest the Offline Continuity worker is allowed to
 * pin. URLs are same-origin paths so a receipt can never authorize a worker
 * to fetch an arbitrary third-party resource.
 *
 * @typedef {{ url: string, scope: "public" | "account" }} OfflineAsset
 * @typedef {{ version: string, assets: OfflineAsset[] }} OfflineAssetPackage
 */

const VERSION_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;
const ASSET_SCOPES = new Set(["public", "account"]);

/** @param {unknown} value @returns {OfflineAssetPackage} */
export function normalizeOfflineAssetPackage(value) {
  if (!value || typeof value !== "object") {
    throw new Error("Offline asset package must be an object.");
  }
  const candidate = /** @type {Record<string, unknown>} */ (value);
  if (
    typeof candidate.version !== "string" ||
    !VERSION_PATTERN.test(candidate.version)
  ) {
    throw new Error("Offline asset package version is invalid.");
  }
  if (!Array.isArray(candidate.assets) || candidate.assets.length === 0) {
    throw new Error("Offline asset package needs at least one asset.");
  }
  if (candidate.assets.length > 128) {
    throw new Error("Offline asset package has too many assets.");
  }
  const urls = new Set();
  const assets = candidate.assets.map((asset) => {
    if (!asset || typeof asset !== "object") {
      throw new Error("Offline asset package contains an invalid asset.");
    }
    const entry = /** @type {Record<string, unknown>} */ (asset);
    if (
      typeof entry.url !== "string" ||
      !entry.url.startsWith("/") ||
      entry.url.startsWith("//") ||
      entry.url.includes("\\") ||
      urls.has(entry.url) ||
      typeof entry.scope !== "string" ||
      !ASSET_SCOPES.has(entry.scope)
    ) {
      throw new Error("Offline asset package contains an invalid asset.");
    }
    urls.add(entry.url);
    return {
      url: entry.url,
      scope: /** @type {"public" | "account"} */ (entry.scope)
    };
  });
  return /** @type {OfflineAssetPackage} */ (Object.freeze({
    version: candidate.version,
    assets: Object.freeze(assets)
  }));
}

/** @param {NodeJS.ProcessEnv | Record<string, string | undefined>} env */
export function loadOfflineAssetPackage(env = {}) {
  if (!env.OFFLINE_ASSET_PACKAGE) {
    return null;
  }
  let parsed;
  try {
    parsed = JSON.parse(env.OFFLINE_ASSET_PACKAGE);
  } catch {
    throw new Error("OFFLINE_ASSET_PACKAGE must be valid JSON.");
  }
  return normalizeOfflineAssetPackage(parsed);
}
