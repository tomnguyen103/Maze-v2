/** @typedef {{ collection?: unknown, status?: "ready" | "syncing" | "unavailable" }} FossilAtlasSnapshot */

/** @type {(() => Promise<FossilAtlasSnapshot | undefined>) | null} */
let snapshotReader = null;

/** @param {() => Promise<FossilAtlasSnapshot | undefined>} reader */
export function setFossilSnapshotReader(reader) {
  snapshotReader = reader;
}

/** @returns {Promise<FossilAtlasSnapshot | undefined>} */
export function getFossilSnapshot() {
  return snapshotReader?.() ?? Promise.resolve(undefined);
}
