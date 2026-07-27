import { describe, expect, it } from "vitest";
import { initErrorTracking } from "../server/error-tracking.js";
import { initTracing } from "../server/tracing.js";
import { scrubTelemetryEvent } from "../shared/telemetry-scrub.js";

describe("env-gated telemetry", () => {
  it("tracing is a no-op without an OTLP endpoint", async () => {
    await expect(initTracing({})).resolves.toBeNull();
  });

  it("error tracking is a no-op without a Sentry DSN", async () => {
    await expect(initErrorTracking({})).resolves.toBeNull();
  });
});

describe("telemetry event scrubbing", () => {
  it("reduces the user to their id", () => {
    const event = scrubTelemetryEvent({
      user: {
        id: "user_123",
        email: "kid@example.com",
        ip_address: "10.0.0.1",
        username: "Explorer Kid"
      }
    });
    expect(event.user).toEqual({ id: "user_123" });
  });

  it("drops a user with no id entirely", () => {
    const event = scrubTelemetryEvent({
      user: { email: "kid@example.com" }
    });
    expect(event.user).toBeUndefined();
  });

  it("strips request headers, cookies, bodies, and query strings", () => {
    const event = scrubTelemetryEvent({
      request: {
        url: "https://echo.example/api/scores?token=secret",
        headers: { authorization: "Bearer secret" },
        cookies: "__session=secret",
        data: { answer: "b" },
        query_string: "token=secret"
      }
    });
    expect(event.request).toEqual({ url: "https://echo.example/api/scores" });
    expect(JSON.stringify(event)).not.toContain("secret");
  });

  it("strips URL fragments, which can carry tokens", () => {
    const event = scrubTelemetryEvent({
      request: { url: "https://echo.example/callback#access_token=secret" }
    });
    expect(event.request).toEqual({ url: "https://echo.example/callback" });
  });

  it("leaves events without user or request untouched", () => {
    expect(scrubTelemetryEvent({ message: "boom" })).toEqual({
      message: "boom"
    });
  });
});
