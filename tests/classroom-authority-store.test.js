import { describe, expect, it } from "vitest";
import { createClassroomAuthorityStore } from "../server/classroom-authority-store.js";

/** @param {boolean} applied */
function databaseReturning(applied) {
  /** @type {{ sql: string, values: unknown[] }[]} */
  const calls = [];
  return {
    calls,
    /** @param {string} sql @param {unknown[]} [values] */
    async query(sql, values = []) {
      calls.push({ sql, values });
      return { rows: [{ applied }] };
    }
  };
}

describe("Classroom authority store", () => {
  it("uses the narrow definer function for Classroom synchronization", async () => {
    const database = databaseReturning(true);
    const store = createClassroomAuthorityStore(database);

    await expect(
      store.upsertClassroom({
        id: "org_classroom",
        name: "Morning Explorers",
        occurredAt: 100
      })
    ).resolves.toBe(true);

    expect(database.calls[0]).toEqual({
      sql: "SELECT sync_classroom($1, $2, $3) AS applied",
      values: ["org_classroom", "Morning Explorers", 100]
    });
  });

  it("leaves deleted-user tombstone enforcement inside the definer function", async () => {
    const database = databaseReturning(false);
    const store = createClassroomAuthorityStore(database);

    await expect(
      store.upsertMembership({
        id: "orgmem_student",
        classroomId: "org_classroom",
        userId: "user_student",
        role: "student",
        occurredAt: 200
      })
    ).resolves.toBe(false);

    expect(database.calls[0]).toEqual({
      sql: "SELECT sync_classroom_membership($1, $2, $3, $4, $5) AS applied",
      values: [
        "orgmem_student",
        "org_classroom",
        "user_student",
        "student",
        200
      ]
    });
  });

  it("deletes by stable authority ids through definer functions", async () => {
    const database = databaseReturning(true);
    const store = createClassroomAuthorityStore(database);

    await store.deleteClassroom({ id: "org_classroom", occurredAt: 300 });
    await store.deleteMembership({ id: "orgmem_student", occurredAt: 400 });

    expect(database.calls).toEqual([
      {
        sql: "SELECT delete_classroom($1, $2) AS applied",
        values: ["org_classroom", 300]
      },
      {
        sql: "SELECT delete_classroom_membership($1, $2) AS applied",
        values: ["orgmem_student", 400]
      }
    ]);
  });
});
