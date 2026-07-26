import {
  transitionLifetimeState
} from "../server/lifetime-state.js";
import { describe, expect, it } from "vitest";

describe("lifetime entitlement transitions", () => {
  it("activates a newly paid purchase", () => {
    expect(
      transitionLifetimeState({
        currentEventCreated: 0,
        currentState: "none",
        eventCreated: 100,
        requestedState: "active",
        source: "checkout"
      })
    ).toEqual({
      eventCreated: 100,
      outcome: "processed",
      state: "active"
    });
  });

  it("keeps a refund or dispute when a later-delivered paid event arrives", () => {
    for (const state of ["refunded", "disputed"]) {
      expect(
        transitionLifetimeState({
          currentEventCreated: 200,
          currentState: state,
          eventCreated: 300,
          requestedState: "active",
          source: "checkout"
        })
      ).toEqual({
        eventCreated: 200,
        outcome: "ignored",
        state
      });
    }
  });

  it("ignores an older provider event", () => {
    expect(
      transitionLifetimeState({
        currentEventCreated: 200,
        currentState: "active",
        eventCreated: 199,
        requestedState: "refunded",
        source: "provider"
      })
    ).toEqual({
      eventCreated: 200,
      outcome: "stale",
      state: "active"
    });
  });

  it("restores disputed access only from an explicit provider outcome", () => {
    expect(
      transitionLifetimeState({
        currentEventCreated: 200,
        currentState: "disputed",
        eventCreated: 201,
        requestedState: "active",
        source: "provider"
      })
    ).toEqual({
      eventCreated: 201,
      outcome: "processed",
      state: "active"
    });
  });

  it("never restores a refunded purchase from a dispute outcome", () => {
    expect(
      transitionLifetimeState({
        currentEventCreated: 200,
        currentState: "refunded",
        eventCreated: 201,
        requestedState: "active",
        source: "provider"
      })
    ).toEqual({
      eventCreated: 200,
      outcome: "ignored",
      state: "refunded"
    });
    expect(
      transitionLifetimeState({
        currentEventCreated: 201,
        currentState: "refunded",
        eventCreated: 202,
        requestedState: "disputed",
        source: "provider"
      })
    ).toEqual({
      eventCreated: 201,
      outcome: "ignored",
      state: "refunded"
    });
  });

  it("treats the same state and event time as idempotent", () => {
    expect(
      transitionLifetimeState({
        currentEventCreated: 200,
        currentState: "refunded",
        eventCreated: 200,
        requestedState: "refunded",
        source: "provider"
      })
    ).toEqual({
      eventCreated: 200,
      outcome: "duplicate",
      state: "refunded"
    });
  });

  it("does not lose a restrictive event created in the same second", () => {
    expect(
      transitionLifetimeState({
        currentEventCreated: 200,
        currentState: "active",
        eventCreated: 200,
        requestedState: "disputed",
        source: "provider"
      })
    ).toEqual({
      eventCreated: 200,
      outcome: "processed",
      state: "disputed"
    });
    expect(
      transitionLifetimeState({
        currentEventCreated: 200,
        currentState: "disputed",
        eventCreated: 200,
        requestedState: "active",
        source: "provider"
      })
    ).toEqual({
      eventCreated: 200,
      outcome: "stale",
      state: "disputed"
    });
  });
});
