import {
  addEchoFossil,
  createFossilCollection,
  mergeEchoFossilCollections,
  normalizeFossilCollection
} from "./quest-fossils.js";

const STORAGE_PREFIX = "echo-maze:echo-fossils";
const QUEST_ID_PATTERN = /^quest_[a-z0-9_-]{7,92}$/i;

/**
 * @param {{
 *   client: {
 *     getFossils: (questId: string) => Promise<{ collection: unknown }>,
 *     saveFossils: (collection: unknown) => Promise<{ collection: unknown }>
 *   },
 *   storage?: Pick<Storage, "getItem" | "setItem" | "removeItem">,
 *   onChange?: (collection: ReturnType<typeof createFossilCollection>) => void,
 *   onStatus?: (status: "local" | "syncing" | "saved" | "offline" | "unavailable") => void
 * }} dependencies
 */
export function createFossilContinuity({
  client,
  storage,
  onChange = () => {},
  onStatus = () => {}
}) {
  const deviceStorage = resolveStorage(storage);
  let selectedUserId = "";
  let selectedQuestId = "";
  /** @type {import("./quest-fossils.js").FossilCollection | null} */
  let collection = null;
  let accountDeleted = false;
  let authEpoch = 0;
  /** @type {Promise<boolean>} */
  let idle = Promise.resolve(false);

  return {
    getCollection: () => collection ?? emptyCollection(selectedQuestId),
    selectUser,
    setQuest,
    record,
    queueBoundary,
    retry,
    whenIdle: () => idle
  };

  /** @param {string} userId @param {string} questId */
  async function selectUser(userId, questId) {
    const normalizedUserId = typeof userId === "string" ? userId : "";
    const normalizedQuestId = validQuestId(questId) ? questId : "";
    selectedUserId = normalizedUserId;
    selectedQuestId = normalizedQuestId;
    accountDeleted = false;
    authEpoch += 1;
    const epoch = authEpoch;
    const localKey = fossilKey(normalizedUserId, normalizedQuestId);
    const storedLocal = readCollection(localKey);
    collection = storedLocal ?? emptyCollection(normalizedQuestId);
    onChange(collection);
    onStatus(normalizedUserId ? "syncing" : "local");

    let guest = null;
    if (normalizedUserId && !storedLocal) {
      guest = readCollection(fossilKey("", normalizedQuestId));
    }

    if (!normalizedUserId || !normalizedQuestId) {
      return collection;
    }
    try {
      const remote = await client.getFossils(normalizedQuestId);
      if (!isCurrent(epoch, normalizedUserId, normalizedQuestId)) {
        return collection;
      }
      const cloud = normalizeFossilCollection(remote?.collection) ??
        emptyCollection(normalizedQuestId);
      const localAndGuest = guest
        ? mergeEchoFossilCollections(collection, guest)
        : collection;
      collection = mergeEchoFossilCollections(localAndGuest, cloud);
      const persisted = writeCollection(localKey, collection);
      if (guest && persisted) {
        removeItem(fossilKey("", normalizedQuestId));
      }
      onChange(collection);
      onStatus(persisted ? "saved" : "unavailable");
    } catch {
      if (isCurrent(epoch, normalizedUserId, normalizedQuestId)) {
        onStatus("offline");
      }
    }
    return collection;
  }

  /** @param {string} questId */
  function setQuest(questId) {
    if (!validQuestId(questId) || questId === selectedQuestId) {
      return Promise.resolve(collection ?? emptyCollection(selectedQuestId));
    }
    return selectUser(selectedUserId, questId);
  }

  /** @param {import("./quest-fossils.js").EchoFossil} fossil */
  function record(fossil) {
    if (!collection) {
      return null;
    }
    try {
      collection = addEchoFossil(collection, fossil);
    } catch {
      onStatus("unavailable");
      return collection;
    }
    const persisted = writeCollection(
      fossilKey(selectedUserId, selectedQuestId),
      collection
    );
    onChange(collection);
    if (!persisted) {
      onStatus("unavailable");
    }
    return collection;
  }

  function queueBoundary() {
    idle = idle
      .catch(() => false)
      .then(() => syncBoundary());
    return idle;
  }

  function retry() {
    return queueBoundary();
  }

  async function syncBoundary() {
    if (
      !selectedUserId ||
      !selectedQuestId ||
      !collection ||
      accountDeleted
    ) {
      onStatus("local");
      return false;
    }
    const session = {
      userId: selectedUserId,
      questId: selectedQuestId,
      epoch: authEpoch
    };
    onStatus("syncing");
    try {
      const result = await client.saveFossils(collection);
      if (!isCurrent(session.epoch, session.userId, session.questId)) {
        return false;
      }
      const remote = normalizeFossilCollection(result?.collection);
      if (!remote || remote.questId !== session.questId) {
        throw new Error("Fossil service returned an invalid collection.");
      }
      collection = mergeEchoFossilCollections(collection, remote);
      const persisted = writeCollection(
        fossilKey(session.userId, session.questId),
        collection
      );
      onChange(collection);
      onStatus(persisted ? "saved" : "unavailable");
      return persisted;
    } catch (error) {
      if (isDeletedAccountError(error) && isCurrent(
        session.epoch,
        session.userId,
        session.questId
      )) {
        accountDeleted = true;
        onStatus("local");
        return false;
      }
      if (isCurrent(session.epoch, session.userId, session.questId)) {
        onStatus("offline");
      }
      return false;
    }
  }

  /** @param {number} epoch @param {string} userId @param {string} questId */
  function isCurrent(epoch, userId, questId) {
    return (
      epoch === authEpoch &&
      userId === selectedUserId &&
      questId === selectedQuestId
    );
  }

  /** @param {string} key */
  function readCollection(key) {
    try {
      return normalizeFossilCollection(
        JSON.parse(deviceStorage.getItem(key) ?? "null")
      );
    } catch {
      return null;
    }
  }

  /** @param {string} key @param {unknown} value */
  function writeCollection(key, value) {
    try {
      deviceStorage.setItem(key, JSON.stringify(value));
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
}

/** @param {string} questId @returns {import("./quest-fossils.js").FossilCollection} */
function emptyCollection(questId) {
  return validQuestId(questId)
    ? createFossilCollection(questId)
    : createFossilCollection("quest_unselected_000");
}

/** @param {string} userId @param {string} questId */
function fossilKey(userId, questId) {
  const encodedQuestId = encodeURIComponent(questId);
  return userId
    ? `${STORAGE_PREFIX}:account:${encodeURIComponent(userId)}:${encodedQuestId}:v1`
    : `${STORAGE_PREFIX}:guest:${encodedQuestId}:v1`;
}

/** @param {string} value */
function validQuestId(value) {
  return typeof value === "string" && QUEST_ID_PATTERN.test(value);
}

/** @param {Pick<Storage, "getItem" | "setItem" | "removeItem"> | undefined} storage */
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

/** @param {unknown} error */
function isDeletedAccountError(error) {
  return Boolean(
    error &&
    typeof error === "object" &&
    "status" in error &&
    error.status === 410
  );
}
