import { createOfflineContinuityClient } from "./offline-continuity-client.js";
import { createOfflineContinuityController } from "./offline-continuity-controller.js";
import {
  OFFLINE_RUN_RECORD_KEY,
  ownerMismatch,
  scrubOfflineState
} from "./offline-local-scrub.js";
import { questIdentityMatches } from "../../shared/quest-identity.js";
import { selectOfflineLearningDeckQuestion } from "../questions/offline-deck-selection.js";

/** @typedef {{ runId: string, seed: string, levelId: string, labyrinthNumber: number, rulesetRevision: string, contentPackHash: string, questId?: string }} OfflineRunIdentity */
/** @typedef {{ runId: string, seed: string, levelId: string, labyrinthNumber: number, rulesetRevision?: string, contentPackHash?: string, questId?: string }} OfflineRunLocator */
/** @typedef {OfflineRunLocator & { questId: string }} OfflineRunWithQuestId */
/** @typedef {{ version: string, assets: { url: string, scope: "public" | "account" }[] }} OfflineAssetPackage */
/** @typedef {import("../../shared/offline-receipt.js").OfflineReceipt} OfflineReceipt */
/** @typedef {ReturnType<typeof createOfflineContinuityRuntime>} OfflineContinuityRuntime */

/**
 * Owns the lazy, player-facing Offline Continuity boundary. The game entry
 * chunk supplies state accessors and gameplay callbacks; this module owns the
 * receipt, worker, package, retry, and presentation seams after the feature is
 * actually needed.
 *
 * @param {{
 *   elements: {
 *     challengeSource: HTMLElement,
 *     offlineContinuity: HTMLElement,
 *     offlineContinuityLabel: HTMLElement,
 *     offlineContinuityNote: HTMLElement,
 *     offlineContinue: HTMLButtonElement
 *   },
     *   playerController: {
     *     getAuthenticatedUserId: () => string | null,
     *     auth?: () => boolean,
     *     issueOfflineReceipt: (run: { runId: string, seed: string, levelId: string, labyrinthNumber: number, questId: string }, nonce: string) => Promise<{ receipt: unknown, assetPackage: OfflineAssetPackage }>
     *     retryLanternJournalSync: () => Promise<void>,
     *     submitOfflineRun: (submission: {
 *       idempotencyKey: string,
 *       receipt: OfflineReceipt,
 *       deviceInstallationHash: string,
 *       contentPackHash: string,
 *       terminalAt: string,
 *       actionLog: import("./run-action-log-v2.js").RunActionLogV2
 *     }) => Promise<{ status: "accepted" | "rejected" | "expired" | "invalid", duplicate?: boolean }>
 *   },
 *   getActiveRunLocator: () => { runId?: string, pending?: boolean, seed: string, levelId: string, labyrinthNumber: number, rulesetRevision?: string, questId?: string } | null,
 *   getRun: () => ReturnType<typeof import("./game-session.js").createRun>,
 *   isFirstLight: () => boolean,
 *   isDaily: () => boolean,
 *   isOnline: () => boolean,
 *   announce: (message: string) => void,
 *   showEvent: (message: string) => void,
 *   updateInterface: () => void,
 *   transition: (action: { type: "pause" }) => void,
 *   closeCampfire: () => void,
 *   closeResult: () => void,
 *   loadChallengeQuestion: () => void,
 *   selectOfflineQuestion?: (
 *     snapshot: Parameters<OfflineContinuityRuntime["selectQuestion"]>[0],
 *     usedQuestionIds: string[]
   *   ) => ReturnType<typeof import("../questions/question-bank.js")["getBundledQuestion"]> | null,
   *   applyOfflineQuestion: (question: ReturnType<typeof import("../questions/question-bank.js")["getBundledQuestion"]>, ordinal: number, key: string) => void,
 *   focusCanvas: () => void,
 *   setActive: (active: boolean) => void,
 *   clearActiveRun: () => void,
 *   now?: () => Date
 * }} dependencies
 */
export function createOfflineContinuityRuntime({
  now = () => new Date(),
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
  selectOfflineQuestion,
  applyOfflineQuestion,
  focusCanvas,
  setActive,
  clearActiveRun
}) {
  let accountScope = playerController.getAuthenticatedUserId();
  const client = createOfflineContinuityClient({
    playerController,
    accountScope
  });
  const controller = createOfflineContinuityController({
    workerClient: client.workerClient,
    receiptVerifier: { verify: client.verifyReceipt },
    submitOfflineRun: playerController.submitOfflineRun,
    accountScope,
    getDeviceInstallationHash: client.deviceInstallationHashFor
  });
  const viewPromise = import("./offline-continuity-view.js").then(
    ({ createOfflineContinuityView }) =>
      createOfflineContinuityView({
        section: elements.offlineContinuity,
        button: elements.offlineContinue,
        label: elements.offlineContinuityLabel,
        note: elements.offlineContinuityNote
      })
  );

  /** @type {OfflineRunIdentity | null} */
  let runIdentity = null;
  let active = false;
  /** @type {{ questId?: string, learningDeckId: string, learningDeckRevision: string } | null} */
  let offlineDeckBinding = null;
  let recordingUnavailable = false;
  let preparationRunId = "";
  let workerLeaseRunId = "";
  /** @type {Promise<boolean> | null} */
  let preparationPromise = null;
  let preparationCancelled = false;
  let pendingOverflowed = false;
  /** @type {{ previous: Parameters<typeof controller.recordTransition>[0]["previous"], action: Parameters<typeof controller.recordTransition>[0]["action"], next: Parameters<typeof controller.recordTransition>[0]["next"] }[]} */
  let pendingTransitions = [];

  /** @param {string | null} nextAccountScope */
  function setAccountScope(nextAccountScope) {
    accountScope = nextAccountScope;
    client.setAccountScope(nextAccountScope);
    controller.setAccountScope(nextAccountScope);
  }

  /** @param {{ runId: string, seed: string, levelId: string, labyrinthNumber: number, rulesetRevision?: string, questId?: string }} locator @param {OfflineReceipt} receipt */
  function offlineRunIdentity(locator, receipt) {
    return /** @type {OfflineRunIdentity} */ ({
      runId: locator.runId,
      seed: locator.seed,
      levelId: locator.levelId,
      labyrinthNumber: locator.labyrinthNumber,
      rulesetRevision: locator.rulesetRevision ?? getRun().ruleset.revision,
      contentPackHash: receipt.binding.contentPackHash,
      ...(typeof locator.questId === "string"
        ? { questId: locator.questId }
        : {}),
      ...(typeof receipt.binding.questId === "string"
        ? { questId: receipt.binding.questId }
        : {})
    });
  }

  /** @param {OfflineRunIdentity | null} [identity=runIdentity] */
  function isCurrentRun(identity = runIdentity) {
    const locator = getActiveRunLocator();
    return Boolean(
      !isFirstLight() &&
        !isDaily() &&
        locator?.pending === false &&
        typeof locator.runId === "string" &&
        identity &&
        identity.runId === locator.runId &&
        identity.seed === locator.seed &&
        identity.levelId === locator.levelId &&
        identity.labyrinthNumber === locator.labyrinthNumber &&
        questIdentityMatches(identity.questId, locator.questId)
    );
  }

  /** @param {{ ok?: boolean, reason?: string } | null | undefined} result */
  function reportFailure(result) {
    if (!result || result.ok !== false || recordingUnavailable) {
      return;
    }
    recordingUnavailable = true;
    const message =
      result.reason === "expired"
        ? "Offline authority ended. This Run is paused until you reconnect."
        : "Offline Run details could not be saved. This result cannot claim replay verification.";
    announce(message);
    showEvent(message);
  }

  /** @param {OfflineRunIdentity} run @param {{ ok?: boolean, reason?: string }} result */
  async function preserveUnrecordable(run, result) {
    if (result.ok !== false) {
      return;
    }
    const marked = await controller.markUnrecordable({
      run,
      reason: result.reason ?? "recording"
    });
    reportFailure(marked);
    reportFailure(result);
  }

  /** @param {{ offer?: { offered: boolean, reason?: string }, verification?: "pending" | "verified" | "unverified" }} state */
  async function render(state) {
    try {
      const view = await viewPromise;
      if (state.offer) {
        view.renderOffer(state.offer);
      }
      if (state.verification) {
        view.renderVerification(state.verification);
      }
    } catch {
      elements.offlineContinuity.hidden = true;
      elements.offlineContinue.hidden = true;
    }
  }

  async function renderOfferFromDevice() {
    const locator = getActiveRunLocator();
    if (
      !locator ||
      locator.pending !== false ||
      typeof locator.runId !== "string"
    ) {
      return;
    }
    const recoveryLocator = /** @type {OfflineRunLocator} */ ({
      runId: locator.runId,
      seed: locator.seed,
      levelId: locator.levelId,
      labyrinthNumber: locator.labyrinthNumber,
      rulesetRevision: locator.rulesetRevision,
      ...(typeof locator.questId === "string"
        ? { questId: locator.questId }
        : {})
    });
    try {
      const recovered = await controller.recover(recoveryLocator);
      if (
        recovered.ok !== true ||
        !("status" in recovered) ||
        !("run" in recovered) ||
        !["ready", "unverified"].includes(recovered.status) ||
        !recovered.run
      ) {
        return;
      }
      runIdentity = recovered.run;
      offlineDeckBinding = offlineDeckBindingFromReceipt(recovered.receipt);
      await render({
        offer: {
          offered: recovered.status === "ready",
          reason: recovered.status === "unverified" ? "binding" : undefined
        }
      });
    } catch {
      return;
    }
  }

  async function renderFromDevice() {
    /** @type {Record<string, unknown> | null} */
    let record;
    try {
      const stored = globalThis.localStorage?.getItem(OFFLINE_RUN_RECORD_KEY);
      record = stored ? JSON.parse(stored) : null;
    } catch {
      return;
    }
    if (!record || typeof record !== "object" || Array.isArray(record)) {
      await renderOfferFromDevice();
      return;
    }
    const verification =
      record.verification === "verified" ||
      record.verification === "unverified" ||
      record.verification === "pending"
        ? record.verification
        : null;
    if (!verification) {
      return;
    }
    await render({
      verification: /** @type {"pending" | "verified" | "unverified"} */ (verification),
      offer: { offered: false }
    });
  }

  /** @param {OfflineRunWithQuestId} locator */
  async function prepare(locator) {
    setAccountScope(playerController.getAuthenticatedUserId());
    active = false;
    setActive(false);
    recordingUnavailable = false;
    runIdentity = null;
    offlineDeckBinding = null;
    preparationRunId = locator.runId;
    workerLeaseRunId = "";
    preparationCancelled = false;
    pendingTransitions = [];
    pendingOverflowed = false;
    preparationPromise = prepareInternal(locator);
    try {
      return await preparationPromise;
    } finally {
      if (preparationRunId === locator.runId) {
        preparationPromise = null;
        preparationRunId = "";
        preparationCancelled = false;
        pendingTransitions = [];
        pendingOverflowed = false;
      }
    }
  }

  /** @param {OfflineRunWithQuestId} locator */
  async function prepareInternal(locator) {
    try {
      const result = await client.issueAndPin(locator);
      if (result.ok === true) {
        workerLeaseRunId = locator.runId;
      }
      if (preparationCancelled && preparationRunId === locator.runId) {
        await cancelPreparedRun(locator.runId);
        return false;
      }
      if (!result.ok) {
        if (result.reason !== "unconfigured") {
          showEvent("Offline Continuity is not ready for this Run.");
        }
        return false;
      }
      if (!result.receipt || !result.assetPackage) {
        showEvent("Offline Continuity is not ready for this Run.");
        return false;
      }
      const receipt = /** @type {OfflineReceipt} */ (result.receipt);
      const identity = offlineRunIdentity(locator, receipt);
      if (!identity.rulesetRevision || !identity.contentPackHash) {
        showEvent("Offline Continuity is not ready for this Run.");
        return false;
      }
      if (preparationCancelled && preparationRunId === locator.runId) {
        await cancelPreparedRun(locator.runId);
        return false;
      }
      const prepared = await controller.prepare({
        run: identity,
        receipt,
        assetPackage: result.assetPackage,
        verified: result.verification?.valid === true
      });
      if (!prepared.ok) {
        showEvent("Offline Continuity is not ready for this Run.");
        return false;
      }
      if (preparationCancelled && preparationRunId === locator.runId) {
        await cancelPreparedRun(locator.runId);
        return false;
      }
      const bufferedBatch = pendingTransitions;
      pendingTransitions = [];
      let batch = bufferedBatch;
      let failureReason = "";
      while (batch.length > 0) {
        if (preparationCancelled && preparationRunId === locator.runId) {
          await cancelPreparedRun(locator.runId);
          return false;
        }
        for (const buffered of batch) {
          const result = await controller.recordTransition({
            run: identity,
            ...buffered
          });
          if (result.ok === false && !failureReason) {
            failureReason = result.reason ?? "storage";
          }
          await preserveUnrecordable(identity, result);
          if (preparationCancelled && preparationRunId === locator.runId) {
            await cancelPreparedRun(locator.runId);
            return false;
          }
        }
        batch = pendingTransitions;
        pendingTransitions = [];
      }
      if (pendingOverflowed) {
        const marked = await controller.markUnrecordable({
          run: identity,
          reason: "log-overflow"
        });
        if (marked.ok === false && !failureReason) {
          failureReason = marked.reason ?? "storage";
        }
        reportFailure(marked);
      }
      if (preparationCancelled && preparationRunId === locator.runId) {
        await cancelPreparedRun(locator.runId);
        return false;
      }
      runIdentity = identity;
      offlineDeckBinding = offlineDeckBindingFromReceipt(receipt);
      recordingUnavailable ||= pendingOverflowed;
      await render({
        offer: {
          offered: !recordingUnavailable,
          ...(!recordingUnavailable
            ? {}
            : {
                reason: pendingOverflowed
                  ? "unrecordable"
                  : failureReason || "unrecordable"
              })
        }
      });
      if (preparationCancelled && preparationRunId === locator.runId) {
        await cancelPreparedRun(locator.runId);
        runIdentity = null;
        offlineDeckBinding = null;
        return false;
      }
      return true;
    } catch {
      showEvent("Offline Continuity is not ready for this Run.");
      return false;
    }
  }

  /** @param {OfflineReceipt} receipt */
  function offlineDeckBindingFromReceipt(receipt) {
    const binding = receipt.binding;
    return typeof binding.learningDeckId === "string" &&
      typeof binding.learningDeckRevision === "string"
      ? {
          ...(typeof binding.questId === "string"
            ? { questId: binding.questId }
            : {}),
          learningDeckId: binding.learningDeckId,
          learningDeckRevision: binding.learningDeckRevision
        }
      : null;
  }

  /** @param {string} runId */
  async function cancelPreparedRun(runId) {
    if (workerLeaseRunId !== runId) {
      return { ok: true, durable: true, cleared: false };
    }
    const result = await controller.cancelPreparedRun(runId);
    if (result.ok !== false) {
      workerLeaseRunId = "";
    }
    return result;
  }

  /** @param {string} runId */
  async function cancelPreparation(runId) {
    if (active && runIdentity?.runId === runId) {
      return { ok: false, reason: "active", durable: false };
    }
    if (preparationRunId === runId) {
      preparationCancelled = true;
      await preparationPromise;
    }
    const result = await cancelPreparedRun(runId);
    if (runIdentity?.runId === runId) {
      runIdentity = null;
      offlineDeckBinding = null;
      pendingTransitions = [];
      pendingOverflowed = false;
    }
    return result;
  }

  /** @param {Parameters<typeof controller.recordTransition>[0]["previous"]} previous @param {Parameters<typeof controller.recordTransition>[0]["action"]} action @param {Parameters<typeof controller.recordTransition>[0]["next"]} next */
  async function recordTransition(previous, action, next) {
    if (!isCurrentRun()) {
      const locator = getActiveRunLocator();
      if (
        preparationRunId &&
        locator?.runId === preparationRunId &&
        pendingTransitions.length < 4096
      ) {
        pendingTransitions.push({ previous, action, next });
      } else if (preparationRunId && locator?.runId === preparationRunId) {
        pendingOverflowed = true;
      }
      return;
    }
    const identity = /** @type {OfflineRunIdentity} */ (runIdentity);
    const result = await controller.recordTransition({
      run: identity,
      previous,
      action,
      next
    });
    await preserveUnrecordable(identity, result);
    if (result.reason === "expired" && getRun().status === "active") {
      transition({ type: "pause" });
      updateInterface();
    }
  }

  async function continueRun() {
    const locator = getActiveRunLocator();
    if (
      !locator ||
      locator.pending !== false ||
      typeof locator.runId !== "string"
    ) {
      announce("This Run has no verified offline authority.");
      return;
    }
    try {
      const recovered = await controller.recover({
        runId: locator.runId,
        seed: locator.seed,
        levelId: locator.levelId,
        labyrinthNumber: locator.labyrinthNumber,
        rulesetRevision: locator.rulesetRevision,
        ...(typeof locator.questId === "string"
          ? { questId: locator.questId }
          : {})
      });
      if (
        recovered.ok !== true ||
        !("status" in recovered) ||
        !("run" in recovered) ||
        !recovered.run
      ) {
        await render({ offer: { offered: false, reason: recovered.reason } });
        announce(
          recovered.reason === "expired"
            ? "Offline play for this Run has ended. Reconnect to continue."
            : "This Run is not ready for offline play. Reconnect to prepare it."
        );
        return;
      }
      if (recovered.status === "terminal") {
        await render({
          verification: "pending",
          offer: { offered: false }
        });
        return;
      }
      if (recovered.status !== "ready") {
        await render({ offer: { offered: false, reason: recovered.reason } });
        return;
      }
      runIdentity = recovered.run;
      offlineDeckBinding = offlineDeckBindingFromReceipt(recovered.receipt);
      active = true;
      recordingUnavailable = false;
      setActive(true);
      closeCampfire();
      closeResult();
      if (getRun().status === "paused") {
        transition({ type: "pause" });
      }
      elements.offlineContinue.hidden = true;
      announce("Continuing this exact Run offline.");
      showEvent("Continuing this exact Run offline. Progress stays on this device until reconnect.");
      if (getRun().status === "challenge") {
        loadChallengeQuestion();
      }
      focusCanvas();
    } catch {
      announce("Offline Run recovery is unavailable. Reconnect to continue.");
    }
  }

  /** @param {string} runId */
  function startRun(runId) {
    active = false;
    setActive(false);
    recordingUnavailable = false;
    if (runIdentity?.runId !== runId) {
      runIdentity = null;
      offlineDeckBinding = null;
    }
    if (preparationRunId !== runId) {
      pendingTransitions = [];
      pendingOverflowed = false;
    }
  }

  function startFirstLight() {
    active = false;
    setActive(false);
    runIdentity = null;
    offlineDeckBinding = null;
    recordingUnavailable = false;
  }

  /**
   * @param {{ levelId: string, seed: string, wardenId: number, attempt: number, challengeKind: "warden" | "gate-warden", labyrinthNumber: number, questionOrdinal: number, questId?: string, learningDeckId?: string, learningDeckRevision?: string }} snapshot
   * @param {string[]} usedQuestionIds
   */
  function selectQuestion(snapshot, usedQuestionIds) {
    for (let offset = 0; offset < 20; offset += 1) {
      /** @type {"warden" | "gate-warden"} */
      const challengeKind =
        offset === 0 &&
        snapshot.attempt === 0 &&
        snapshot.challengeKind === "gate-warden"
          ? "gate-warden"
          : "warden";
      const request = {
        ...snapshot,
        ...(offlineDeckBinding ?? {}),
        questionOrdinal: snapshot.questionOrdinal + offset,
        challengeKind
      };
      const question = selectOfflineQuestion
        ? selectOfflineQuestion(request, usedQuestionIds)
        : selectOfflineLearningDeckQuestion(request, usedQuestionIds)?.question ??
          null;
      if (!question) {
        continue;
      }
      if (!usedQuestionIds.includes(question.id)) {
        return { question, ordinal: request.questionOrdinal };
      }
    }
    return null;
  }

  /**
   * @param {Parameters<typeof selectQuestion>[0]} snapshot
   * @param {string} key
   * @param {string[]} usedQuestionIds
   */
  async function loadQuestion(snapshot, key, usedQuestionIds) {
    try {
      const selected = selectQuestion(snapshot, usedQuestionIds);
      if (!selected) {
        elements.challengeSource.textContent =
          "No fresh pinned question card was available. Reconnect to continue.";
        return;
      }
      elements.challengeSource.textContent = "Your question is ready.";
      applyOfflineQuestion(selected.question, selected.ordinal, key);
    } catch {
      elements.challengeSource.textContent =
        "No fresh pinned question card was available. Reconnect to continue.";
    }
  }

  /** @param {{ durable?: boolean } | null | undefined} result */
  function settleTerminalResult(result) {
    if (result?.durable) {
      active = false;
      setActive(false);
      clearActiveRun();
      return;
    }
    const message =
      "Offline result could not be durably saved. Reconnect before leaving this device.";
    announce(message);
    showEvent(message);
  }

  /** @param {string | undefined} onlineRunId */
  async function terminal(onlineRunId = undefined) {
    if (!active && onlineRunId) {
      return cancelPreparation(onlineRunId);
    }
    if (
      preparationPromise &&
      getActiveRunLocator()?.runId === preparationRunId
    ) {
      await preparationPromise;
    }
    if (!isCurrentRun()) {
      if (!isOnline()) {
        const unavailable = {
          ok: false,
          reason: "unprepared",
          durable: false
        };
        reportFailure(unavailable);
        settleTerminalResult(unavailable);
        return unavailable;
      }
      return null;
    }
    if (!active && isOnline()) {
      return null;
    }
    try {
      const current = getRun();
      const result = await controller.recordTerminal({
        run: /** @type {OfflineRunIdentity} */ (runIdentity),
        terminalRun: current,
        outcome: current.status === "won" ? "won" : "lost",
        terminalAt: now()
      });
      reportFailure(result);
      if (result.record) {
        await render({
          verification: /** @type {"pending" | "verified" | "unverified"} */ (
            result.record.verification
          )
        });
      }
      settleTerminalResult(result);
      return result;
    } catch {
      const failure = { ok: false, reason: "storage", durable: false };
      reportFailure(failure);
      settleTerminalResult(failure);
      return failure;
    }
  }

  async function reconcile() {
    if (!isOnline()) {
      return { status: "pending", retry: true, reason: "offline" };
    }
    const result = await controller.reconcile();
    await renderFromDevice();
    return result;
  }

  async function boot() {
    const authAvailable =
      typeof playerController.auth !== "function" || playerController.auth();
    setAccountScope(playerController.getAuthenticatedUserId());
    if (authAvailable && ownerMismatch(accountScope)) {
      const cleared = scrubOfflineState();
      await signOut();
      clearActiveRun();
      if (!cleared) {
        const message =
          "This device could not erase Offline Continuity data. Clear this site's data before another player uses this device.";
        announce(message);
        showEvent(message);
      }
      return { status: "none", retry: false, cloudWritten: false };
    }
    let stored;
    let packageReady;
    try {
      stored = localStorage.getItem(OFFLINE_RUN_RECORD_KEY);
      packageReady = Boolean(
        localStorage.getItem("echo-maze:offline-receipt:v1") &&
        localStorage.getItem("echo-maze:offline-action-log:v1")
      );
    } catch {
      return { status: "none", retry: false, cloudWritten: false };
    }
    if (!stored && getActiveRunLocator()?.pending !== false) {
      return { status: "none", retry: false, cloudWritten: false };
    }
    if (isOnline() && packageReady) {
      return reconcile();
    }
    return renderFromDevice();
  }

  async function online() {
    const result = await reconcile();
    if (result?.retry === false && result.status !== "none") {
      active = false;
      setActive(false);
      clearActiveRun();
    }
    if (
      result?.status === "accepted" ||
      result?.status === "none" ||
      result?.status === "verified"
    ) {
      await playerController.retryLanternJournalSync();
    }
    return result;
  }

  function signOut() {
    return client.workerClient.signOut
      ? client.workerClient.signOut()
      : Promise.resolve({ ok: false, reason: "unsupported" });
  }

  return {
    renderFromDevice,
    boot,
    reconcile,
    online,
    signOut,
    prepare,
    recordTransition,
    continueRun,
    startRun,
    startFirstLight,
    selectQuestion,
    loadQuestion,
    terminal,
    cancelPreparation,
    setAccountScope,
    isActive: () => active
  };
}
