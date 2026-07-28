import { createServer } from "node:http";
import { describe, expect, it, vi } from "vitest";
import { createAccessSettingsHandler } from "../server/access-settings-route.js";
import { DeletedUserError } from "../server/deleted-user-guard.js";

const SETTINGS = {
  version: 1,
  highContrast: true,
  largeMarks: false,
  readerFriendlyQuestions: true,
  reducedEffects: false
};

const RECORD = {
  settings: SETTINGS,
  revision: 3,
  updatedAt: "2026-07-28T00:00:00.000Z"
};

/**
 * @param {(request: import("node:http").IncomingMessage, response: import("node:http").ServerResponse) => void | Promise<void>} handler
 * @param {(origin: string) => Promise<void>} callback
 */
async function withServer(handler, callback) {
  const server = createServer((request, response) => handler(request, response));
  await new Promise((resolve) =>
    server.listen(0, "127.0.0.1", () => resolve(undefined))
  );
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Test server did not start.");
  }
  try {
    await callback(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve(undefined)))
    );
  }
}

function createStore(result = { record: RECORD, conflict: false, duplicate: false }) {
  return {
    get: vi.fn().mockResolvedValue(RECORD),
    save: vi.fn().mockResolvedValue(result)
  };
}

describe("Explorer Access Settings API", () => {
  it("requires a signed-in Explorer for reads and writes", async () => {
    const handler = createAccessSettingsHandler({
      store: createStore(),
      getUserId: () => null
    });

    await withServer(handler, async (origin) => {
      expect((await fetch(`${origin}/api/me/settings`)).status).toBe(401);
      expect(
        (
          await fetch(`${origin}/api/me/settings`, {
            method: "PUT",
            body: JSON.stringify({ expectedRevision: 0, settings: SETTINGS })
          })
        ).status
      ).toBe(401);
    });
  });

  it("reads and creates one revisioned settings record", async () => {
    const store = createStore({
      record: { ...RECORD, revision: 1 },
      conflict: false,
      duplicate: false
    });
    const audit = vi.fn();
    const handler = createAccessSettingsHandler({
      store,
      getUserId: () => "user_123",
      recordAudit: audit
    });

    await withServer(handler, async (origin) => {
      const loaded = await fetch(`${origin}/api/me/settings`);
      expect(loaded.status).toBe(200);
      await expect(loaded.json()).resolves.toEqual({ record: RECORD });

      const saved = await fetch(`${origin}/api/me/settings`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ expectedRevision: 0, settings: SETTINGS })
      });
      expect(saved.status).toBe(201);
      await expect(saved.json()).resolves.toMatchObject({
        record: { settings: SETTINGS, revision: 1 }
      });
    });

    expect(store.save).toHaveBeenCalledWith("user_123", 0, SETTINGS);
    expect(audit).toHaveBeenCalledTimes(1);
    expect(audit).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        actorId: "user_123",
        action: "access_settings.save",
        resource: { type: "explorer_access_settings", id: "user_123" },
        before: { expectedRevision: 0 },
        after: SETTINGS
      })
    );
  });

  it("returns the current record on a stale revision and does not audit it", async () => {
    const audit = vi.fn();
    const handler = createAccessSettingsHandler({
      store: createStore({ record: RECORD, conflict: true, duplicate: false }),
      getUserId: () => "user_123",
      recordAudit: audit
    });

    await withServer(handler, async (origin) => {
      const response = await fetch(`${origin}/api/me/settings`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ expectedRevision: 2, settings: SETTINGS })
      });

      expect(response.status).toBe(409);
      await expect(response.json()).resolves.toMatchObject({
        record: { revision: 3 },
        error: expect.stringContaining("another device")
      });
    });
    expect(audit).not.toHaveBeenCalled();
  });

  it("treats an identical retry as success without a false audit event", async () => {
    const audit = vi.fn();
    const handler = createAccessSettingsHandler({
      store: createStore({ record: RECORD, conflict: false, duplicate: true }),
      getUserId: () => "user_123",
      recordAudit: audit
    });

    await withServer(handler, async (origin) => {
      const response = await fetch(`${origin}/api/me/settings`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ expectedRevision: 2, settings: SETTINGS })
      });
      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toMatchObject({ duplicate: true });
    });
    expect(audit).not.toHaveBeenCalled();
  });

  it("rejects malformed settings, unsupported methods, and deleted accounts", async () => {
    const deletedStore = createStore();
    deletedStore.save.mockRejectedValue(new DeletedUserError());
    const handler = createAccessSettingsHandler({
      store: deletedStore,
      getUserId: () => "user_123"
    });

    await withServer(handler, async (origin) => {
      const malformed = await fetch(`${origin}/api/me/settings`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          expectedRevision: -1,
          settings: { ...SETTINGS, highContrast: "yes" }
        })
      });
      expect(malformed.status).toBe(400);

      const unsupported = await fetch(`${origin}/api/me/settings`, {
        method: "POST"
      });
      expect(unsupported.status).toBe(405);
      expect(unsupported.headers.get("allow")).toBe("GET, PUT");

      const deleted = await fetch(`${origin}/api/me/settings`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ expectedRevision: 0, settings: SETTINGS })
      });
      expect(deleted.status).toBe(410);
    });
  });

  it("redacts storage failure details", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const handler = createAccessSettingsHandler({
      store: {
        get: vi.fn().mockRejectedValue(new Error("secret database detail")),
        save: vi.fn()
      },
      getUserId: () => "user_123"
    });

    await withServer(handler, async (origin) => {
      const response = await fetch(`${origin}/api/me/settings`);
      expect(response.status).toBe(500);
    });
    expect(JSON.stringify(log.mock.calls)).not.toContain("secret database detail");
    log.mockRestore();
  });
});
