import { describe, expect, it, vi } from "vitest";
import { createClassroomDomainStore } from "../server/classroom-domain-store.js";

describe("Classroom Domain store", () => {
  it("uses the narrow registration and lookup functions", async () => {
    const database = {
      query: vi.fn(async (sql) => {
        if (sql.includes("register_classroom_domain")) {
          return {
            rows: [{
              domain: "students.school.example",
              auto_join_enabled: true
            }]
          };
        }
        if (sql.includes("read_classroom_domain")) {
          return {
            rows: [{
              domain: "students.school.example",
              auto_join_enabled: true
            }]
          };
        }
        return { rows: [{ classroom_id: "org_class_1" }] };
      })
    };
    const store = createClassroomDomainStore(database);

    await expect(
      store.registerDomain(
        "user_teacher_1",
        "org_class_1",
        "students.school.example"
      )
    ).resolves.toEqual({
      domain: "students.school.example",
      autoJoinEnabled: true
    });
    await expect(
      store.domainForTeacher("user_teacher_1", "org_class_1")
    ).resolves.toEqual({
      domain: "students.school.example",
      autoJoinEnabled: true
    });
    await expect(
      store.classroomForDomain("students.school.example")
    ).resolves.toBe("org_class_1");

    expect(database.query.mock.calls).toEqual([
      [
        expect.stringContaining("register_classroom_domain"),
        ["org_class_1", "user_teacher_1", "students.school.example", null]
      ],
      [
        expect.stringContaining("read_classroom_domain"),
        ["org_class_1", "user_teacher_1"]
      ],
      [
        expect.stringContaining("classroom_for_verified_domain"),
        ["students.school.example"]
      ]
    ]);
  });

  it("maps a database uniqueness conflict to a safe domain conflict", async () => {
    const database = {
      query: vi.fn(async () => {
        throw Object.assign(new Error("duplicate"), { code: "23505" });
      })
    };

    await expect(
      createClassroomDomainStore(database).registerDomain(
        "user_teacher_1",
        "org_class_1",
        "students.school.example"
      )
    ).rejects.toMatchObject({ name: "ClassroomDomainConflictError" });
  });
});
