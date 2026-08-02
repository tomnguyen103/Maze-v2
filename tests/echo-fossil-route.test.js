import { createServer } from "node:http";
import { describe, expect, it, vi } from "vitest";
import {
  createEchoFossil,
  createFossilCollection
} from "../src/game/quest-fossils.js";
import { createEchoFossilHandler } from "../server/echo-fossil-route.js";

const QUEST_ID = "quest_fossil_route_123";
const FOSSIL = createEchoFossil({
  questId: QUEST_ID,
  labyrinthNumber: 4,
  atlasRegionId: "foundation",
  outcome: "escaped",
  fossilId: "fossil_00000000-0000-4000-8000-000000000201"
});
const COLLECTION = {
  ...createFossilCollection(QUEST_ID),
  fossils: [FOSSIL]
};

function createStore() {
  return {
    collection: createFossilCollection(QUEST_ID),
    async getFossils() {
      return { collection: this.collection };
    },
    /** @param {string} _userId @param {unknown} rawCollection */
    async saveFossils(_userId, rawCollection) {
      const collection = /** @type {import("../src/game/quest-fossils.js").FossilCollection} */ (rawCollection);
      this.collection = collection;
      return { collection };
    }
  };
}

/** @param {(request: import("node:http").IncomingMessage, response: import("node:http").ServerResponse) => void | Promise<void>} handler @param {(origin: string) => Promise<void>} callback */
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

describe("Echo Fossil API", () => {
  it("requires authentication and a valid Quest ID", async () => {
    const handler = createEchoFossilHandler({
      store: createStore(),
      getUserId: () => null
    });
    await withServer(handler, async (origin) => {
      expect((await fetch(`${origin}/api/echo-fossils?questId=${QUEST_ID}`)).status)
        .toBe(401);
    });

    const authenticated = createEchoFossilHandler({
      store: createStore(),
      getUserId: () => "user_123"
    });
    await withServer(authenticated, async (origin) => {
      expect((await fetch(`${origin}/api/echo-fossils`)).status).toBe(400);
    });
  });

  it("reads and saves only normalized Personal Fossil data", async () => {
    const store = createStore();
    const handler = createEchoFossilHandler({
      store,
      getUserId: () => "user_123"
    });
    await withServer(handler, async (origin) => {
      const saved = await fetch(`${origin}/api/echo-fossils`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ collection: COLLECTION })
      });
      expect(saved.status).toBe(200);
      expect(await saved.json()).toEqual({ collection: COLLECTION });

      const read = await fetch(
        `${origin}/api/echo-fossils?questId=${QUEST_ID}`
      );
      expect(await read.json()).toEqual({ collection: COLLECTION });
    });
  });

  it("rejects classroom scope and forbidden fields", async () => {
    const handler = createEchoFossilHandler({
      store: createStore(),
      getUserId: () => "user_123"
    });
    await withServer(handler, async (origin) => {
      const classroom = await fetch(
        `${origin}/api/echo-fossils?questId=${QUEST_ID}`,
        { headers: { "x-echo-maze-classroom-id": "org_class_123" } }
      );
      expect(classroom.status).toBe(400);

      const forbidden = await fetch(`${origin}/api/echo-fossils`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          collection: {
            ...COLLECTION,
            fossils: [{ ...FOSSIL, score: 900 }]
          }
        })
      });
      expect(forbidden.status).toBe(400);
    });
  });

  it("does not leak storage errors or accept unsupported methods", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const store = createStore();
    store.getFossils = async () => {
      throw new Error("database secret must-not-leak");
    };
    const handler = createEchoFossilHandler({
      store,
      getUserId: () => "user_123"
    });
    await withServer(handler, async (origin) => {
      expect(
        (await fetch(`${origin}/api/echo-fossils?questId=${QUEST_ID}`)).status
      ).toBe(500);
      expect(
        (await fetch(`${origin}/api/echo-fossils`, { method: "PATCH" })).status
      ).toBe(405);
    });
    expect(JSON.stringify(log.mock.calls)).not.toContain("must-not-leak");
    log.mockRestore();
  });
});
