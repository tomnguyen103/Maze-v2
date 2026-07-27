import { describe, expect, it } from "vitest";
import { createLogger, redactError } from "../server/logger.js";

/** Collects each JSON log line pino writes. */
function collectingDestination() {
  /** @type {Record<string, unknown>[]} */
  const lines = [];
  return {
    lines,
    write(/** @type {string} */ chunk) {
      for (const line of chunk.split("\n")) {
        if (line.trim()) {
          lines.push(JSON.parse(line));
        }
      }
    }
  };
}

describe("structured logger", () => {
  it("writes JSON lines at info level by default", () => {
    const destination = collectingDestination();
    const logger = createLogger({}, destination);
    logger.info({ route: "/api/profile" }, "request");
    logger.debug({ route: "/api/profile" }, "hidden");
    expect(destination.lines).toHaveLength(1);
    expect(destination.lines[0]).toMatchObject({
      msg: "request",
      route: "/api/profile"
    });
  });

  it("honours LOG_LEVEL", () => {
    const destination = collectingDestination();
    const logger = createLogger({ LOG_LEVEL: "warn" }, destination);
    logger.info({}, "hidden");
    logger.warn({}, "shown");
    expect(destination.lines).toHaveLength(1);
    expect(destination.lines[0].msg).toBe("shown");
  });

  it("redacts error objects down to a safe class name", () => {
    const destination = collectingDestination();
    const logger = createLogger({}, destination);
    logger.error(
      { err: new Error("password=hunter2 for user@example.com") },
      "boom"
    );
    const line = JSON.stringify(destination.lines[0]);
    expect(destination.lines[0].err).toEqual({ name: "Error" });
    expect(line).not.toContain("hunter2");
    expect(line).not.toContain("user@example.com");
  });

  it("keeps the safe-error-log semantics in the serializer", () => {
    expect(redactError(new TypeError("secret"))).toEqual({ name: "Error" });
    expect(redactError({ message: "secret" })).toEqual({
      name: "UnknownError"
    });
  });

  it("binds request context onto child loggers", () => {
    const destination = collectingDestination();
    const logger = createLogger({}, destination);
    const child = logger.child({ request_id: "req_123" });
    child.info({}, "request");
    expect(destination.lines[0].request_id).toBe("req_123");
  });
});
