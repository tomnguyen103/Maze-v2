import { createRunAccessStore } from "../server/run-access-store.js";
import { describe, expect, it, vi } from "vitest";

/**
 * @param {{
 *   access?: { free_runs_used: number, membership_state: string },
 *   existingGrant?: {
 *     run_id: string,
 *     seed: string,
 *     level_id: string,
 *     labyrinth_number: number,
 *     grant_source?: string
 *   } | null
 * }} [input]
 */
function createTransactionalPool({
  access = { free_runs_used: 0, membership_state: "none" },
  existingGrant = null
} = {}) {
  const grants = new Map();
  if (existingGrant) {
    grants.set(existingGrant.run_id, {
      grant_source: "free",
      ...existingGrant
    });
  }
  const client = {
    query: vi.fn(async (sql, values = []) => {
      if (sql.includes("SELECT free_runs_used")) {
        return { rows: [access] };
      }
      if (
        sql.includes("FROM run_access_grants") &&
        sql.includes("SELECT")
      ) {
        const grant = grants.get(String(values[1]));
        return { rows: grant ? [grant] : [] };
      }
      if (sql.includes("INSERT INTO run_access_grants")) {
        grants.set(String(values[1]), {
          run_id: values[1],
          seed: values[2],
          level_id: values[3],
          labyrinth_number: values[4],
          grant_source: sql.includes("'lifetime'") ? "lifetime" : "free"
        });
        return { rows: [] };
      }
      if (sql.includes("RETURNING free_runs_used")) {
        access.free_runs_used += 1;
        return { rows: [{ free_runs_used: access.free_runs_used }] };
      }
      return { rows: [] };
    }),
    release: vi.fn()
  };
  const pool = {
    query: vi.fn(async () => ({ rows: [access] })),
    connect: vi.fn(async () => client)
  };
  return { client, pool };
}

describe("Run Access store", () => {
  it("locks one player's allowance and consumes one of three starts", async () => {
    const { client, pool } = createTransactionalPool();
    const store = createRunAccessStore(pool);

    await expect(
      store.authorizeRun("user_123", {
        runId: "access_01J1MOSSWATCH",
        seed: "MOSS-WATCH-11",
        levelId: "trail-scout",
        labyrinthNumber: 4
      })
    ).resolves.toEqual({
      allowed: true,
      duplicate: false,
      freeRunsRemaining: 2,
      state: "free"
    });

    expect(client.query).toHaveBeenCalledWith("BEGIN");
    expect(
      client.query.mock.calls.some(([sql]) => sql.includes("FOR UPDATE"))
    ).toBe(true);
    expect(
      client.query.mock.calls.some(([sql]) =>
        sql.includes("ON CONFLICT (player_id, run_id) DO NOTHING")
      )
    ).toBe(true);
    expect(client.query).toHaveBeenCalledWith("COMMIT");
    expect(client.release).toHaveBeenCalledOnce();
  });

  it("returns the original grant without consuming again", async () => {
    const { client, pool } = createTransactionalPool({
      access: { free_runs_used: 2, membership_state: "none" },
      existingGrant: {
        run_id: "access_existing",
        seed: "MOSS-WATCH-11",
        level_id: "trail-scout",
        labyrinth_number: 4
      }
    });
    const store = createRunAccessStore(pool);

    await expect(
      store.authorizeRun("user_123", {
        runId: "access_existing",
        seed: "MOSS-WATCH-11",
        levelId: "trail-scout",
        labyrinthNumber: 4
      })
    ).resolves.toEqual({
      allowed: true,
      duplicate: true,
      freeRunsRemaining: 1,
      state: "free"
    });
    expect(
      client.query.mock.calls.some(([sql]) =>
        sql.includes("UPDATE player_access")
      )
    ).toBe(false);
  });

  it("blocks the fourth unique start", async () => {
    const { pool } = createTransactionalPool({
      access: { free_runs_used: 3, membership_state: "none" }
    });
    const store = createRunAccessStore(pool);

    await expect(
      store.authorizeRun("user_123", {
        runId: "access_fourth",
        seed: "MOSS-WATCH-11",
        levelId: "trail-scout",
        labyrinthNumber: 4
      })
    ).resolves.toEqual({
      allowed: false,
      duplicate: false,
      freeRunsRemaining: 0,
      state: "blocked"
    });
  });

  it("admits exactly three sequential starts and keeps the retry free", async () => {
    const { pool } = createTransactionalPool();
    const store = createRunAccessStore(pool);
    const facts = {
      seed: "MOSS-WATCH-11",
      levelId: "trail-scout",
      labyrinthNumber: 4
    };

    const attempts = [];
    for (const suffix of ["one", "two", "three", "four"]) {
      attempts.push(
        await store.authorizeRun("user_123", {
          ...facts,
          runId: `access_sequential_${suffix}`
        })
      );
    }
    const retry = await store.authorizeRun("user_123", {
      ...facts,
      runId: "access_sequential_one"
    });

    expect(attempts.map(({ allowed }) => allowed)).toEqual([
      true,
      true,
      true,
      false
    ]);
    expect(retry).toMatchObject({ allowed: true, duplicate: true });
  });

  it("admits a Lifetime Member without consuming an allowance", async () => {
    const { client, pool } = createTransactionalPool({
      access: { free_runs_used: 3, membership_state: "active" }
    });
    const store = createRunAccessStore(pool);

    await expect(
      store.authorizeRun("user_123", {
        runId: "access_member",
        seed: "MOSS-WATCH-11",
        levelId: "trail-scout",
        labyrinthNumber: 4
      })
    ).resolves.toEqual({
      allowed: true,
      duplicate: false,
      freeRunsRemaining: 0,
      state: "member"
    });
    expect(
      client.query.mock.calls.some(([sql]) =>
        sql.includes("INSERT INTO run_access_grants")
      )
    ).toBe(true);
    expect(
      client.query.mock.calls.some(([sql]) =>
        sql.includes("UPDATE player_access")
      )
    ).toBe(false);
  });

  it.each(["refunded", "disputed"])(
    "blocks a new Run for a %s membership",
    async (membershipState) => {
      const { pool } = createTransactionalPool({
        access: {
          free_runs_used: 0,
          membership_state: membershipState
        }
      });
      const store = createRunAccessStore(pool);

      await expect(
        store.authorizeRun("user_123", {
          runId: `access_${membershipState}`,
          seed: "MOSS-WATCH-11",
          levelId: "trail-scout",
          labyrinthNumber: 4
        })
      ).resolves.toMatchObject({
        allowed: false,
        state: "membership-blocked"
      });
    }
  );

  it("rolls back and releases the database client after a failure", async () => {
    const { client, pool } = createTransactionalPool();
    client.query.mockRejectedValueOnce(new Error("database unavailable"));
    const store = createRunAccessStore(pool);

    await expect(
      store.authorizeRun("user_123", {
        runId: "access_retry",
        seed: "MOSS-WATCH-11",
        levelId: "trail-scout",
        labyrinthNumber: 4
      })
    ).rejects.toThrow("database unavailable");
    expect(client.query).toHaveBeenCalledWith("ROLLBACK");
    expect(client.release).toHaveBeenCalledOnce();
  });

  it("rejects reuse of one id for different Run facts", async () => {
    const { pool } = createTransactionalPool({
      access: { free_runs_used: 1, membership_state: "none" },
      existingGrant: {
        run_id: "access_existing",
        seed: "MOSS-WATCH-11",
        level_id: "trail-scout",
        labyrinth_number: 4
      }
    });
    const store = createRunAccessStore(pool);

    await expect(
      store.authorizeRun("user_123", {
        runId: "access_existing",
        seed: "DIFFERENT-SEED",
        levelId: "trail-scout",
        labyrinthNumber: 4
      })
    ).rejects.toMatchObject({ name: "RunAccessConflictError" });
  });
});
