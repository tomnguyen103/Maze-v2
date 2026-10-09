import { describe, expect, it } from "vitest";
import { safeErrorName } from "../server/safe-error-log.js";

describe("privacy-safe error logging", () => {
  it("uses only two bounded error categories", () => {
    const error = new Error("secret detail");
    error.name = "secret-custom-name";

    expect(safeErrorName(error)).toBe("Error");
    expect(safeErrorName({ name: "secret-object-name" })).toBe(
      "UnknownError"
    );
  });
});
