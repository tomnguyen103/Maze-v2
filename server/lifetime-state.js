/**
 * @param {{
 *   currentEventCreated: number,
 *   currentState: string,
 *   eventCreated: number,
 *   requestedState: "active" | "refunded" | "disputed",
 *   source: "checkout" | "provider"
 * }} transition
 */
export function transitionLifetimeState(transition) {
  const {
    currentEventCreated,
    currentState,
    eventCreated,
    requestedState,
    source
  } = transition;
  if (eventCreated < currentEventCreated) {
    return {
      eventCreated: currentEventCreated,
      outcome: "stale",
      state: currentState
    };
  }
  if (currentState === "refunded" && requestedState !== "refunded") {
    return {
      eventCreated: currentEventCreated,
      outcome: "ignored",
      state: currentState
    };
  }
  if (eventCreated === currentEventCreated) {
    const precedence = {
      none: 0,
      active: 1,
      disputed: 2,
      refunded: 3
    };
    if (
      source === "provider" &&
      Number(Reflect.get(precedence, requestedState) ?? 0) >
        Number(Reflect.get(precedence, currentState) ?? 0)
    ) {
      return {
        eventCreated,
        outcome: "processed",
        state: requestedState
      };
    }
    return {
      eventCreated: currentEventCreated,
      outcome: currentState === requestedState ? "duplicate" : "stale",
      state: currentState
    };
  }
  if (
    source === "checkout" &&
    requestedState === "active" &&
    (currentState === "refunded" || currentState === "disputed")
  ) {
    return {
      eventCreated: currentEventCreated,
      outcome: "ignored",
      state: currentState
    };
  }
  return {
    eventCreated,
    outcome: "processed",
    state: requestedState
  };
}
