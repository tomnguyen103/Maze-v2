import { normalizeRunRuleset } from "./run-ruleset.js";
import { uniqueId } from "./unique-id.js";
import { questIdentityMatches } from "../../shared/quest-identity.js";

const RUN_ID_PATTERN = /^[a-zA-Z0-9_-]{12,128}$/;
const QUEST_ID_PATTERN = /^(?:quest|legacy)_[A-Za-z0-9_-]{7,92}$/;

/** @param {() => string} [idFactory] */
export function createRunAccessId(idFactory = uniqueId) {
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
 *   rulesetRevision?: string,
 *   questId?: string
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
 *   rulesetRevision: string,
 *   questId?: string
 * }}
 */
export function withRunAccessId(locator, idFactory = uniqueId) {
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
    rulesetRevision: ruleset.revision,
    ...(typeof locator.questId === "string" && QUEST_ID_PATTERN.test(locator.questId)
      ? { questId: locator.questId }
      : {})
  };
}

/**
 * @param {{ version?: number, runId?: string, pending?: boolean, questId?: string } | null} active
 * @param {{ runId?: string, questId?: string }} candidate
 */
export function isAdmittedRunResume(active, candidate) {
  return Boolean(
    (active?.version === 2 || active?.version === 3) &&
    active.pending === false &&
    active.runId === candidate.runId &&
    questIdentityMatches(active.questId, candidate.questId)
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
