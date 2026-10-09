import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const migrationSql = readFile(
  new URL("../db/migrations/0032_financial_facts.sql", import.meta.url),
  "utf8"
);

describe("Financial facts migration", () => {
  it("US-01.1 creates the fact table idempotently with a bounded lock timeout", async () => {
    const sql = await migrationSql;

    expect(sql).toContain("SET lock_timeout = '3s';");
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS financial_facts");
    expect(sql).toContain("RESET lock_timeout;");
  });

  it("US-01.1 binds each fact to the spec amount, currency and status", async () => {
    const sql = await migrationSql;

    expect(sql).toContain("payment_intent_id TEXT PRIMARY KEY");
    expect(sql).toContain(
      "billing_mode TEXT NOT NULL CHECK (billing_mode IN ('test', 'live'))"
    );
    expect(sql).toContain("amount_cents INTEGER NOT NULL CHECK (amount_cents = 599)");
    expect(sql).toContain("currency TEXT NOT NULL CHECK (currency = 'usd')");
    expect(sql).toContain(
      "status TEXT NOT NULL CHECK (status IN ('paid', 'refunded', 'disputed'))"
    );
    expect(sql).toContain(
      "refunded_cents INTEGER NOT NULL DEFAULT 0 CHECK (refunded_cents BETWEEN 0 AND amount_cents)"
    );
  });

  it("US-04.2 holds no account, contact, Checkout Session or name column", async () => {
    const sql = await migrationSql;
    const start = sql.indexOf("CREATE TABLE IF NOT EXISTS financial_facts");
    const columns = sql.slice(start, sql.indexOf(");", start)).toLowerCase();

    for (const term of ["clerk", "player", "user", "email", "checkout_session", "name", "address"]) {
      expect(columns).not.toContain(term);
    }
  });
});
