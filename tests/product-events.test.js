import { createProductEventRecorder } from "../server/product-events.js";
import { describe, expect, it, vi } from "vitest";

describe("privacy-minimized product events", () => {
  it("records only the allowlisted Run Access decision fields", () => {
    const write = vi.fn();
    const record = createProductEventRecorder({ write });

    record("run_access_decision", {
      accessState: "free",
      duplicate: true,
      enforcementEnabled: true,
      outcome: "admitted",
      runId: "must-not-leak",
      userId: "must-not-leak"
    });

    expect(write).toHaveBeenCalledWith({
      accessState: "free",
      duplicate: true,
      enforcementEnabled: true,
      event: "run_access_decision",
      outcome: "admitted"
    });
  });

  it("drops unknown event names instead of logging arbitrary data", () => {
    const write = vi.fn();
    const record = createProductEventRecorder({ write });

    record("raw_webhook", { body: "secret" });

    expect(write).not.toHaveBeenCalled();
  });

  it("drops inherited object keys instead of treating them as event schemas", () => {
    const write = vi.fn();
    const record = createProductEventRecorder({ write });

    expect(() => record("constructor", { body: "secret" })).not.toThrow();
    expect(write).not.toHaveBeenCalled();
  });

  it("keeps Lifetime Membership events free of account and payment IDs", () => {
    const write = vi.fn();
    const record = createProductEventRecorder({ write });

    record("lifetime_webhook", {
      eventId: "must-not-leak",
      eventType: "checkout.session.completed",
      outcome: "processed",
      paymentIntentId: "must-not-leak",
      userId: "must-not-leak"
    });

    expect(write).toHaveBeenCalledWith({
      event: "lifetime_webhook",
      eventType: "checkout.session.completed",
      outcome: "processed"
    });
  });
});
