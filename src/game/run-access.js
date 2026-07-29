import { normalizeRunRuleset } from "./run-ruleset.js";

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
 *   labyrinthNumber: number,
 *   atlasRegionId?: string,
 *   rulesetRevision?: string
 * }} locator
 * @param {() => string} [idFactory]
 * @returns {{
 *   version: 3,
 *   runId: string,
 *   pending: boolean,
 *   seed: string,
 *   levelId: string,
 *   labyrinthNumber: number,
 *   atlasRegionId: string,
 *   rulesetRevision: string
 * }}
 */
export function withRunAccessId(locator, idFactory = defaultIdFactory) {
  const runId =
    typeof locator.runId === "string" && RUN_ID_PATTERN.test(locator.runId)
      ? locator.runId
      : createRunAccessId(idFactory);
  const hasRulesetIdentity =
    locator.atlasRegionId !== undefined ||
    locator.rulesetRevision !== undefined;
  const ruleset = normalizeRunRuleset(
    hasRulesetIdentity
      ? {
          atlasRegionId: locator.atlasRegionId,
          revision: locator.rulesetRevision
        }
      : undefined,
    locator.labyrinthNumber
  );
  if (!ruleset) {
    throw new Error("Run ruleset identity is invalid.");
  }
  return {
    version: 3,
    runId,
    pending: locator.pending === true,
    seed: locator.seed,
    levelId: locator.levelId,
    labyrinthNumber: locator.labyrinthNumber,
    atlasRegionId: ruleset.atlasRegionId,
    rulesetRevision: ruleset.revision
  };
}

/**
 * @param {{ version?: number, runId?: string, pending?: boolean } | null} active
 * @param {{ runId?: string }} candidate
 */
export function isAdmittedRunResume(active, candidate) {
  return Boolean(
    (active?.version === 2 || active?.version === 3) &&
    active.pending === false &&
    active.runId === candidate.runId
  );
}

/**
 * @param {{ seed: string, levelId: string, labyrinthNumber: number, atlasRegionId?: string, rulesetRevision?: string }} locator
 * @param {{ seed: string, levelId: string, labyrinthNumber: number, atlasRegionId?: string, rulesetRevision?: string }} run
 */
export function runLocatorMatches(locator, run) {
  const locatorRuleset = normalizeRunRuleset(
    locator.atlasRegionId !== undefined ||
      locator.rulesetRevision !== undefined
      ? {
          atlasRegionId: locator.atlasRegionId,
          revision: locator.rulesetRevision
        }
      : undefined,
    locator.labyrinthNumber
  );
  const runRuleset = normalizeRunRuleset(
    run.atlasRegionId !== undefined ||
      run.rulesetRevision !== undefined
      ? {
          atlasRegionId: run.atlasRegionId,
          revision: run.rulesetRevision
        }
      : undefined,
    run.labyrinthNumber
  );
  return (
    locatorRuleset !== null &&
    runRuleset !== null &&
    locator.seed === run.seed &&
    locator.levelId === run.levelId &&
    locator.labyrinthNumber === run.labyrinthNumber &&
    locatorRuleset.atlasRegionId === runRuleset.atlasRegionId &&
    locatorRuleset.revision === runRuleset.revision
  );
}
