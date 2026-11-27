import { describe, expect, it, vi } from "vitest";
import { announceCopyResult } from "../src/game/shell/copy-result.js";

const messages = { copied: "copied", failed: "failed" };

describe("announceCopyResult", () => {
  it("reports success from a good clipboard write", async () => {
    const announce = vi.fn();
    await announceCopyResult(Promise.resolve(), messages, announce);
    expect(announce).toHaveBeenCalledOnce();
    expect(announce).toHaveBeenCalledWith("copied");
  });

  it("reports failure from a rejected clipboard write", async () => {
    const announce = vi.fn();
    await announceCopyResult(Promise.reject(new Error("denied")), messages, announce);
    expect(announce).toHaveBeenCalledWith("failed");
  });
});
