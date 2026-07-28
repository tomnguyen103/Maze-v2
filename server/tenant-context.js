/**
 * @typedef {{
 *   explorerId: string,
 *   classroomId: string | null
 * }} TenantContext
 */

/**
 * @param {{
 *   query: (
 *     sql: string,
 *     values?: unknown[]
 *   ) => Promise<{ rows?: Record<string, unknown>[] }>
 * }} client
 * @param {TenantContext} context
 */
export async function setTenantContext(client, context) {
  if (
    typeof context.explorerId !== "string" ||
    context.explorerId.length === 0 ||
    (
      context.classroomId !== null &&
      (
        typeof context.classroomId !== "string" ||
        context.classroomId.length === 0
      )
    )
  ) {
    throw new Error("Tenant context is invalid.");
  }
  await client.query(
    `SELECT
       set_config('echo_maze.explorer_id', $1, true),
       set_config('echo_maze.classroom_id', $2, true)`,
    [context.explorerId, context.classroomId ?? ""]
  );
}

/**
 * @template T
 * @param {{
 *   connect: () => Promise<{
 *     query: (
 *       sql: string,
 *       values?: unknown[]
 *     ) => Promise<{ rows: Record<string, unknown>[] }>,
 *     release: (destroy?: boolean) => void
 *   }>
 * }} pool
 * @param {TenantContext} context
 * @param {(client: {
 *   query: (
 *     sql: string,
 *     values?: unknown[]
 *   ) => Promise<{ rows: Record<string, unknown>[] }>
 * }) => Promise<T>} operation
 */
export async function withTenantContext(pool, context, operation) {
  const client = await pool.connect();
  let transaction = false;
  let released = false;
  try {
    await client.query("BEGIN");
    transaction = true;
    await setTenantContext(client, context);
    const result = await operation(client);
    await client.query("COMMIT");
    transaction = false;
    return result;
  } catch (error) {
    if (transaction) {
      try {
        await client.query("ROLLBACK");
      } catch {
        client.release(true);
        released = true;
      }
    }
    throw error;
  } finally {
    if (!released) {
      client.release();
    }
  }
}
