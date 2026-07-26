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
  storage = localStorage,
  onChange = () => {},
  onStatus = () => {}
}) {
  let selectedUserId = "";
  let authEpoch = 0;
  let journal = createLanternJournal();
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
    selectedUserId = userId;
    authEpoch += 1;
    const epoch = authEpoch;
    const selectedKey = journalKey(userId);
    const selectedStored = readJournal(selectedKey);
    journal = selectedStored ?? createLanternJournal();

    if (userId && !selectedStored) {
      const guest = readJournal(journalKey(""));
      if (guest?.events.length) {
        journal = mergeLanternJournals(journal, guest);
        writeJournal(selectedKey, journal);
        storage.removeItem(journalKey(""));
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
    writeJournal(journalKey(selectedUserId), journal);
    emit();
    authEpoch += 1;
    if (selectedUserId) {
      idle = queueCloudSync(authEpoch, selectedUserId);
    }
    return journal;
  }

  function clear() {
    journal = createLanternJournal();
    writeJournal(journalKey(selectedUserId), journal);
    authEpoch += 1;
    if (selectedUserId) {
      storage.setItem(clearKey(selectedUserId), "pending");
      idle = queueCloudSync(authEpoch, selectedUserId);
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
      const pendingClear = storage.getItem(clearKey(userId)) === "pending";
      if (pendingClear) {
        await client.clearLearningJournal();
        if (!isCurrent(epoch, userId)) return;
        storage.removeItem(clearKey(userId));
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
    writeJournal(journalKey(userId), journal);
    emit();
  }

  /** @param {number} epoch @param {string} userId */
  function isCurrent(epoch, userId) {
    return epoch === authEpoch && userId === selectedUserId;
  }

  /** @param {string} key */
  function readJournal(key) {
    const raw = storage.getItem(key);
    if (!raw) return null;
    try {
      return normalizeLanternJournal(JSON.parse(raw));
    } catch {
      return null;
    }
  }

  /** @param {string} key @param {unknown} value */
  function writeJournal(key, value) {
    storage.setItem(key, JSON.stringify(value));
  }

  function emit() {
    onChange(journal);
  }
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
