import {
  clearClassExpeditionSelection,
  loadClassExpeditionSelection,
  loadPendingClassRunOutcome,
  savePendingClassRunOutcome
} from "./class-expedition-selection.js";

/**
 * Game-side Class Expedition companion, loaded lazily so the game bundle
 * carries only its dynamic import. It authorizes each assigned Labyrinth
 * through an idempotent Classroom Run Grant, records terminal outcomes, and
 * fail-closes on lost Classroom Membership. Class Runs never receive offline
 * authority: every start and resume requires the online Grant check.
 *
 * @param {{
 *   client: {
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
 *   getUserId: () => string | null,
 *   storage?: Pick<Storage, "getItem" | "setItem" | "removeItem"> | null,
 *   announce?: (message: string) => void,
 *   onFailClose?: () => Promise<void> | void
 * }} dependencies
 */
export function createClassExpeditionPlay({
  client,
  getUserId,
  storage = globalThis.localStorage,
  announce = () => {},
  onFailClose = async () => {}
}) {
  function selection() {
    return loadClassExpeditionSelection(storage, getUserId());
  }

  function deactivate() {
    clearClassExpeditionSelection(storage, getUserId());
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
    const pending = loadPendingClassRunOutcome(storage, getUserId());
    if (!pending) {
      return;
    }
    try {
      await client.recordClassRunOutcome(
        pending.classroomId,
        pending.expeditionId,
        {
          runId: pending.runId,
          labyrinthNumber: pending.labyrinthNumber,
          outcome: pending.outcome
        }
      );
      savePendingClassRunOutcome(storage, getUserId(), null);
    } catch (error) {
      // Any server verdict settles the pending entry; only transport
      // failures keep it for the next attempt.
      if (statusOf(error) > 0) {
        savePendingClassRunOutcome(storage, getUserId(), null);
      }
      throw error;
    }
  }

  return {
    /**
     * @param {{ runId: string, labyrinthNumber: number }} locator
     * @returns {Promise<boolean>} whether the assigned Run may start/resume
     */
    async authorizeClassRun(locator) {
      const active = selection();
      if (!active) {
        deactivate();
        announce("Open your Classroom page to continue the Class Expedition.");
        return false;
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
        await flushPendingOutcome();
        await client.issueClassRunGrant(active.classroomId, active.expeditionId, {
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
     * @param {{ runId: string, labyrinthNumber: number }} locator
     * @param {boolean} won
     * @returns {Promise<"recorded" | "pending" | "removed" | "skipped">}
     */
    async recordClassRunOutcome(locator, won) {
      const active = selection();
      if (!active) {
        return "skipped";
      }
      const outcome = won ? "escaped" : "defeated";
      try {
        await client.recordClassRunOutcome(
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
        if (status === 0) {
          savePendingClassRunOutcome(storage, getUserId(), {
            classroomId: active.classroomId,
            expeditionId: active.expeditionId,
            runId: locator.runId,
            labyrinthNumber: locator.labyrinthNumber,
            outcome
          });
          return "pending";
        }
        return "recorded";
      }
    }
  };
}
