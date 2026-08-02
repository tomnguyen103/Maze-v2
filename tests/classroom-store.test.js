import { describe, expect, it, vi } from "vitest";
import { createClassroomStore } from "../server/classroom-store.js";

/**
 * @param {(sql: string, values?: unknown[]) => Record<string, unknown>[]} rowsFor
 */
function transactionalPool(rowsFor) {
  const client = {
    query: vi.fn(async (sql, values) => {
      if (sql === "BEGIN" || sql === "COMMIT" || sql === "ROLLBACK") {
        return { rows: [] };
      }
      if (sql.startsWith("SELECT set_config")) {
        return { rows: [] };
      }
      return { rows: rowsFor(sql, values) };
    }),
    release: vi.fn()
  };
  return {
    connect: vi.fn(async () => client),
    client
  };
}

describe("Classroom store", () => {
  it("lists only the signed-in Explorer's synchronized memberships", async () => {
    const pool = transactionalPool((/** @type {string} */ sql) =>
      sql.includes("FROM classroom_memberships")
        ? [{
            id: "org_class_1",
            name: "Comet Crew",
            role: "student"
          }]
        : []
    );
    const store = createClassroomStore(pool);

    await expect(store.listForUser("user_student_1")).resolves.toEqual([
      { id: "org_class_1", name: "Comet Crew", role: "student" }
    ]);
    expect(
      pool.client.query.mock.calls.some(
        ([sql]) =>
          String(sql).includes("classroom_memberships") &&
          String(sql).includes("clerk_user_id")
      )
    ).toBe(true);
  });

  it("requires a selected Teacher membership", async () => {
    const teacherPool = transactionalPool((/** @type {string} */ sql) =>
      sql.includes("SELECT role") ? [{ role: "teacher" }] : []
    );
    await expect(
      createClassroomStore(teacherPool).requireTeacher(
        "user_teacher_1",
        "org_class_1"
      )
    ).resolves.toBe("teacher");

    const studentPool = transactionalPool((/** @type {string} */ sql) =>
      sql.includes("SELECT role") ? [{ role: "student" }] : []
    );
    await expect(
      createClassroomStore(studentPool).requireTeacher(
        "user_student_1",
        "org_class_1"
      )
    ).rejects.toMatchObject({ name: "ClassroomAccessDeniedError" });
  });

  it("uses only the narrow aggregate function for Teacher progress", async () => {
    const pool = transactionalPool((/** @type {string} */ sql) => {
      if (sql.includes("SELECT role")) return [{ role: "teacher" }];
      if (sql.includes("read_classroom_progress")) {
        return [{
          objective_id: "addition-within-20",
          correct_count: 2,
          wrong_count: 1,
          hint_count: 0,
          skip_count: 1,
          total_count: 4,
          truncated: true
        }];
      }
      return [];
    });
    const store = createClassroomStore(pool);

    await expect(
      store.progressForTeacher("user_teacher_1", "org_class_1")
    ).resolves.toEqual({
      progress: [{
        objectiveId: "addition-within-20",
        correct: 2,
        wrong: 1,
        hints: 0,
        skips: 1,
        total: 4
      }],
      truncated: true
    });

    const sql = pool.client.query.mock.calls.map(([query]) => String(query));
    expect(sql.some((query) => query.includes("read_classroom_progress"))).toBe(
      true
    );
    expect(
      sql.some(
        (query) =>
          query.includes("SELECT journal") ||
          query.includes("jsonb_array_elements")
      )
    ).toBe(false);
  });
});
