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
  return pool;
}
