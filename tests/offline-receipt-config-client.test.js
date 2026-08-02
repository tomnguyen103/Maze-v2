import { generateKeyPairSync } from "node:crypto";
import { describe, expect, it } from "vitest";
import { loadOfflineReceiptPublicKeys } from "../src/game/offline-receipt-config.js";

function publicKey(kid = "offline-primary") {
  const pair = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
  return {
    ...pair.publicKey.export({ format: "jwk" }),
    kid
  };
}

describe("Offline receipt browser key configuration", () => {
  it("bundles only public P-256 keys and rejects duplicate ids", () => {
    const key = publicKey();
    expect(
      loadOfflineReceiptPublicKeys({
        VITE_OFFLINE_RECEIPT_PUBLIC_KEYS: JSON.stringify([key])
      })
    ).toEqual([key]);

    expect(() =>
      loadOfflineReceiptPublicKeys({
        VITE_OFFLINE_RECEIPT_PUBLIC_KEYS: JSON.stringify([
          key,
          { ...key, x: `${key.x}x` }
        ])
      })
    ).toThrow("must be unique");
  });

  it("rejects private key material before it can reach the browser verifier", () => {
    const key = publicKey();
    expect(() =>
      loadOfflineReceiptPublicKeys({
        VITE_OFFLINE_RECEIPT_PUBLIC_KEYS: JSON.stringify([
          { ...key, d: "private" }
        ])
      })
    ).toThrow("public P-256 JWKs");
  });
});
