import { Pool } from "pg";
import { attachDatabasePool } from "@vercel/functions";

/** @param {string} connectionString */
export function createDatabasePool(connectionString) {
  const pool = new Pool({
    connectionString,
    max: 10,
    idleTimeoutMillis: 5000,
    connectionTimeoutMillis: 5000
  });
  attachDatabasePool(pool);
  return pool;
}
