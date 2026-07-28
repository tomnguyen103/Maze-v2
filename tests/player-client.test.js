import {
  createPlayerApiClient,
  createRunIdempotencyKey
} from "../src/player/player-client.js";
import {
  applyPlayerPalettes,
  DEFAULT_PLAYER_PROFILE
} from "../src/player/palettes.js";
import { describe, expect, it, vi } from "vitest";

describe("player client", () => {
  it("maps admin workbench actions to their guarded routes", async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "content-type": "application/json" }
      })
    );
    const client = createPlayerApiClient({ fetchImpl });

    await client.listAdminUsers();
    await client.exportAdminUser("user_1");
    await client.updateAdminRole("user_1", "moderator");
    await client.listAdminQuestions();
    await client.saveAdminQuestion("math-1", { prompt: "draft" });
    await client.publishAdminQuestion("math-1", 2);
    await client.deleteAdminQuestion("math-1");
    await client.getAdminMembership("user_1");
    await client.issueAdminRefund("user_1");
    await client.listAdminAudit(10);
    await client.getAdminMetrics();
    await client.listDeadWebhooks();

    const calls = /** @type {any[][]} */ (fetchImpl.mock.calls);
    expect(calls.map(([path]) => path)).toEqual([
      "/api/admin/users",
      "/api/admin/users/user_1/export",
      "/api/admin/users/user_1/role",
      "/api/admin/questions",
      "/api/admin/questions/math-1",
      "/api/admin/questions/math-1/publish",
      "/api/admin/questions/math-1",
      "/api/admin/memberships/user_1",
      "/api/admin/memberships/user_1/refund",
      "/api/admin/audit?before=10",
      "/api/admin/metrics",
      "/api/admin/webhooks/dead"
    ]);
    expect(calls[2][1]).toEqual(
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ role: "moderator" })
      })
    );
  });

  it("adds the Clerk session token to authenticated requests", async () => {
    const fetchImpl = vi.fn(
      /** @param {string | URL | Request} _path @param {RequestInit} [_options] */
      async (_path, _options) => {
        void _path;
        void _options;
        return new Response(
          JSON.stringify({
            profile: {
              username: "Moss Runner",
              explorerPalette: "teal",
              playgroundPalette: "daylight"
            }
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      }
    );
    const client = createPlayerApiClient({
      fetchImpl,
      getToken: async () => "session-token"
    });

    await client.getProfile();

    expect(fetchImpl).toHaveBeenCalledWith(
      "/api/profile",
      expect.objectContaining({ credentials: "same-origin" })
    );
    const requestOptions = fetchImpl.mock.calls[0][1];
    expect(requestOptions).toBeDefined();
    if (!requestOptions) {
      throw new Error("Expected request options.");
    }
    expect(new Headers(requestOptions.headers).get("authorization")).toBe(
      "Bearer session-token"
    );
  });

  it("surfaces the API error message", async () => {
    const client = createPlayerApiClient({
      fetchImpl: async () =>
        new Response(JSON.stringify({ error: "That username is already in use." }), {
          status: 409,
          headers: { "content-type": "application/json" }
        }),
      getToken: async () => null
    });

    await expect(
      client.saveProfile({
        username: "Moss",
        explorerPalette: "teal",
        playgroundPalette: "daylight"
      })
    ).rejects.toThrow("That username is already in use.");
  });

  it("preserves the current record on an optimistic settings conflict", async () => {
    const record = {
      settings: {
        version: 1,
        highContrast: true,
        largeMarks: false,
        readerFriendlyQuestions: true,
        reducedEffects: false
      },
      revision: 4,
      updatedAt: "2026-07-28T00:00:00.000Z"
    };
    const client = createPlayerApiClient({
      fetchImpl: async () =>
        new Response(
          JSON.stringify({
            error: "Explorer Access Settings changed on another device.",
            record
          }),
          {
            status: 409,
            headers: { "content-type": "application/json" }
          }
        )
    });

    await expect(
      client.saveAccessSettings(record.settings, 2)
    ).rejects.toMatchObject({
      status: 409,
      body: { record }
    });
  });

  it("aborts a player request after its timeout", async () => {
    vi.useFakeTimers();
    try {
      const client = createPlayerApiClient({
        fetchImpl: (_path, options) =>
          new Promise((_resolve, reject) => {
            options?.signal?.addEventListener("abort", () => {
              reject(new DOMException("Timed out", "AbortError"));
            });
          }),
        timeoutMs: 10
      });

      const assertion = expect(client.getLeaderboard()).rejects.toMatchObject({
        name: "AbortError"
      });
      await vi.advanceTimersByTimeAsync(10);
      await assertion;
    } finally {
      vi.useRealTimers();
    }
  });

  it("times out while waiting for a Clerk token", async () => {
    vi.useFakeTimers();
    try {
      const fetchImpl = vi.fn();
      const client = createPlayerApiClient({
        fetchImpl,
        getToken: () => new Promise(() => {}),
        timeoutMs: 10
      });

      const assertion = expect(client.getProfile()).rejects.toMatchObject({
        name: "AbortError"
      });
      await vi.advanceTimersByTimeAsync(10);
      await assertion;
      expect(fetchImpl).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it("times out while reading a response body", async () => {
    vi.useFakeTimers();
    try {
      const client = createPlayerApiClient({
        fetchImpl: async () =>
          /** @type {Response} */ ({
            ok: true,
            status: 200,
            json: () => new Promise(() => {})
          }),
        timeoutMs: 10
      });

      const assertion = expect(client.getLeaderboard()).rejects.toMatchObject({
        name: "AbortError"
      });
      await vi.advanceTimersByTimeAsync(10);
      await assertion;
    } finally {
      vi.useRealTimers();
    }
  });

  it("builds a stable idempotency key from final run facts", () => {
    const run = {
      seed: "MOSS-WATCH-11",
      moves: 81,
      elapsedMs: 92000,
      score: 900
    };

    expect(createRunIdempotencyKey(run, "trail-scout", 4)).toBe(
      createRunIdempotencyKey(run, "trail-scout", 4)
    );
    expect(createRunIdempotencyKey(run, "trail-scout", 4)).toMatch(
      /^[a-z0-9_-]{12,128}$/
    );
  });

  it("posts the stable Run id to the admission seam", async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(
        JSON.stringify({
          allowed: true,
          duplicate: false,
          freeRunsRemaining: 2,
          state: "free",
          enforcementEnabled: true
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      )
    );
    const client = createPlayerApiClient({
      fetchImpl,
      getToken: async () => "session-token"
    });

    await expect(
      client.authorizeRun({
        runId: "access_01J1MOSSWATCH",
        seed: "MOSS-WATCH-11",
        levelId: "trail-scout",
        labyrinthNumber: 4
      })
    ).resolves.toMatchObject({ allowed: true, freeRunsRemaining: 2 });
    expect(fetchImpl).toHaveBeenCalledWith(
      "/api/access/runs",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          runId: "access_01J1MOSSWATCH",
          seed: "MOSS-WATCH-11",
          levelId: "trail-scout",
          labyrinthNumber: 4
        })
      })
    );
  });

  it("posts guest Run admission without waiting for a Clerk token", async () => {
    const getToken = vi.fn(() => new Promise(() => {}));
    const fetchImpl = vi.fn(async () =>
      new Response(
        JSON.stringify({
          allowed: true,
          duplicate: false,
          guestDemoEnforcementEnabled: true
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      )
    );
    const client = createPlayerApiClient({ fetchImpl, getToken });
    const run = {
      runId: "access_01J1MOSSWATCH",
      seed: "MOSS-WATCH-11",
      levelId: "trail-scout",
      labyrinthNumber: 4
    };
    await expect(client.authorizeGuestRun(run)).resolves.toMatchObject({
      allowed: true
    });
    expect(fetchImpl).toHaveBeenCalledWith(
      "/api/access/guest-runs",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify(run)
      })
    );
    expect(getToken).not.toHaveBeenCalled();
  });

  it("reads and revision-saves Cloud Quest Progress", async () => {
    const progress = {
      version: 1,
      questId: "quest_client_123",
      levelId: "trail-scout",
      labyrinthNumber: 4,
      completedLabyrinths: 3,
      usedMapFingerprints: [],
      usedQuestionIds: [],
      nextQuestionOrdinal: 0,
      complete: false
    };
    const fetchImpl = vi.fn(async () =>
      new Response(JSON.stringify({ record: null }), {
        status: 200,
        headers: { "content-type": "application/json" }
      })
    );
    const client = createPlayerApiClient({
      fetchImpl,
      getToken: async () => "session-token"
    });

    await client.getQuestProgress();
    await client.saveQuestProgress(progress, 3);

    const calls = /** @type {any[][]} */ (fetchImpl.mock.calls);
    expect(calls[0][0]).toBe("/api/quest-progress");
    expect(calls[1]).toEqual([
      "/api/quest-progress",
      expect.objectContaining({
        method: "PUT",
        body: JSON.stringify({ progress, expectedRevision: 3 })
      })
    ]);
  });

  it("reads and revision-saves Explorer Access Settings", async () => {
    const settings = {
      version: 1,
      highContrast: true,
      largeMarks: false,
      readerFriendlyQuestions: true,
      reducedEffects: false
    };
    const fetchImpl = vi.fn(
      /** @param {string | URL | Request} _path @param {RequestInit} [_options] */
      async (_path, _options) => {
        void _path;
        void _options;
        return new Response(JSON.stringify({ record: null }), {
          status: 200,
          headers: { "content-type": "application/json" }
        });
      }
    );
    const client = createPlayerApiClient({
      fetchImpl,
      getToken: async () => "session-token"
    });

    await client.getAccessSettings();
    await client.saveAccessSettings(settings, 3);

    expect(fetchImpl.mock.calls[0][0]).toBe("/api/me/settings");
    expect(fetchImpl.mock.calls[1]).toEqual([
      "/api/me/settings",
      expect.objectContaining({
        method: "PUT",
        body: JSON.stringify({ settings, expectedRevision: 3 })
      })
    ]);
  });

  it("reads the server enforcement flag without waiting for a Clerk token", async () => {
    const getToken = vi.fn(() => new Promise(() => {}));
    const client = createPlayerApiClient({
      fetchImpl: async () =>
        new Response(JSON.stringify({ enforcementEnabled: false }), {
          status: 200,
          headers: { "content-type": "application/json" }
        }),
      getToken
    });

    await expect(client.getRunAccessConfig()).resolves.toEqual({
      enforcementEnabled: false
    });
    expect(getToken).not.toHaveBeenCalled();
  });

  it("opens the fixed lifetime Checkout without browser commercial fields", async () => {
    const fetchImpl = vi.fn(
      /** @param {string | URL | Request} _path @param {RequestInit} [_options] */
      async (_path, _options) => {
        void _path;
        void _options;
        return new Response(
          JSON.stringify({
            checkoutUrl: "https://checkout.stripe.com/c/pay/cs_test_echo",
            purchaseId: "purchase_123",
            state: "checkout_open"
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      }
    );
    const client = createPlayerApiClient({
      fetchImpl,
      getToken: async () => "session-token"
    });

    await client.createLifetimeCheckout();

    expect(fetchImpl).toHaveBeenCalledWith(
      "/api/lifetime-checkout",
      expect.objectContaining({ method: "POST" })
    );
    expect(fetchImpl.mock.calls[0][1]?.body).toBeUndefined();
  });

  it("confirms only the returned Stripe Checkout Session", async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(
        JSON.stringify({
          canStartRun: true,
          lifetime: true,
          state: "lifetime_active"
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      )
    );
    const client = createPlayerApiClient({
      fetchImpl,
      getToken: async () => "session-token"
    });

    await client.confirmLifetimeCheckout("cs_test_echo_123");

    expect(fetchImpl).toHaveBeenCalledWith(
      "/api/lifetime-confirm",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ sessionId: "cs_test_echo_123" })
      })
    );
  });

  it("reads, saves, and clears the authenticated learning Journal", async () => {
    const fetchImpl = vi.fn(
      /** @param {string | URL | Request} _path @param {RequestInit} [_options] */
      async (_path, _options) => {
        void _path;
        void _options;
        return new Response(JSON.stringify({ journal: { version: 1, events: [] } }), {
          status: 200,
          headers: { "content-type": "application/json" }
        });
      }
    );
    const client = createPlayerApiClient({
      fetchImpl,
      getToken: async () => "session-token"
    });
    const journal = { version: 1, events: [] };

    await client.getLearningJournal();
    await client.saveLearningJournal(journal, 2);
    await client.clearLearningJournal();

    expect(fetchImpl.mock.calls.map(([path]) => path)).toEqual([
      "/api/learning-journal",
      "/api/learning-journal",
      "/api/learning-journal"
    ]);
    expect(fetchImpl.mock.calls[1][1]).toEqual(
      expect.objectContaining({
        method: "PUT",
        body: JSON.stringify({ journal, clearGeneration: 2 })
      })
    );
    expect(fetchImpl.mock.calls[2][1]).toEqual(
      expect.objectContaining({ method: "DELETE" })
    );
  });
});

describe("player palettes", () => {
  it("applies supported palette attributes and falls back to defaults", () => {
    /** @type {{ dataset: Record<string, string> }} */
    const root = { dataset: {} };

    applyPlayerPalettes(
      {
        username: "Moss",
        explorerPalette: "violet",
        playgroundPalette: "dusk"
      },
      root
    );
    expect(root.dataset.explorerPalette).toBe("violet");
    expect(root.dataset.playgroundPalette).toBe("dusk");

    applyPlayerPalettes(
      {
        ...DEFAULT_PLAYER_PROFILE,
        explorerPalette: "unknown",
        playgroundPalette: "unknown"
      },
      root
    );
    expect(root.dataset.explorerPalette).toBe("teal");
    expect(root.dataset.playgroundPalette).toBe("daylight");
  });
});
