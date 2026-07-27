import { describe, expect, it, vi } from "vitest";
import {
  createWebhookInbox,
  createWebhookInboxStore,
  MAX_WEBHOOK_ATTEMPTS
} from "../server/webhook-inbox.js";

/**
 * In-memory stand-in that applies the same rules the SQL does: primary-key
 * collision on (provider, event_id), and the attempt cap promoting a failure to
 * dead.
 */
function createFakeStore() {
  /** @type {Map<string, Record<string, any>>} */
  const rows = new Map();
  const key = (/** @type {string} */ provider, /** @type {string} */ eventId) =>
    `${provider}:${eventId}`;
  return {
    rows,
    /** @param {{ provider: string, eventId: string, eventType: string, payload: unknown }} delivery */
    async record({ provider, eventId, eventType, payload }) {
      const id = key(provider, eventId);
      if (rows.has(id)) {
        return { duplicate: true };
      }
      rows.set(id, {
        provider,
        event_id: eventId,
        event_type: eventType,
        payload,
        status: "pending",
        attempts: 0,
        last_error: null,
        received_at: rows.size
      });
      return { duplicate: false };
    },
    /** @param {{ provider: string, eventId: string }} key */
    async markProcessed({ provider, eventId }) {
      const row = rows.get(key(provider, eventId));
      if (row) {
        row.status = "processed";
        row.attempts += 1;
        row.last_error = null;
        row.processed_at = "now";
        // Mirrors the SQL: the payload exists only to make a retry possible.
        row.payload = null;
      }
    },
    /** @param {{ provider: string, eventId: string, error: unknown }} failure */
    async markFailed({ provider, eventId, error }) {
      const row = rows.get(key(provider, eventId));
      if (!row) return { status: "failed", attempts: 0 };
      row.attempts += 1;
      row.status = row.attempts >= MAX_WEBHOOK_ATTEMPTS ? "dead" : "failed";
      row.last_error = error instanceof Error ? "Error" : "UnknownError";
      return { status: row.status, attempts: row.attempts };
    },
    /** @param {{ limit?: number }} [options] */
    async selectRetryable({ limit = 20 } = {}) {
      return [...rows.values()]
        .filter(
          (row) =>
            ["pending", "failed"].includes(row.status) &&
            row.payload !== null &&
            row.attempts < MAX_WEBHOOK_ATTEMPTS
        )
        .sort((left, right) => left.received_at - right.received_at)
        .slice(0, limit);
    },
    // The window is the SQL's concern; the fake prunes every settled row so the
    // test asserts which statuses are eligible, not the arithmetic.
    async prune() {
      let pruned = 0;
      for (const [id, row] of [...rows.entries()]) {
        if (["processed", "dead"].includes(row.status)) {
          rows.delete(id);
          pruned += 1;
        }
      }
      return pruned;
    },
    /** @param {{ limit?: number }} [options] */
    async listDead({ limit = 100 } = {}) {
      return [...rows.values()]
        .filter((row) => row.status === "dead")
        .slice(0, limit);
    }
  };
}

const delivery = (overrides = {}) => ({
  provider: /** @type {"stripe"} */ ("stripe"),
  eventId: "evt_1",
  eventType: "checkout.session.completed",
  payload: { id: "evt_1" },
  ...overrides
});

describe("createWebhookInbox", () => {
  it("stores then processes a first delivery", async () => {
    const store = createFakeStore();
    const processEvent = vi.fn(async () => {});
    const inbox = createWebhookInbox({ store, processEvent });
    await expect(inbox.receive(delivery())).resolves.toMatchObject({
      duplicate: false,
      processed: true
    });
    expect(processEvent).toHaveBeenCalledTimes(1);
    expect(store.rows.get("stripe:evt_1")?.status).toBe("processed");
  });

  it("makes a repeated delivery a no-op, not a second state change", async () => {
    const store = createFakeStore();
    const processEvent = vi.fn(async () => {});
    const inbox = createWebhookInbox({ store, processEvent });
    for (let attempt = 0; attempt < 4; attempt += 1) {
      await inbox.receive(delivery());
    }
    expect(processEvent).toHaveBeenCalledTimes(1);
    expect(store.rows.size).toBe(1);
  });

  it("keeps events from different providers with the same id apart", async () => {
    const store = createFakeStore();
    const processEvent = vi.fn(async () => {});
    const inbox = createWebhookInbox({ store, processEvent });
    await inbox.receive(delivery({ provider: "stripe" }));
    await inbox.receive(delivery({ provider: "clerk" }));
    expect(processEvent).toHaveBeenCalledTimes(2);
    expect(store.rows.size).toBe(2);
  });

  it("leaves a failed delivery retryable rather than losing it", async () => {
    const store = createFakeStore();
    const inbox = createWebhookInbox({
      store,
      onFailure: () => {},
      processEvent: async () => {
        throw new Error("downstream unavailable");
      }
    });
    await expect(inbox.receive(delivery())).resolves.toMatchObject({
      processed: false,
      status: "failed",
      attempts: 1
    });
    expect(store.rows.get("stripe:evt_1")?.status).toBe("failed");
  });

  it("records only a redacted error class, never the provider's message", async () => {
    const store = createFakeStore();
    const inbox = createWebhookInbox({
      store,
      onFailure: () => {},
      processEvent: async () => {
        throw new Error("card 4242424242424242 declined for user_secret");
      }
    });
    await inbox.receive(delivery());
    const stored = JSON.stringify(store.rows.get("stripe:evt_1"));
    expect(stored).not.toContain("4242");
    expect(stored).not.toContain("user_secret");
    expect(store.rows.get("stripe:evt_1")?.last_error).toBe("Error");
  });

  it("retries a failure and marks it processed when it succeeds", async () => {
    const store = createFakeStore();
    let failing = true;
    const inbox = createWebhookInbox({
      store,
      onFailure: () => {},
      processEvent: async () => {
        if (failing) throw new Error("downstream unavailable");
      }
    });
    await inbox.receive(delivery());
    failing = false;
    await expect(inbox.retryPending()).resolves.toEqual({
      claimed: 1,
      processed: 1,
      failed: 0,
      dead: 0
    });
    expect(store.rows.get("stripe:evt_1")?.status).toBe("processed");
  });

  it("stops retrying at the attempt cap and marks the row dead", async () => {
    const store = createFakeStore();
    const processEvent = vi.fn(async () => {
      throw new Error("permanently broken");
    });
    const inbox = createWebhookInbox({
      store,
      processEvent,
      onFailure: () => {}
    });
    await inbox.receive(delivery());
    for (let round = 0; round < 10; round += 1) {
      await inbox.retryPending();
    }
    expect(store.rows.get("stripe:evt_1")).toMatchObject({
      status: "dead",
      attempts: MAX_WEBHOOK_ATTEMPTS
    });
    // One inline attempt plus exactly the remaining retries, then it stops
    // consuming budget forever.
    expect(processEvent).toHaveBeenCalledTimes(MAX_WEBHOOK_ATTEMPTS);
    await expect(store.listDead()).resolves.toHaveLength(1);
  });

  it("reports every failure once, with no payload in the report", async () => {
    /** @type {Record<string, unknown>[]} */
    const failures = [];
    const store = createFakeStore();
    const inbox = createWebhookInbox({
      store,
      onFailure: (details) => failures.push(details),
      processEvent: async () => {
        throw new Error("boom with card 4242424242424242");
      }
    });
    await inbox.receive(delivery());
    expect(failures).toEqual([
      {
        provider: "stripe",
        eventType: "checkout.session.completed",
        status: "failed",
        attempts: 1,
        name: "Error"
      }
    ]);
    expect(JSON.stringify(failures)).not.toContain("4242");
  });

  it("retries oldest first so an out-of-order delivery still settles", async () => {
    const store = createFakeStore();
    /** @type {string[]} */
    const seen = [];
    const inbox = createWebhookInbox({
      store,
      onFailure: () => {},
      processEvent: async (
        /** @type {string} */ _provider,
        /** @type {{ eventType: string, payload: unknown }} */ event
      ) => {
        seen.push(event.eventType);
        throw new Error("later");
      }
    });
    await inbox.receive(delivery({ eventId: "evt_1", eventType: "first" }));
    await inbox.receive(delivery({ eventId: "evt_2", eventType: "second" }));
    seen.length = 0;
    await inbox.retryPending();
    expect(seen).toEqual(["first", "second"]);
  });

  it("does not claim rows that are already processed or dead", async () => {
    const store = createFakeStore();
    const inbox = createWebhookInbox({
      store,
      onFailure: () => {},
      processEvent: async () => {}
    });
    await inbox.receive(delivery({ eventId: "evt_ok" }));
    store.rows.set("stripe:evt_dead", {
      provider: "stripe",
      event_id: "evt_dead",
      event_type: "x",
      payload: {},
      status: "dead",
      attempts: MAX_WEBHOOK_ATTEMPTS,
      received_at: 9
    });
    await expect(inbox.retryPending()).resolves.toMatchObject({ claimed: 0 });
  });
});

describe("payload retention", () => {
  it("clears the payload the moment a delivery succeeds", async () => {
    // A Clerk user.deleted payload carries the raw Clerk id, which the deletion
    // tombstone exists specifically to avoid storing. It must not outlive the
    // retry it enables.
    const store = createFakeStore();
    const inbox = createWebhookInbox({ store, processEvent: async () => {} });
    await inbox.receive(
      delivery({ provider: "clerk", eventType: "user.deleted", payload: { id: "user_raw_id" } })
    );
    const row = store.rows.get("clerk:evt_1");
    expect(row?.status).toBe("processed");
    expect(row?.payload).toBeNull();
    expect(JSON.stringify(row)).not.toContain("user_raw_id");
  });

  it("keeps the payload while the delivery is still retryable", async () => {
    const store = createFakeStore();
    const inbox = createWebhookInbox({
      store,
      onFailure: () => {},
      processEvent: async () => {
        throw new Error("downstream unavailable");
      }
    });
    await inbox.receive(delivery({ payload: { id: "evt_1" } }));
    expect(store.rows.get("stripe:evt_1")?.payload).toEqual({ id: "evt_1" });
  });

  it("prunes settled rows so a dead payload cannot linger forever", async () => {
    const store = createFakeStore();
    const inbox = createWebhookInbox({
      store,
      onFailure: () => {},
      processEvent: async () => {
        throw new Error("permanently broken");
      }
    });
    await inbox.receive(delivery());
    for (let round = 0; round < 10; round += 1) {
      await inbox.retryPending();
    }
    expect(store.rows.get("stripe:evt_1")?.status).toBe("dead");
    await expect(store.prune()).resolves.toBe(1);
    expect(store.rows.size).toBe(0);
  });
});

describe("createWebhookInboxStore", () => {
  /** @param {Record<string, unknown>[]} rows */
  function poolReturning(rows) {
    /** @type {{ sql: string, values: unknown[] }[]} */
    const calls = [];
    return {
      calls,
      async query(/** @type {string} */ sql, /** @type {unknown[]} */ values = []) {
        calls.push({ sql, values });
        return { rows };
      }
    };
  }

  it("treats a primary-key collision as a duplicate", async () => {
    const store = createWebhookInboxStore(poolReturning([]));
    await expect(
      store.record(delivery())
    ).resolves.toEqual({ duplicate: true });
  });

  it("treats an inserted row as new", async () => {
    const store = createWebhookInboxStore(poolReturning([{ status: "pending" }]));
    await expect(store.record(delivery())).resolves.toEqual({
      duplicate: false
    });
  });

  it("inserts with ON CONFLICT DO NOTHING so replay cannot double-write", async () => {
    const pool = poolReturning([]);
    await createWebhookInboxStore(pool).record(delivery());
    expect(pool.calls[0].sql).toContain("ON CONFLICT (provider, event_id) DO NOTHING");
  });

  it("promotes a failure to dead at the attempt cap, in one statement", async () => {
    const pool = poolReturning([{ status: "dead", attempts: 5 }]);
    const store = createWebhookInboxStore(pool);
    await expect(
      store.markFailed({
        provider: "stripe",
        eventId: "evt_1",
        error: new Error("nope")
      })
    ).resolves.toEqual({ status: "dead", attempts: 5 });
    expect(pool.calls[0].sql).toContain("attempts + 1 >= $3");
    // Only the redacted class name reaches last_error.
    expect(pool.calls[0].values[3]).toBe("Error");
  });

  it("selects retryable rows oldest first, below the attempt cap", async () => {
    const pool = poolReturning([]);
    await createWebhookInboxStore(pool).selectRetryable({ limit: 5 });
    expect(pool.calls[0].sql).toContain("status IN ('pending', 'failed')");
    expect(pool.calls[0].sql).toContain("ORDER BY received_at ASC");
    expect(pool.calls[0].values).toEqual([5, MAX_WEBHOOK_ATTEMPTS]);
    // Deliberately not a lock-based claim: through the pooled adapter every
    // statement is its own transaction, so FOR UPDATE would guarantee nothing.
    // Overlapping runs are safe because processEvent is idempotent instead.
    expect(pool.calls[0].sql).not.toContain("FOR UPDATE");
  });
});
