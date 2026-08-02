import { createFossilContinuity } from "./fossil-continuity.js";
import { loadQuestProgress } from "./quest-progress.js";
import { loadRunRecords } from "./storage.js";
import { createTerminalFossil } from "./terminal-fossil.js";

/** @typedef {ReturnType<typeof createFossilContinuity>} FossilContinuity */

const TERMINAL_MARKER_KEY = "echo-maze:echo-fossils:last-terminal:v1";

/**
 * @param {{
 *   playerController: {
 *     getApiClient: () => ReturnType<typeof import("../player/player-client.js").createPlayerApiClient>,
 *     getAuthenticatedUserId: () => string | null
 *   },
 *   storage?: Pick<Storage, "getItem" | "setItem" | "removeItem">,
 *   getQuestId?: () => string,
 * }} dependencies
 */
export function createFossilRuntime({
  playerController,
  storage,
  getQuestId = () => loadQuestProgress()?.questId ?? ""
}) {
  /** @type {"ready" | "syncing" | "unavailable"} */
  let atlasStatus = "ready";
  const continuity = createFossilContinuity({
    client: playerController.getApiClient(),
    storage,
    onStatus: (status) => {
      atlasStatus = status === "syncing"
        ? "syncing"
        : status === "offline" || status === "unavailable"
          ? "unavailable"
          : "ready";
    }
  });
  const deviceStorage = storage ?? globalThis.localStorage;
  let selectedUserId = "";
  let selectedQuestId = "";
  /** @type {Promise<unknown>} */
  let selectionPromise = Promise.resolve();

  function refresh() {
    const userId = playerController.getAuthenticatedUserId() ?? "";
    const questId = getQuestId();
    if (userId === selectedUserId && questId === selectedQuestId) {
      return selectionPromise;
    }
    selectedUserId = userId;
    selectedQuestId = questId;
    selectionPromise = continuity.selectUser(userId, questId);
    return selectionPromise;
  }

  void refresh();

  /** @param {boolean} classroom @param {string} [seed] */
  async function recordLatestTerminal(classroom, seed) {
    const record = loadRunRecords(deviceStorage).find(
      (candidate) => typeof seed === "string" && candidate.seed === seed
    );
    if (
      !record ||
      typeof record.questId !== "string" ||
      !Number.isInteger(record.labyrinthNumber) ||
      typeof record.atlasRegionId !== "string"
    ) {
      return null;
    }
    const labyrinthNumber = /** @type {number} */ (record.labyrinthNumber);
    const userId = playerController.getAuthenticatedUserId() ?? "";
    if (userId !== selectedUserId || record.questId !== selectedQuestId) {
      selectedUserId = userId;
      selectedQuestId = record.questId;
      selectionPromise = continuity.selectUser(userId, record.questId);
    }
    await selectionPromise;
    const marker = JSON.stringify([
      userId,
      record.questId,
      record.seed,
      record.outcome,
      record.labyrinthNumber,
      record.atlasRegionId,
      record.moves,
      record.elapsedMs
    ]);
    try {
      if (deviceStorage?.getItem(TERMINAL_MARKER_KEY) === marker) {
        return null;
      }
    } catch {
      // Storage denial should not block the local Fossil write.
    }
    try {
      const fossil = createTerminalFossil({
        playMode: classroom ? "classroom" : "personal",
        questId: record.questId,
        labyrinthNumber,
        atlasRegionId: record.atlasRegionId,
        outcome: record.outcome
      });
      if (fossil) {
        continuity.record(fossil);
        void continuity.queueBoundary();
      }
      try {
        deviceStorage?.setItem(TERMINAL_MARKER_KEY, marker);
      } catch {
        // Storage denial should not block the local Fossil write.
      }
      return fossil;
    } catch {
      atlasStatus = "unavailable";
      return null;
    }
  }

  return {
    getCollection: () => continuity.getCollection(),
    getStatus: () => atlasStatus,
    async getSnapshot() {
      await refresh();
      return {
        collection: continuity.getCollection(),
        status: atlasStatus
      };
    },
    refresh,
    recordLatestTerminal
  };
}
