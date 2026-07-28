import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { Pool } from "pg";
import { exportUserSnapshot } from "../server/data-export.js";
import { normalizeDatabaseConnectionString } from "../server/database.js";
import { withTenantContext } from "../server/tenant-context.js";
import { createUserDeletionStore } from "../server/user-deletion-store.js";

const databaseUrl = process.env.DATABASE_URL ?? "";
const adminDatabaseUrl = process.env.DATABASE_ADMIN_URL ?? "";
const runIntegration =
  process.env.RUN_DATABASE_INTEGRATION === "1" &&
  Boolean(databaseUrl) &&
  Boolean(adminDatabaseUrl);

/** @type {Pool | null} */
let runtimePool = null;
/** @type {Pool | null} */
let adminPool = null;

describe.runIf(runIntegration)("Classroom PostgreSQL tenant boundary", () => {
  afterAll(async () => {
    await Promise.all([runtimePool?.end(), adminPool?.end()]);
  });

  it("forces RLS and clears pooled tenant context after commit and rollback", async () => {
    runtimePool = new Pool({
      connectionString: normalizeDatabaseConnectionString(databaseUrl),
      max: 1
    });
    adminPool = new Pool({
      connectionString: normalizeDatabaseConnectionString(adminDatabaseUrl),
      max: 1
    });

    const suffix = randomUUID().replaceAll("-", "");
    const explorerId = `user_${suffix}`;
    const otherExplorerId = `user_other_${suffix}`;
    const classroomA = `org_a_${suffix}`;
    const classroomB = `org_b_${suffix}`;
    const classroomC = `org_c_${suffix}`;

    try {
      const boundary = await runtimePool.query(
        `SELECT
           current_user AS runtime_login,
           role.rolsuper,
           role.rolbypassrls,
           pg_has_role(
             current_user,
             'echo_maze_runtime',
             'member'
           ) AS runtime_member,
           ARRAY_AGG(
             pg_get_userbyid(class.relowner)::TEXT
             ORDER BY class.relname
           ) AS tenant_owners
         FROM pg_roles AS role
         CROSS JOIN pg_class AS class
         WHERE role.rolname = current_user
           AND class.relname = ANY($1::TEXT[])
         GROUP BY current_user, role.rolsuper, role.rolbypassrls`,
        [[
          "classrooms",
          "classroom_memberships",
          "cloud_quest_progress",
          "learning_journals"
        ]]
      );
      expect(boundary.rows[0]).toMatchObject({
        rolsuper: false,
        rolbypassrls: false,
        runtime_member: true,
        tenant_owners: Array(4).fill("echo_maze_tenant_owner")
      });
      expect(boundary.rows[0]?.runtime_login).not.toBe(
        "echo_maze_tenant_owner"
      );

      const adminClient = await adminPool.connect();
      try {
        await adminClient.query("BEGIN");
        await adminClient.query(
          `INSERT INTO player_access (clerk_user_id)
           VALUES ($1), ($2)`,
          [explorerId, otherExplorerId]
        );
        await adminClient.query(
          `INSERT INTO classrooms (id, name)
           VALUES
             ($1, 'Class A'),
             ($2, 'Class B'),
             ($3, 'Class C')`,
          [classroomA, classroomB, classroomC]
        );
        await adminClient.query(
          `INSERT INTO classroom_memberships (
             classroom_id,
             clerk_user_id,
             clerk_membership_id,
             role
           )
           VALUES
             ($1, $3, $4, 'student'),
             ($2, $3, $5, 'student'),
             ($1, $6, $7, 'student')`,
          [
            classroomA,
            classroomB,
            explorerId,
            `orgmem_a_${suffix}`,
            `orgmem_b_${suffix}`,
            otherExplorerId,
            `orgmem_other_${suffix}`
          ]
        );
        await adminClient.query(
          `INSERT INTO cloud_quest_progress (
             clerk_user_id,
             classroom_id,
             quest_id,
             level_id,
             labyrinth_number,
             completed_labyrinths,
             next_question_ordinal,
             complete
           )
           VALUES
             ($1, NULL, 'quest_personal_rls', 'bright-start', 1, 0, 0, FALSE),
             ($1, $2, 'quest_class_a_rls', 'bright-start', 1, 0, 0, FALSE),
             ($1, $3, 'quest_class_b_rls', 'bright-start', 1, 0, 0, FALSE),
             ($4, $2, 'quest_other_rls', 'bright-start', 1, 0, 0, FALSE)`,
          [
            explorerId,
            classroomA,
            classroomB,
            otherExplorerId
          ]
        );
        await adminClient.query(
          `INSERT INTO learning_journals (
             clerk_user_id,
             classroom_id
           )
           VALUES
             ($1, NULL),
             ($1, $2),
             ($1, $3)`,
          [explorerId, classroomA, classroomB]
        );
        await adminClient.query("COMMIT");
      } catch (error) {
        await adminClient.query("ROLLBACK").catch(() => {});
        throw error;
      } finally {
        adminClient.release();
      }

      const exported = await exportUserSnapshot(runtimePool, explorerId, {
        now: () => "2026-07-28T00:00:00.000Z"
      });
      expect(exported.data.classroom_memberships.map(
        (membership) => membership.classroom_id
      )).toEqual([classroomA, classroomB]);
      expect(exported.data.quest_progress).toMatchObject({
        quest_id: "quest_personal_rls"
      });
      expect(exported.data.class_quest_progress.map(
        (progress) => progress.classroom_id
      )).toEqual([classroomA, classroomB]);
      expect(exported.data.class_journals.map(
        (journal) => journal.classroom_id
      )).toEqual([classroomA, classroomB]);

      await expect(
        withTenantContext(
          runtimePool,
          { explorerId, classroomId: classroomA },
          async (client) => {
            const visible = await client.query(
              `SELECT classroom_id
               FROM cloud_quest_progress
               ORDER BY classroom_id NULLS FIRST`
            );
            expect(visible.rows).toEqual([{ classroom_id: classroomA }]);

            const crossClass = await client.query(
              `SELECT record_id
               FROM cloud_quest_progress
               WHERE classroom_id = $1`,
              [classroomB]
            );
            expect(crossClass.rows).toEqual([]);

            const crossExplorer = await client.query(
              `SELECT record_id
               FROM cloud_quest_progress
               WHERE clerk_user_id = $1`,
              [otherExplorerId]
            );
            expect(crossExplorer.rows).toEqual([]);
          }
        )
      ).resolves.toBeUndefined();

      await expect(
        withTenantContext(
          runtimePool,
          { explorerId, classroomId: classroomC },
          async (client) => {
            const nonmemberClass = await client.query(
              `SELECT record_id
               FROM cloud_quest_progress
               WHERE classroom_id = $1`,
              [classroomC]
            );
            expect(nonmemberClass.rows).toEqual([]);
          }
        )
      ).resolves.toBeUndefined();

      await expect(
        withTenantContext(
          runtimePool,
          { explorerId, classroomId: null },
          async (client) => {
            const visible = await client.query(
              `SELECT classroom_id
               FROM cloud_quest_progress`
            );
            expect(visible.rows).toEqual([{ classroom_id: null }]);
          }
        )
      ).resolves.toBeUndefined();

      await expectTenantContextCleared(runtimePool);

      await expect(
        withTenantContext(
          runtimePool,
          { explorerId, classroomId: classroomA },
          (client) => client.query(
            `INSERT INTO learning_journals (
               clerk_user_id,
               classroom_id
             )
             VALUES ($1, $2)`,
            [explorerId, classroomC]
          )
        )
      ).rejects.toMatchObject({ code: "42501" });

      await expectTenantContextCleared(runtimePool);

      await expect(
        withTenantContext(
          runtimePool,
          { explorerId, classroomId: classroomB },
          async () => {
            throw new Error("force rollback");
          }
        )
      ).rejects.toThrow("force rollback");

      await expectTenantContextCleared(runtimePool);

      await adminPool.query(
        `DELETE FROM classroom_memberships
         WHERE classroom_id = $1 AND clerk_user_id = $2`,
        [classroomB, explorerId]
      );
      const membershipCascade = await adminPool.query(
        `SELECT
           (
             SELECT COUNT(*)::INTEGER
             FROM cloud_quest_progress
             WHERE classroom_id = $1 AND clerk_user_id = $2
           ) AS progress,
           (
             SELECT COUNT(*)::INTEGER
             FROM learning_journals
             WHERE classroom_id = $1 AND clerk_user_id = $2
           ) AS journals`,
        [classroomB, explorerId]
      );
      expect(membershipCascade.rows).toEqual([{
        progress: 0,
        journals: 0
      }]);

      await createUserDeletionStore(runtimePool).deleteUser(explorerId);
      const deleted = await adminPool.query(
        `SELECT
           COUNT(*) FILTER (
             WHERE clerk_user_id = $1
           )::INTEGER AS memberships,
           (
             SELECT COUNT(*)::INTEGER
             FROM cloud_quest_progress
             WHERE clerk_user_id = $1
           ) AS progress
         FROM classroom_memberships`,
        [explorerId]
      );
      expect(deleted.rows).toEqual([{ memberships: 0, progress: 0 }]);
    } finally {
      await adminPool.query(
        "DELETE FROM player_access WHERE clerk_user_id = ANY($1::TEXT[])",
        [[explorerId, otherExplorerId]]
      ).catch(() => {});
      await adminPool.query(
        "DELETE FROM classrooms WHERE id = ANY($1::TEXT[])",
        [[classroomA, classroomB, classroomC]]
      ).catch(() => {});
    }
  });
});

/** @param {Pool} pool */
async function expectTenantContextCleared(pool) {
  const context = await pool.query(
    `SELECT
       NULLIF(current_setting('echo_maze.explorer_id', true), '')
         AS explorer_id,
       NULLIF(current_setting('echo_maze.classroom_id', true), '')
         AS classroom_id`
  );
  expect(context.rows).toEqual([{
    explorer_id: null,
    classroom_id: null
  }]);
}
