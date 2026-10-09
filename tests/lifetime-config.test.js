import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  describeLifetimeConfig,
  LifetimeConfigurationError,
  loadLifetimeConfig,
  resolveBillingConfiguration
} from "../server/lifetime-config.js";
import { createPlayerApi } from "../server/player-api.js";

const testEnv = {
  ECHO_MAZE_APP_ORIGIN: "https://maze.example",
  STRIPE_PRICE_ID: "price_echo_test",
  STRIPE_SECRET_KEY: "sk_test_safe-placeholder",
  STRIPE_WEBHOOK_SECRET: "whsec_safe-placeholder"
};

const liveEnv = {
  ...testEnv,
  ECHO_MAZE_BILLING_MODE: "live",
  STRIPE_SECRET_KEY: "sk_live_safe-placeholder",
  VERCEL_ENV: "production"
};

/** @param {Record<string, string | undefined>} env @param {string} key */
function without(env, key) {
  return Object.fromEntries(Object.entries(env).filter(([name]) => name !== key));
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("US-01 Billing Mode configuration", () => {
  it("US-01.1 an unset mode loads test mode with no mode field", () => {
    const result = describeLifetimeConfig(testEnv);
    expect(result.mode).toBe("test");
    expect(result.refusal).toBeNull();
    expect(result.config).not.toBeNull();
    expect(result.config).not.toHaveProperty("mode");
  });

  it("US-01.2 live loads with a live key on production over https", () => {
    const result = describeLifetimeConfig(liveEnv);
    expect(result.mode).toBe("live");
    expect(result.refusal).toBeNull();
    expect(result.config).toEqual({
      appOrigin: "https://maze.example",
      priceId: "price_echo_test",
      secretKey: "sk_live_safe-placeholder",
      webhookSecret: "whsec_safe-placeholder",
      expedition: null
    });
  });

  it.each(["sandbox", "LIVE"])(
    "US-01.2 refuses the mode value %s with a named reason",
    (value) => {
      const result = describeLifetimeConfig({
        ...testEnv,
        ECHO_MAZE_BILLING_MODE: value
      });
      expect(result).toEqual({
        mode: null,
        config: null,
        refusal: "invalid_mode"
      });
    }
  );

  it.each([
    ["test mode with a live key", { ...testEnv, STRIPE_SECRET_KEY: "sk_live_x" }],
    [
      "live mode with a test key",
      { ...liveEnv, STRIPE_SECRET_KEY: "sk_test_safe-placeholder" }
    ]
  ])("US-01.3 refuses %s with key_mode_mismatch", (_label, env) => {
    const result = describeLifetimeConfig(env);
    expect(result.config).toBeNull();
    expect(result.refusal).toBe("key_mode_mismatch");
  });

  it("US-01.4 the same environment loads twice to equal configs of one mode", () => {
    const first = describeLifetimeConfig(liveEnv);
    const second = describeLifetimeConfig(liveEnv);
    expect(second).toEqual(first);
    expect(second.mode).toBe(first.mode);
  });

  it.each(["STRIPE_PRICE_ID", "STRIPE_WEBHOOK_SECRET", "ECHO_MAZE_APP_ORIGIN"])(
    "US-01.5 returns no config when %s is missing",
    (key) => {
      expect(loadLifetimeConfig(without(testEnv, key))).toBeNull();
      expect(loadLifetimeConfig(without(liveEnv, key))).toBeNull();
    }
  );
});

describe("US-02 live mode only in production", () => {
  it("US-02.1 live loads on production over https with NODE_ENV alone", () => {
    const env = { ...without(liveEnv, "VERCEL_ENV"), NODE_ENV: "production" };
    expect(describeLifetimeConfig(env).mode).toBe("live");
    expect(describeLifetimeConfig(liveEnv).mode).toBe("live");
  });

  it.each([
    ["a Vercel preview", { ...liveEnv, VERCEL_ENV: "preview" }],
    [
      "a non-production NODE_ENV",
      { ...without(liveEnv, "VERCEL_ENV"), NODE_ENV: "development" }
    ]
  ])("US-02.2 refuses live on %s with live_requires_production", (_label, env) => {
    const result = describeLifetimeConfig(env);
    expect(result.config).toBeNull();
    expect(result.refusal).toBe("live_requires_production");
  });

  it("US-02.2 keeps test loading on a Vercel preview", () => {
    const result = describeLifetimeConfig({ ...testEnv, VERCEL_ENV: "preview" });
    expect(result.mode).toBe("test");
    expect(result.config).not.toBeNull();
  });

  it("US-02.2 refuses live on an http origin with live_requires_https_origin", () => {
    const result = describeLifetimeConfig({
      ...liveEnv,
      ECHO_MAZE_APP_ORIGIN: "http://maze.example"
    });
    expect(result.config).toBeNull();
    expect(result.refusal).toBe("live_requires_https_origin");
  });

  it.each([
    "https://localhost:3000",
    "https://127.0.0.1:8443",
    "https://[::1]:8443",
    "http://localhost:3000"
  ])("US-02.3 refuses live on the localhost origin %s", (origin) => {
    const result = describeLifetimeConfig({
      ...liveEnv,
      ECHO_MAZE_APP_ORIGIN: origin
    });
    expect(result.config).toBeNull();
    expect(result.refusal).toBe("live_requires_https_origin");
  });

  it("US-02.4 a refused live config makes the boot throw with the reason", () => {
    expect(() =>
      resolveBillingConfiguration({ ...liveEnv, VERCEL_ENV: "preview" })
    ).toThrow(LifetimeConfigurationError);
    expect(() =>
      resolveBillingConfiguration({ ...liveEnv, VERCEL_ENV: "preview" })
    ).toThrow("live_requires_production");
  });

  it("US-02.4 the long-running server boots through the billing check", () => {
    const boot = readFileSync(
      fileURLToPath(new URL("../server.js", import.meta.url)),
      "utf8"
    );
    expect(boot).toContain("resolveBillingConfiguration(process.env)");
  });

  it("US-02.4 the serverless path logs a billing refusal once per instance", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    createPlayerApi({ ...liveEnv, VERCEL_ENV: "preview" });
    expect(error).toHaveBeenCalledTimes(1);
    expect(error).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ reason: "live_requires_production" })
    );
  });
});
