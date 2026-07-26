import { createServer } from "node:http";
import { createPlayerApi } from "../server/player-api.js";
import { describe, expect, it } from "vitest";

/**
 * @param {ReturnType<typeof createPlayerApi>} handler
 * @param {(origin: string) => Promise<void>} callback
 */
async function withServer(handler, callback) {
  const server = createServer((request, response) =>
    handler(request, response)
  );
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

describe("composed player API", () => {
  it("keeps enforcement disabled when payment recovery is unavailable", async () => {
    const handler = createPlayerApi({
      CLERK_PUBLISHABLE_KEY: "pk_test_example",
      CLERK_SECRET_KEY: "sk_test_example",
      DATABASE_URL: "postgresql://test:test@127.0.0.1:1/echo",
      RUN_ACCESS_ENFORCEMENT_ENABLED: "true"
    });

    await withServer(handler, async (origin) => {
      const response = await fetch(`${origin}/api/access/config`);
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ enforcementEnabled: false });
    });
  });

  it("returns the public rollback state when the database is absent", async () => {
    const handler = createPlayerApi({});

    await withServer(handler, async (origin) => {
      const response = await fetch(`${origin}/api/access/config`);
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ enforcementEnabled: false });
    });
  });

  it("fails lifetime purchase requests closed when services are absent", async () => {
    const handler = createPlayerApi({});

    await withServer(handler, async (origin) => {
      const response = await fetch(`${origin}/api/lifetime-checkout`, {
        method: "POST"
      });
      expect(response.status).toBe(503);
      await expect(response.json()).resolves.toEqual({
        error: "Player services are not configured. Guest play still works."
      });
    });
  });
});
