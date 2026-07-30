// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import { createClassExpeditionPlay } from "../src/classroom/class-expedition-play.js";
import {
  CLASS_EXPEDITION_ACTIVE_KEY,
  loadClassExpeditionSelection,
  loadPendingClassRunOutcome,
  saveClassExpeditionSelection,
  savePendingClassRunOutcome
} from "../src/classroom/class-expedition-selection.js";

const USER = "user_student_play_1";
const SELECTION = {
  classroomId: "org_class_play_1",
  expeditionId: "exped_play_1",
  atlasRegion: 2,
  levelId: "trail-scout",
  learningDeckId: "mixed-trail",
  learningDeckRevision:
    "deck:mixed-trail:v1:d0647e88de6cbe1dea606b07e468ab92"
};

function fakeStorage() {
  /** @type {Map<string, string>} */
  const map = new Map();
  return {
    /** @param {string} key */
    getItem: (key) => map.get(key) ?? null,
    /** @param {string} key @param {string} value */
    setItem: (key, value) => void map.set(key, String(value)),
    /** @param {string} key */
    removeItem: (key) => void map.delete(key)
  };
}

/** @param {number} status */
function apiError(status, message = "denied") {
  const error = new Error(message);
  // Mirrors PlayerApiError's status field without importing browser wiring.
  Object.assign(error, { status });
  return error;
}

/** @param {Record<string, unknown>} [clientOverrides] */
function play(clientOverrides = {}) {
  const storage = fakeStorage();
  saveClassExpeditionSelection(storage, USER, SELECTION);
  const client = {
    issueClassRunGrant: vi.fn(async () => ({
      grant: { runId: "class_run_p0001", status: "issued", duplicate: false }
    })),
    recordClassRunOutcome: vi.fn(async () => ({ recorded: true })),
    ...clientOverrides
  };
  const announce = vi.fn();
  const onFailClose = vi.fn(async () => {});
  const module = createClassExpeditionPlay({
    client,
    getUserId: () => USER,
    storage,
    announce,
    onFailClose
  });
  return { module, client, announce, onFailClose, storage };
}

describe("Class Expedition play", () => {
  it("authorizes an assigned Labyrinth through an idempotent Grant", async () => {
    const { module, client } = play();
    await expect(
      module.authorizeClassRun({ runId: "class_run_p0001", labyrinthNumber: 6 })
    ).resolves.toBe(true);
    expect(client.issueClassRunGrant).toHaveBeenCalledWith(
      "org_class_play_1",
      "exped_play_1",
      { runId: "class_run_p0001", labyrinthNumber: 6 }
    );
  });

  it("refuses Labyrinths outside the assigned Region and completes past it", async () => {
    const { module, client, storage } = play();
    await expect(
      module.authorizeClassRun({ runId: "class_run_p0001", labyrinthNumber: 4 })
    ).resolves.toBe(false);
    await expect(
      module.authorizeClassRun({ runId: "class_run_p0001", labyrinthNumber: 9 })
    ).resolves.toBe(false);
    // Advancing past the Region end retires the selection entirely.
    expect(loadClassExpeditionSelection(storage, USER)).toBeNull();
    expect(storage.getItem(CLASS_EXPEDITION_ACTIVE_KEY)).toBeNull();
    expect(client.issueClassRunGrant).not.toHaveBeenCalled();
  });

  it("fail-closes on lost Membership: recovery deleted, no Class result", async () => {
    const { module, client, onFailClose, storage } = play({
      issueClassRunGrant: vi.fn(async () => {
        throw apiError(403);
      })
    });
    await expect(
      module.authorizeClassRun({ runId: "class_run_p0001", labyrinthNumber: 5 })
    ).resolves.toBe(false);
    expect(onFailClose).toHaveBeenCalled();
    expect(loadClassExpeditionSelection(storage, USER)).toBeNull();
    expect(client.issueClassRunGrant).toHaveBeenCalled();
  });

  it("blocks new starts on closed or exhausted assignments without fail-closing", async () => {
    const { module, announce, onFailClose } = play({
      issueClassRunGrant: vi.fn(async () => {
        throw apiError(409, "Class Expedition is closed.");
      })
    });
    await expect(
      module.authorizeClassRun({ runId: "class_run_p0001", labyrinthNumber: 5 })
    ).resolves.toBe(false);
    expect(announce).toHaveBeenCalledWith("Class Expedition is closed.");
    expect(onFailClose).not.toHaveBeenCalled();
  });

  it("never grants offline authority: network failure pauses Class Play", async () => {
    const { module, announce } = play({
      issueClassRunGrant: vi.fn(async () => {
        throw new Error("fetch failed");
      })
    });
    await expect(
      module.authorizeClassRun({ runId: "class_run_p0001", labyrinthNumber: 5 })
    ).resolves.toBe(false);
    expect(String(announce.mock.calls[0][0])).toContain("connection");
  });

  it("records terminal outcomes and retires the selection at the Region end", async () => {
    const { module, client, storage } = play();
    await expect(
      module.recordClassRunOutcome(
        { runId: "class_run_p0001", labyrinthNumber: 8 },
        true
      )
    ).resolves.toBe("recorded");
    expect(client.recordClassRunOutcome).toHaveBeenCalledWith(
      "org_class_play_1",
      "exped_play_1",
      {
        runId: "class_run_p0001",
        labyrinthNumber: 8,
        outcome: "escaped"
      }
    );
    expect(loadClassExpeditionSelection(storage, USER)).toBeNull();
  });

  it("keeps one pending outcome across a transport failure and flushes it", async () => {
    /** @type {import("vitest").Mock<(...args: unknown[]) => Promise<unknown>>} */
    const failing = vi.fn(async () => {
      throw new Error("offline");
    });
    const { module, storage } = play({ recordClassRunOutcome: failing });
    await expect(
      module.recordClassRunOutcome(
        { runId: "class_run_p0001", labyrinthNumber: 5 },
        false
      )
    ).resolves.toBe("pending");
    expect(loadPendingClassRunOutcome(storage, USER)).toMatchObject({
      runId: "class_run_p0001",
      labyrinthNumber: 5,
      outcome: "defeated"
    });

    failing.mockImplementation(async () => ({ recorded: true }));
    await expect(
      module.authorizeClassRun({ runId: "class_run_p0002", labyrinthNumber: 5 })
    ).resolves.toBe(true);
    expect(loadPendingClassRunOutcome(storage, USER)).toBeNull();
  });

  it("treats a removed Membership at terminal state as no Class result", async () => {
    const { module, onFailClose } = play({
      recordClassRunOutcome: vi.fn(async () => {
        throw apiError(403);
      })
    });
    await expect(
      module.recordClassRunOutcome(
        { runId: "class_run_p0001", labyrinthNumber: 5 },
        true
      )
    ).resolves.toBe("removed");
    expect(onFailClose).toHaveBeenCalled();
  });

  it("stores and validates selections and pending outcomes defensively", () => {
    const storage = fakeStorage();
    expect(loadClassExpeditionSelection(storage, USER)).toBeNull();
    saveClassExpeditionSelection(storage, USER, SELECTION);
    expect(loadClassExpeditionSelection(storage, USER)).toEqual(SELECTION);
    storage.setItem(`echo-maze:class-expedition:v1:${USER}`, "{broken");
    expect(loadClassExpeditionSelection(storage, USER)).toBeNull();
    savePendingClassRunOutcome(storage, USER, {
      classroomId: SELECTION.classroomId,
      expeditionId: SELECTION.expeditionId,
      runId: "class_run_p0001",
      labyrinthNumber: 5,
      outcome: "escaped"
    });
    expect(loadPendingClassRunOutcome(storage, USER)).not.toBeNull();
    savePendingClassRunOutcome(storage, USER, null);
    expect(loadPendingClassRunOutcome(storage, USER)).toBeNull();
  });
});
