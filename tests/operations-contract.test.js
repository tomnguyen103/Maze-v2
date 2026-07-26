import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const envExample = readFileSync(".env.example", "utf8");
const operations = readFileSync(
  "docs/lifetime-membership-operations.md",
  "utf8"
);
const deletionTool = readFileSync("scripts/delete-user-data.mjs", "utf8");

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
