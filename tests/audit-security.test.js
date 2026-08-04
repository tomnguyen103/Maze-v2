import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/** @param {string} relative */
function source(relative) {
  return readFileSync(
    fileURLToPath(new URL(`../${relative}`, import.meta.url)),
    "utf8"
  );
}

describe("SG-06 — enforcement is never silently disabled", () => {
  it("separates 'asked for' from 'achievable'", async () => {
    const { resolveEnforcement } = await import("../server/lifetime-config.js");

    expect(resolveEnforcement({})).toEqual({ enabled: false, refusal: null });
    expect(
      resolveEnforcement({ RUN_ACCESS_ENFORCEMENT_ENABLED: "no" })
    ).toEqual({ enabled: false, refusal: null });

    // The exact case the audit named: a live key fails the test-mode gate, so
    // asking for enforcement used to turn it off.
    const refused = resolveEnforcement({
      RUN_ACCESS_ENFORCEMENT_ENABLED: "true",
      STRIPE_SECRET_KEY: "sk_live_realkey",
      STRIPE_PRICE_ID: "price_1",
      STRIPE_WEBHOOK_SECRET: "whsec_1",
      ECHO_MAZE_APP_ORIGIN: "https://example.test"
    });
    expect(refused.enabled).toBe(false);
    expect(refused.refusal).toContain("RUN_ACCESS_ENFORCEMENT_ENABLED");

    expect(
      resolveEnforcement({
        RUN_ACCESS_ENFORCEMENT_ENABLED: "true",
        STRIPE_SECRET_KEY: "sk_test_key",
        STRIPE_PRICE_ID: "price_1",
        STRIPE_WEBHOOK_SECRET: "whsec_1",
        ECHO_MAZE_APP_ORIGIN: "https://example.test"
      })
    ).toEqual({ enabled: true, refusal: null });
  });

  it("refuses to boot the long-running server, which can afford to", () => {
    const boot = source("server.js");
    expect(boot).toContain("resolveEnforcementEnabled(process.env)");
  });
});

describe("SG-07 — a fail-open path says what failed", () => {
  it("logs the error's identity rather than only that it degraded", () => {
    const route = source("server/run-access-route.js");
    const at = route.indexOf("guest metering failed open");
    expect(at).toBeGreaterThan(-1);
    expect(route.slice(at, at + 200)).toContain("safeErrorName(error)");
    // A bare `catch {` on that path loses the error entirely.
    expect(route).not.toContain("} catch {\n            // The demo boundary");
  });
});

describe("SG-13 — the public Scoreboard is bounded", () => {
  it("has a read budget", async () => {
    const { RATE_LIMIT_BUDGETS } = await import(
      "../server/rate-limit-config.js"
    );
    expect(RATE_LIMIT_BUDGETS["leaderboard.read"]).toBeDefined();
  });

  it("meters before the query it exists to bound", () => {
    const route = source("server/player-route.js");
    const metered = route.indexOf('"leaderboard.read"');
    const read = route.indexOf("store.getLeaderboard(partition)");
    expect(metered).toBeGreaterThan(-1);
    expect(metered).toBeLessThan(read);
  });

  it("keeps one Score Entry per Explorer per partition", () => {
    const store = source("server/player-store.js");
    expect(store).toContain("DELETE FROM score_entries AS superseded");
    // Personal partitions only: a Classroom Score Entry is a different
    // record with a different reader.
    expect(store).toContain("superseded.classroom_id IS NULL");
    expect(store).toContain("superseded.idempotency_key <> (");
    expect(store).toContain("best.idempotency_key ASC");
  });
});

describe("SG-17 — a public name is screened, and staff can retire one", () => {
  it("rejects contact details and the obvious cases", async () => {
    const { validateProfileInput, InputError } = await import(
      "../server/player-validation.js"
    );
    const attempt = () => ({
      explorerPalette: "teal",
      playgroundPalette: "daylight"
    });
    for (const username of [
      "15551234567",
      "snapchat_me",
      "kikme_now",
      "shithead",
      "admin",
      "ѕhit"
    ]) {
      expect(() =>
        validateProfileInput({ ...attempt(), username })
      ).toThrow(InputError);
    }
  });

  it("still accepts ordinary names, including non-ASCII ones", async () => {
    const { validateProfileInput } = await import(
      "../server/player-validation.js"
    );
    for (const username of [
      "Tom",
      "Echo Runner",
      "maze_kid-7",
      "Zoë",
      "Grape",
      "Draper",
      "Nazir",
      "Administrator",
      "Kysia"
    ]) {
      expect(
        validateProfileInput({
          username,
          explorerPalette: "teal",
          playgroundPalette: "daylight"
        }).username
      ).toBe(username);
    }
  });

  it("gives staff a remedy smaller than deleting a child's account", async () => {
    const { ROLE_PERMISSIONS } = await import("../shared/permissions.js");
    expect(ROLE_PERMISSIONS.moderator).toContain("users:names:write");
    expect(ROLE_PERMISSIONS.admin).toContain("users:names:write");
    expect(ROLE_PERMISSIONS.player).not.toContain("users:names:write");

    const route = source("server/admin-route.js");
    expect(route).toContain("username$/");
    expect(route).toContain('permissions: { POST: "users:names:write" }');
    expect(route).toContain("user.username.clear");

    // The replacement is derived from the account, never from the name being
    // retired, and the column is NOT NULL so it is replaced rather than
    // emptied.
    const store = source("server/player-store.js");
    expect(store).toContain("retiredUsername");
    expect(store).not.toContain("SET username = NULL");
  });
});

describe("TM-01v — a free mailbox cannot claim a school domain", () => {
  it("lists every Tuta domain, not only the one in the snapshot", async () => {
    const { PUBLIC_EMAIL_DOMAINS } = await import(
      "../server/classroom-domain.js"
    );
    for (const domain of [
      "tuta.com",
      "tuta.io",
      "tutamail.com",
      "tutanota.com",
      "tutanota.de"
    ]) {
      expect(PUBLIC_EMAIL_DOMAINS).toContain(domain);
    }
  });

  it("records what was added by review rather than by the snapshot", async () => {
    const { PUBLIC_EMAIL_DOMAIN_SOURCE } = await import(
      "../server/classroom-domain.js"
    );
    expect(PUBLIC_EMAIL_DOMAIN_SOURCE.reviewedSupplements).toContain(
      "tuta.com"
    );
    // The freshness check: the vendored snapshot is pinned, so a supplement
    // is the only way a domain enters without a version bump, and every one
    // has to be listed here for the migration test to reconcile against.
    expect(PUBLIC_EMAIL_DOMAIN_SOURCE.package).toBe("free-email-domains");
    expect(PUBLIC_EMAIL_DOMAIN_SOURCE.version).toMatch(/^\d+\.\d+\.\d+$/);

    const takenAt = Date.parse(PUBLIC_EMAIL_DOMAIN_SOURCE.snapshotTakenAt);
    expect(Number.isFinite(takenAt)).toBe(true);
    const maxAgeDays = Number(PUBLIC_EMAIL_DOMAIN_SOURCE.maxSnapshotAgeDays);
    expect(maxAgeDays).toBeGreaterThan(0);
    expect((Date.now() - takenAt) / 86400000).toBeLessThan(maxAgeDays);
  });

  it("refuses to regenerate the applied migration it diverged from", () => {
    const script = source("scripts/sync-public-email-domains.mjs");
    expect(script).toContain("reviewedSupplementsAfterMigration0017");
    expect(script).toContain("Refusing to regenerate migration 0017");
  });
});

describe("TM-11 — erasure leaves no Clerk identifier behind", () => {
  it("deletes the three tables that kept one", () => {
    const store = source("server/user-deletion-store.js");
    expect(store).toContain("DELETE FROM user_roles");
    expect(store).toContain("DELETE FROM rate_limit_counters");
    expect(store).toContain("DELETE FROM classroom_authority_versions");
  });

  it("asserts each of them, so a silent failure is not a success", () => {
    const store = source("server/user-deletion-store.js");
    for (const assertion of [
      "roles_deleted",
      "rate_limit_counters_deleted",
      "classroom_authority_versions_deleted"
    ]) {
      // Once in the SQL that computes it, once in the named assertion list.
      expect(store.split(assertion).length - 1).toBeGreaterThanOrEqual(2);
    }
  });

  it("drops the Membership authority rows while the join still exists", () => {
    const store = source("server/user-deletion-store.js");
    const authority = store.indexOf("DELETE FROM classroom_authority_versions");
    const access = store.indexOf("DELETE FROM player_access");
    // `player_access` cascades to `classroom_memberships`, which is the only
    // route from an Explorer to their Clerk membership ids.
    expect(authority).toBeLessThan(access);
  });
});

describe("TM-12 — traces carry no child's address or identifier", () => {
  it("blanks both the modern and the deprecated attribute names", async () => {
    const { SUPPRESSED_HTTP_ATTRIBUTES } = await import(
      "../server/tracing.js"
    );
    for (const attribute of [
      "client.address",
      "net.peer.ip",
      "url.query",
      "http.target"
    ]) {
      expect(SUPPRESSED_HTTP_ATTRIBUTES).toContain(attribute);
    }
    const tracing = source("server/tracing.js");
    expect(tracing).toContain("class RedactingSpanProcessor");
    expect(tracing).toContain("onEnd(span)");
    expect(tracing).toContain("spanProcessors: [new RedactingSpanProcessor()]");
  });
});

describe("TM-13 — auto-join is a decision", () => {
  it("passes the flag instead of writing a literal", () => {
    const migration = source(
      "db/migrations/0030_domain_autojoin_and_leaderboard_index.sql"
    );
    expect(migration).toContain("p_auto_join_enabled BOOLEAN DEFAULT NULL");
    expect(migration).toContain("COALESCE(p_auto_join_enabled, FALSE)");
    expect(migration).toContain("public.org_domains.auto_join_enabled");
    expect(migration).toContain("SET lock_timeout");
    // The three-argument form is dropped, so no caller keeps the old
    // behaviour by accident, and the column default stops assuming one.
    expect(migration).toContain(
      "DROP FUNCTION IF EXISTS register_classroom_domain(TEXT, TEXT, TEXT)"
    );
    expect(migration).toContain(
      "ALTER COLUMN auto_join_enabled SET DEFAULT FALSE"
    );
  });

  it("edits forward rather than touching an applied migration", () => {
    // 0017 is at the applied boundary. Its `TRUE` literal is still there,
    // deliberately: the fix supersedes it rather than rewriting history.
    const applied = source("db/migrations/0017_verified_classroom_domains.sql");
    expect(applied).toContain("VALUES (p_domain, p_classroom_id, p_teacher_id, TRUE)");
  });
});

describe("SG-01 — a refunded account is not asked to pay again", () => {
  it("refuses checkout creation from a state no payment can resolve", () => {
    const store = source("server/lifetime-store.js");
    expect(store).toContain('membershipState !== "none"');
    expect(store).toContain('state: "membership-blocked"');
  });

  it("returns the refusal to the caller instead of creating a Checkout", () => {
    const service = source("server/lifetime-service.js");
    expect(service).toContain("membership-blocked");
    const refusal = service.indexOf("membership-blocked");
    const checkout = service.indexOf("provider.createCheckout(");
    expect(refusal).toBeLessThan(checkout);
  });

  it("says so in the runbook, which only documented the dispute path", () => {
    const runbook = source("docs/lifetime-membership-operations.md");
    expect(runbook).toContain("`refunded` is absorbing");
    expect(runbook).toContain("Do not tell a parent to buy again.");
  });
});

describe("SG-02 — a resubmission is answered before the replay", () => {
  it("reads the ledger first", () => {
    const service = source("server/offline-submission.js");
    const ledger = service.indexOf("findRecordedSubmission(");
    const replay = service.indexOf("verifyOfflineRunReplay(submission.actionLog");
    expect(ledger).toBeGreaterThan(-1);
    expect(ledger).toBeLessThan(replay);
  });

  it("returns the recorded rejection instead of verifying again", () => {
    const service = source("server/offline-submission.js");
    const at = service.indexOf("if (settled && settled.runId === stored.runId)");
    expect(at).toBeGreaterThan(-1);
    const branch = service.slice(at, at + 700);
    // A terminal rejection is durable: answered from the ledger, never
    // re-derived, and never turned into any other status. The lookup is
    // scoped to the receipt it belongs to, so one key cannot answer for
    // another Run.
    expect(branch).toContain("if (!settled.accepted)");
    expect(branch).toContain('status: "rejected", duplicate: true');
  });
});
