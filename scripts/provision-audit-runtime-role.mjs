#!/usr/bin/env node

import { pathToFileURL } from "node:url";
import { Pool } from "pg";
import { normalizeDatabaseConnectionString } from "../server/database.js";

const ROLE_PATTERN = /^[A-Za-z_][A-Za-z0-9_]{0,62}$/;

/**
 * @param {{
 *   pool: {
 *     connect: () => Promise<{
 *       query: (
 *         sql: string,
 *         values?: unknown[]
 *       ) => Promise<{ rows: Record<string, unknown>[] }>,
 *       release: () => void
 *     }>
 *   },
 *   runtimeLogin: string
 * }} dependencies
 */
export async function provisionAuditRuntimeRole({ pool, runtimeLogin }) {
  if (!ROLE_PATTERN.test(runtimeLogin)) {
    throw new Error("Audit runtime login is invalid.");
  }
  const client = await pool.connect();
  let transaction = false;
  try {
    const roleResult = await client.query(
      `SELECT
         rolcanlogin,
         rolsuper,
         rolcreaterole,
         rolcreatedb,
         rolreplication,
         rolbypassrls,
         pg_has_role(rolname, 'echo_maze_audit_owner', 'MEMBER')
           AS audit_owner_member
       FROM pg_roles
       WHERE rolname = $1`,
      [runtimeLogin]
    );
    const role = roleResult.rows[0];
    if (
      !role ||
      role.rolcanlogin !== true ||
      role.rolsuper !== false ||
      role.rolcreaterole !== false ||
      role.rolcreatedb !== false ||
      role.rolreplication !== false ||
      role.rolbypassrls !== false ||
      role.audit_owner_member !== false
    ) {
      throw new Error(
        "Audit runtime role must be an unprivileged login outside the audit owner."
      );
    }

    await client.query("BEGIN");
    transaction = true;
    await client.query(
      `REVOKE ALL ON TABLE audit_events FROM "${runtimeLogin}"`
    );
    await client.query(
      `REVOKE ALL ON TABLE audit_chain_head FROM "${runtimeLogin}"`
    );
    await client.query(
      `REVOKE ALL ON SEQUENCE audit_events_id_seq FROM "${runtimeLogin}"`
    );
    await client.query(
      `REVOKE ALL ON FUNCTION append_audit_event(TEXT) FROM "${runtimeLogin}"`
    );
    await client.query(
      `GRANT echo_maze_runtime TO "${runtimeLogin}"`
    );
    await client.query(
      "REVOKE EXECUTE ON FUNCTION append_audit_event(TEXT) FROM PUBLIC"
    );
    const proofResult = await client.query(
      `SELECT
         pg_has_role($1, 'echo_maze_runtime', 'MEMBER') AS runtime_member,
         has_function_privilege(
           $1,
           'public.append_audit_event(text)',
           'EXECUTE'
         ) AS can_append,
         has_table_privilege($1, 'public.audit_events', 'SELECT')
           AS can_read_events,
         has_table_privilege($1, 'public.audit_chain_head', 'SELECT')
           AS can_read_head,
         has_table_privilege($1, 'public.audit_events', 'INSERT')
           AS can_insert_events,
         has_table_privilege($1, 'public.audit_events', 'UPDATE')
           AS can_update_events,
         has_table_privilege($1, 'public.audit_events', 'DELETE')
           AS can_delete_events,
         has_table_privilege($1, 'public.audit_events', 'TRUNCATE')
           AS can_truncate_events,
         has_table_privilege($1, 'public.audit_chain_head', 'UPDATE')
           AS can_update_head,
         NOT EXISTS (
           SELECT 1
           FROM pg_proc AS procedure
           CROSS JOIN LATERAL aclexplode(
             COALESCE(
               procedure.proacl,
               acldefault('f', procedure.proowner)
             )
           ) AS privilege
           WHERE procedure.oid =
             'public.append_audit_event(text)'::regprocedure
             AND privilege.grantee = 0
             AND privilege.privilege_type = 'EXECUTE'
         ) AS public_execute_revoked`,
      [runtimeLogin]
    );
    if (!privilegeProofIsSafe(proofResult.rows[0])) {
      throw new Error("Audit runtime privilege verification failed.");
    }
    await client.query("COMMIT");
    transaction = false;
  } catch (error) {
    if (transaction) {
      await client.query("ROLLBACK");
    }
    throw error;
  } finally {
    client.release();
  }
}

/** @param {Record<string, unknown> | undefined} proof */
function privilegeProofIsSafe(proof) {
  return Boolean(
    proof &&
    proof.runtime_member === true &&
    proof.can_append === true &&
    proof.can_read_events === true &&
    proof.can_read_head === true &&
    proof.can_insert_events === false &&
    proof.can_update_events === false &&
    proof.can_delete_events === false &&
    proof.can_truncate_events === false &&
    proof.can_update_head === false &&
    proof.public_execute_revoked === true
  );
}

async function main() {
  const adminUrl = process.env.DATABASE_ADMIN_URL;
  const runtimeLogin = process.env.AUDIT_RUNTIME_LOGIN;
  if (!adminUrl || !runtimeLogin) {
    throw new Error(
      "DATABASE_ADMIN_URL and AUDIT_RUNTIME_LOGIN are required."
    );
  }
  const pool = new Pool({
    connectionString: normalizeDatabaseConnectionString(adminUrl),
    max: 1,
    connectionTimeoutMillis: 10000,
    query_timeout: 60000
  });
  try {
    await provisionAuditRuntimeRole({ pool, runtimeLogin });
    console.log("Audit runtime privilege boundary verified.");
  } finally {
    await pool.end();
  }
}

const entryUrl = process.argv[1]
  ? pathToFileURL(process.argv[1]).href
  : "";
if (import.meta.url === entryUrl) {
  main().catch((error) => {
    console.error(
      "Audit runtime role provisioning failed.",
      error instanceof Error ? error.name : "UnknownError"
    );
    process.exitCode = 1;
  });
}
