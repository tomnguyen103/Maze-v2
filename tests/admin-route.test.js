import { describe, expect, it } from "vitest";
import { PassThrough } from "node:stream";
import { createAdminHandler } from "../server/admin-route.js";
import { createPermissionGuard } from "../server/rbac.js";

/**
 * @param {{ method?: string, url: string, body?: unknown }} options
 */
function createRequest({ method = "POST", url, body }) {
  const stream = new PassThrough();
  stream.end(body === undefined ? "" : JSON.stringify(body));
  return /** @type {import("node:http").IncomingMessage} */ (
    /** @type {unknown} */ (
      Object.assign(stream, { method, url, headers: {}, socket: {} })
    )
  );
}

function createResponse() {
  /** @type {{ statusCode: number, body: any, headers: Record<string, string> }} */
  const captured = { statusCode: 0, body: null, headers: {} };
  /** @type {(value: typeof captured) => void} */
  let settle = () => {};
  const finished = new Promise((resolve) => {
    settle = resolve;
  });
  const response = {
    statusCode: 200,
    /** @param {string} name @param {string} value */
    setHeader(name, value) {
      captured.headers[name] = value;
    },
    /** @param {string} [payload] */
    end(payload) {
      captured.statusCode = response.statusCode;
      captured.body = payload ? JSON.parse(payload) : null;
      settle(captured);
    }
  };
  return { response: /** @type {never} */ (response), finished };
}

/**
 * @param {{
 *   actor?: string | null,
 *   role?: import("../shared/permissions.js").Role,
 *   previousRole?: import("../shared/permissions.js").Role,
 *   setRole?: (change: Record<string, unknown>) => Promise<any>,
 *   exportUser?: (userId: string) => Promise<unknown>,
 *   mirrorRole?: (userId: string, role: string) => Promise<void>
 * }} [options]
 */
function createHarness(options = {}) {
  const {
    actor = "admin_1",
    role = "admin",
    previousRole = "player"
  } = options;
  /** @type {Record<string, unknown>[]} */
  const audits = [];
  /** @type {Record<string, unknown>[]} */
  const writes = [];
  /** @type {[string, string][]} */
  const mirrored = [];
  /** @type {string[]} */
  const exported = [];
  const handler = createAdminHandler({
    store: {
      setRole:
        options.setRole ??
        (async (change) => {
          writes.push(change);
          return { previousRole, role: change.role };
        })
    },
    exportUser:
      options.exportUser ??
      (async (userId) => {
        exported.push(userId);
        // Shaped like the real envelope so the route is exercised against what
        // shared/export-schema.json actually describes.
        return {
          schema: "echo-maze-export/1",
          generated_at: "2026-01-01T00:00:00.000Z",
          data: { player_profile: { user_id: userId } }
        };
      }),
    requirePermission: createPermissionGuard({
      getUserId: () => actor,
      resolver: { roleFor: async () => role }
    }),
    recordAudit: async (_request, event) => {
      audits.push(event);
    },
    mirrorRole:
      options.mirrorRole ??
      (async (userId, nextRole) => {
        mirrored.push([userId, nextRole]);
      })
  });
  return { handler, audits, writes, mirrored, exported };
}

/**
 * @param {ReturnType<typeof createHarness>} harness
 * @param {{ method?: string, url: string, body?: unknown }} options
 */
async function call(harness, options) {
  const { response, finished } = createResponse();
  await harness.handler(createRequest(options), response, undefined);
  return finished;
}

const roleUrl = "/api/admin/users/user_target/role";

describe("admin role endpoint", () => {
  it("grants a role, mirrors it, and writes one audit row", async () => {
    const harness = createHarness();
    const result = await call(harness, {
      url: roleUrl,
      body: { role: "moderator" }
    });
    expect(result.statusCode).toBe(200);
    expect(result.body).toEqual({
      userId: "user_target",
      role: "moderator",
      changed: true
    });
    expect(harness.writes).toEqual([
      { userId: "user_target", role: "moderator", grantedBy: "admin_1" }
    ]);
    expect(harness.mirrored).toEqual([["user_target", "moderator"]]);
    expect(harness.audits).toHaveLength(1);
    expect(harness.audits[0]).toMatchObject({
      action: "role.grant",
      actorId: "admin_1",
      actorRole: "admin",
      resource: { type: "user_role", id: "user_target" },
      before: { role: "player" },
      after: { role: "moderator" }
    });
  });

  it("writes no audit row when the role does not actually change", async () => {
    // Re-granting a role someone already holds changes nothing, and an audit log
    // padded with non-events is harder to read.
    const harness = createHarness({ previousRole: "moderator" });
    const result = await call(harness, {
      url: roleUrl,
      body: { role: "moderator" }
    });
    expect(result.statusCode).toBe(200);
    expect(result.body.changed).toBe(false);
    expect(harness.writes).toHaveLength(1);
    expect(harness.audits).toEqual([]);
  });

  it("audits a revocation as role.revoke", async () => {
    const harness = createHarness({ previousRole: "moderator" });
    await call(harness, { url: roleUrl, body: { role: "player" } });
    expect(harness.audits[0]).toMatchObject({
      action: "role.revoke",
      before: { role: "moderator" },
      after: { role: "player" }
    });
  });

  it("denies an unauthenticated caller with 401 and writes nothing", async () => {
    const harness = createHarness({ actor: null });
    const result = await call(harness, {
      url: roleUrl,
      body: { role: "admin" }
    });
    expect(result.statusCode).toBe(401);
    expect(harness.writes).toEqual([]);
    expect(harness.audits).toEqual([]);
  });

  it("denies a player with 403 and writes nothing", async () => {
    const harness = createHarness({ actor: "user_1", role: "player" });
    const result = await call(harness, {
      url: roleUrl,
      body: { role: "admin" }
    });
    expect(result.statusCode).toBe(403);
    expect(harness.writes).toEqual([]);
    expect(harness.audits).toEqual([]);
  });

  it("denies a moderator with 403 — role granting is admin-only", async () => {
    const harness = createHarness({ actor: "mod_1", role: "moderator" });
    const result = await call(harness, {
      url: roleUrl,
      body: { role: "admin" }
    });
    expect(result.statusCode).toBe(403);
    expect(harness.writes).toEqual([]);
  });

  it("refuses a player promoting themselves", async () => {
    const harness = createHarness({ actor: "user_1", role: "player" });
    const result = await call(harness, {
      url: "/api/admin/users/user_1/role",
      body: { role: "admin" }
    });
    expect(result.statusCode).toBe(403);
    expect(harness.writes).toEqual([]);
  });

  it("refuses an admin changing their own role", async () => {
    const harness = createHarness({ actor: "admin_1", role: "admin" });
    const result = await call(harness, {
      url: "/api/admin/users/admin_1/role",
      body: { role: "player" }
    });
    expect(result.statusCode).toBe(403);
    expect(result.body.error).toMatch(/your own role/i);
    expect(harness.writes).toEqual([]);
    expect(harness.audits).toEqual([]);
  });

  it("rejects a role outside the matrix", async () => {
    const harness = createHarness();
    const result = await call(harness, {
      url: roleUrl,
      body: { role: "owner" }
    });
    expect(result.statusCode).toBe(400);
    expect(harness.writes).toEqual([]);
    expect(harness.audits).toEqual([]);
  });

  it("rejects a malformed body", async () => {
    const harness = createHarness();
    const { response, finished } = createResponse();
    const stream = new PassThrough();
    stream.end("not json");
    await harness.handler(
      /** @type {never} */ (
        Object.assign(stream, {
          method: "POST",
          url: roleUrl,
          headers: {},
          socket: {}
        })
      ),
      response,
      undefined
    );
    expect((await finished).statusCode).toBe(400);
    expect(harness.writes).toEqual([]);
  });

  it("denies before revealing whether an admin route exists", async () => {
    const harness = createHarness({ actor: "user_1", role: "player" });
    const unknown = await call(harness, {
      url: "/api/admin/users/user_target/secrets",
      body: {}
    });
    const wrongMethod = await call(harness, {
      method: "GET",
      url: roleUrl
    });
    // A player gets the same 403 for both, so the admin surface cannot be
    // mapped by reading 404s and 405s.
    expect(unknown.statusCode).toBe(403);
    expect(wrongMethod.statusCode).toBe(403);
  });

  it("rejects a non-POST method", async () => {
    const harness = createHarness();
    const result = await call(harness, { method: "GET", url: roleUrl });
    expect(result.statusCode).toBe(405);
    expect(result.headers.allow).toBe("POST");
  });

  it("returns 404 for an unknown admin route without leaking whether it exists", async () => {
    const harness = createHarness();
    const result = await call(harness, {
      url: "/api/admin/users/user_target/secrets",
      body: {}
    });
    expect(result.statusCode).toBe(404);
  });

  it("passes non-admin paths to the next handler", async () => {
    const harness = createHarness();
    let continued = false;
    const { response } = createResponse();
    await harness.handler(
      createRequest({ url: "/api/profile" }),
      response,
      () => {
        continued = true;
      }
    );
    expect(continued).toBe(true);
  });

  it("still records the change when the Clerk mirror fails", async () => {
    // The mirror only feeds UI gating. Losing it must not lose the grant.
    const harness = createHarness({
      mirrorRole: async () => {
        throw new Error("clerk unavailable");
      }
    });
    const result = await call(harness, {
      url: roleUrl,
      body: { role: "moderator" }
    });
    expect(result.statusCode).toBe(200);
    expect(harness.writes).toHaveLength(1);
    expect(harness.audits).toHaveLength(1);
  });

  it("still reports success when the audit write fails", async () => {
    // setRole has already committed by then. Reporting 503 would claim a failed
    // change that actually succeeded, and the retry would be a no-op that writes
    // no audit row at all.
    const handler = createAdminHandler({
      store: {
        setRole: async () => ({ previousRole: "player", role: "moderator" })
      },
      requirePermission: createPermissionGuard({
        getUserId: () => "admin_1",
        resolver: { roleFor: async () => "admin" }
      }),
      recordAudit: async () => {
        throw new Error("audit unavailable");
      }
    });
    const { response, finished } = createResponse();
    await handler(
      createRequest({ url: roleUrl, body: { role: "moderator" } }),
      response,
      undefined
    );
    const result = await finished;
    expect(result.statusCode).toBe(200);
    expect(result.body).toMatchObject({ role: "moderator", changed: true });
  });

  it("reports 503 and writes no audit row when the store fails", async () => {
    const harness = createHarness({
      setRole: async () => {
        throw new Error("database down");
      }
    });
    const result = await call(harness, {
      url: roleUrl,
      body: { role: "moderator" }
    });
    expect(result.statusCode).toBe(503);
    expect(harness.audits).toEqual([]);
  });
});

const exportUrl = "/api/admin/users/user_target/export";

describe("admin data export", () => {
  it("serves another Explorer's export and audits it as export.admin", async () => {
    const harness = createHarness();
    const result = await call(harness, { method: "GET", url: exportUrl });
    expect(result.statusCode).toBe(200);
    expect(result.body).toMatchObject({
      schema: "echo-maze-export/1",
      data: { player_profile: { user_id: "user_target" } }
    });
    expect(result.headers["content-disposition"]).toBe(
      'attachment; filename="echo-maze-export-user_target.json"'
    );
    expect(harness.exported).toEqual(["user_target"]);
    expect(harness.audits).toHaveLength(1);
    expect(harness.audits[0]).toMatchObject({
      action: "export.admin",
      actorId: "admin_1",
      actorRole: "admin",
      resource: { type: "player_account", id: "user_target" }
    });
  });

  it("refuses a moderator, who holds users:read but not export:any", async () => {
    const harness = createHarness({ actor: "mod_1", role: "moderator" });
    const result = await call(harness, { method: "GET", url: exportUrl });
    expect(result.statusCode).toBe(403);
    expect(harness.exported).toEqual([]);
    expect(harness.audits).toEqual([]);
  });

  it("refuses a signed-out caller", async () => {
    const harness = createHarness({ actor: null });
    const result = await call(harness, { method: "GET", url: exportUrl });
    expect(result.statusCode).toBe(401);
    expect(harness.exported).toEqual([]);
  });

  it("rejects a method other than GET", async () => {
    const harness = createHarness();
    const result = await call(harness, { method: "POST", url: exportUrl });
    expect(result.statusCode).toBe(405);
    expect(result.headers.allow).toBe("GET");
    expect(harness.exported).toEqual([]);
  });

  it("does not leak the failure when the export cannot be built", async () => {
    const harness = createHarness({
      exportUser: async () => {
        throw new Error("postgres://user:secret@host is unreachable");
      }
    });
    const result = await call(harness, { method: "GET", url: exportUrl });
    expect(result.statusCode).toBe(503);
    expect(JSON.stringify(result.body)).not.toContain("secret@host");
    expect(harness.audits).toEqual([]);
  });

  it("still guards the role route with its own permission", async () => {
    // The two sub-paths must not share one check: export:any is admin-only,
    // and so is users:roles:write, but they are separate grants.
    const harness = createHarness();
    const result = await call(harness, {
      url: roleUrl,
      body: { role: "moderator" }
    });
    expect(result.statusCode).toBe(200);
  });

  it("keeps an unknown path indistinguishable from a forbidden one", async () => {
    const harness = createHarness({ actor: "mod_1", role: "moderator" });
    const unknown = await call(harness, {
      method: "GET",
      url: "/api/admin/does-not-exist"
    });
    const real = await call(harness, { method: "GET", url: exportUrl });
    // A caller who may not use either route cannot tell them apart.
    expect(unknown.statusCode).toBe(real.statusCode);
  });
});
