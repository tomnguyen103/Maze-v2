import { describe, expect, it, vi } from "vitest";
import { createOfflineWorkerClient } from "../src/game/offline-worker-client.js";

/** @type {{ version: string, assets: { url: string, scope: "public" | "account" }[] }} */
const ASSET_PACKAGE = {
  version: "build_01MOSS",
  assets: [
    { url: "/index.html", scope: "public" },
    { url: "/assets/quest-pack.js", scope: "account" }
  ]
};

function navigatorWithWorker() {
  /** @type {any} */
  let worker;
  const navigatorLike = {
    serviceWorker: {
      register: vi.fn(async () => ({ active: worker })),
      ready: Promise.resolve({ active: worker })
    }
  };
  const messageChannel = () => {
    const port1 = /** @type {{ onmessage: ((event: { data: unknown }) => void) | null }} */ ({
      onmessage: null
    });
    const port2 = {
      /** @param {unknown} data */
      reply(data) {
        port1.onmessage?.({ data });
      }
    };
    return { port1, port2 };
  };
  worker = {
    postMessage: vi.fn(
      /** @param {{ version: string }} message @param {{ reply: (data: unknown) => void }[]} ports */
      (message, ports) => {
      ports[0].reply({ ok: true, version: message.version });
      }
    )
  };
  return {
    navigatorLike: /** @type {Navigator} */ (/** @type {unknown} */ (navigatorLike)),
    worker,
    messageChannel: /** @type {() => MessageChannel} */ (
      /** @type {unknown} */ (messageChannel)
    )
  };
}

describe("Offline Continuity worker client", () => {
  it("registers once and reports an explicit successful pin", async () => {
    const harness = navigatorWithWorker();
    const client = createOfflineWorkerClient(harness);

    await expect(
      client.pin(ASSET_PACKAGE, { accountScope: "user_01MOSS" })
    ).resolves.toEqual({
      ok: true,
      version: ASSET_PACKAGE.version
    });
    expect(harness.navigatorLike.serviceWorker.register).toHaveBeenCalledWith(
      "/sw.js"
    );
    expect(harness.worker.postMessage).toHaveBeenCalledWith(
      { type: "pin", ...ASSET_PACKAGE, accountScope: "user_01MOSS" },
      expect.any(Array)
    );
  });

  it("does not register a worker just to clean up an unused boundary", async () => {
    const harness = navigatorWithWorker();
    const client = createOfflineWorkerClient(harness);

    await expect(client.signOut()).resolves.toEqual({
      ok: true,
      reason: "not-registered"
    });
    expect(harness.navigatorLike.serviceWorker.register).not.toHaveBeenCalled();
    expect(harness.worker.postMessage).not.toHaveBeenCalled();
  });

  it("does not ask the worker to pin an invalid or unsupported package", async () => {
    const harness = navigatorWithWorker();
    const client = createOfflineWorkerClient(harness);
    await expect(
      client.pin(
        /** @type {Parameters<ReturnType<typeof createOfflineWorkerClient>["pin"]>[0]} */ (
          /** @type {unknown} */ ({
            version: "build_01MOSS",
            assets: [{ url: "/index.html" }]
          })
        )
      )
    ).resolves.toMatchObject({ ok: false });
    expect(harness.worker.postMessage).not.toHaveBeenCalled();

    await expect(client.pin(ASSET_PACKAGE)).resolves.toEqual({
      ok: false,
      reason: "account-scope"
    });
    expect(harness.worker.postMessage).not.toHaveBeenCalled();

    const unsupported = createOfflineWorkerClient({
      navigatorLike: /** @type {Navigator} */ (/** @type {unknown} */ ({}))
    });
    await expect(unsupported.register()).resolves.toEqual({
      ok: false,
      reason: "unsupported"
    });
  });

  it("reports an unresponsive or terminated worker instead of hanging", async () => {
    const harness = navigatorWithWorker();
    harness.worker.postMessage.mockImplementation(() => {});
    const client = createOfflineWorkerClient({
      ...harness,
      timeoutMs: 1
    });

    await expect(
      client.pin(ASSET_PACKAGE, { accountScope: "user_01MOSS" })
    ).resolves.toEqual({
      ok: false,
      reason: "timeout"
    });

    const throwing = navigatorWithWorker();
    throwing.worker.postMessage.mockImplementation(() => {
      throw new Error("worker gone");
    });
    await expect(
      createOfflineWorkerClient({ ...throwing, timeoutMs: 1 }).pin(ASSET_PACKAGE, {
        accountScope: "user_01MOSS"
      })
    ).resolves.toEqual({ ok: false, reason: "message" });
  });
});
