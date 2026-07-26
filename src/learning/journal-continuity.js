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
 *     getLearningJournal: () => Promise<{ journal: unknown }>,
 *     saveLearningJournal: (journal: unknown) => Promise<{ journal: unknown }>,
 *     clearLearningJournal: () => Promise<unknown>
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

    if (userId && !selectedStored) {
      const storedGuest = readJournal(journalKey(""));
      const guest =
        previousUserId === ""
          ? mergeLanternJournals(
              previousJournal,
              storedGuest ?? createLanternJournal()
            )
          : storedGuest;
      if (guest?.events.length) {
        journal = mergeLanternJournals(journal, guest);
        if (
          writeJournal(selectedKey, journal) &&
          removeItem(journalKey(""))
        ) {
          onStatus("");
        } else {
          onStatus("Journal storage is unavailable on this device.");
        }
      }
    }
    emit();
    idle = queueCloudSync(epoch, userId);
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
    journal = recordLearningOutcome(journal, question, outcome, createEventId);
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
        await client.clearLearningJournal();
        if (!isCurrent(epoch, userId)) return;
        pendingClearUsers.delete(userId);
        removeItem(clearKey(userId));
        if (journal.events.length === 0) {
          onStatus("");
          return;
        }
        const saved = await client.saveLearningJournal(journal);
        if (!isCurrent(epoch, userId)) return;
        adoptCloudResult(saved.journal, userId);
        onStatus("");
        return;
      }

      const cloud = await client.getLearningJournal();
      if (!isCurrent(epoch, userId)) return;
      const cloudJournal =
        normalizeLanternJournal(cloud.journal) ?? createLanternJournal();
      const merged = mergeLanternJournals(journal, cloudJournal);
      journal = merged;
      writeJournal(journalKey(userId), journal);
      emit();
      if (JSON.stringify(merged) !== JSON.stringify(cloudJournal)) {
        const saved = await client.saveLearningJournal(merged);
        if (!isCurrent(epoch, userId)) return;
        adoptCloudResult(saved.journal, userId);
      }
      onStatus("");
    } catch {
      if (isCurrent(epoch, userId)) {
        onStatus("Journal saved on this device. Cloud sync will retry.");
      }
    }
  }

  /** @param {unknown} value @param {string} userId */
  function adoptCloudResult(value, userId) {
    const normalized = normalizeLanternJournal(value);
    if (!normalized) return;
    journal = normalized;
    if (!writeJournal(journalKey(userId), journal)) {
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

  /** @param {string} key */
  function getItem(key) {
    try {
      return deviceStorage.getItem(key);
    } catch {
      return null;
    }
  }

  /** @param {string} key @param {string} value */
  function setItem(key, value) {
    try {
      deviceStorage.setItem(key, value);
      return true;
    } catch {
      return false;
    }
  }

  /** @param {string} key */
  function removeItem(key) {
    try {
      deviceStorage.removeItem(key);
      return true;
    } catch {
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
