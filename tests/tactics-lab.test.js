import { describe, expect, it } from "vitest";
import {
  TACTICS_DRILL_IDS,
  TACTICS_TRAIL_TWIST_IDS,
  applyTacticsLabAction,
  createTacticsLabSession,
  getTacticsLabPublicState,
  listTacticsDrills
} from "../src/game/tactics-lab.js";

describe("Warden Tactics Lab contract", () => {
  it("publishes the four fixed drill cards and five accepted Trail Twists", () => {
    expect(TACTICS_DRILL_IDS).toEqual([
      "patrol",
      "hunt",
      "intercept",
      "trail-twists"
    ]);
    expect(TACTICS_TRAIL_TWIST_IDS).toEqual([
      "echo-hush-v1",
      "windways-v1",
      "echo-bridges-v1",
      "tide-doors-v1",
      "warden-bells-v1"
    ]);
    expect(listTacticsDrills()).toHaveLength(4);
    expect(listTacticsDrills().map((drill) => drill.id)).toEqual(
      TACTICS_DRILL_IDS
    );
  });

  it("creates deterministic sessions from production run rules", () => {
    const first = createTacticsLabSession("hunt");
    const second = createTacticsLabSession("hunt");

    expect(first).toEqual(second);
    expect(first.run.ruleset.revision).toBe("classic-v1");
    expect(first.run.status).toBe("active");
    expect(first.persisted).toBe(false);
  });

  it("rejects unknown drills and never mutates a prior session", () => {
    expect(() => createTacticsLabSession("unknown")).toThrow(
      "Tactics Lab drill is not available."
    );
    const session = createTacticsLabSession("patrol");
    const before = structuredClone(session);
    const next = applyTacticsLabAction(session, { type: "pulse" });

    expect(session).toEqual(before);
    expect(next).not.toBe(session);
    expect(next.run.moves).toBe(session.run.moves + 1);
    expect(next.persisted).toBe(false);
  });

  it("uses the fixed regional ruleset for each Trail Twist drill", () => {
    for (const revision of TACTICS_TRAIL_TWIST_IDS) {
      const session = createTacticsLabSession("trail-twists", revision);
      expect(session.run.ruleset.revision).toBe(revision);
      expect(session.twistId).toBe(revision);
    }
  });

  it("makes the Intercept card exercise the production eligible Warden", () => {
    const afterMove = applyTacticsLabAction(
      createTacticsLabSession("intercept"),
      { type: "move", direction: "down" }
    );

    expect(afterMove.run.wardens).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: 1, mode: "intercept" })])
    );
  });

  it("rejects unknown actions and restarts the same deterministic session", () => {
    const session = createTacticsLabSession("intercept");
    const advanced = applyTacticsLabAction(session, { type: "pulse" });
    const restarted = applyTacticsLabAction(advanced, { type: "restart" });

    expect(() =>
      applyTacticsLabAction(session, { type: "change-difficulty" })
    ).toThrow("Tactics Lab action is not available.");
    expect(restarted.stepIndex).toBe(0);
    expect(restarted.run).toEqual(session.run);
  });

  it("projects observed state without hidden map or answer-bearing fields", () => {
    const state = getTacticsLabPublicState(
      createTacticsLabSession("patrol")
    );

    expect(state).toMatchObject({
      drillId: "patrol",
      persisted: false,
      status: "active"
    });
    expect(state).not.toHaveProperty("labyrinth");
    expect(state).not.toHaveProperty("explorer");
    expect(state.wardens[0]).not.toHaveProperty("row");
    expect(state.wardens[0]).not.toHaveProperty("col");
    expect(state).not.toHaveProperty("question");
  });
});
