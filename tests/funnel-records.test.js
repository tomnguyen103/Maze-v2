import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = fileURLToPath(new URL("../", import.meta.url));

const GLOSSARY = "GLOSSARY.md";
const ADR = "docs/adr/0049-account-free-financial-facts.md";
const PRIVACY = "docs/data-privacy.md";
const OBSERVABILITY = "docs/observability.md";
const NOTES = [
  "docs/solutions/database/lazy-first-grant-stamp.md",
  "docs/solutions/backend/iso-day-calendar-rollover.md"
];

/**
 * Reads a record as LF text. A Windows checkout may hold CRLF line endings.
 *
 * @param {string} path
 */
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
  const start = text.indexOf(`\n${heading}\n`);
  if (start === -1) {
    return "";
  }
  const level = heading.split(" ")[0];
  const next = text.indexOf(`\n${level} `, start + heading.length + 2);
  return text.slice(start, next === -1 ? undefined : next);
}

describe("Funnel records", () => {
  it.each([
    "Campaign Code",
    "Qualified Adult Visit",
    "Net Purchase",
    "Financial Fact",
    "Funnel Count",
    "Contribution"
  ])("US-12.1 defines %s in the glossary", (term) => {
    expect(read(GLOSSARY)).toMatch(new RegExp(`^\\*\\*${term}\\*\\*:`, "m"));
  });

  it("US-12.1 keeps implementation detail out of the six glossary definitions", () => {
    const glossary = read(GLOSSARY);

    for (const term of [
      "Campaign Code",
      "Qualified Adult Visit",
      "Net Purchase",
      "Financial Fact",
      "Funnel Count",
      "Contribution"
    ]) {
      const start = glossary.indexOf(`\n**${term}**:\n`);
      const end = glossary.indexOf("\n\n", start + 1);
      const definition = glossary.slice(start, end === -1 ? undefined : end);

      expect(start).toBeGreaterThan(-1);
      expect(definition).not.toMatch(
        /`|\.js\b|\w\/\w|\b[a-z]+_[a-z_]+\b|[a-z][A-Z]/
      );
    }
  });

  it("US-12.2 records the account-free fact decision and its retention reading", () => {
    const adr = read(ADR);

    expect(adr).toMatch(/^- Status: Accepted$/m);
    expect(adr).toContain("`financial_facts`");
    expect(adr).toContain("`funnel_counts`");
    expect(adr).toMatch(/no account, contact, Checkout Session or\s+name column/);
    expect(adr).toContain("Code deletes no fact");
    expect(adr).toContain("financial retention policy");
    expect(
      readdirSync(join(root, "docs/adr")).filter((name) =>
        name.startsWith("0049-")
      )
    ).toEqual(["0049-account-free-financial-facts.md"]);
  });

  it("US-12.3 claims only what the forwarder code shows and names the live configuration as an owner check", () => {
    const forwarder = read("server/product-events.js");
    const claim = section(read(OBSERVABILITY), "## Product events to PostHog");
    const trusted = forwarder.match(
      /const SERVER_TRUSTED_EVENTS = new Set\(\[([^\]]*)\]\)/
    );
    const events = [...(trusted?.[1] ?? "").matchAll(/"([a-z_]+)"/g)].map(
      ([, name]) => name
    );

    expect(events.length).toBeGreaterThan(0);
    for (const name of events) {
      expect(claim).toContain(`\`${name}\``);
    }
    expect(forwarder).toContain('distinct_id: "echo-maze-server"');
    expect(claim).toContain("`echo-maze-server`");
    expect(forwarder).toContain("POSTHOG_API_KEY");
    expect(claim).toContain("`POSTHOG_API_KEY`");
    expect(read(PRIVACY)).toMatch(/`POSTHOG_API_KEY` is an owner check/);
  });

  it("US-12.4 lists the stored fields of both tables and the fields that never reach analytics", () => {
    const records = section(read(PRIVACY), "## Account-free business records");

    expect(records).toContain("| Financial Fact | `financial_facts` |");
    expect(records).toContain("| Funnel Count | `funnel_counts` |");
    for (const field of [
      "PaymentIntent id",
      "Billing Mode",
      "refunded cents",
      "UTC day",
      "Campaign Code"
    ]) {
      expect(records).toContain(field);
    }
    for (const absent of [
      "account id",
      "email",
      "address",
      "cookie",
      "user agent",
      "Checkout Session id"
    ]) {
      expect(records).toContain(absent);
    }
    expect(records).toMatch(
      /No analytics vendor receives a Financial Fact or a\s+Funnel Count/
    );
  });

  it.each(NOTES)("US-12.5 records the build trap in %s", (note) => {
    expect(existsSync(join(root, note))).toBe(true);
    const text = read(note);

    expect(text).toMatch(
      /^---\ntitle: .+\ncategory: [a-z-]+\ntrigger: .+\n---\n/
    );
    for (const heading of [
      "## Problem",
      "## What did not work",
      "## Root cause",
      "## Fix"
    ]) {
      expect(text).toContain(`\n${heading}\n`);
    }
  });
});
