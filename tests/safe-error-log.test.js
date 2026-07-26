import { describe, expect, it, vi } from "vitest";
import {
  logProviderFallback,
  safeErrorName
} from "../server/safe-error-log.js";

describe("privacy-safe error logging", () => {
  it("uses only two bounded error categories", () => {
    const error = new Error("secret detail");
    error.name = "secret-custom-name";

    expect(safeErrorName(error)).toBe("Error");
    expect(safeErrorName({ name: "secret-object-name" })).toBe(
      "UnknownError"
    );
  });

  it("does not serialize provider errors", () => {
    const warning = vi.spyOn(console, "warn").mockImplementation(() => {});

    try {
      logProviderFallback(
        new Error("Bearer secret-token; child answer: private text")
      );

      expect(warning).toHaveBeenCalledWith(
        "[questions] AI provider unavailable; using bundled deck.",
        { name: "Error" }
      );
      expect(JSON.stringify(warning.mock.calls)).not.toMatch(
        /secret-token|private text/
      );
    } finally {
      warning.mockRestore();
    }
  });
});
