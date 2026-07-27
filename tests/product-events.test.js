import {
  createPostHogForwarder,
  createProductEventRecorder
} from "../server/product-events.js";
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

  it("drops unsafe values even when their field names are allowlisted", () => {
    const write = vi.fn();
    const record = createProductEventRecorder({ write });

    record("lifetime_webhook", {
      eventType: "raw webhook body: sk_test_secret",
      outcome: "simulated-card-secret"
    });
    record("run_access_error", {
      category: "session token: bearer-secret"
    });

    expect(write).toHaveBeenNthCalledWith(1, {
      event: "lifetime_webhook"
    });
    expect(write).toHaveBeenNthCalledWith(2, {
      event: "run_access_error"
    });
  });

  it("keeps only bounded booleans and known access states", () => {
    const write = vi.fn();
    const record = createProductEventRecorder({ write });

    record("run_access_decision", {
      accessState: "must-not-leak",
      duplicate: "true",
      enforcementEnabled: true,
      outcome: "admitted"
    });

    expect(write).toHaveBeenCalledWith({
      enforcementEnabled: true,
      event: "run_access_decision",
      outcome: "admitted"
    });
  });
});

describe("server-side PostHog forwarding", () => {
  it("is disabled entirely without a POSTHOG_API_KEY", () => {
    expect(createPostHogForwarder({})).toBeNull();
  });

  it("forwards only server-trusted events, already schema-filtered", () => {
    const fetcher = vi.fn(
      (/** @type {string} */ url, /** @type {{ body: string }} */ options) =>
        Promise.resolve({ ok: Boolean(url) && Boolean(options) })
    );
    const forward = createPostHogForwarder(
      { POSTHOG_API_KEY: "phc_test" },
      fetcher
    );
    if (!forward) throw new Error("Forwarder should be configured.");
    const write = vi.fn();
    const record = createProductEventRecorder({ write, forward });

    record("lifetime_confirmation", {
      outcome: "activated",
      userId: "must-not-leak"
    });
    record("rate_limit_hit", { budget: "question", scope: "ip" });

    expect(fetcher).toHaveBeenCalledTimes(1);
    const [url, options] = fetcher.mock.calls[0];
    expect(String(url)).toBe("https://us.i.posthog.com/capture/");
    const body = JSON.parse(options.body);
    expect(body.api_key).toBe("phc_test");
    expect(body.event).toBe("lifetime_confirmation");
    expect(body.properties.outcome).toBe("activated");
    // Forwarding sees the schema-filtered event, so identities can never
    // travel even if a call site passes them.
    expect(JSON.stringify(body)).not.toContain("must-not-leak");
  });

  it("honours POSTHOG_HOST", () => {
    const fetcher = vi.fn(
      (/** @type {string} */ url, /** @type {{ body: string }} */ options) =>
        Promise.resolve({ ok: Boolean(url) && Boolean(options) })
    );
    const forward = createPostHogForwarder(
      { POSTHOG_API_KEY: "phc_test", POSTHOG_HOST: "https://eu.i.posthog.com" },
      fetcher
    );
    if (!forward) throw new Error("Forwarder should be configured.");
    forward({ event: "run_access_decision", outcome: "admitted" });
    expect(String(fetcher.mock.calls[0][0])).toBe(
      "https://eu.i.posthog.com/capture/"
    );
  });

  it("swallows a synchronously throwing fetcher too", () => {
    const forward = createPostHogForwarder(
      { POSTHOG_API_KEY: "phc_test" },
      () => {
        throw new Error("bad host");
      }
    );
    if (!forward) throw new Error("Forwarder should be configured.");
    expect(() =>
      forward({ event: "lifetime_confirmation", outcome: "activated" })
    ).not.toThrow();
  });

  it("swallows delivery failures so analytics never fail a request", () => {
    const fetcher = vi.fn(
      (/** @type {string} */ url, /** @type {{ body: string }} */ options) =>
        Promise.reject(new Error(`offline ${Boolean(url && options)}`))
    );
    const forward = createPostHogForwarder(
      { POSTHOG_API_KEY: "phc_test" },
      fetcher
    );
    if (!forward) throw new Error("Forwarder should be configured.");
    expect(() =>
      forward({ event: "lifetime_confirmation", outcome: "activated" })
    ).not.toThrow();
  });
});
