import {
  isSameQuestIdentity,
  mergeSameQuestProgress,
  reconcileQuestProgress
} from "../game/quest-continuity.js";
import { setFossilSnapshotReader } from "../game/fossil-atlas-state.js";
import { normalizeQuestProgress } from "../game/quest-progress.js";

const PENDING_KEY = "echo-maze:quest-sync-pending:v1";
const LOCAL_CHOICE_KEY = "echo-maze:quest-sync-local-choice:v1";
const STALE_SYNC = Symbol("stale-sync");

/** @typedef {NonNullable<ReturnType<typeof normalizeQuestProgress>>} QuestProgress */
/** @typedef {{ progress: QuestProgress, revision: number, updatedAt: string }} CloudQuest */
/** @typedef {{ getItem: (key: string) => string | null, setItem: (key: string, value: string) => void, removeItem: (key: string) => void }} QuestStorage */

/**
 * @param {{
 *   loadCloud: () => Promise<{ record: CloudQuest | null }>,
 *   saveCloud: (progress: QuestProgress, expectedRevision: number) => Promise<{ record: CloudQuest, duplicate?: boolean }>,
 *   storage?: QuestStorage,
 *   onConflict?: (conflict: { local: QuestProgress, cloud: CloudQuest }) => void,
 *   onProgress?: (progress: QuestProgress, source: "cloud" | "merged") => void,
 *   onStatus?: (status: "local" | "syncing" | "saved" | "offline" | "conflict") => void,
 *   fossils?: Parameters<typeof import("../game/fossil-runtime.js").createFossilRuntime>[0]["playerController"]
 * }} dependencies
 */
export function createQuestContinuityController({
  loadCloud,
  saveCloud,
  storage = globalThis.localStorage,
  onConflict = () => {},
  onProgress = () => {},
  onStatus = () => {},
  fossils
}) {
  /** @type {string | null} */
  let authenticatedUserId = null;
  let authEpoch = 0;
  let accountDeleted = false;
  /** @type {{ local: QuestProgress, cloud: CloudQuest } | null} */
  let conflict = null;
  let syncChain = Promise.resolve(false);
  const fossilRuntime = fossils
    ? import("../game/fossil-runtime.js").then(({ createFossilRuntime }) =>
        createFossilRuntime({
          playerController: fossils
        })
      )
        .catch(() => null)
    : Promise.resolve(null);
  setFossilSnapshotReader(() =>
    fossilRuntime.then((runtime) => runtime?.getSnapshot())
  );

  return {
    getSnapshot: () => fossilRuntime.then(
      (runtime) => runtime?.getSnapshot()
    ),
    /** @param {string | null} nextUserId */
    setAuthenticated(nextUserId) {
      const normalizedUserId =
        typeof nextUserId === "string" && nextUserId ? nextUserId : null;
      if (normalizedUserId === authenticatedUserId) {
        return;
      }
      authenticatedUserId = normalizedUserId;
      authEpoch += 1;
      accountDeleted = false;
      conflict = null;
      onStatus("local");
    },
    /**
     * @param {QuestProgress} progress
     * @param {boolean} classroom
     * @param {boolean} sync
     * @param {string} seed
     */
    async queueTerminal(progress, classroom, sync, seed) {
      await fossilRuntime.then((runtime) =>
        runtime?.recordLatestTerminal(classroom, seed)
      ).catch(() => null);
      if (!sync) {
        onStatus("local");
        return false;
      }
      return this.queueBoundary(progress);
    },
    /** @param {QuestProgress} progress */
    queueBoundary(progress) {
      if (accountDeleted) {
        clearPending(storage);
        clearLocalChoice(storage);
        onStatus("local");
        return Promise.resolve(false);
      }
      savePending(progress, storage);
      return enqueue(progress);
    },
    /** @param {QuestProgress | null} fallbackProgress */
    retry(fallbackProgress) {
      return enqueue(loadPending(storage) ?? fallbackProgress);
    },
    /** @param {"local" | "cloud"} choice */
    async resolveConflict(choice) {
      if (!conflict || (choice !== "local" && choice !== "cloud")) {
        return false;
      }
      const selectedConflict = conflict;
      conflict = null;
      const session = currentSession();
      if (choice === "cloud") {
        clearPending(storage);
        clearLocalChoice(storage);
        try {
          onProgress(selectedConflict.cloud.progress, "cloud");
        } catch (error) {
          // Keep the conflict open so the Explorer can still choose their
          // device Quest instead of being left with a dead dialog.
          conflict = selectedConflict;
          throw error;
        }
        onStatus("saved");
        return true;
      }
      saveLocalChoice(
        selectedConflict.local,
        selectedConflict.cloud.progress.questId,
        session.userId,
        storage
      );
      onStatus("syncing");
      try {
        const saved = await saveWithOneConflictRetry(
          selectedConflict.local,
          selectedConflict.cloud.revision,
          session,
          selectedConflict.cloud.progress.questId
        );
        if (saved === STALE_SYNC) {
          return true;
        }
        if (!saved) {
          return false;
        }
        clearPending(storage);
        clearLocalChoice(storage);
        onProgress(saved.progress, "merged");
        onStatus("saved");
        return true;
      } catch (error) {
        if (handleDeletedAccount(error, session)) {
          return true;
        }
        if (isCurrentSession(session)) {
          onStatus("offline");
        }
        return true;
      }
    }
  };

  /** @param {QuestProgress | null} fallbackProgress */
  function enqueue(fallbackProgress) {
    syncChain = syncChain
      .catch(() => false)
      .then(() => synchronize(loadPending(storage) ?? fallbackProgress));
    return syncChain;
  }

  /** @param {QuestProgress | null} progress */
  async function synchronize(progress) {
    const session = currentSession();
    if (!session.userId) {
      onStatus("local");
      return false;
    }
    if (accountDeleted) {
      onStatus("local");
      return false;
    }
    onStatus("syncing");
    try {
      const result = await loadCloud();
      if (!isCurrentSession(session)) {
        return false;
      }
      const storedLocalChoice = loadLocalChoice(storage);
      const selectedLocal =
        storedLocalChoice?.userId === session.userId
          ? storedLocalChoice
          : null;
      if (storedLocalChoice && !selectedLocal) {
        clearLocalChoice(storage);
      }
      if (selectedLocal) {
        progress = selectedLocal.progress;
        const cloud = result.record ?? null;
        if (
          !cloud ||
          cloud.progress.questId === selectedLocal.replacedQuestId
        ) {
          const saved = await saveWithOneConflictRetry(
            selectedLocal.progress,
            cloud?.revision ?? 0,
            session,
            selectedLocal.replacedQuestId
          );
          if (saved === STALE_SYNC) {
            return false;
          }
          if (!saved) {
            return false;
          }
          clearPending(storage);
          clearLocalChoice(storage);
          onProgress(saved.progress, "merged");
          onStatus("saved");
          return true;
        }
        if (cloud.progress.questId !== selectedLocal.progress.questId) {
          clearLocalChoice(storage);
          conflict = { local: selectedLocal.progress, cloud };
          onConflict(conflict);
          onStatus("conflict");
          return false;
        }
      }
      const decision = reconcileQuestProgress(progress, result.record ?? null);
      if (decision.kind === "conflict") {
        clearLocalChoice(storage);
        conflict = { local: decision.local, cloud: decision.cloud };
        onConflict(conflict);
        onStatus("conflict");
        return false;
      }
      if (decision.kind === "restore-cloud") {
        clearPending(storage);
        clearLocalChoice(storage);
        onProgress(decision.progress, "cloud");
        onStatus("saved");
        return true;
      }
      if (decision.kind === "cloud-current") {
        clearPending(storage);
        clearLocalChoice(storage);
        onProgress(decision.progress, "merged");
        onStatus("saved");
        return true;
      }
      if (
        decision.kind === "upload-local" ||
        decision.kind === "merge-and-upload"
      ) {
        const saved = await saveWithOneConflictRetry(
          decision.progress,
          decision.expectedRevision,
          session
        );
        if (saved === STALE_SYNC) {
          return false;
        }
        if (!saved) {
          return false;
        }
        clearPending(storage);
        clearLocalChoice(storage);
        if (decision.kind === "merge-and-upload") {
          onProgress(saved.progress, "merged");
        }
        onStatus("saved");
        return true;
      }
      onStatus("saved");
      return true;
    } catch (error) {
      if (handleDeletedAccount(error, session)) {
        return false;
      }
      if (isCurrentSession(session)) {
        onStatus("offline");
      }
      return false;
    }
  }

  /**
   * @param {QuestProgress} progress
   * @param {number} expectedRevision
   * @param {{ userId: string | null, epoch: number }} session
   * @param {string | null} [replacedQuestId]
   */
  async function saveWithOneConflictRetry(
    progress,
    expectedRevision,
    session,
    replacedQuestId = null
  ) {
    try {
      const saved = await saveCloud(progress, expectedRevision);
      if (!isCurrentSession(session)) {
        return STALE_SYNC;
      }
      return saved.record;
    } catch (error) {
      if (
        !error ||
        typeof error !== "object" ||
        !("status" in error) ||
        error.status !== 409
      ) {
        throw error;
      }
      const latest = (await loadCloud()).record;
      if (!isCurrentSession(session)) {
        return STALE_SYNC;
      }
      if (!latest) {
        throw error;
      }
      if (latest.progress.questId !== progress.questId) {
        if (latest.progress.questId === replacedQuestId) {
          const replaced = await saveCloud(progress, latest.revision);
          if (!isCurrentSession(session)) {
            return STALE_SYNC;
          }
          return replaced.record;
        }
        clearLocalChoice(storage);
        conflict = { local: progress, cloud: latest };
        onConflict(conflict);
        onStatus("conflict");
        return null;
      }
      if (!isSameQuestIdentity(progress, latest.progress)) {
        // Same Quest ID, different Quest Level or Learning Deck revision: the
        // merge cannot decide this, so the Explorer chooses.
        clearLocalChoice(storage);
        conflict = { local: progress, cloud: latest };
        onConflict(conflict);
        onStatus("conflict");
        return null;
      }
      const merged = mergeSameQuestProgress(progress, latest.progress);
      const saved = await saveCloud(merged, latest.revision);
      if (!isCurrentSession(session)) {
        return STALE_SYNC;
      }
      return saved.record;
    }
  }

  function currentSession() {
    return { userId: authenticatedUserId, epoch: authEpoch };
  }

  /**
   * @param {unknown} error
   * @param {{ userId: string | null, epoch: number }} session
   */
  function handleDeletedAccount(error, session) {
    if (!isDeletedAccountError(error) || !isCurrentSession(session)) {
      return false;
    }
    accountDeleted = true;
    conflict = null;
    clearPending(storage);
    clearLocalChoice(storage);
    onStatus("local");
    return true;
  }

  /** @param {{ userId: string | null, epoch: number }} session */
  function isCurrentSession(session) {
    return (
      session.userId !== null &&
      session.userId === authenticatedUserId &&
      session.epoch === authEpoch
    );
  }
}

/** @param {unknown} error */
function isDeletedAccountError(error) {
  return Boolean(
    error &&
    typeof error === "object" &&
    "status" in error &&
    error.status === 410
  );
}

/** @param {QuestStorage} storage */
function loadPending(storage) {
  try {
    return normalizeQuestProgress(
      JSON.parse(storage?.getItem(PENDING_KEY) ?? "null")
    );
  } catch {
    return null;
  }
}

/** @param {QuestProgress} progress @param {QuestStorage} storage */
function savePending(progress, storage) {
  try {
    storage?.setItem(PENDING_KEY, JSON.stringify(progress));
  } catch {
    return;
  }
}

/** @param {QuestStorage} storage */
function clearPending(storage) {
  try {
    storage?.removeItem(PENDING_KEY);
  } catch {
    return;
  }
}

/** @param {QuestStorage} storage */
function loadLocalChoice(storage) {
  try {
    const value = JSON.parse(storage?.getItem(LOCAL_CHOICE_KEY) ?? "null");
    const progress = normalizeQuestProgress(value?.progress);
    if (
      !progress ||
      typeof value?.replacedQuestId !== "string" ||
      !value.replacedQuestId ||
      typeof value?.userId !== "string" ||
      !value.userId
    ) {
      return null;
    }
    return {
      progress,
      replacedQuestId: value.replacedQuestId,
      userId: value.userId
    };
  } catch {
    return null;
  }
}

/**
 * @param {QuestProgress} progress
 * @param {string} replacedQuestId
 * @param {string | null} userId
 * @param {QuestStorage} storage
 */
function saveLocalChoice(progress, replacedQuestId, userId, storage) {
  if (!userId) {
    return;
  }
  try {
    storage?.setItem(
      LOCAL_CHOICE_KEY,
      JSON.stringify({ progress, replacedQuestId, userId })
    );
  } catch {
    return;
  }
}

/** @param {QuestStorage} storage */
function clearLocalChoice(storage) {
  try {
    storage?.removeItem(LOCAL_CHOICE_KEY);
  } catch {
    return;
  }
}
