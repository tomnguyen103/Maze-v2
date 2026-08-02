/**
 * The authored Learning Deck roster: one entry per published Deck.
 *
 * Word Trail and Nature Trail are withheld from the roster until authored
 * content exists for them. Their generated pools were one reviewed card
 * reskinned — a child on Nature Trail met the same question up to seventeen
 * times in a single Region — which cannot honour the published promise of
 * focused reviewed coverage. Issue #122 records the decision.
 *
 * `revisionId` is the revision new Quests pin. `publishedRevisionIds` lists
 * every revision ever published for that Deck, newest last, so a Quest that
 * pinned an earlier revision stays readable after a republish.
 */
const OPTIONS = Object.freeze([
  Object.freeze({
    deckId: "mixed-trail",
    label: "Mixed Trail",
    kind: /** @type {"mixed"} */ ("mixed"),
    description: "Number, Word, and Nature Questions together.",
    revisionId: "deck:mixed-trail:v1:d0647e88de6cbe1dea606b07e468ab92",
    publishedRevisionIds: Object.freeze([
      "deck:mixed-trail:v1:d0647e88de6cbe1dea606b07e468ab92"
    ])
  }),
  Object.freeze({
    deckId: "number-trail",
    label: "Number Trail",
    kind: /** @type {"focused"} */ ("focused"),
    description: "Mostly Number Questions, then Mixed Trail when they run out.",
    revisionId: "deck:number-trail:v1:d583663a8c0590f497042439ce82d2f7",
    publishedRevisionIds: Object.freeze([
      "deck:number-trail:v1:67aa6e0169885d41ba784245b45a7105",
      "deck:number-trail:v1:d583663a8c0590f497042439ce82d2f7"
    ])
  }),
]);

export function getPublishedLearningDeckOptions() {
  return OPTIONS;
}

/**
 * @param {string | null | undefined} deckId
 * @param {string} [revisionId]
 */
export function getPublishedLearningDeckOption(deckId, revisionId) {
  return (
    OPTIONS.find(
      (option) =>
        option.deckId === deckId &&
        (revisionId === undefined ||
          option.publishedRevisionIds.includes(revisionId))
    ) ?? null
  );
}

export function getDefaultLearningDeckOption() {
  const mixed = getPublishedLearningDeckOption("mixed-trail");
  if (!mixed) {
    throw new Error("Published Mixed Trail revision is missing.");
  }
  return mixed;
}
