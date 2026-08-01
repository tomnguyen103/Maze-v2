import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { loadOfflineContinuityConfig } from "../server/offline-continuity-config.js";
import {
  deriveOfflineDeviceHash,
  validateOfflineDeviceInstallationNonce
} from "../server/offline-device.js";
import { normalizeOfflineAssetPackage } from "../shared/offline-asset-package.js";

const ASSET_PACKAGE = JSON.stringify({
  version: "build_01MOSS",
  assets: [{ url: "/index.html", scope: "public" }]
});

describe("Offline Continuity server configuration", () => {
  it("is absent, complete, or an error rather than partially enabled", () => {
    expect(loadOfflineContinuityConfig({})).toBeNull();
    expect(
      loadOfflineContinuityConfig({
        OFFLINE_DEVICE_HASH_SECRET: "server-only-secret-01",
        OFFLINE_CONTENT_PACK_HASH: "a".repeat(64),
        OFFLINE_ASSET_PACKAGE: ASSET_PACKAGE
      })
    ).toMatchObject({
      contentPackHash: "a".repeat(64),
      assetPackage: {
        version: "build_01MOSS"
      }
    });
    expect(() =>
      loadOfflineContinuityConfig({
        OFFLINE_DEVICE_HASH_SECRET: "server-only-secret-01"
      })
    ).toThrow("configuration is incomplete");
  });

  it("rejects an asset manifest that is not explicit about scope", () => {
    expect(() =>
      normalizeOfflineAssetPackage({
        version: "build_01MOSS",
        assets: [{ url: "/index.html" }]
      })
    ).toThrow("invalid asset");
  });

  it("derives only a one-way device hash from a bounded nonce", () => {
    const nonce = "installation_nonce_01MOSS";
    const secret = "server-only-secret-01";
    expect(validateOfflineDeviceInstallationNonce(nonce)).toBe(nonce);
    expect(deriveOfflineDeviceHash(nonce, secret)).toBe(
      createHmac("sha256", secret).update(nonce).digest("hex")
    );
    expect(() => validateOfflineDeviceInstallationNonce("short")).toThrow(
      "16-256"
    );
  });
});
