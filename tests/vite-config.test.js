import { describe, expect, it } from "vitest";
import buildConfig from "../vite.config.mjs";

// Regression guard for the intermittent "Vitest caught 1 unhandled error"
// gate failure. Evaluating the Vite config under vitest used to construct the
// full player API at config load — a real pg Pool, a Stripe client, and Clerk
// middleware — none of which a unit-test run can ever serve. Test runs must
// get a config with no API plugin at all, and other modes must defer
// middleware construction until a dev or preview server actually starts.

const factory = /** @type {(env: { mode: string, command: string }) => any} */ (
  buildConfig
);

describe("vite config side effects", () => {
  it("registers no API middleware plugin for a vitest run", () => {
    const resolved = factory({ mode: "test", command: "serve" });
    expect(resolved.plugins ?? []).toEqual([]);
    expect(resolved.test).toEqual({ include: ["tests/*.test.js"] });
  });

  it("keeps the API plugin for dev and preview servers", () => {
    for (const mode of ["development", "production"]) {
      const resolved = factory({ mode, command: "serve" });
      expect(resolved.plugins).toHaveLength(1);
      expect(resolved.plugins[0].name).toBe("question-api");
      expect(typeof resolved.plugins[0].configureServer).toBe("function");
      expect(typeof resolved.plugins[0].configurePreviewServer).toBe(
        "function"
      );
    }
  });

  it("keeps ports and build output identical across modes", () => {
    const test = factory({ mode: "test", command: "serve" });
    const dev = factory({ mode: "development", command: "serve" });
    expect(test.server).toEqual(dev.server);
    expect(test.preview).toEqual(dev.preview);
    expect(test.build).toEqual(dev.build);
  });
});
