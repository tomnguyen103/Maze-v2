const RUN_ID_PATTERN = /^[a-zA-Z0-9_-]{12,128}$/;

function defaultIdFactory() {
  if (globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

/** @param {() => string} [idFactory] */
export function createRunAccessId(idFactory = defaultIdFactory) {
  const runId = `access_${idFactory()}`.slice(0, 128);
  if (!RUN_ID_PATTERN.test(runId)) {
    throw new Error("Could not create a valid Run Access id.");
  }
  return runId;
}

/**
 * @param {{
 *   version: number,
 *   runId?: string,
 *   pending?: boolean,
 *   seed: string,
 *   levelId: string,
 *   labyrinthNumber: number
 * }} locator
 * @param {() => string} [idFactory]
 * @returns {{
 *   version: 2,
 *   runId: string,
 *   pending: boolean,
 *   seed: string,
 *   levelId: string,
 *   labyrinthNumber: number
 * }}
 */
export function withRunAccessId(locator, idFactory = defaultIdFactory) {
  const runId =
    typeof locator.runId === "string" && RUN_ID_PATTERN.test(locator.runId)
      ? locator.runId
      : createRunAccessId(idFactory);
  return {
    version: 2,
    runId,
    pending: locator.pending === true,
    seed: locator.seed,
    levelId: locator.levelId,
    labyrinthNumber: locator.labyrinthNumber
  };
}

/**
 * @param {{ seed: string, levelId: string, labyrinthNumber: number }} locator
 * @param {{ seed: string, levelId: string, labyrinthNumber: number }} run
 */
export function runLocatorMatches(locator, run) {
  return (
    locator.seed === run.seed &&
    locator.levelId === run.levelId &&
    locator.labyrinthNumber === run.labyrinthNumber
  );
}
