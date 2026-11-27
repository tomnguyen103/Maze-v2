import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.resetModules();
  vi.doUnmock("../src/game/quest-atlas.js");
  vi.doUnmock("../src/game/quest-atlas.js?retry=1");
  vi.doUnmock("../src/game/quest-atlas-view.js");
  vi.doUnmock("../src/game/run-replay-view.js");
});

describe("Quest Atlas projection retry", () => {
  /** @param {boolean} projectionFails */
  async function load(projectionFails) {
    vi.resetModules();
    const retryLoaded = vi.fn();
    vi.doMock("../src/game/quest-atlas-view.js", () => ({
      createQuestAtlasView: () => ({ show: vi.fn() })
    }));
    vi.doMock("../src/game/quest-atlas.js", () => {
      if (projectionFails) throw new Error("chunk failed");
      return { projectAtlas: async () => ({}) };
    });
    vi.doMock("../src/game/quest-atlas.js?retry=1", () => {
      retryLoaded();
      return { projectAtlas: async () => ({}) };
    });
    const { showQuestAtlas } = await import(
      "../src/game/shell/quest-atlas-opener.js"
    );
    const deps = {
      getRun: () => ({ status: "paused" }),
      getRunRecords: () => [],
      getQuestProgress: () => ({}),
      togglePause: vi.fn(),
      announce: vi.fn(),
      openRunReplay: vi.fn(),
      openWorkshop: vi.fn()
    };
    return { showQuestAtlas, deps, retryLoaded };
  }

  it("keeps the first-try import after a successful projection import", async () => {
    const { showQuestAtlas, deps, retryLoaded } = await load(false);
    const trigger = /** @type {HTMLElement} */ ({});
    await showQuestAtlas(deps, trigger);
    await showQuestAtlas(deps, trigger);
    expect(retryLoaded).not.toHaveBeenCalled();
    expect(deps.announce).not.toHaveBeenCalled();
  });

  it("switches to the retry chunk only after the import fails", async () => {
    const { showQuestAtlas, deps, retryLoaded } = await load(true);
    const trigger = /** @type {HTMLElement} */ ({});
    await showQuestAtlas(deps, trigger);
    expect(deps.announce).toHaveBeenCalledTimes(1);
    expect(retryLoaded).not.toHaveBeenCalled();
    await showQuestAtlas(deps, trigger);
    expect(retryLoaded).toHaveBeenCalledTimes(1);
  });
});

describe("Run Replay opener", () => {
  it("keeps the accepted request's resume flag when a second request is ignored", async () => {
    vi.resetModules();
    /** @type {() => void} */
    let onClose = () => {};
    /** @type {(value: unknown) => void} */
    let release = () => {};
    const gate = new Promise((resolve) => {
      release = resolve;
    });
    vi.doMock("../src/game/run-replay-view.js", async () => {
      await gate;
      return {
        createRunReplayView: (/** @type {{ onClose: () => void }} */ hooks) => {
          onClose = hooks.onClose;
          return { show: vi.fn() };
        }
      };
    });
    const { openRunReplay } = await import(
      "../src/game/shell/run-replay-opener.js"
    );
    const togglePause = vi.fn();
    const deps = {
      getRun: () => ({ status: "paused" }),
      togglePause,
      announce: vi.fn()
    };
    const trigger = /** @type {HTMLElement} */ ({});
    const first = openRunReplay(deps, { replay: {} }, trigger, true);
    await openRunReplay(deps, { replay: {} }, trigger, false);
    release(undefined);
    await first;
    onClose();
    expect(togglePause).toHaveBeenCalledTimes(1);
  });
});

describe("Workshop opener", () => {
  it("does nothing when the Journal closed before a Journal request starts", async () => {
    vi.resetModules();
    const { openWorkshop } = await import(
      "../src/game/shell/workshop-opener.js"
    );
    const setReopenJournal = vi.fn();
    const deps = {
      getRun: () => ({ status: "active" }),
      togglePause: vi.fn(),
      announce: vi.fn(),
      journalDialog: { open: false, dataset: {}, close: vi.fn() },
      practiceDialog: { open: false },
      workshopButton: {},
      setReopenJournal,
      openLanternJournal: vi.fn(),
      showQuestAtlas: vi.fn(),
      recordLearningOutcome: vi.fn()
    };
    await openWorkshop(/** @type {any} */ (deps), {
      origin: "journal",
      difficultyBand: "bright",
      trigger: /** @type {HTMLElement} */ ({})
    });
    expect(setReopenJournal).not.toHaveBeenCalled();
    expect(deps.openLanternJournal).not.toHaveBeenCalled();
    expect(deps.announce).not.toHaveBeenCalled();
  });
});
