import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const envExample = readFileSync(".env.example", "utf8");
const operations = readFileSync(
  "docs/lifetime-membership-operations.md",
  "utf8"
);

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
    expect(operations).toMatch(
      /BEGIN;[\s\S]*DELETE FROM cloud_quest_progress WHERE clerk_user_id = \$1;[\s\S]*DELETE FROM players WHERE clerk_user_id = \$1;[\s\S]*DELETE FROM player_access WHERE clerk_user_id = \$1;[\s\S]*COMMIT;/
    );
    expect(operations).toContain(
      "SELECT pg_advisory_xact_lock(hashtextextended($1, 0));"
    );
    expect(operations).toMatch(
      /INSERT INTO deleted_user_tombstones \(clerk_user_id_hash\)[\s\S]*VALUES \(\$2\)/
    );
    expect(operations).toContain("64-character SHA-256");
    expect(operations).toContain("signed `user.deleted` webhook");
    expect(operations).toMatch(
      /Stripe financial records follow Stripe and legal\s+retention rules/
    );
    expect(operations).toContain("`learning_journals` contain zero");
    expect(operations).toMatch(
      /Never\s+partially delete one application identity\./
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
