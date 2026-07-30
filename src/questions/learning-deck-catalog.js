/**
 * The authored Learning Deck roster: one entry per published Deck.
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
    revisionId: "deck:number-trail:v1:67aa6e0169885d41ba784245b45a7105",
    publishedRevisionIds: Object.freeze([
      "deck:number-trail:v1:67aa6e0169885d41ba784245b45a7105"
    ])
  }),
  Object.freeze({
    deckId: "word-trail",
    label: "Word Trail",
    kind: /** @type {"focused"} */ ("focused"),
    description: "Mostly Word Questions, then Mixed Trail when they run out.",
    revisionId: "deck:word-trail:v1:daa862d93131ed0af4edb0ca1f743f19",
    publishedRevisionIds: Object.freeze([
      "deck:word-trail:v1:daa862d93131ed0af4edb0ca1f743f19"
    ])
  }),
  Object.freeze({
    deckId: "nature-trail",
    label: "Nature Trail",
    kind: /** @type {"focused"} */ ("focused"),
    description: "Mostly Nature Questions, then Mixed Trail when they run out.",
    revisionId: "deck:nature-trail:v1:d6a6da5d0eb0aa49d4a225c30cb455d7",
    publishedRevisionIds: Object.freeze([
      "deck:nature-trail:v1:d6a6da5d0eb0aa49d4a225c30cb455d7"
    ])
  })
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
        (revisionId === undefined || option.revisionId === revisionId)
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
