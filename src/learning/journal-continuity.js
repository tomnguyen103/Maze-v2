import {
  createLanternJournal,
  mergeLanternJournals,
  normalizeLanternJournal,
  recordLearningOutcome
} from "./lantern-journal.js";

const STORAGE_PREFIX = "echo-maze:lantern-journal";

/**
 * @param {{
 *   client: {
 *     getLearningJournal: () => Promise<{ journal: unknown, clearGeneration?: unknown }>,
 *     saveLearningJournal: (journal: unknown, clearGeneration: number) => Promise<{ journal: unknown, clearGeneration?: unknown }>,
 *     clearLearningJournal: () => Promise<{ journal?: unknown, clearGeneration?: unknown } | void>
 *   },
 *   storage?: Pick<Storage, "getItem" | "setItem" | "removeItem">,
 *   onChange?: (journal: ReturnType<typeof createLanternJournal>) => void,
 *   onStatus?: (message: string) => void
 * }} dependencies
 */
export function createJournalContinuity({
  client,
  storage,
  onChange = () => {},
  onStatus = () => {}
}) {
  const deviceStorage = resolveStorage(storage);
  let selectedUserId = "";
  let authEpoch = 0;
  let journal = createLanternJournal();
  let clearGeneration = 0;
  let devicePersistenceAvailable = true;
  const pendingClearUsers = new Set();
  /** @type {Promise<void>} */
  let idle = Promise.resolve();

  return {
    getJournal: () => journal,
    selectUser,
    record,
    clear,
    retry,
    whenIdle: () => idle
  };

  /** @param {string} userId */
  async function selectUser(userId) {
    const previousUserId = selectedUserId;
    const previousJournal = journal;
    selectedUserId = userId;
    authEpoch += 1;
    const epoch = authEpoch;
    const selectedKey = journalKey(userId);
    const selectedStored = readJournal(selectedKey);
    journal = selectedStored ?? createLanternJournal();
    clearGeneration = readGeneration(userId);

    let guest = null;
    if (userId && !selectedStored) {
      const storedGuest = readJournal(journalKey(""));
      guest =
        previousUserId === ""
          ? mergeLanternJournals(
              previousJournal,
              storedGuest ?? createLanternJournal()
            )
          : storedGuest;
    }
    emit();
    idle = queueCloudSync(epoch, userId);
    await idle;
    if (!isCurrent(epoch, userId) || !guest?.events.length) return;
    journal = mergeLanternJournals(journal, guest);
    if (
      writeJournal(selectedKey, journal) &&
      removeItem(journalKey(""))
    ) {
      onStatus("");
    } else {
      onStatus("Journal storage is unavailable on this device.");
    }
    emit();
    authEpoch += 1;
    idle = queueCloudSync(authEpoch, userId);
    await idle;
  }

  /**
   * @param {{
   *   id: string,
   *   topicId: string,
   *   learningObjectiveId: string,
   *   difficultyBand: string
   * }} question
   * @param {"correct" | "wrong" | "hint" | "skip"} outcome
   * @param {() => string} [createEventId]
   */
  function record(question, outcome, createEventId) {
    try {
      journal = recordLearningOutcome(
        journal,
        question,
        outcome,
        createEventId
      );
    } catch {
      onStatus("Journal could not record this outcome.");
      return journal;
    }
    if (!writeJournal(journalKey(selectedUserId), journal)) {
      onStatus("Journal storage is unavailable on this device.");
    }
    emit();
    authEpoch += 1;
    if (selectedUserId) {
      idle = queueCloudSync(authEpoch, selectedUserId);
    }
    return journal;
  }

  function clear() {
    journal = createLanternJournal();
    let stored = writeJournal(journalKey(selectedUserId), journal);
    authEpoch += 1;
    if (selectedUserId) {
      pendingClearUsers.add(selectedUserId);
      stored = setItem(clearKey(selectedUserId), "pending") && stored;
      idle = queueCloudSync(authEpoch, selectedUserId);
    }
    if (!stored) {
      onStatus("Journal storage is unavailable on this device.");
    }
    emit();
  }

  async function retry() {
    if (!selectedUserId) {
      return;
    }
    authEpoch += 1;
    idle = queueCloudSync(authEpoch, selectedUserId);
    await idle;
  }

  /** @param {number} epoch @param {string} userId */
  function queueCloudSync(epoch, userId) {
    return idle.then(
      () => syncCloud(epoch, userId),
      () => syncCloud(epoch, userId)
    );
  }

  /** @param {number} epoch @param {string} userId */
  async function syncCloud(epoch, userId) {
    if (!userId) {
      onStatus("");
      return;
    }
    if (!isCurrent(epoch, userId)) {
      return;
    }
    try {
      const pendingClear =
        pendingClearUsers.has(userId) ||
        getItem(clearKey(userId)) === "pending";
      if (pendingClear) {
        const cleared = await client.clearLearningJournal();
        if (!isCurrent(epoch, userId)) return;
        const clearedState = cloudState(cleared, clearGeneration + 1);
        clearGeneration = clearedState.clearGeneration;
        persistGeneration(userId);
        pendingClearUsers.delete(userId);
        removeItem(clearKey(userId));
        if (journal.events.length === 0) {
          onStatus("");
          return;
        }
        const saved = await client.saveLearningJournal(
          journal,
          clearGeneration
        );
        if (!isCurrent(epoch, userId)) return;
        adoptCloudResult(saved, userId);
        onStatus("");
        return;
      }

      const cloud = await client.getLearningJournal();
      if (!isCurrent(epoch, userId)) return;
      const cloudResult = cloudState(cloud, 0);
      const cloudJournal = cloudResult.journal;
      if (cloudResult.clearGeneration > clearGeneration) {
        clearGeneration = cloudResult.clearGeneration;
        journal = cloudJournal;
        persistState(userId);
        emit();
        onStatus("");
        return;
      }
      if (cloudResult.clearGeneration < clearGeneration) {
        throw new Error("Cloud Journal clear generation moved backwards.");
      }
      const merged = mergeLanternJournals(journal, cloudJournal);
      journal = merged;
      writeJournal(journalKey(userId), journal);
      emit();
      if (JSON.stringify(merged) !== JSON.stringify(cloudJournal)) {
        const saved = await client.saveLearningJournal(
          merged,
          clearGeneration
        );
        if (!isCurrent(epoch, userId)) return;
        adoptCloudResult(saved, userId);
      }
      onStatus("");
    } catch {
      if (isCurrent(epoch, userId)) {
        onStatus(
          devicePersistenceAvailable
            ? "Journal saved on this device. Cloud sync will retry."
            : "Journal is kept in this tab. Keep it open while cloud sync retries."
        );
      }
    }
  }

  /** @param {unknown} value @param {string} userId */
  function adoptCloudResult(value, userId) {
    const state = cloudState(value, clearGeneration);
    journal = state.journal;
    clearGeneration = state.clearGeneration;
    if (!persistState(userId)) {
      onStatus("Journal storage is unavailable on this device.");
    }
    emit();
  }

  /** @param {number} epoch @param {string} userId */
  function isCurrent(epoch, userId) {
    return epoch === authEpoch && userId === selectedUserId;
  }

  /** @param {string} key */
  function readJournal(key) {
    try {
      const raw = deviceStorage.getItem(key);
      if (!raw) return null;
      return normalizeLanternJournal(JSON.parse(raw));
    } catch {
      return null;
    }
  }

  /** @param {string} key @param {unknown} value */
  function writeJournal(key, value) {
    return setItem(key, JSON.stringify(value));
  }

  /** @param {string} userId */
  function readGeneration(userId) {
    if (!userId) return 0;
    const value = Number(getItem(generationKey(userId)));
    return Number.isSafeInteger(value) && value >= 0 ? value : 0;
  }

  /** @param {string} userId */
  function persistGeneration(userId) {
    return !userId ||
      setItem(generationKey(userId), String(clearGeneration));
  }

  /** @param {string} userId */
  function persistState(userId) {
    return (
      writeJournal(journalKey(userId), journal) &&
      persistGeneration(userId)
    );
  }

  /** @param {string} key */
  function getItem(key) {
    try {
      return deviceStorage.getItem(key);
    } catch {
      devicePersistenceAvailable = false;
      return null;
    }
  }

  /** @param {string} key @param {string} value */
  function setItem(key, value) {
    try {
      deviceStorage.setItem(key, value);
      return true;
    } catch {
      devicePersistenceAvailable = false;
      return false;
    }
  }

  /** @param {string} key */
  function removeItem(key) {
    try {
      deviceStorage.removeItem(key);
      return true;
    } catch {
      devicePersistenceAvailable = false;
      return false;
    }
  }

  function emit() {
    onChange(journal);
  }
}

/**
 * @param {Pick<Storage, "getItem" | "setItem" | "removeItem"> | undefined} storage
 */
function resolveStorage(storage) {
  if (storage) return storage;
  try {
    const browserStorage = globalThis.localStorage;
    if (browserStorage) return browserStorage;
  } catch {
    // Fall through to the unavailable adapter.
  }
  return {
    getItem: () => null,
    setItem: () => {
      throw new Error("Device storage is unavailable.");
    },
    removeItem: () => {}
  };
}

/** @param {string} userId */
function journalKey(userId) {
  return userId
    ? `${STORAGE_PREFIX}:account:${userId}`
    : `${STORAGE_PREFIX}:guest`;
}

/** @param {string} userId */
function clearKey(userId) {
  return `${journalKey(userId)}:clear`;
}

/** @param {string} userId */
function generationKey(userId) {
  return `${journalKey(userId)}:clear-generation`;
}

/** @param {unknown} value @param {number} fallbackGeneration */
function cloudState(value, fallbackGeneration) {
  const state =
    value && typeof value === "object" && !Array.isArray(value)
      ? /** @type {Record<string, unknown>} */ (value)
      : {};
  const normalized = normalizeLanternJournal(state.journal);
  const generation = Number(state.clearGeneration);
  return {
    journal: normalized ?? createLanternJournal(),
    clearGeneration:
      Number.isSafeInteger(generation) && generation >= 0
        ? generation
        : fallbackGeneration
  };
}
