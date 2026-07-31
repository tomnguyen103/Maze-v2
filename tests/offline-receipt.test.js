import { generateKeyPairSync } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import {
  OFFLINE_RECEIPT_ALGORITHM,
  OFFLINE_RECEIPT_SCHEMA,
  offlinePlayAuthorityOpen,
  offlineSubmissionDeadline,
  receiptBindingMatches
} from "../shared/offline-receipt.js";
import {
  createOfflineReceiptSigner,
  createOfflineReceiptVerifier,
  publicJwkFor
} from "../server/offline-receipt.js";

const ISSUED_AT = "2026-07-31T00:00:00.000Z";

/** @param {string} keyId */
function keyPair(keyId) {
  const { privateKey, publicKey } = generateKeyPairSync("ec", {
    namedCurve: "P-256"
  });
  return {
    keyId,
    privateKey,
    jwk: publicJwkFor(publicKey, keyId)
  };
}

/** @param {Record<string, unknown>} [overrides] */
function binding(overrides = {}) {
  return {
    runId: "offline_run_01J1MOSSWATCH",
    deviceInstallationHash: "a".repeat(64),
    playerId: "user_moss",
    classroomId: null,
    seed: "MOSS-WATCH-11",
    levelId: /** @type {const} */ ("trail-scout"),
    labyrinthNumber: 4,
    rulesetRevision: "tide-doors-v1",
    contentPackHash: "b".repeat(64),
    ...overrides
  };
}

describe("Offline Continuity Receipt", () => {
  const primary = keyPair("offline-2026-07");

  it("signs with ECDSA P-256 over SHA-256 and verifies", () => {
    const signer = createOfflineReceiptSigner({
      privateKey: primary.privateKey,
      keyId: primary.keyId
    });
    const receipt = signer.issue(binding(), { issuedAt: ISSUED_AT });

    expect(receipt.schema).toBe(OFFLINE_RECEIPT_SCHEMA);
    expect(receipt.algorithm).toBe(OFFLINE_RECEIPT_ALGORITHM);
    expect(OFFLINE_RECEIPT_ALGORITHM).toBe("ecdsa-p256-sha256");
    expect(
      createOfflineReceiptVerifier({ keys: [primary.jwk] }).verify(receipt)
    ).toEqual({ valid: true });
  });

  it("ends play authority at issue plus seven days", () => {
    const signer = createOfflineReceiptSigner({
      privateKey: primary.privateKey,
      keyId: primary.keyId
    });
    const receipt = signer.issue(binding(), { issuedAt: ISSUED_AT });

    expect(receipt.binding.playExpiresAt).toBe("2026-08-07T00:00:00.000Z");
    expect(
      offlinePlayAuthorityOpen(receipt, new Date("2026-08-06T23:59:59.999Z"))
    ).toBe(true);
    expect(
      offlinePlayAuthorityOpen(receipt, new Date("2026-08-07T00:00:00.000Z"))
    ).toBe(false);
  });

  it("ends submission validity at terminal plus 48 hours, capped at nine days", () => {
    const signer = createOfflineReceiptSigner({
      privateKey: primary.privateKey,
      keyId: primary.keyId
    });
    const receipt = signer.issue(binding(), { issuedAt: ISSUED_AT });

    expect(receipt.binding.submissionExpiresAt).toBe(
      "2026-08-09T00:00:00.000Z"
    );
    // A Run that ends early gets its 48 hours and no more.
    expect(
      offlineSubmissionDeadline(receipt, new Date("2026-08-01T09:00:00.000Z"))
    ).toBe("2026-08-03T09:00:00.000Z");
    // The nine-day cap sits exactly at play expiry plus 48 hours, so a Run
    // that runs the play window right to its end still gets the full grace
    // and the cap never cuts a legitimate submission short.
    expect(
      offlineSubmissionDeadline(receipt, new Date(receipt.binding.playExpiresAt))
    ).toBe("2026-08-09T00:00:00.000Z");
    // A terminal instant beyond the play window cannot arise honestly, and a
    // client claiming one gains nothing: the cap still binds.
    expect(
      offlineSubmissionDeadline(receipt, new Date("2026-09-01T00:00:00.000Z"))
    ).toBe("2026-08-09T00:00:00.000Z");
  });

  it("rejects a receipt copied to another device or Run", () => {
    const signer = createOfflineReceiptSigner({
      privateKey: primary.privateKey,
      keyId: primary.keyId
    });
    const receipt = signer.issue(binding(), { issuedAt: ISSUED_AT });

    expect(receiptBindingMatches(receipt, binding())).toBe(true);
    for (const drift of [
      { runId: "offline_run_01J1OTHERRUN0" },
      { deviceInstallationHash: "c".repeat(64) },
      { seed: "MOSS-WATCH-12" },
      { levelId: /** @type {const} */ ("maze-master") },
      { labyrinthNumber: 5 },
      { rulesetRevision: "classic-v1" },
      { contentPackHash: "d".repeat(64) }
    ]) {
      expect(receiptBindingMatches(receipt, binding(drift))).toBe(false);
    }
  });

  it("refuses to sign a Classroom Run Grant", () => {
    const signer = createOfflineReceiptSigner({
      privateKey: primary.privateKey,
      keyId: primary.keyId
    });

    expect(() =>
      signer.issue(binding({ classroomId: "org_class_1" }), {
        issuedAt: ISSUED_AT
      })
    ).toThrow("Classroom Run Grants are not eligible");
  });

  it("rejects a tampered binding and a tampered signature", () => {
    const signer = createOfflineReceiptSigner({
      privateKey: primary.privateKey,
      keyId: primary.keyId
    });
    const verifier = createOfflineReceiptVerifier({ keys: [primary.jwk] });
    const receipt = signer.issue(binding(), { issuedAt: ISSUED_AT });

    expect(
      verifier.verify({
        ...receipt,
        binding: { ...receipt.binding, labyrinthNumber: 5 }
      })
    ).toEqual({ valid: false, reason: "signature" });
    expect(
      verifier.verify({ ...receipt, signature: receipt.signature.slice(1) })
    ).toEqual({ valid: false, reason: "signature" });
    expect(
      verifier.verify({ ...receipt, schema: "echo-maze-offline-receipt/0" })
    ).toEqual({ valid: false, reason: "schema" });
  });

  it("keeps every outstanding receipt verifiable across a key rotation", () => {
    const rotated = keyPair("offline-2026-08");
    const outstanding = createOfflineReceiptSigner({
      privateKey: primary.privateKey,
      keyId: primary.keyId
    }).issue(binding(), { issuedAt: ISSUED_AT });
    const fresh = createOfflineReceiptSigner({
      privateKey: rotated.privateKey,
      keyId: rotated.keyId
    }).issue(binding({ runId: "offline_run_01J1AFTERROTATE" }), {
      issuedAt: "2026-08-02T00:00:00.000Z"
    });

    // The retiring key stays in the verifier's set until the last receipt it
    // signed is past its submission deadline.
    const verifier = createOfflineReceiptVerifier({
      keys: [primary.jwk, rotated.jwk]
    });
    expect(verifier.verify(outstanding)).toEqual({ valid: true });
    expect(verifier.verify(fresh)).toEqual({ valid: true });

    const rotatedOnly = createOfflineReceiptVerifier({ keys: [rotated.jwk] });
    expect(rotatedOnly.verify(outstanding)).toEqual({
      valid: false,
      reason: "key"
    });
  });

  it("grants no authority beyond continuing the Run it names", () => {
    const receipt = createOfflineReceiptSigner({
      privateKey: primary.privateKey,
      keyId: primary.keyId
    }).issue(binding(), { issuedAt: ISSUED_AT });

    // The binding is the whole receipt: there is no field a client could read
    // as an entitlement, a purchase, a configuration change, or a licence to
    // start a different Run.
    expect(Object.keys(receipt).sort()).toEqual([
      "algorithm",
      "binding",
      "keyId",
      "schema",
      "signature"
    ]);
    expect(Object.keys(receipt.binding).sort()).toEqual([
      "contentPackHash",
      "deviceInstallationHash",
      "issuedAt",
      "labyrinthNumber",
      "levelId",
      "playExpiresAt",
      "playerId",
      "rulesetRevision",
      "runId",
      "seed",
      "submissionExpiresAt"
    ]);
  });
});

describe("Offline receipt signing key confinement", () => {
  it("is never imported by anything the browser bundles", async () => {
    const sources = await readdir(new URL("../src/", import.meta.url), {
      recursive: true
    });
    const modules = sources.filter((name) => String(name).endsWith(".js"));
    expect(modules.length).toBeGreaterThan(0);

    for (const name of modules) {
      const source = await readFile(
        new URL(`../src/${String(name).replaceAll("\\", "/")}`, import.meta.url),
        "utf8"
      );
      expect(source).not.toContain("server/offline-receipt.js");
      expect(source).not.toContain("OFFLINE_RECEIPT_PRIVATE_KEY");
    }
  });

  it("leaves no private key material in the built output", async () => {
    /** @type {string[]} */
    let assets = [];
    try {
      assets = await readdir(new URL("../dist/assets/", import.meta.url));
    } catch {
      // A build is not a precondition of the unit suite. The gate runs
      // `npm run build` before `check:bundle`, so this asserts on real output
      // whenever one exists and reports the gap plainly when it does not.
      expect(assets).toEqual([]);
      return;
    }

    const scripts = assets.filter((name) => name.endsWith(".js"));
    expect(scripts.length).toBeGreaterThan(0);
    for (const name of scripts) {
      const source = await readFile(
        new URL(`../dist/assets/${name}`, import.meta.url),
        "utf8"
      );
      expect(source).not.toContain("PRIVATE KEY");
      expect(source).not.toContain("OFFLINE_RECEIPT_PRIVATE_KEY");
      // A P-256 private JWK is a public JWK plus "d". Its absence is what
      // separates a bundled verification key from a bundled signing key.
      expect(source).not.toMatch(/"crv"\s*:\s*"P-256"[^}]*"d"\s*:/);
    }
  });
});

describe("Offline receipt verification in the browser", () => {
  it("verifies a server signature and refuses a tampered one", async () => {
    const { createOfflineReceiptVerifier: createBrowserVerifier } = await import(
      "../src/game/offline-receipt-verify.js"
    );
    const pair = keyPair("offline-browser");
    const receipt = createOfflineReceiptSigner({
      privateKey: pair.privateKey,
      keyId: pair.keyId
    }).issue(binding(), { issuedAt: ISSUED_AT });
    const verifier = createBrowserVerifier({ keys: [pair.jwk] });

    await expect(verifier.verify(receipt)).resolves.toEqual({ valid: true });
    await expect(
      verifier.verify({
        ...receipt,
        binding: { ...receipt.binding, seed: "OTHER-SEED-1" }
      })
    ).resolves.toEqual({ valid: false, reason: "signature" });
    await expect(
      verifier.verify({ ...receipt, keyId: "offline-unknown" })
    ).resolves.toEqual({ valid: false, reason: "key" });
  });

  it("refuses to bundle a key that carries a secret", async () => {
    const { createOfflineReceiptVerifier: createBrowserVerifier } = await import(
      "../src/game/offline-receipt-verify.js"
    );
    const pair = keyPair("offline-browser");

    expect(() =>
      createBrowserVerifier({ keys: [{ ...pair.jwk, d: "not-a-public-key" }] })
    ).toThrow("must carry no secret");
  });
});

describe("Offline receipt configuration", () => {
  it("is absent, complete, or an error — never half configured", async () => {
    const { loadOfflineReceiptConfig } = await import(
      "../server/offline-receipt-config.js"
    );
    const pair = keyPair("offline-config");
    const keys = JSON.stringify([pair.jwk]);
    const pem = pair.privateKey.export({ format: "pem", type: "pkcs8" });

    expect(loadOfflineReceiptConfig({})).toBeNull();
    expect(
      loadOfflineReceiptConfig({
        OFFLINE_RECEIPT_PRIVATE_KEY: String(pem),
        OFFLINE_RECEIPT_KEY_ID: pair.keyId,
        VITE_OFFLINE_RECEIPT_PUBLIC_KEYS: keys
      })
    ).toMatchObject({ keyId: pair.keyId });
    expect(() =>
      loadOfflineReceiptConfig({ OFFLINE_RECEIPT_PRIVATE_KEY: "pem" })
    ).toThrow("incomplete");
  });

  it("refuses a signing key the browser could not verify", async () => {
    const { loadOfflineReceiptConfig } = await import(
      "../server/offline-receipt-config.js"
    );
    const pair = keyPair("offline-config");

    expect(() =>
      loadOfflineReceiptConfig({
        OFFLINE_RECEIPT_PRIVATE_KEY: "pem",
        OFFLINE_RECEIPT_KEY_ID: "offline-not-published",
        VITE_OFFLINE_RECEIPT_PUBLIC_KEYS: JSON.stringify([pair.jwk])
      })
    ).toThrow("not among the published keys");
  });

  it("refuses a signing key whose published half is a different key", async () => {
    // A rotation that swaps the private key without republishing its public
    // half signs receipts every browser rejects, and the key id alone cannot
    // catch it.
    const { loadOfflineReceiptConfig } = await import(
      "../server/offline-receipt-config.js"
    );
    const pair = keyPair("offline-config");
    const other = keyPair("offline-other");

    expect(() =>
      loadOfflineReceiptConfig({
        OFFLINE_RECEIPT_PRIVATE_KEY: String(
          other.privateKey.export({ format: "pem", type: "pkcs8" })
        ),
        OFFLINE_RECEIPT_KEY_ID: pair.keyId,
        VITE_OFFLINE_RECEIPT_PUBLIC_KEYS: JSON.stringify([pair.jwk])
      })
    ).toThrow("does not match its published key");
  });

  it("refuses a published key that carries private key material", async () => {
    const { loadOfflineReceiptConfig } = await import(
      "../server/offline-receipt-config.js"
    );
    const pair = keyPair("offline-config");

    expect(() =>
      loadOfflineReceiptConfig({
        OFFLINE_RECEIPT_PRIVATE_KEY: "pem",
        OFFLINE_RECEIPT_KEY_ID: pair.keyId,
        VITE_OFFLINE_RECEIPT_PUBLIC_KEYS: JSON.stringify([
          { ...pair.jwk, d: "secret" }
        ])
      })
    ).toThrow("must not carry private key material");
  });
});
