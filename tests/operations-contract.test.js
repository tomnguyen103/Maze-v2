import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const envExample = readFileSync(".env.example", "utf8");
const operations = readFileSync(
  "docs/lifetime-membership-operations.md",
  "utf8"
);
const deletionTool = readFileSync("scripts/delete-user-data.mjs", "utf8");

/**
 * Variables the hosting platform injects. An operator cannot usefully set them
 * in a local file, so `.env.example` documents them without offering a value.
 */
const PLATFORM_PROVIDED = new Set([
  "NODE_ENV",
  "VERCEL_ENV",
  "VERCEL_GIT_COMMIT_SHA"
]);

/**
 * @param {string} directory
 * @returns {string[]}
 */
function sourceFiles(directory) {
  return readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) {
      return sourceFiles(path);
    }
    // Declaration files describe env vars rather than reading them; every
    // other module extension counts, so a future .ts cannot escape the scan.
    return /\.(js|jsx|ts|tsx)$/.test(path) && !path.endsWith(".d.ts")
      ? [path]
      : [];
  });
}

/**
 * Every `env.NAME`, `process.env.NAME`, and `import.meta.env.NAME` read across
 * the server and the client bundle.
 */
function readEnvNames() {
  /** @type {Set<string>} */
  const names = new Set();
  for (const path of [...sourceFiles("server"), ...sourceFiles("src")]) {
    const source = readFileSync(path, "utf8");
    for (const match of source.matchAll(/\benv\.([A-Z][A-Z0-9_]*)\b/g)) {
      names.add(match[1]);
    }
  }
  return [...names].sort();
}

describe("environment documentation contract", () => {
  it("documents every variable the server and client read", () => {
    // Word-bounded, so documenting VITE_SENTRY_DSN cannot pass for SENTRY_DSN.
    const undocumented = readEnvNames().filter(
      (name) => !new RegExp(`\\b${name}\\b`).test(envExample)
    );
    expect(undocumented).toEqual([]);
  });

  it("ships every optional hardening knob unset, so defaults stay the safe ones", () => {
    for (const name of [
      "REQUEST_ADDRESS_SALT",
      "CRON_SECRET",
      "SENTRY_DSN",
      "VITE_SENTRY_DSN",
      "POSTHOG_API_KEY",
      "OTEL_EXPORTER_OTLP_ENDPOINT"
    ]) {
      expect(envExample).toMatch(new RegExp(`^${name}=\\s*$`, "m"));
    }
    // Trusting proxy headers by default would let any caller spoof its address
    // past the rate limiter.
    expect(envExample).toMatch(/^TRUST_PROXY_HEADERS=false$/m);
  });

  it("names the platform-injected variables without inviting an override", () => {
    for (const name of PLATFORM_PROVIDED) {
      expect(envExample).toContain(name);
      expect(envExample).not.toMatch(new RegExp(`^${name}=`, "m"));
    }
  });
});

describe("release operations contract", () => {
  it("keeps production enforcement and live billing disabled by default", () => {
    expect(envExample).toContain("RUN_ACCESS_ENFORCEMENT_ENABLED=false");
    expect(envExample).not.toMatch(/\bsk_live_/);
    expect(envExample).not.toMatch(/\bprice_live_/);
    expect(operations).toContain("No step in this repository authorizes a live charge.");
  });

  it("documents every required recovery and rollback drill", () => {
    for (const heading of [
      "## Support triage",
      "## Receipt recovery",
      "## Refund and dispute handling",
      "## Account deletion",
      "## Billing disable",
      "## Rollback",
      "## Privacy-minimized observability",
      "## External production approvals"
    ]) {
      expect(operations).toContain(heading);
    }
  });

  it("deletes application identity transactionally without erasing provider records", () => {
    expect(operations).toContain("scripts/delete-user-data.mjs");
    expect(operations).toContain(
      '$reenteredUserId = Read-Host "Re-enter the Clerk user id"'
    );
    expect(operations).toContain(
      "if ($verifiedUserId -cne $reenteredUserId)"
    );
    expect(operations).toMatch(
      /\$env:ECHO_MAZE_DELETE_CONFIRM = Read-Host \(/
    );
    expect(operations).not.toContain(
      '$env:ECHO_MAZE_DELETE_CONFIRM = "DELETE APPLICATION DATA"'
    );
    expect(deletionTool).toContain("createUserDeletionStore");
    expect(deletionTool).toContain("deletedUserHash");
    expect(deletionTool).toContain("ECHO_MAZE_DELETE_CONFIRM_SHA256");
    expect(operations).toContain("signed `user.deleted` webhook");
    expect(operations).toMatch(
      /Stripe financial\s+records follow Stripe and legal\s+retention rules/
    );
    expect(operations).toContain("`learning_journals` contain zero");
    expect(operations).toMatch(
      /Never\s+partially delete one application identity\./
    );
    expect(operations).toMatch(
      /failed deletion or verification rolls back the\s+transaction/
    );
  });

  it("preserves entitlements and webhook recovery during billing disable", () => {
    expect(operations).toContain(
      "RUN_ACCESS_ENFORCEMENT_ENABLED=false"
    );
    expect(operations).toContain(
      "Continue normalizing signed refund and dispute events"
    );
    expect(operations).toMatch(
      /no\s+entitlement or purchase row is deleted/
    );
  });

  it("limits server failure logs to bounded error categories", () => {
    expect(operations).toMatch(
      /fixed operation label plus a bounded error category\s+only/
    );
    expect(operations).toMatch(
      /never serialize an error name, message, stack, request body, or\s+provider payload/
    );
  });
});
