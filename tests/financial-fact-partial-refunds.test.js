import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const sql = await readFile(
  new URL("../db/migrations/0035_financial_fact_partial_refunds.sql", import.meta.url),
  "utf8"
).then((text) => text.replace(/\r\n/g, "\n"));

// Row behaviour needs a live DATABASE_URL. These source checks pin the
// contract in the default gate.
describe("Financial Fact partial refund migration 0035", () => {
  it("US-02.8 adds the partial refunded cents column with a zero default", () => {
    expect(sql).toMatch(
      /ALTER TABLE financial_facts\s+ADD COLUMN IF NOT EXISTS partial_refunded_cents INTEGER NOT NULL DEFAULT 0;/
    );
  });

  it("US-02.8 bounds the partial cents by the refunded cents in one re-run safe ALTER", () => {
    expect(sql).toMatch(
      /DROP CONSTRAINT IF EXISTS financial_facts_partial_refunded_cents_check,\s+ADD CONSTRAINT financial_facts_partial_refunded_cents_check\s+CHECK \(partial_refunded_cents BETWEEN 0 AND refunded_cents\);/
    );
  });

  it("US-02.8 backfills only a fact that is not fully refunded", () => {
    expect(sql).toMatch(
      /UPDATE financial_facts\s+SET partial_refunded_cents = refunded_cents\s+WHERE refunded_at IS NULL\s+AND partial_refunded_cents <> refunded_cents;/
    );
    expect(sql.match(/^UPDATE /gm)).toHaveLength(1);
  });

  it("US-02.8 runs in one transaction with a short lock wait", () => {
    expect(sql).toMatch(/^BEGIN;\s+SET LOCAL lock_timeout = '3s';/m);
    expect(sql.trimEnd().endsWith("COMMIT;")).toBe(true);
    expect(sql.match(/^BEGIN;/gm)).toHaveLength(1);
  });

  it("US-02.8 re-runs without error and names the rollback steps", () => {
    expect(sql).not.toMatch(/^\s*ADD COLUMN (?!IF NOT EXISTS)/m);
    expect(sql).not.toMatch(/^\s*DROP CONSTRAINT (?!IF EXISTS)/m);
    const header = sql.slice(0, sql.indexOf("BEGIN;"));
    expect(header).toContain("Rollback");
    expect(header).toContain("drop the column");
  });
});
