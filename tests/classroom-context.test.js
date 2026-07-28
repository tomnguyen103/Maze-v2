import { describe, expect, it, vi } from "vitest";
import {
  assertClassroomMembership,
  classroomIdFromRequest
} from "../server/classroom-context.js";

describe("Classroom request context", () => {
  it("accepts no context as Personal Play", () => {
    expect(classroomIdFromRequest({ headers: {} })).toBeNull();
  });

  it("accepts one normalized Clerk Organization id", () => {
    expect(
      classroomIdFromRequest({
        headers: { "x-echo-maze-classroom-id": "org_morning_123" }
      })
    ).toBe("org_morning_123");
  });

  it.each([
    "",
    "classroom_123",
    "org_x",
    "org_bad space",
    ["org_one", "org_two"]
  ])("rejects crafted context %j", (value) => {
    expect(() =>
      classroomIdFromRequest({
        headers: { "x-echo-maze-classroom-id": value }
      })
    ).toThrow("Classroom context is invalid.");
  });

  it("denies a selected Classroom until synchronized Membership exists", async () => {
    const database = {
      query: vi.fn(async () => ({ rows: [] }))
    };

    await expect(
      assertClassroomMembership(
        database,
        "user_student",
        "org_morning_123"
      )
    ).rejects.toMatchObject({ name: "ClassroomAccessDeniedError" });
  });
});
