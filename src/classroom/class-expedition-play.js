import {
  clearClassExpeditionSelection,
  loadClassExpeditionSelection,
  loadPendingClassRunOutcome,
  savePendingClassRunOutcome
} from "./class-expedition-selection.js";
import { loadSelectedClassroom } from "./classroom-selection.js";

/**
 * Game-side Class Expedition companion, loaded lazily so the game bundle
 * carries only its dynamic import. It authorizes each assigned Labyrinth
 * through an idempotent Classroom Run Grant, records terminal outcomes, and
 * fail-closes on lost Classroom Membership. Class Runs never receive offline
 * authority: every start and resume requires the online Grant check.
 *
 * @param {{
 *   client?: {
 *     issueClassRunGrant: (
 *       classroomId: string,
 *       expeditionId: string,
 *       input: { runId: string, labyrinthNumber: number }
 *     ) => Promise<{ grant: Record<string, unknown> }>,
 *     recordClassRunOutcome: (
 *       classroomId: string,
 *       expeditionId: string,
 *       input: {
 *         runId: string,
 *         labyrinthNumber: number,
 *         outcome: "escaped" | "defeated"
 *       }
 *     ) => Promise<unknown>
 *   },
 *   getUserId?: () => string | null,
 *   playerController?: {
 *     getApiClient: () => Record<string, any>,
 *     getAuthenticatedUserId: () => string | null
 *   },
 *   storage?: Pick<Storage, "getItem" | "setItem" | "removeItem"> | null,
 *   announce?: (message: string) => void,
 *   onFailClose?: () => Promise<void> | void
 * }} dependencies
 */
export function createClassExpeditionPlay({
  client,
  getUserId,
  playerController,
  storage = globalThis.localStorage,
  announce = () => {},
  onFailClose = async () => {}
}) {
  const api = /** @type {NonNullable<typeof client>} */ (
    client ?? playerController?.getApiClient()
  );
  const resolveUserId =
    getUserId ?? (() => playerController?.getAuthenticatedUserId() ?? null);
  /**
   * The Expedition selection is only live while its Classroom is still the
   * selected Class Play context. A stale selection (Personal Play resumed,
   * or another Classroom chosen) retires itself so Personal Runs are never
   * routed through Classroom Run Grants.
   */
  function selection() {
    const userId = resolveUserId();
    const active = loadClassExpeditionSelection(storage, userId);
    if (!active) {
      return null;
    }
    const selectedClassroom = loadSelectedClassroom(
      /** @type {Storage} */ (storage),
      userId
    );
    if (selectedClassroom !== active.classroomId) {
      clearClassExpeditionSelection(storage, userId);
      return null;
    }
    return active;
  }

  function deactivate() {
    clearClassExpeditionSelection(storage, resolveUserId());
  }

  /** @param {unknown} error */
  function statusOf(error) {
    const status = /** @type {{ status?: unknown }} */ (error)?.status;
    return typeof status === "number" ? status : 0;
  }

  async function handleMembershipLoss() {
    deactivate();
    announce(
      "Class Play for this Classroom has ended. Your Personal Play is untouched."
    );
    await onFailClose();
  }

  async function flushPendingOutcome() {
    const pending = loadPendingClassRunOutcome(storage, resolveUserId());
    if (!pending) {
      return;
    }
    try {
      await api.recordClassRunOutcome(
        pending.classroomId,
        pending.expeditionId,
        {
          runId: pending.runId,
          labyrinthNumber: pending.labyrinthNumber,
          outcome: pending.outcome
        }
      );
      savePendingClassRunOutcome(storage, resolveUserId(), null);
    } catch (error) {
      // Only a definitive server verdict settles the pending entry; a
      // transport failure, 5xx, or rate limit keeps it for the next attempt.
      const status = statusOf(error);
      if (status === 400 || status === 403 || status === 404 || status === 409) {
        savePendingClassRunOutcome(storage, resolveUserId(), null);
      }
      throw error;
    }
  }

  return {
    /**
     * @param {{ runId: string, labyrinthNumber: number }} locator
     * @returns {Promise<boolean | null>} true/false for an assigned Run;
     *   null when no live Class Expedition governs this device, so normal
     *   Personal admission should continue.
     */
    async authorize(locator) {
      const active = selection();
      if (!active) {
        deactivate();
        return null;
      }
      const regionEnd = active.atlasRegion * 4;
      const regionStart = regionEnd - 3;
      if (locator.labyrinthNumber > regionEnd) {
        deactivate();
        announce(
          "Class Expedition complete! Visit your Classroom page for the next assignment."
        );
        return false;
      }
      if (locator.labyrinthNumber < regionStart) {
        announce(
          "This Labyrinth is outside the assigned Atlas Region. Open your Classroom page."
        );
        return false;
      }
      try {
        // A definitive verdict on the PREVIOUS Run's outcome settles and
        // clears that entry, then rethrows. Letting it escape here would read
        // as a verdict on this start: the Grant is never attempted and the
        // Explorer is denied once, with the stale outcome's message. The entry
        // is already gone, so this start proceeds on its own merits.
        try {
          await flushPendingOutcome();
        } catch {
          // Intentionally ignored — settling a prior outcome is not a verdict
          // on this Labyrinth. A transient failure leaves the entry pending
          // for the next attempt.
        }
        await api.issueClassRunGrant(active.classroomId, active.expeditionId, {
          runId: locator.runId,
          labyrinthNumber: locator.labyrinthNumber
        });
        return true;
      } catch (error) {
        const status = statusOf(error);
        if (status === 403) {
          await handleMembershipLoss();
          return false;
        }
        if (status === 409 || status === 400) {
          announce(
            error instanceof Error && error.message
              ? error.message
              : "This Class Expedition cannot start a new Labyrinth right now."
          );
          return false;
        }
        announce(
          "Class Play needs a connection. Reconnect to continue this Class Expedition."
        );
        return false;
      }
    },

    /**
     * @param {string} runId
     * @param {number} labyrinthNumber
     * @param {boolean} won
     * @returns {Promise<"recorded" | "pending" | "removed" | "rejected" | "skipped">}
     */
    async recordOutcome(runId, labyrinthNumber, won) {
      const locator = { runId, labyrinthNumber };
      const active = selection();
      if (!active) {
        return "skipped";
      }
      const outcome = won ? "escaped" : "defeated";
      try {
        await api.recordClassRunOutcome(
          active.classroomId,
          active.expeditionId,
          {
            runId: locator.runId,
            labyrinthNumber: locator.labyrinthNumber,
            outcome
          }
        );
        if (won && locator.labyrinthNumber === active.atlasRegion * 4) {
          deactivate();
          announce(
            "Class Expedition complete! Visit your Classroom page for the next assignment."
          );
        }
        return "recorded";
      } catch (error) {
        const status = statusOf(error);
        if (status === 403) {
          await handleMembershipLoss();
          return "removed";
        }
        if (status === 400 || status === 404 || status === 409) {
          // A definitive server rejection is a real verdict, not a success:
          // say so instead of silently dropping the Class outcome.
          announce(
            error instanceof Error && error.message
              ? error.message
              : "This Class Run outcome could not be recorded."
          );
          return "rejected";
        }
        // Transport failures, 5xx, and rate limits are retryable: keep one
        // bounded pending outcome so the Grant cannot strand as issued.
        savePendingClassRunOutcome(storage, resolveUserId(), {
          classroomId: active.classroomId,
          expeditionId: active.expeditionId,
          runId: locator.runId,
          labyrinthNumber: locator.labyrinthNumber,
          outcome
        });
        return "pending";
      }
    }
  };
}
