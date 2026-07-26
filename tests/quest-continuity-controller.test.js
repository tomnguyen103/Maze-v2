import { describe, expect, it, vi } from "vitest";
import { createQuestContinuityController } from "../src/player/quest-continuity-controller.js";
import {
  createQuestProgress,
  rememberMap
} from "../src/game/quest-progress.js";

function createStorage() {
  /** @type {Map<string, string>} */
  const values = new Map();
  return {
    /** @param {string} key */
    getItem: (key) => values.get(key) ?? null,
    /** @param {string} key @param {string} value */
    setItem(key, value) {
      values.set(key, value);
    },
    /** @param {string} key */
    removeItem(key) {
      values.delete(key);
    }
  };
}

/** @param {number} number @param {string} [questId] */
function progressAt(number, questId = "quest_sync_123") {
  return {
    ...createQuestProgress("trail-scout", number, questId),
    completedLabyrinths: number - 1
  };
}

describe("Quest Continuity controller", () => {
  it("queues a boundary locally without contacting cloud while signed out", async () => {
    const storage = createStorage();
    const loadCloud = vi.fn();
    const controller = createQuestContinuityController({
      loadCloud,
      saveCloud: vi.fn(),
      storage
    });
    const progress = progressAt(4);

    await controller.queueBoundary(progress);

    expect(loadCloud).not.toHaveBeenCalled();
    expect(JSON.parse(
      storage.getItem("echo-maze:quest-sync-pending:v1") ?? "null"
    )).toEqual(progress);
  });

  it("idempotently migrates local progress into an empty cloud record", async () => {
    const storage = createStorage();
    const saveCloud = vi.fn(async (progress, expectedRevision) => ({
      record: {
        progress,
        revision: expectedRevision + 1,
        updatedAt: "2026-07-26T00:00:00.000Z"
      },
      duplicate: false
    }));
    const onStatus = vi.fn();
    const controller = createQuestContinuityController({
      loadCloud: async () => ({ record: null }),
      saveCloud,
      storage,
      onStatus
    });
    controller.setAuthenticated("user_123");
    const progress = progressAt(4);

    await controller.queueBoundary(progress);

    expect(saveCloud).toHaveBeenCalledWith(progress, 0);
    expect(storage.getItem("echo-maze:quest-sync-pending:v1")).toBeNull();
    expect(onStatus).toHaveBeenLastCalledWith("saved");
  });

  it("restores cloud progress when a signed-in browser has no local Quest", async () => {
    const cloud = {
      progress: progressAt(8),
      revision: 3,
      updatedAt: "2026-07-26T00:00:00.000Z"
    };
    const onProgress = vi.fn();
    const controller = createQuestContinuityController({
      loadCloud: async () => ({ record: cloud }),
      saveCloud: vi.fn(),
      storage: createStorage(),
      onProgress
    });
    controller.setAuthenticated("user_123");

    await controller.retry(null);

    expect(onProgress).toHaveBeenCalledWith(cloud.progress, "cloud");
  });

  it("keeps the boundary queued offline and retries safely", async () => {
    const storage = createStorage();
    const progress = progressAt(4);
    const loadCloud = vi.fn()
      .mockRejectedValueOnce(new TypeError("offline"))
      .mockResolvedValueOnce({ record: null });
    const saveCloud = vi.fn(async (saved) => ({
      record: {
        progress: saved,
        revision: 1,
        updatedAt: "2026-07-26T00:00:00.000Z"
      }
    }));
    const onStatus = vi.fn();
    const controller = createQuestContinuityController({
      loadCloud,
      saveCloud,
      storage,
      onStatus
    });
    controller.setAuthenticated("user_123");

    await controller.queueBoundary(progress);
    expect(storage.getItem("echo-maze:quest-sync-pending:v1")).not.toBeNull();
    expect(onStatus).toHaveBeenLastCalledWith("offline");

    await controller.retry(progress);
    expect(saveCloud).toHaveBeenCalledWith(progress, 0);
    expect(storage.getItem("echo-maze:quest-sync-pending:v1")).toBeNull();
  });

  it("merges a stale same-Quest write and retries one optimistic revision", async () => {
    const local = rememberMap(progressAt(5), "map-local");
    const cloud = {
      progress: rememberMap(progressAt(7), "map-cloud"),
      revision: 4,
      updatedAt: "2026-07-26T00:00:00.000Z"
    };
    const latest = {
      progress: rememberMap(progressAt(8), "map-latest"),
      revision: 5,
      updatedAt: "2026-07-26T00:01:00.000Z"
    };
    const loadCloud = vi.fn()
      .mockResolvedValueOnce({ record: cloud })
      .mockResolvedValueOnce({ record: latest });
    const saveCloud = vi.fn()
      .mockRejectedValueOnce(
        Object.assign(new Error("stale"), { status: 409 })
      )
      .mockImplementation(async (progress, expectedRevision) => ({
        record: {
          progress,
          revision: expectedRevision + 1,
          updatedAt: "2026-07-26T00:02:00.000Z"
        }
      }));
    const onProgress = vi.fn();
    const controller = createQuestContinuityController({
      loadCloud,
      saveCloud,
      storage: createStorage(),
      onProgress
    });
    controller.setAuthenticated("user_123");

    await controller.queueBoundary(local);

    expect(saveCloud).toHaveBeenLastCalledWith(
      expect.objectContaining({
        labyrinthNumber: 8,
        usedMapFingerprints: ["map-cloud", "map-latest", "map-local"]
      }),
      5
    );
    expect(onProgress).toHaveBeenCalledWith(
      expect.objectContaining({ labyrinthNumber: 8 }),
      "merged"
    );
  });

  it("requires an explicit choice for different Quests", async () => {
    const local = progressAt(4, "quest_local_123");
    const cloud = {
      progress: progressAt(9, "quest_cloud_456"),
      revision: 2,
      updatedAt: "2026-07-26T00:00:00.000Z"
    };
    const saveCloud = vi.fn(async (progress, expectedRevision) => ({
      record: {
        progress,
        revision: expectedRevision + 1,
        updatedAt: "2026-07-26T00:00:00.000Z"
      }
    }));
    const onConflict = vi.fn();
    const onProgress = vi.fn();
    const controller = createQuestContinuityController({
      loadCloud: async () => ({ record: cloud }),
      saveCloud,
      storage: createStorage(),
      onConflict,
      onProgress
    });
    controller.setAuthenticated("user_123");

    await controller.queueBoundary(local);

    expect(onConflict).toHaveBeenCalledWith({ local, cloud });
    expect(saveCloud).not.toHaveBeenCalled();

    await controller.resolveConflict("cloud");
    expect(onProgress).toHaveBeenCalledWith(cloud.progress, "cloud");
  });

  it("keeps the local choice queued and resumes when its save is offline", async () => {
    const storage = createStorage();
    const local = progressAt(4, "quest_local_123");
    const cloud = {
      progress: progressAt(9, "quest_cloud_456"),
      revision: 2,
      updatedAt: "2026-07-26T00:00:00.000Z"
    };
    const onConflict = vi.fn();
    const onStatus = vi.fn();
    const controller = createQuestContinuityController({
      loadCloud: async () => ({ record: cloud }),
      saveCloud: vi.fn(async () => {
        throw new TypeError("offline");
      }),
      storage,
      onConflict,
      onStatus
    });
    controller.setAuthenticated("user_123");
    await controller.queueBoundary(local);

    await expect(controller.resolveConflict("local")).resolves.toBe(true);

    expect(onConflict).toHaveBeenCalledTimes(1);
    expect(onStatus).toHaveBeenLastCalledWith("offline");
    expect(JSON.parse(
      storage.getItem("echo-maze:quest-sync-pending:v1") ?? "null"
    )).toEqual(local);

    const retrySave = vi.fn(async (progress, expectedRevision) => ({
      record: {
        progress,
        revision: expectedRevision + 1,
        updatedAt: "2026-07-26T00:01:00.000Z"
      }
    }));
    const retryController = createQuestContinuityController({
      loadCloud: async () => ({ record: cloud }),
      saveCloud: retrySave,
      storage,
      onConflict,
      onStatus
    });
    retryController.setAuthenticated("user_123");

    await retryController.retry(local);

    expect(retrySave).toHaveBeenCalledWith(local, cloud.revision);
    expect(onConflict).toHaveBeenCalledTimes(1);
    expect(onStatus).toHaveBeenLastCalledWith("saved");
    expect(storage.getItem("echo-maze:quest-sync-pending:v1")).toBeNull();
  });

  it("discards a cloud restore that finishes after the Clerk identity changes", async () => {
    /** @type {(value: any) => void} */
    let resolveLoad = () => {};
    const loadCloud = vi.fn(() => new Promise((resolve) => {
      resolveLoad = resolve;
    }));
    const onProgress = vi.fn();
    const onStatus = vi.fn();
    const controller = createQuestContinuityController({
      loadCloud,
      saveCloud: vi.fn(),
      storage: createStorage(),
      onProgress,
      onStatus
    });
    controller.setAuthenticated("user_a");

    const syncing = controller.retry(null);
    await vi.waitFor(() => expect(loadCloud).toHaveBeenCalledOnce());
    controller.setAuthenticated("user_b");
    resolveLoad({
      record: {
        progress: progressAt(8, "quest_account_a"),
        revision: 3,
        updatedAt: "2026-07-26T00:00:00.000Z"
      }
    });
    await syncing;

    expect(onProgress).not.toHaveBeenCalled();
    expect(onStatus).toHaveBeenLastCalledWith("local");
  });

  it("discards a cloud save that finishes after sign-out", async () => {
    /** @type {(value: any) => void} */
    let resolveSave = () => {};
    const progress = progressAt(4);
    const saveCloud = vi.fn(() => new Promise((resolve) => {
      resolveSave = resolve;
    }));
    const onProgress = vi.fn();
    const onStatus = vi.fn();
    const storage = createStorage();
    const controller = createQuestContinuityController({
      loadCloud: async () => ({ record: null }),
      saveCloud,
      storage,
      onProgress,
      onStatus
    });
    controller.setAuthenticated("user_a");

    const syncing = controller.queueBoundary(progress);
    await vi.waitFor(() => expect(saveCloud).toHaveBeenCalledOnce());
    controller.setAuthenticated(null);
    resolveSave({
      record: {
        progress,
        revision: 1,
        updatedAt: "2026-07-26T00:00:00.000Z"
      }
    });
    await syncing;

    expect(onProgress).not.toHaveBeenCalled();
    expect(onStatus).toHaveBeenLastCalledWith("local");
    expect(storage.getItem("echo-maze:quest-sync-pending:v1")).not.toBeNull();
  });

  it("never replays another Clerk identity's keep-local choice", async () => {
    const storage = createStorage();
    const local = progressAt(4, "quest_local_123");
    const cloud = {
      progress: progressAt(9, "quest_cloud_456"),
      revision: 2,
      updatedAt: "2026-07-26T00:00:00.000Z"
    };
    const onConflict = vi.fn();
    const accountA = createQuestContinuityController({
      loadCloud: async () => ({ record: cloud }),
      saveCloud: vi.fn(async () => {
        throw new TypeError("offline");
      }),
      storage,
      onConflict
    });
    accountA.setAuthenticated("user_a");
    await accountA.queueBoundary(local);
    await accountA.resolveConflict("local");

    const accountBSave = vi.fn();
    const accountB = createQuestContinuityController({
      loadCloud: async () => ({ record: cloud }),
      saveCloud: accountBSave,
      storage,
      onConflict
    });
    accountB.setAuthenticated("user_b");
    await accountB.retry(local);

    expect(accountBSave).not.toHaveBeenCalled();
    expect(onConflict).toHaveBeenCalledTimes(2);
    expect(onConflict).toHaveBeenLastCalledWith({ local, cloud });
  });
});
