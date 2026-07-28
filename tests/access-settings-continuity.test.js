import { describe, expect, it, vi } from "vitest";
import {
  ACCESS_SETTINGS_STORAGE_KEY,
  DEFAULT_ACCESS_SETTINGS
} from "../src/player/access-settings.js";
import { createAccessSettingsContinuity } from "../src/player/access-settings-continuity.js";

const LOCAL = /** @type {const} */ ({
  version: 1,
  highContrast: true,
  largeMarks: false,
  readerFriendlyQuestions: true,
  reducedEffects: false
});

const CLOUD = /** @type {const} */ ({
  version: 1,
  highContrast: false,
  largeMarks: true,
  readerFriendlyQuestions: false,
  reducedEffects: true
});

function storageWith(settings = LOCAL) {
  const values = new Map([[ACCESS_SETTINGS_STORAGE_KEY, JSON.stringify(settings)]]);
  return {
    getItem: vi.fn((key) => values.get(key) ?? null),
    setItem: vi.fn((key, value) => values.set(key, value)),
    value() {
      return JSON.parse(values.get(ACCESS_SETTINGS_STORAGE_KEY) ?? "null");
    }
  };
}

/**
 * @param {ReturnType<typeof import("../src/player/access-settings.js").loadAccessSettings>} settings
 * @param {number} revision
 */
function record(settings, revision) {
  return {
    settings,
    revision,
    updatedAt: "2026-07-28T00:00:00.000Z"
  };
}

describe("Explorer Access Settings continuity", () => {
  it("keeps guests device-local and performs no network request", async () => {
    const storage = storageWith();
    const client = {
      getAccessSettings: vi.fn(async () => ({ record: null })),
      saveAccessSettings: vi.fn(
        /**
         * @param {ReturnType<typeof import("../src/player/access-settings.js").loadAccessSettings>} settings
         * @param {number} revision
         */
        async (settings, revision) => {
          void settings;
          void revision;
          return {};
        }
      )
    };
    const apply = vi.fn();
    const continuity = createAccessSettingsContinuity({
      client,
      storage,
      onApply: apply
    });

    await continuity.selectUser("");
    const result = await continuity.save(CLOUD);

    expect(result).toMatchObject({
      settings: CLOUD,
      close: true,
      synced: false
    });
    expect(storage.value()).toEqual(CLOUD);
    expect(apply).toHaveBeenLastCalledWith(CLOUD);
    expect(client.getAccessSettings).not.toHaveBeenCalled();
    expect(client.saveAccessSettings).not.toHaveBeenCalled();
  });

  it("seeds an absent cloud record from the current device", async () => {
    const storage = storageWith();
    const client = {
      getAccessSettings: vi.fn().mockResolvedValue({ record: null }),
      saveAccessSettings: vi.fn().mockResolvedValue({
        record: record(LOCAL, 1),
        duplicate: false
      })
    };
    const continuity = createAccessSettingsContinuity({ client, storage });

    await continuity.selectUser("user_123");

    expect(client.saveAccessSettings).toHaveBeenCalledWith(LOCAL, 0);
    expect(continuity.current()).toEqual(record(LOCAL, 1));
  });

  it("lets an existing cloud record win and refreshes the local cache", async () => {
    const storage = storageWith();
    const apply = vi.fn();
    const client = {
      getAccessSettings: vi.fn().mockResolvedValue({ record: record(CLOUD, 4) }),
      saveAccessSettings: vi.fn()
    };
    const continuity = createAccessSettingsContinuity({
      client,
      storage,
      onApply: apply
    });

    await continuity.selectUser("user_123");

    expect(storage.value()).toEqual(CLOUD);
    expect(apply).toHaveBeenLastCalledWith(CLOUD);
    expect(continuity.current()).toEqual(record(CLOUD, 4));
    expect(client.saveAccessSettings).not.toHaveBeenCalled();
  });

  it("restores the current cloud record after an optimistic conflict", async () => {
    const storage = storageWith();
    const client = {
      getAccessSettings: vi.fn().mockResolvedValue({ record: record(LOCAL, 2) }),
      saveAccessSettings: vi.fn().mockRejectedValue(
        Object.assign(new Error("changed"), {
          status: 409,
          body: { record: record(CLOUD, 3) }
        })
      )
    };
    const continuity = createAccessSettingsContinuity({ client, storage });
    await continuity.selectUser("user_123");

    const result = await continuity.save(LOCAL);

    expect(result).toMatchObject({
      settings: CLOUD,
      close: false,
      synced: true,
      conflict: true
    });
    expect(storage.value()).toEqual(CLOUD);
    expect(continuity.current()).toEqual(record(CLOUD, 3));
  });

  it("preserves local presentation and reports a temporary cloud failure", async () => {
    const storage = storageWith();
    /** @type {string[]} */
    const statuses = [];
    const client = {
      getAccessSettings: vi.fn().mockRejectedValue(new Error("offline")),
      saveAccessSettings: vi.fn()
    };
    const continuity = createAccessSettingsContinuity({
      client,
      storage,
      onStatus: (message) => statuses.push(message)
    });

    await continuity.selectUser("user_123");

    expect(storage.value()).toEqual(LOCAL);
    expect(continuity.current()).toEqual({
      settings: LOCAL,
      revision: 0,
      updatedAt: null
    });
    expect(statuses.at(-1)).toContain("device");
    expect(DEFAULT_ACCESS_SETTINGS).not.toEqual(LOCAL);
  });

  it("ignores a completed save after the signed-in account changes", async () => {
    const storage = storageWith();
    /** @type {(value: { record: ReturnType<typeof record> }) => void} */
    let finishSave = () => {};
    const pendingSave = new Promise((resolve) => {
      finishSave = resolve;
    });
    const client = {
      getAccessSettings: vi
        .fn()
        .mockResolvedValueOnce({ record: record(LOCAL, 1) })
        .mockResolvedValueOnce({ record: record(DEFAULT_ACCESS_SETTINGS, 7) }),
      saveAccessSettings: vi.fn(() => pendingSave)
    };
    const continuity = createAccessSettingsContinuity({ client, storage });
    await continuity.selectUser("user_first");

    const saving = continuity.save(CLOUD);
    await continuity.selectUser("user_second");
    finishSave({ record: record(CLOUD, 2) });

    await expect(saving).resolves.toMatchObject({
      settings: DEFAULT_ACCESS_SETTINGS,
      close: false,
      synced: false
    });
    expect(storage.value()).toEqual(DEFAULT_ACCESS_SETTINGS);
    expect(continuity.current()).toEqual(record(DEFAULT_ACCESS_SETTINGS, 7));
  });
});
