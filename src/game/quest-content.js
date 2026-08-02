/**
 * Quest content identity and authored Living Regions content. This module is
 * deliberately independent from the maze engine: a content pack can describe
 * player-facing copy and reviewed Question selection without changing Run
 * simulation or ruleset identity.
 */

export const QUEST_I_CONTENT_PACK_ID = "quest-i";
export const QUEST_II_CONTENT_PACK_ID = "quest-ii";
export const QUEST_CONTENT_PACK_IDS = Object.freeze([
  QUEST_I_CONTENT_PACK_ID,
  QUEST_II_CONTENT_PACK_ID
]);

export const QUEST_II_PACING_BEATS = Object.freeze([
  "arrival",
  "variation",
  "escalation",
  "gate"
]);

/** @typedef {typeof QUEST_II_PACING_BEATS[number]} QuestIIPacingBeat */

/** @typedef {{
 *   id: string,
 *   regionId: string,
 *   labyrinthNumber: number,
 *   beat: QuestIIPacingBeat,
 *   title: string,
 *   body: string,
 *   gameplayTie: string,
 *   eventKind: "region-arrival" | "twist-observed" | "twist-used" | "gate-warden"
 * }} QuestIIStorylet */

/** @typedef {{
 *   id: string,
 *   name: string,
 *   motif: string,
 *   trailTwistRevision: string,
 *   learningMove: string,
 *   labyrinthNumbers: readonly number[],
 *   storylets: readonly QuestIIStorylet[]
 * }} QuestIIRegion */

/** @type {Record<string, readonly Omit<QuestIIStorylet, "id" | "regionId" | "labyrinthNumber">[]>} */
const REGION_STORYLETS = Object.freeze({
  foundation: Object.freeze([
    Object.freeze({
      beat: "arrival",
      title: "A softer footfall",
      body: "Hushline Orchard keeps the first Echo close. Notice what changes when an Echo quiets the ordinary Warden's next step.",
      gameplayTie: "echo-hush-v1:region-arrival",
      eventKind: "region-arrival"
    }),
    Object.freeze({
      beat: "variation",
      title: "Quiet between lanterns",
      body: "The orchard leaves a safe pause after an Echo. Use that pause to read the next passage before the Warden moves again.",
      gameplayTie: "echo-hush-v1:echo-collected",
      eventKind: "twist-observed"
    }),
    Object.freeze({
      beat: "escalation",
      title: "A deliberate hush",
      body: "The paths narrow near the old press. Collecting an Echo can buy one careful action, but the Warden returns to its rhythm after it.",
      gameplayTie: "echo-hush-v1:echo-collected",
      eventKind: "twist-used"
    }),
    Object.freeze({
      beat: "gate",
      title: "The orchard answers",
      body: "The Gate Warden keeps the final lantern. Bring your quiet-step plan to the question, then carry the lesson onward.",
      gameplayTie: "echo-hush-v1:gate-warden",
      eventKind: "gate-warden"
    })
  ]),
  developing: Object.freeze([
    Object.freeze({
      beat: "arrival",
      title: "Ribbons in the wind",
      body: "Windthread Steps marks a source and a landing. Watch the pair before choosing the next Explorer move.",
      gameplayTie: "windways-v1:region-arrival",
      eventKind: "region-arrival"
    }),
    Object.freeze({
      beat: "variation",
      title: "A longer step",
      body: "A Windway can carry the Explorer farther in one legal action. Compare the landing with the path you first planned.",
      gameplayTie: "windways-v1:windway-used",
      eventKind: "twist-observed"
    }),
    Object.freeze({
      beat: "escalation",
      title: "Choose the landing",
      body: "Several ribbons cross the ridge. Let the visible destination guide a deliberate move instead of chasing the nearest opening.",
      gameplayTie: "windways-v1:windway-used",
      eventKind: "twist-used"
    }),
    Object.freeze({
      beat: "gate",
      title: "The ridge remembers",
      body: "The Gate Warden listens from the high marker. Use your movement comparison when the final reviewed question appears.",
      gameplayTie: "windways-v1:gate-warden",
      eventKind: "gate-warden"
    })
  ]),
  capable: Object.freeze([
    Object.freeze({
      beat: "arrival",
      title: "Two stones, one span",
      body: "Bridgewake Basin hides paired Echo Bridges in the fog. One recovered Echo can reveal a new connection without closing the old route.",
      gameplayTie: "echo-bridges-v1:region-arrival",
      eventKind: "region-arrival"
    }),
    Object.freeze({
      beat: "variation",
      title: "A path joins the path",
      body: "An opened bridge serves Explorer and Warden alike. Notice which choices become possible when the pair is visible.",
      gameplayTie: "echo-bridges-v1:echo-collected",
      eventKind: "twist-observed"
    }),
    Object.freeze({
      beat: "escalation",
      title: "Cross with a reason",
      body: "The basin offers more than one route. Connect the Echo you found with the crossing that makes the next action safer.",
      gameplayTie: "echo-bridges-v1:bridge-opened",
      eventKind: "twist-used"
    }),
    Object.freeze({
      beat: "gate",
      title: "The joined path",
      body: "The Gate Warden waits beyond the last arch. Explain the connection in the reviewed question before the basin opens onward.",
      gameplayTie: "echo-bridges-v1:gate-warden",
      eventKind: "gate-warden"
    })
  ]),
  advanced: Object.freeze([
    Object.freeze({
      beat: "arrival",
      title: "A tide with a pattern",
      body: "Tideglass Causeway opens and closes its visible doors together. First, watch the phase before you commit to a route.",
      gameplayTie: "tide-doors-v1:region-arrival",
      eventKind: "region-arrival"
    }),
    Object.freeze({
      beat: "variation",
      title: "Open, then turning",
      body: "A successful Move or Pulse turns the tide. Questions, Hints, pauses, and blocked paths leave the phase where it was.",
      gameplayTie: "tide-doors-v1:phase-change",
      eventKind: "twist-observed"
    }),
    Object.freeze({
      beat: "escalation",
      title: "Plan before the water",
      body: "The causeway rewards a short plan. Choose an action that still works after the shared door phase changes.",
      gameplayTie: "tide-doors-v1:phase-change",
      eventKind: "twist-used"
    }),
    Object.freeze({
      beat: "gate",
      title: "The turning tide",
      body: "The Gate Warden holds the sea-glass mark. Bring a before-and-after plan to the final reviewed question.",
      gameplayTie: "tide-doors-v1:gate-warden",
      eventKind: "gate-warden"
    })
  ]),
  mastery: Object.freeze([
    Object.freeze({
      beat: "arrival",
      title: "A bell in the stone",
      body: "Bellroot Nightline places one-use Signal Bells beside revealed passages. Learn which Wardens can hear them.",
      gameplayTie: "warden-bells-v1:region-arrival",
      eventKind: "region-arrival"
    }),
    Object.freeze({
      beat: "variation",
      title: "A signal, not a shortcut",
      body: "A nearby Bell can lure revealed ordinary Wardens for one action. Hidden and Gate Wardens keep their course.",
      gameplayTie: "warden-bells-v1:signal-bell-rung",
      eventKind: "twist-observed"
    }),
    Object.freeze({
      beat: "escalation",
      title: "Ring with intent",
      body: "The summit gives only one signal at each Bell. Read the revealed board, then spend the sound where it changes the next choice.",
      gameplayTie: "warden-bells-v1:signal-bell-rung",
      eventKind: "twist-used"
    }),
    Object.freeze({
      beat: "gate",
      title: "The last light listens",
      body: "The Gate Warden ignores every signal. Carry the full region pattern into the final reviewed question and the summit will open.",
      gameplayTie: "warden-bells-v1:gate-warden",
      eventKind: "gate-warden"
    })
  ])
});

/** @type {readonly QuestIIRegion[]} */
const QUEST_II_REGIONS = Object.freeze(
  [
    ["foundation", "Hushline Orchard", "Lantern moss and quiet stone", "echo-hush-v1", "Notice a changed rhythm"],
    ["developing", "Windthread Steps", "Rising wind and bright trail ribbons", "windways-v1", "Compare movement choices"],
    ["capable", "Bridgewake Basin", "Joined arches and clear blue spans", "echo-bridges-v1", "Connect two observations"],
    ["advanced", "Tideglass Causeway", "Sea-glass channels and alternating tide marks", "tide-doors-v1", "Plan before committing"],
    ["mastery", "Bellroot Nightline", "Beacon bells and resonant stone", "warden-bells-v1", "Apply the full pattern"]
  ].map(([id, name, motif, trailTwistRevision, learningMove], regionIndex) => {
    const start = regionIndex * 4 + 1;
    const regionKey = /** @type {keyof typeof REGION_STORYLETS} */ (id);
    const storylets = REGION_STORYLETS[regionKey].map((storylet, offset) => ({
      ...storylet,
      id: `quest-ii-${id}-${start + offset}`,
      regionId: id,
      labyrinthNumber: start + offset
    }));
    return Object.freeze({
      id,
      name,
      motif,
      trailTwistRevision,
      learningMove,
      labyrinthNumbers: Object.freeze(
        Array.from({ length: 4 }, (_, offset) => start + offset)
      ),
      storylets: Object.freeze(storylets.map((storylet) => Object.freeze(storylet)))
    });
  })
);

/**
 * @param {string | undefined | null} questId
 * @returns {"quest-i" | "quest-ii"}
 */
export function getQuestContentPackId(questId) {
  return typeof questId === "string" && /^quest_ii_/iu.test(questId)
    ? QUEST_II_CONTENT_PACK_ID
    : QUEST_I_CONTENT_PACK_ID;
}

/** @param {string | undefined | null} questId @returns {string} */
export function getQuestContentPackLabel(questId) {
  return getQuestContentPackId(questId) === QUEST_II_CONTENT_PACK_ID
    ? "Quest II · "
    : "";
}

/**
 * @param {{ questId?: string | null, complete: boolean }} progress
 * @returns {"quest-i" | "quest-ii"}
 */
export function getNextQuestContentPackId(progress) {
  return progress.complete
    ? QUEST_II_CONTENT_PACK_ID
    : getQuestContentPackId(progress.questId);
}

/**
 * @param {"quest-i" | "quest-ii"} [contentPackId]
 * @returns {string}
 */
export function createQuestId(contentPackId = QUEST_I_CONTENT_PACK_ID) {
  if (!QUEST_CONTENT_PACK_IDS.includes(contentPackId)) {
    throw new Error("Quest content pack is not supported.");
  }
  const randomId = globalThis.crypto?.randomUUID?.();
  const suffix =
    randomId ??
    `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 14)}`;
  return contentPackId === QUEST_II_CONTENT_PACK_ID
    ? `quest_ii_${suffix}`
    : `quest_${suffix}`;
}

/** @returns {QuestIIRegion[]} */
export function getQuestIIRegions() {
  return QUEST_II_REGIONS.map((region) => ({
    ...region,
    labyrinthNumbers: [...region.labyrinthNumbers],
    storylets: region.storylets.map((storylet) => ({ ...storylet }))
  }));
}

/**
 * @param {number} labyrinthNumber
 * @returns {QuestIIStorylet}
 */
export function getQuestIIStorylet(labyrinthNumber) {
  if (!Number.isInteger(labyrinthNumber) || labyrinthNumber < 1 || labyrinthNumber > 20) {
    throw new RangeError("Quest II Labyrinth Number must be between 1 and 20.");
  }
  const region = QUEST_II_REGIONS.find((candidate) =>
    candidate.labyrinthNumbers.includes(labyrinthNumber)
  );
  const storylet = region?.storylets.find(
    (candidate) => candidate.labyrinthNumber === labyrinthNumber
  );
  if (!storylet) {
    throw new Error("Quest II storylet is unavailable.");
  }
  return { ...storylet };
}

/** @param {number} labyrinthNumber @returns {string} */
export function getQuestIIStoryletLogEntry(labyrinthNumber) {
  const storylet = getQuestIIStorylet(labyrinthNumber);
  const region = QUEST_II_REGIONS.find(
    (candidate) => candidate.id === storylet.regionId
  );
  return `Quest II · ${region?.name ?? "Living Region"} · ${storylet.title}. ${storylet.body}`;
}

/** @param {number} labyrinthNumber @returns {QuestIIRegion} */
export function getQuestIIRegion(labyrinthNumber) {
  const storylet = getQuestIIStorylet(labyrinthNumber);
  const region = QUEST_II_REGIONS.find((candidate) => candidate.id === storylet.regionId);
  if (!region) {
    throw new Error("Quest II region is unavailable.");
  }
  return {
    ...region,
    labyrinthNumbers: [...region.labyrinthNumbers],
    storylets: region.storylets.map((candidate) => ({ ...candidate }))
  };
}
