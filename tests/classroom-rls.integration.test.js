import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { Pool } from "pg";
import { exportUserSnapshot } from "../server/data-export.js";
import { normalizeDatabaseConnectionString } from "../server/database.js";
import { withTenantContext } from "../server/tenant-context.js";
import { createUserDeletionStore } from "../server/user-deletion-store.js";
import { createClassroomAuthorityStore } from "../server/classroom-authority-store.js";
import { processClassroomAuthorityEvent } from "../server/classroom-authority.js";
import { createQuestProgressStore } from "../server/quest-progress-store.js";
import { createQuestProgress } from "../src/game/quest-progress.js";
import { createLearningJournalStore } from "../server/learning-journal-store.js";
import { createPlayerStore } from "../server/player-store.js";
import { createClassroomStore } from "../server/classroom-store.js";
import { createClassroomDomainStore } from "../server/classroom-domain-store.js";

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
      max: 2
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
    const staleClassroom = `org_stale_${suffix}`;
    const raceExplorerId = `user_race_${suffix}`;

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
          "org_domains",
          "cloud_quest_progress",
          "learning_journals",
          "score_entries"
        ]]
      );
      expect(boundary.rows[0]).toMatchObject({
        rolsuper: false,
        rolbypassrls: false,
        runtime_member: true,
        tenant_owners: Array(6).fill("echo_maze_tenant_owner")
      });
      expect(boundary.rows[0]?.runtime_login).not.toBe(
        "echo_maze_tenant_owner"
      );

      const authorityStore = createClassroomAuthorityStore(runtimePool);
      let timestamp = 1000;
      for (const [id, name] of [
        [classroomA, "Class A"],
        [classroomB, "Class B"],
        [classroomC, "Class C"]
      ]) {
        await processClassroomAuthorityEvent(authorityStore, {
          eventType: "organization.created",
          payload: { id, name, occurredAt: timestamp }
        });
        timestamp += 1000;
      }
      for (const [id, classroomId, userId] of [
        [`orgmem_a_${suffix}`, classroomA, explorerId],
        [`orgmem_b_${suffix}`, classroomB, explorerId],
        [`orgmem_other_${suffix}`, classroomA, otherExplorerId]
      ]) {
        await processClassroomAuthorityEvent(authorityStore, {
          eventType: "organizationMembership.created",
          payload: {
            id,
            classroomId,
            userId,
            role: "org:member",
            occurredAt: timestamp
          }
        });
        timestamp += 1000;
      }
      await processClassroomAuthorityEvent(authorityStore, {
        eventType: "organizationMembership.updated",
        payload: {
          id: `orgmem_a_${suffix}`,
          classroomId: classroomA,
          userId: explorerId,
          role: "org:admin",
          occurredAt: timestamp
        }
      });
      timestamp += 1000;

      await processClassroomAuthorityEvent(authorityStore, {
        eventType: "organization.created",
        payload: {
          id: staleClassroom,
          name: "Stale Class",
          occurredAt: 100
        }
      });
      await processClassroomAuthorityEvent(authorityStore, {
        eventType: "organization.deleted",
        payload: { id: staleClassroom, occurredAt: 300 }
      });
      await expect(
        processClassroomAuthorityEvent(authorityStore, {
          eventType: "organization.created",
          payload: {
            id: staleClassroom,
            name: "Must Not Return",
            occurredAt: 200
          }
        })
      ).resolves.toMatchObject({ applied: false });
      await expect(
        processClassroomAuthorityEvent(authorityStore, {
          eventType: "organization.created",
          payload: {
            id: staleClassroom,
            name: "Equal Timestamp Must Not Return",
            occurredAt: 300
          }
        })
      ).resolves.toMatchObject({ applied: false });
      await expect(
        adminPool.query("SELECT 1 FROM classrooms WHERE id = $1", [
          staleClassroom
        ])
      ).resolves.toMatchObject({ rows: [] });

      const equalMembershipId = `orgmem_equal_${suffix}`;
      await expect(
        processClassroomAuthorityEvent(authorityStore, {
          eventType: "organizationMembership.created",
          payload: {
            id: equalMembershipId,
            classroomId: classroomB,
            userId: otherExplorerId,
            role: "org:admin",
            occurredAt: timestamp
          }
        })
      ).resolves.toMatchObject({ applied: true });
      await expect(
        processClassroomAuthorityEvent(authorityStore, {
          eventType: "organizationMembership.updated",
          payload: {
            id: equalMembershipId,
            classroomId: classroomB,
            userId: otherExplorerId,
            role: "org:member",
            occurredAt: timestamp
          }
        })
      ).resolves.toMatchObject({ applied: true });
      await expect(
        processClassroomAuthorityEvent(authorityStore, {
          eventType: "organizationMembership.updated",
          payload: {
            id: equalMembershipId,
            classroomId: classroomB,
            userId: otherExplorerId,
            role: "org:admin",
            occurredAt: timestamp
          }
        })
      ).resolves.toMatchObject({ applied: false });
      await expect(
        adminPool.query(
          `SELECT role
           FROM classroom_memberships
           WHERE clerk_membership_id = $1`,
          [equalMembershipId]
        )
      ).resolves.toMatchObject({ rows: [{ role: "student" }] });
      await expect(
        processClassroomAuthorityEvent(authorityStore, {
          eventType: "organizationMembership.deleted",
          payload: { id: equalMembershipId, occurredAt: timestamp }
        })
      ).resolves.toMatchObject({ applied: true });
      await expect(
        processClassroomAuthorityEvent(authorityStore, {
          eventType: "organizationMembership.created",
          payload: {
            id: equalMembershipId,
            classroomId: classroomB,
            userId: otherExplorerId,
            role: "org:member",
            occurredAt: timestamp
          }
        })
      ).resolves.toMatchObject({ applied: false });

      const classroomBTeacherMembership = `orgmem_teacher_b_${suffix}`;
      await expect(
        processClassroomAuthorityEvent(authorityStore, {
          eventType: "organizationMembership.created",
          payload: {
            id: classroomBTeacherMembership,
            classroomId: classroomB,
            userId: otherExplorerId,
            role: "org:admin",
            occurredAt: timestamp + 1
          }
        })
      ).resolves.toMatchObject({ applied: true });

      const domainStore = createClassroomDomainStore(runtimePool);
      const verifiedDomain = `school-${suffix.slice(0, 12)}.example`;
      await expect(
        domainStore.registerDomain(
          explorerId,
          classroomA,
          verifiedDomain
        )
      ).resolves.toEqual({
        domain: verifiedDomain,
        autoJoinEnabled: true
      });
      await expect(
        domainStore.domainForTeacher(explorerId, classroomA)
      ).resolves.toEqual({
        domain: verifiedDomain,
        autoJoinEnabled: true
      });
      await expect(
        domainStore.domainForTeacher(otherExplorerId, classroomA)
      ).resolves.toBeNull();
      await expect(
        domainStore.registerDomain(
          otherExplorerId,
          classroomA,
          `student-${suffix.slice(0, 12)}.example`
        )
      ).rejects.toMatchObject({ code: "42501" });
      await expect(
        domainStore.classroomForDomain(verifiedDomain)
      ).resolves.toBe(classroomA);
      await expect(
        domainStore.registerDomain(
          otherExplorerId,
          classroomB,
          verifiedDomain
        )
      ).rejects.toMatchObject({
        name: "ClassroomDomainConflictError"
      });
      await expect(
        domainStore.registerDomain(
          otherExplorerId,
          classroomB,
          "gmail.com"
        )
      ).rejects.toMatchObject({ code: "22023" });
      await expect(
        runtimePool.query("SELECT domain FROM org_domains")
      ).rejects.toMatchObject({ code: "42501" });
      await adminPool.query(
        `UPDATE org_domains
         SET auto_join_enabled = FALSE
         WHERE domain = $1`,
        [verifiedDomain]
      );
      await expect(
        domainStore.classroomForDomain(verifiedDomain)
      ).resolves.toBeNull();
      await adminPool.query(
        `UPDATE org_domains
         SET auto_join_enabled = TRUE
         WHERE domain = $1`,
        [verifiedDomain]
      );

      const adminClient = await adminPool.connect();
      try {
        await adminClient.query("BEGIN");
        await adminClient.query(
          `INSERT INTO players (
             clerk_user_id,
             username,
             username_key
           )
           VALUES
             ($1, $3, $4),
             ($2, $5, $6)`,
          [
            explorerId,
            otherExplorerId,
            `Explorer ${suffix.slice(0, 8)}`,
            `explorer ${suffix.slice(0, 8)}`,
            `Other ${suffix.slice(0, 8)}`,
            `other ${suffix.slice(0, 8)}`
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
             classroom_id,
             journal
           )
           VALUES
             ($1, $2, '{"version":1,"events":[]}'::jsonb),
             (
               $3,
               $4,
               '{"version":1,"events":[{"eventId":"01JCLASSROOMCOUNT0000000001","questionId":"scout-developing-0","topicId":"number-sense","learningObjectiveId":"addition-within-20","difficultyBand":"developing","outcome":"correct"},{"eventId":"01JCLASSROOMCOUNT0000000002","questionId":"scout-developing-1","topicId":"number-sense","learningObjectiveId":"addition-within-20","difficultyBand":"developing","outcome":"wrong"}]}'::jsonb
             )`,
          [explorerId, classroomB, otherExplorerId, classroomA]
        );
        await adminClient.query("COMMIT");
      } catch (error) {
        await adminClient.query("ROLLBACK").catch(() => {});
        throw error;
      } finally {
        adminClient.release();
      }

      const classroomStore = createClassroomStore(runtimePool);
      await expect(
        classroomStore.listForUser(explorerId)
      ).resolves.toEqual([
        { id: classroomA, name: "Class A", role: "teacher" },
        { id: classroomB, name: "Class B", role: "student" }
      ]);
      await expect(
        classroomStore.progressForTeacher(explorerId, classroomA)
      ).resolves.toEqual({
        progress: [{
          studentName: `Other ${suffix.slice(0, 8)}`,
          objectiveId: "addition-within-20",
          correct: 1,
          wrong: 1,
          hints: 0,
          skips: 0,
          total: 2
        }],
        truncated: false
      });
      await expect(
        classroomStore.progressForTeacher(otherExplorerId, classroomA)
      ).rejects.toMatchObject({ name: "ClassroomAccessDeniedError" });
      await expect(
        withTenantContext(
          runtimePool,
          { explorerId, classroomId: classroomA },
          (client) =>
            client.query(
              "SELECT * FROM read_classroom_progress($1)",
              [classroomB]
            )
        )
      ).resolves.toMatchObject({ rows: [] });
      await expect(
        withTenantContext(
          runtimePool,
          { explorerId, classroomId: classroomA },
          (client) =>
            client.query(
              `SELECT journal
               FROM learning_journals
               WHERE clerk_user_id = $1`,
              [otherExplorerId]
            )
        )
      ).resolves.toMatchObject({ rows: [] });
      await expect(
        withTenantContext(
          runtimePool,
          { explorerId, classroomId: classroomA },
          (client) => client.query("SELECT * FROM classroom_progress_counts")
        )
      ).rejects.toMatchObject({ code: "42501" });

      const questStore = createQuestProgressStore(runtimePool);
      await questStore.save(
        explorerId,
        0,
        createQuestProgress("bright-start", 1, "quest_personal_rls")
      );
      await questStore.save(
        explorerId,
        0,
        createQuestProgress("bright-start", 1, "quest_class_a_rls"),
        classroomA
      );
      const journalStore = createLearningJournalStore(runtimePool);
      await journalStore.saveJournal(
        explorerId,
        { version: 1, events: [] },
        0
      );
      await journalStore.saveJournal(
        explorerId,
        { version: 1, events: [] },
        0,
        classroomA
      );
      const scoreStore = createPlayerStore(runtimePool);
      const scoreRun = {
        idempotencyKey: `run_${suffix}`.slice(0, 128),
        levelId: "bright-start",
        labyrinthNumber: 1,
        seed: suffix.slice(0, 32),
        wardensDefeated: 2,
        echoesCollected: 3,
        moves: 40,
        elapsedMs: 60000,
        escaped: true,
        atlasRegionId: "foundation",
        rulesetRevision: "echo-hush-v1",
        score: 850
      };
      await scoreStore.submitScore(explorerId, scoreRun, classroomA);
      await scoreStore.submitScore(explorerId, scoreRun, classroomB);
      await expect(
        scoreStore.submitScore(explorerId, scoreRun, classroomC)
      ).rejects.toMatchObject({ name: "ClassroomAccessDeniedError" });

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
      expect(exported.data.scores.map(
        (score) => score.classroom_id
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

            const crossClassScores = await client.query(
              `SELECT id
               FROM score_entries
               WHERE classroom_id = $1`,
              [classroomB]
            );
            expect(crossClassScores.rows).toEqual([]);

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
            `INSERT INTO score_entries (
               player_id,
               idempotency_key,
               level_id,
               labyrinth_number,
               seed,
               wardens_defeated,
               echoes_collected,
               moves,
               elapsed_ms,
               score,
               escaped,
               classroom_id
             )
             VALUES (
               $1, $2, 'bright-start', 1, $3, 1, 1, 20, 30000, 650, TRUE, $4
             )`,
            [
              explorerId,
              `crafted_${suffix}`.slice(0, 128),
              suffix.slice(0, 32),
              classroomC
            ]
          )
        )
      ).rejects.toMatchObject({ code: "42501" });

      await expect(
        withTenantContext(
          runtimePool,
          { explorerId, classroomId: classroomA },
          async (client) => {
            const crossClass = await client.query(
              `UPDATE score_entries
               SET score = score + 1
               WHERE player_id = $1 AND classroom_id = $2
               RETURNING id`,
              [explorerId, classroomB]
            );
            expect(crossClass.rows).toEqual([]);
          }
        )
      ).resolves.toBeUndefined();

      await expect(
        withTenantContext(
          runtimePool,
          { explorerId, classroomId: classroomA },
          (client) => client.query(
            `UPDATE score_entries
             SET classroom_id = $2
             WHERE player_id = $1 AND classroom_id = $3`,
            [explorerId, classroomC, classroomA]
          )
        )
      ).rejects.toMatchObject({ code: "42501" });

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
           ) AS journals,
           (
             SELECT COUNT(*)::INTEGER
             FROM score_entries
             WHERE classroom_id = $1 AND player_id = $2
           ) AS scores`,
        [classroomB, explorerId]
      );
      expect(membershipCascade.rows).toEqual([{
        progress: 0,
        journals: 0,
        scores: 0
      }]);

      await createUserDeletionStore(runtimePool).deleteUser(explorerId);
      await expect(
        adminPool.query(
          "SELECT domain FROM org_domains WHERE domain = $1",
          [verifiedDomain]
        )
      ).resolves.toMatchObject({ rows: [] });
      await expect(
        processClassroomAuthorityEvent(authorityStore, {
          eventType: "organizationMembership.created",
          payload: {
            id: `orgmem_after_delete_${suffix}`,
            classroomId: classroomA,
            userId: explorerId,
            role: "org:member",
            occurredAt: 9000
          }
        })
      ).resolves.toMatchObject({ applied: false });
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

      const deletionClient = await adminPool.connect();
      try {
        await deletionClient.query("BEGIN");
        await deletionClient.query(
          "SELECT pg_advisory_xact_lock(hashtextextended($1, 0))",
          [raceExplorerId]
        );
        await deletionClient.query(
          `INSERT INTO deleted_user_tombstones (clerk_user_id_hash)
           VALUES (encode(sha256(convert_to($1, 'UTF8')), 'hex'))`,
          [raceExplorerId]
        );

        const raceMembershipId = `orgmem_race_${suffix}`;
        let synchronizationSettled = false;
        const synchronization = authorityStore.upsertMembership({
          id: raceMembershipId,
          classroomId: classroomA,
          userId: raceExplorerId,
          role: "student",
          occurredAt: 10000
        }).then((applied) => {
          synchronizationSettled = true;
          return applied;
        });

        let observedAdvisoryWait = false;
        for (let attempt = 0; attempt < 20; attempt += 1) {
          const waiting = await deletionClient.query(
            `SELECT COUNT(*)::INTEGER AS count
             FROM pg_stat_activity
             WHERE datname = current_database()
               AND query LIKE 'SELECT sync_classroom_membership%'
               AND wait_event = 'advisory'`
          );
          if (waiting.rows[0]?.count > 0) {
            observedAdvisoryWait = true;
            break;
          }
          await new Promise((resolve) => setTimeout(resolve, 10));
        }
        expect(observedAdvisoryWait).toBe(true);
        expect(synchronizationSettled).toBe(false);

        await deletionClient.query("COMMIT");
        await expect(synchronization).resolves.toBe(false);
        await expect(
          deletionClient.query(
            `SELECT
               EXISTS (
                 SELECT 1 FROM player_access WHERE clerk_user_id = $1
               ) AS access_present,
               EXISTS (
                 SELECT 1
                 FROM classroom_memberships
                 WHERE clerk_membership_id = $2
               ) AS membership_present`,
            [raceExplorerId, raceMembershipId]
          )
        ).resolves.toMatchObject({
          rows: [{
            access_present: false,
            membership_present: false
          }]
        });
      } catch (error) {
        await deletionClient.query("ROLLBACK").catch(() => {});
        throw error;
      } finally {
        deletionClient.release();
      }
    } finally {
      await adminPool.query(
        "DELETE FROM player_access WHERE clerk_user_id = ANY($1::TEXT[])",
        [[explorerId, otherExplorerId, raceExplorerId]]
      ).catch(() => {});
      await adminPool.query(
        "DELETE FROM classrooms WHERE id = ANY($1::TEXT[])",
        [[classroomA, classroomB, classroomC, staleClassroom]]
      ).catch(() => {});
      await adminPool.query(
        "DELETE FROM players WHERE clerk_user_id = ANY($1::TEXT[])",
        [[explorerId, otherExplorerId]]
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
