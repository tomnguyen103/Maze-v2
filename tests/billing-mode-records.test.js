import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = fileURLToPath(new URL("../", import.meta.url));

const GLOSSARY = "GLOSSARY.md";
const ADR = "docs/adr/0047-billing-mode-binds-lifetime-purchases.md";
const RUNBOOK = "docs/lifetime-membership-operations.md";
const SETUP = "docs/SETUP.md";
const ENV_EXAMPLE = ".env.example";
const NOTE = "docs/solutions/payments/test-only-revenue-boundary.md";
const RECORD_FILES = [GLOSSARY, ADR, RUNBOOK, SETUP, ENV_EXAMPLE, NOTE];

/**
 * Reads a record as LF text. A Windows checkout may hold CRLF line endings.
 *
 * @param {string} path
 */
function read(path) {
  return readFileSync(join(root, path), "utf8").replace(/\r\n/g, "\n");
}

/**
 * Returns one glossary entry: the bold term through the blank line that ends it.
 *
 * @param {string} text
 * @param {string} term
 */
function glossaryEntry(text, term) {
  const start = text.indexOf(`**${term}**:`);
  if (start === -1) {
    return "";
  }
  const end = text.indexOf("\n\n", start);
  return text.slice(start, end === -1 ? undefined : end);
}

/**
 * Returns the runbook text from one bold step name to the next numbered step.
 *
 * @param {string} text
 * @param {string} name
 */
function stepBlock(text, name) {
  const start = text.indexOf(name);
  if (start === -1) {
    return "";
  }
  const next = text.slice(start + 1).search(/\n\d+\. \*\*/);
  return text.slice(start, next === -1 ? undefined : start + 1 + next);
}

describe("Billing Mode records", () => {
  it("US-14.1 defines Billing Mode in the glossary as test or live", () => {
    const entry = glossaryEntry(read(GLOSSARY), "Billing Mode");
    expect(entry).not.toBe("");
    expect(entry).toMatch(/\btest\b/);
    expect(entry).toMatch(/\blive\b/);
  });

  it("US-14.1 defines Unclassified Purchase as a grant-free, readiness-blocking record", () => {
    const entry = glossaryEntry(read(GLOSSARY), "Unclassified Purchase");
    expect(entry).not.toBe("");
    expect(entry).toMatch(/grants nothing/);
    expect(entry).toMatch(/live readiness/);
  });

  it("US-14.1 keeps environment names, file names and code out of both entries", () => {
    const text = read(GLOSSARY);
    for (const term of ["Billing Mode", "Unclassified Purchase"]) {
      const entry = glossaryEntry(text, term);
      expect(entry, term).not.toBe("");
      expect(entry, term).not.toMatch(/\b[A-Z][A-Z0-9]+_[A-Z0-9_]+\b/);
      expect(entry, term).not.toMatch(/\.(?:js|mjs|sql|md)\b/);
      expect(entry, term).not.toMatch(/`/);
    }
  });

  it("US-14.2 records ADR 0047 with Context, Decision and Consequences", () => {
    expect(existsSync(join(root, ADR))).toBe(true);
    const text = read(ADR);
    expect(text).toMatch(/^## Context$/m);
    expect(text).toMatch(/^## Decision$/m);
    expect(text).toMatch(/^## Consequences$/m);
  });

  it("US-14.2 records ADR 0048 and marks the provider part of ADR 0003 superseded", () => {
    expect(read("docs/adr/0048-direct-reviewed-question-serving.md")).toMatch(
      /^- Status: Accepted$/m
    );
    expect(read("docs/adr/0003-generated-questions-outside-deterministic-run.md")).toContain(
      "superseded by ADR 0048"
    );
  });

  it("US-14.3 holds no model provider variable in the env example, setup guide or Vite config", () => {
    for (const file of [ENV_EXAMPLE, SETUP, "vite.config.mjs"]) {
      expect(read(file), file).not.toMatch(/QUESTION_PROVIDER|GEMINI_|OLLAMA_/);
    }
  });

  it("US-14.4 lists the cutover steps in ascending order", () => {
    const text = read(RUNBOOK);
    const steps = [
      "**Create the live Stripe objects.**",
      "**Apply migration 0031.**",
      "**Dry-run the classification.**",
      "**Review the dry-run output.**",
      "**Apply the classification.**",
      "**Set Billing Mode to live.**",
      "**Check readiness.**",
      "**Make and refund one purchase.**"
    ];
    const indexes = steps.map((step) => text.indexOf(step));
    expect(indexes).not.toContain(-1);
    expect(indexes).toEqual([...indexes].sort((a, b) => a - b));
  });

  it("US-14.4 marks the apply step as an owner action", () => {
    const block = stepBlock(read(RUNBOOK), "**Apply the classification.**");
    expect(block).not.toBe("");
    expect(block).toContain("Owner action");
  });

  it("US-14.4 states that live waits for migration 0031 and complete classification", () => {
    expect(read(RUNBOOK)).toMatch(
      /do not set live before migration 0031 is applied and classification is complete/i
    );
  });

  it("US-14.4 names the Billing Mode variable in the env example and setup guide", () => {
    expect(read(ENV_EXAMPLE)).toMatch(/^ECHO_MAZE_BILLING_MODE=test$/m);
    expect(read(SETUP)).toContain("ECHO_MAZE_BILLING_MODE");
  });

  it("US-14.5 cites only source files that exist in the solutions note", () => {
    expect(existsSync(join(root, NOTE))).toBe(true);
    const cited = [
      ...read(NOTE).matchAll(/`([\w./-]+\.(?:js|mjs|sql|md|json))(?::\d+(?:-\d+)?)?`/g)
    ].map((match) => match[1]);
    expect(cited.length).toBeGreaterThan(0);
    for (const file of cited) {
      expect(existsSync(join(root, file)), file).toBe(true);
    }
  });

  it("US-14.4 holds no Stripe key or webhook secret value in any record", () => {
    for (const file of RECORD_FILES) {
      const text = existsSync(join(root, file)) ? read(file) : "";
      expect(text, file).not.toMatch(/sk_(?:live|test)_\w{8,}/);
      expect(text, file).not.toMatch(/whsec_\w{8,}/);
    }
  });
});
