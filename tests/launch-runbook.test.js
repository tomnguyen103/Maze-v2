import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = fileURLToPath(new URL("../", import.meta.url));
const RUNBOOK = "docs/launch-runbook.md";
const OPERATIONS = "docs/lifetime-membership-operations.md";
const PILOT_VARS = [
  "LIFETIME_PILOT_ACCOUNT_IDS",
  "LIFETIME_PUBLIC_CHECKOUT_ENABLED"
];
const SECRET_VALUE =
  /\b(?:sk|pk|rk)_(?:live|test)_[A-Za-z0-9]{6,}|\bwhsec_[A-Za-z0-9]{6,}|\b4242 ?4242 ?4242 ?4242\b|[\w.+-]+@[\w-]+\.[\w.]+/;

/** @param {string} path */
function read(path) {
  return readFileSync(join(root, path), "utf8").replace(/\r\n/g, "\n");
}

/**
 * Returns the text from one heading to the next heading of the same level.
 *
 * @param {string} text
 * @param {string} heading
 */
function section(text, heading) {
  const level = heading.match(/^#+/)?.[0] ?? "";
  const start = text.indexOf(`${heading}\n`);
  if (start < 0) return "";
  const rest = text.slice(start + heading.length + 1);
  const next = rest.search(new RegExp(`^${level} `, "m"));
  return next < 0 ? rest : rest.slice(0, next);
}

const runbook = read(RUNBOOK);
const steps = [...runbook.matchAll(/^### Step (\d+): .+$/gm)];

/** @param {number} number */
function step(number) {
  const heading = steps.find((match) => Number(match[1]) === number)?.[0] ?? "";
  return section(runbook, heading);
}

describe("Launch runbook", () => {
  it("US-04.1 lists steps 1 to 12 in order with an owner, an action and an evidence slot", () => {
    expect(steps.map((match) => Number(match[1]))).toEqual(
      Array.from({ length: 12 }, (_, index) => index + 1)
    );
    for (let number = 1; number <= 12; number += 1) {
      const text = step(number);
      expect(text).toContain("**Owner:** owner.");
      expect(text).toContain("**Action:**");
      expect(text).toContain("**Evidence:** _empty_");
    }
  });

  it("US-04.2 names the pilot variables at steps 8 and 11 and has a gate removal step", () => {
    for (const name of PILOT_VARS) {
      expect(step(8)).toContain(name);
    }
    expect(step(8)).toContain("LIFETIME_PUBLIC_CHECKOUT_ENABLED=false");
    expect(step(11)).toContain("LIFETIME_PUBLIC_CHECKOUT_ENABLED=true");
    expect(step(11)).toContain("RUN_ACCESS_ENFORCEMENT_ENABLED=true");
    expect(step(11)).toContain("together");
    const removal = section(runbook, "## Gate removal");
    expect(removal).toContain("resolveCheckoutGate");
    for (const name of PILOT_VARS) {
      expect(removal).toContain(name);
    }
  });

  it("US-04.3 states that no agent runs a step and records no secret value", () => {
    expect(runbook).toContain("No agent runs a step.");
    expect(runbook).not.toMatch(SECRET_VALUE);
  });

  it("US-04.4 agrees with the Live cutover section on the pilot variables", () => {
    const cutover = section(read(OPERATIONS), "## Live cutover");

    expect(cutover).toContain("No agent runs them.");
    expect(cutover).toContain("docs/launch-runbook.md");
    expect(cutover).toContain("/play?membership=open");
    for (const name of PILOT_VARS) {
      expect(cutover).toContain(name);
    }
    expect(cutover).not.toMatch(SECRET_VALUE);
  });

  it("US-04.5 gives each plan provider an empty actual-cost cell and no invoice figure", () => {
    const sheet = section(runbook, "## Cost sheet");
    const rows = sheet
      .split("\n")
      .filter((line) => /^\| (?!Provider|:--)/.test(line))
      .map((line) => line.split("|").slice(1, -1).map((cell) => cell.trim()));

    expect(rows.map((cells) => cells[0])).toEqual([
      "Stripe",
      "Vercel",
      "Clerk",
      "Neon"
    ]);
    for (const cells of rows) {
      expect(cells.slice(2)).toEqual(["", "", "", ""]);
    }
    expect(sheet).toContain("not invoices");
    expect(sheet).not.toMatch(/\$\d/);
  });

  it("US-04.6 checks the pilot refund through Run Access while enforcement is off", () => {
    const operations = section(read(OPERATIONS), "## Live cutover");

    for (const text of [step(9), operations]) {
      expect(text).toContain("/api/access");
      expect(text).toContain("membership-blocked");
      expect(text).not.toContain("blocks the next new Run");
    }
    expect(step(12)).toContain("/api/access/config");
  });

  it("US-04.6 names the live Stripe objects and variables before Billing Mode goes live", () => {
    expect(step(6)).toContain("Live cutover step 1");
    for (const name of ["STRIPE_SECRET_KEY", "STRIPE_PRICE_ID", "STRIPE_WEBHOOK_SECRET"]) {
      expect(step(6)).toContain(name);
    }
  });

  it("US-04.6 holds the three F3 owner records with evidence slots", () => {
    const records = section(runbook, "## Launch records");
    const expected = {
      "### PostHog live check": ["POSTHOG_API_KEY", "POSTHOG_HOST"],
      "### Financial retention decision": ["ADR 0049", "Funnel Counts"],
      "### Campaign Code list review": ["shared/campaign-codes.js"]
    };

    for (const [heading, names] of Object.entries(expected)) {
      const text = section(records, heading);
      expect(text, heading).toContain("**Evidence:** _empty_");
      for (const name of names) {
        expect(text, heading).toContain(name);
      }
    }
  });

  it("US-04.5 holds the children's privacy review with the FTC guidance", () => {
    const review = section(runbook, "## Children's privacy review");

    expect(review).toContain("https://www.ftc.gov/");
    for (const area of [
      "Child accounts",
      "Consent",
      "Public profile",
      "Scoreboard",
      "Telemetry",
      "Deletion"
    ]) {
      expect(review).toContain(`| ${area} |`);
    }
  });
});
