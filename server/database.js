import { Pool } from "pg";
import { attachDatabasePool } from "@vercel/functions";

/** @param {string} connectionString */
export function normalizeDatabaseConnectionString(connectionString) {
  const url = new URL(connectionString);
  const localHosts = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);
  if (!localHosts.has(url.hostname)) {
    url.searchParams.set("sslmode", "verify-full");
  }
  return url.toString();
}

/**
 * Narrows a `pg` pool or client to the query-only shape the stores expect, so
 * each store can be exercised against a plain fake in tests.
 *
 * @param {{
 *   query: (sql: string, values?: unknown[]) => Promise<{ rows: unknown[] }>
 * }} pool
 */
export function createQueryAdapter(pool) {
  return {
    /**
     * @param {string} sql
     * @param {unknown[]} [values]
     */
    async query(sql, values) {
      const result = await pool.query(sql, values);
      return {
        rows: /** @type {Record<string, unknown>[]} */ (result.rows)
      };
    }
  };
}

/** @type {Map<string, import("pg").Pool>} */
const sharedPools = new Map();

/**
 * One pool per connection string for the lifetime of the process. Serverless
 * invocations reuse a warm container, so two independent pools for the same
 * database would double the connection footprint for no benefit.
 *
 * @param {string} connectionString
 */
export function getDatabasePool(connectionString) {
  const existing = sharedPools.get(connectionString);
  if (existing) {
    return existing;
  }
  const pool = createDatabasePool(connectionString);
  sharedPools.set(connectionString, pool);
  return pool;
}

/** @param {string} connectionString */
export function createDatabasePool(connectionString) {
  const pool = new Pool({
    connectionString: normalizeDatabaseConnectionString(connectionString),
    max: 10,
    idleTimeoutMillis: 5000,
    connectionTimeoutMillis: 5000
  });
  attachDatabasePool(pool);
  // attachDatabasePool only handles suspension cleanup. Without an `error`
  // listener, an idle client dropped by the database emits an unhandled 'error'
  // and takes the process with it — and this pool backs every feature.
  pool.on("error", (error) => {
    console.error("[database] idle client error", {
      name: error instanceof Error ? "Error" : "UnknownError"
    });
  });
  return pool;
}
