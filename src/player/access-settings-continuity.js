import {
  loadAccessSettings,
  saveAccessSettings
} from "./access-settings.js";

/**
 * @typedef {ReturnType<typeof loadAccessSettings>} AccessSettings
 * @typedef {{
 *   settings: AccessSettings,
 *   revision: number,
 *   updatedAt: string | null
 * }} AccessSettingsRecord
 */

/**
 * @param {{
 *   client: {
 *     getAccessSettings: () => Promise<{ record?: AccessSettingsRecord | null }>,
 *     saveAccessSettings: (
 *       settings: AccessSettings,
 *       expectedRevision: number
 *     ) => Promise<{ record?: AccessSettingsRecord | null, duplicate?: boolean }>
 *   },
 *   storage?: Parameters<typeof loadAccessSettings>[0],
 *   onApply?: (settings: AccessSettings) => void,
 *   onStatus?: (message: string) => void
 * }} dependencies
 */
export function createAccessSettingsContinuity({
  client,
  storage = globalThis.localStorage,
  onApply = () => {},
  onStatus = () => {}
}) {
  let userId = "";
  let selection = 0;
  /** @type {AccessSettingsRecord} */
  let record = localRecord(loadAccessSettings(storage));
  onApply(record.settings);

  return {
    current() {
      return record;
    },
    /** @param {string} nextUserId */
    async selectUser(nextUserId) {
      userId = nextUserId;
      const currentSelection = ++selection;
      record = localRecord(loadAccessSettings(storage));
      onApply(record.settings);
      if (!userId) {
        onStatus("");
        return record;
      }
      try {
        const loaded = await client.getAccessSettings();
        if (currentSelection !== selection || userId !== nextUserId) {
          return record;
        }
        if (loaded.record) {
          acceptCloudRecord(loaded.record);
          onStatus("Explorer Access Settings synced.");
          return record;
        }
        const seeded = await client.saveAccessSettings(record.settings, 0);
        if (
          currentSelection === selection &&
          userId === nextUserId &&
          seeded.record
        ) {
          acceptCloudRecord(seeded.record);
          onStatus("Explorer Access Settings now follow this account.");
        }
      } catch (error) {
        if (currentSelection === selection && userId === nextUserId) {
          if (!acceptConflict(error)) {
            onStatus(
              "Settings stay active on this device; cloud sync is unavailable."
            );
          }
        }
      }
      return record;
    },
    /** @param {AccessSettings} settings */
    async save(settings) {
      const saved = saveAccessSettings(settings, storage);
      record = { ...record, settings: saved };
      onApply(saved);
      if (!userId) {
        onStatus("Explorer Access Settings saved on this device.");
        return {
          settings: saved,
          close: true,
          synced: false,
          conflict: false,
          message: "Explorer Access Settings saved on this device."
        };
      }
      const saveSelection = selection;
      const saveUserId = userId;
      try {
        const result = await client.saveAccessSettings(
          saved,
          record.revision
        );
        if (saveSelection !== selection || saveUserId !== userId) {
          const message =
            "Account changed before Explorer Access Settings finished syncing.";
          onStatus(message);
          return {
            settings: record.settings,
            close: false,
            synced: false,
            conflict: false,
            message
          };
        }
        if (!result.record) {
          throw new Error("Settings service returned an empty record.");
        }
        acceptCloudRecord(result.record);
        onStatus("Explorer Access Settings synced across devices.");
        return {
          settings: record.settings,
          close: true,
          synced: true,
          conflict: false,
          message: "Explorer Access Settings synced across devices."
        };
      } catch (error) {
        if (saveSelection !== selection || saveUserId !== userId) {
          const message =
            "Account changed before Explorer Access Settings finished syncing.";
          onStatus(message);
          return {
            settings: record.settings,
            close: false,
            synced: false,
            conflict: false,
            message
          };
        }
        if (acceptConflict(error)) {
          const message =
            "Settings changed on another device. Current cloud settings restored.";
          onStatus(message);
          return {
            settings: record.settings,
            close: false,
            synced: true,
            conflict: true,
            message
          };
        }
        const message =
          "Saved on this device; cloud sync is unavailable. Try Save again.";
        onStatus(message);
        return {
          settings: saved,
          close: false,
          synced: false,
          conflict: false,
          message
        };
      }
    }
  };

  /** @param {AccessSettingsRecord} next */
  function acceptCloudRecord(next) {
    const settings = saveAccessSettings(next.settings, storage);
    record = {
      settings,
      revision: next.revision,
      updatedAt: next.updatedAt
    };
    onApply(settings);
  }

  /** @param {unknown} error */
  function acceptConflict(error) {
    if (
      !error ||
      typeof error !== "object" ||
      /** @type {{ status?: unknown }} */ (error).status !== 409
    ) {
      return false;
    }
    const body = /** @type {{ body?: { record?: AccessSettingsRecord } }} */ (
      error
    ).body;
    if (!body?.record) {
      return false;
    }
    acceptCloudRecord(body.record);
    return true;
  }
}

/** @param {AccessSettings} settings @returns {AccessSettingsRecord} */
function localRecord(settings) {
  return { settings, revision: 0, updatedAt: null };
}
