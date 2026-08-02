import { clearOfflineAccountState } from "./offline-account-cleanup.js";

/** @typedef {Parameters<typeof import("./offline-continuity-runtime.js").createOfflineContinuityRuntime>[0]} RuntimeDependencies */
/** @typedef {ReturnType<typeof import("./offline-continuity-runtime.js").createOfflineContinuityRuntime>} OfflineContinuityRuntime */

/**
 * @param {RuntimeDependencies["playerController"]} playerController
 * @param {RuntimeDependencies["elements"]["challengeSource"]} challengeSource
 * @param {RuntimeDependencies["getActiveRunLocator"]} getActiveRunLocator
 * @param {RuntimeDependencies["getRun"]} getRun
 * @param {RuntimeDependencies["isFirstLight"]} isFirstLight
 * @param {RuntimeDependencies["isDaily"]} isDaily
 * @param {RuntimeDependencies["isOnline"]} isOnline
 * @param {RuntimeDependencies["announce"]} announce
 * @param {RuntimeDependencies["showEvent"]} showEvent
 * @param {RuntimeDependencies["updateInterface"]} updateInterface
 * @param {RuntimeDependencies["transition"]} transition
 * @param {RuntimeDependencies["closeCampfire"]} closeCampfire
 * @param {RuntimeDependencies["closeResult"]} closeResult
 * @param {RuntimeDependencies["loadChallengeQuestion"]} loadChallengeQuestion
 * @param {RuntimeDependencies["applyOfflineQuestion"]} applyOfflineQuestion
 * @param {RuntimeDependencies["focusCanvas"]} focusCanvas
 * @param {RuntimeDependencies["setActive"]} setActive
 * @param {() => void} clearActiveRun
 */
export function createOfflineContinuityBridge(
  playerController,
  challengeSource,
  getActiveRunLocator,
  getRun,
  isFirstLight,
  isDaily,
  isOnline,
  announce,
  showEvent,
  updateInterface,
  transition,
  closeCampfire,
  closeResult,
  loadChallengeQuestion,
  applyOfflineQuestion,
  focusCanvas,
  setActive,
  clearActiveRun
) {
  /** @param {string} id @returns {HTMLElement} */
  function requiredElement(id) {
    const element = document.getElementById(id);
    if (!element) {
      throw new Error(`Missing Offline Continuity element: ${id}`);
    }
    return element;
  }

  const elements = /** @type {RuntimeDependencies["elements"]} */ ({
    challengeSource,
    offlineContinuity: requiredElement("offline-continuity"),
    offlineContinuityLabel: requiredElement("offline-continuity-label"),
    offlineContinuityNote: requiredElement("offline-continuity-note"),
    offlineContinue: /** @type {HTMLButtonElement} */ (
      requiredElement("offline-continue")
    )
  });
  const dependencies = {
    elements,
    playerController,
    getActiveRunLocator,
    getRun,
    isFirstLight,
    isDaily,
    isOnline,
    announce,
    showEvent,
    updateInterface,
    transition,
    closeCampfire,
    closeResult,
    loadChallengeQuestion,
    applyOfflineQuestion,
    focusCanvas,
    setActive,
    clearActiveRun
  };
  function reportSignOutFailure() {
    const message =
      "Clear this site's data before another player uses this device.";
    announce(message);
    showEvent(message);
  }
  /** @type {Promise<OfflineContinuityRuntime> | null} */
  let runtimePromise = null;

  function loadRuntime() {
    runtimePromise ??= import("./offline-continuity-runtime.js")
      .then(({ createOfflineContinuityRuntime }) =>
        createOfflineContinuityRuntime(dependencies)
      )
      .catch((error) => {
        runtimePromise = null;
        throw error;
      });
    return runtimePromise;
  }

  function continueRun() {
    return loadRuntime().then((runtime) => runtime.continueRun());
  }

  elements.offlineContinue.onclick = () => {
    void continueRun().catch(() => {});
  };

  /** @param {Parameters<OfflineContinuityRuntime["prepare"]>[0]} locator */
  function prepare(locator) {
    return loadRuntime().then((runtime) => runtime.prepare(locator));
  }

  /** @param {string} runId */
  function cancelPreparation(runId) {
    return loadRuntime().then((runtime) => runtime.cancelPreparation(runId));
  }

  /** @param {string | null} accountScope */
  function setAccountScope(accountScope) {
    return loadRuntime().then((runtime) => runtime.setAccountScope(accountScope));
  }

  function signOut() {
    return loadRuntime()
      .then((runtime) => runtime.signOut())
      .then((result) => {
        if (/** @type {{ ok?: boolean }} */ (result).ok !== true) {
          reportSignOutFailure();
        }
        return result;
      }, reportSignOutFailure)
      .finally(() => {
        runtimePromise = null;
      });
  }

  /** @param {Omit<Parameters<typeof clearOfflineAccountState>[0], "signOut">} dependencies */
  function clearState(dependencies) {
    return clearOfflineAccountState({
      ...dependencies,
      signOut: () => signOut()
    });
  }

  /** @param {Parameters<OfflineContinuityRuntime["recordTransition"]>[0]} previous @param {Parameters<OfflineContinuityRuntime["recordTransition"]>[1]} action @param {Parameters<OfflineContinuityRuntime["recordTransition"]>[2]} next */
  function recordTransition(previous, action, next) {
    return loadRuntime().then((runtime) =>
      runtime.recordTransition(previous, action, next)
    );
  }

  /** @param {Parameters<OfflineContinuityRuntime["selectQuestion"]>[0]} snapshot @param {Parameters<OfflineContinuityRuntime["selectQuestion"]>[1]} usedQuestionIds */
  function selectQuestion(snapshot, usedQuestionIds) {
    return loadRuntime().then((runtime) =>
      runtime.selectQuestion(snapshot, usedQuestionIds)
    );
  }

  /** @param {Parameters<OfflineContinuityRuntime["loadQuestion"]>[0]} snapshot @param {Parameters<OfflineContinuityRuntime["loadQuestion"]>[1]} key @param {Parameters<OfflineContinuityRuntime["loadQuestion"]>[2]} usedQuestionIds */
  function loadQuestion(snapshot, key, usedQuestionIds) {
    return loadRuntime().then((runtime) =>
      runtime.loadQuestion(snapshot, key, usedQuestionIds)
    );
  }

  return {
    renderFromDevice: () => loadRuntime().then((runtime) => runtime.renderFromDevice()),
    boot: () => loadRuntime().then((runtime) => runtime.boot()),
    reconcile: () => loadRuntime().then((runtime) => runtime.reconcile()),
    online: () => loadRuntime().then((runtime) => runtime.online()),
    signOut,
    prepare,
    continueRun,
    recordTransition,
    selectQuestion,
    loadQuestion,
    cancelPreparation,
    setAccountScope,
    clearState,
    /** @param {string} runId */
    startRun: (runId) => loadRuntime().then((runtime) => runtime.startRun(runId)),
    startFirstLight: () =>
      loadRuntime().then((runtime) => runtime.startFirstLight()),
    /** @param {string | undefined} onlineRunId */
    terminal: (onlineRunId = undefined) =>
      loadRuntime().then((runtime) => runtime.terminal(onlineRunId))
  };
}
