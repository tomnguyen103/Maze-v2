import { describe, expect, it } from "vitest";
import { createOfflineContentPack } from "../server/offline-content-pack.js";

describe("Offline content pack", () => {
  it("resolves only the server-generated reviewed revision ids", () => {
    const pack = createOfflineContentPack("b".repeat(64));

    expect(pack.questionForRevision("scout-foundation-0")).toMatchObject({
      id: "scout-foundation-0",
      topicId: expect.any(String),
      learningObjectiveId: expect.any(String)
    });
    expect(pack.questionForRevision("capstone-trail-scout-foundation")).toMatchObject({
      id: "capstone-trail-scout-foundation"
    });
    expect(pack.questionForRevision("prompt: Which answer?")).toBeNull();
  });
});
