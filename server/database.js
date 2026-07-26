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
