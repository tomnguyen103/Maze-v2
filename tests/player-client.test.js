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
  it("unwraps the verified Classroom Domain response for the workspace", async () => {
    const responses = [
      { verifiedDomain: null },
      {
        verifiedDomain: {
          domain: "students.school.example",
          autoJoinEnabled: true
        }
      }
    ];
    const fetchImpl = vi.fn(async () =>
      new Response(JSON.stringify(responses.shift()), {
        status: 200,
        headers: { "content-type": "application/json" }
      })
    );
    const client = createPlayerApiClient({ fetchImpl });

    await expect(client.getClassroomDomain("org_class_1")).resolves.toEqual({
      domain: null
    });
    await expect(
      client.registerClassroomDomain(
        "org_class_1",
        "students.school.example"
      )
    ).resolves.toEqual({ domain: "students.school.example" });
  });

  it("maps Classroom workspace actions to the shared guarded namespace", async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(JSON.stringify({
        ok: true,
        verifiedDomain: { domain: "school.example" }
      }), {
        status: 200,
        headers: { "content-type": "application/json" }
      })
    );
    const client = createPlayerApiClient({ fetchImpl });

    await client.listClassrooms();
    await client.createClassroom("Aurora Lab");
    await client.getClassroomProgress("org_class_1");
    await client.getClassroomDomain("org_class_1");
    await client.registerClassroomDomain("org_class_1", "school.example");
    await client.inviteClassroomStudent(
      "org_class_1",
      "student@example.com"
    );

    const calls = /** @type {any[][]} */ (fetchImpl.mock.calls);
    expect(calls.map(([path]) => path)).toEqual([
      "/api/classrooms",
      "/api/classrooms",
      "/api/classrooms/org_class_1/progress",
      "/api/classrooms/org_class_1/domain",
      "/api/classrooms/org_class_1/domain",
      "/api/classrooms/org_class_1/invitations"
    ]);
    expect(calls[1][1]).toEqual(
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ name: "Aurora Lab" })
      })
    );
    expect(calls[4][1]).toEqual(
      expect.objectContaining({
        method: "PUT",
        body: JSON.stringify({ domain: "school.example" })
      })
    );
    expect(calls[5][1]).toEqual(
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ email: "student@example.com" })
      })
    );
  });

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

      const assertion = expect(client.getLeaderboard({
        atlasRegionId: "foundation",
        rulesetRevision: "classic-v1"
      })).rejects.toMatchObject({
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

      const assertion = expect(client.getLeaderboard({
        atlasRegionId: "foundation",
        rulesetRevision: "classic-v1"
      })).rejects.toMatchObject({
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
      score: 900,
      atlasRegionId: "foundation",
      rulesetRevision: "echo-hush-v1"
    };

    expect(createRunIdempotencyKey(run, "trail-scout", 4)).toBe(
      createRunIdempotencyKey(run, "trail-scout", 4)
    );
    expect(createRunIdempotencyKey(run, "trail-scout", 4)).toMatch(
      /^[a-z0-9_-]{12,128}$/
    );
    expect(createRunIdempotencyKey(run, "trail-scout", 4)).not.toBe(
      createRunIdempotencyKey(
        { ...run, rulesetRevision: "classic-v1" },
        "trail-scout",
        4
      )
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

  it("posts the admitted Run and installation nonce to Offline Continuity", async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(
        JSON.stringify({ receipt: { binding: { runId: "access_01J1MOSSWATCH" } } }),
        { status: 201, headers: { "content-type": "application/json" } }
      )
    );
    const client = createPlayerApiClient({
      fetchImpl,
      getToken: async () => "session-token"
    });
    const run = {
      runId: "access_01J1MOSSWATCH",
      seed: "MOSS-WATCH-11",
      levelId: "trail-scout",
      labyrinthNumber: 4
    };

    await expect(
      client.issueOfflineReceipt(run, "installation_nonce_01MOSS")
    ).resolves.toMatchObject({ receipt: expect.any(Object) });
    expect(fetchImpl).toHaveBeenCalledWith(
      "/api/offline/receipt",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          ...run,
          deviceInstallationNonce: "installation_nonce_01MOSS"
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

  it("keeps Echo Fossil calls personal and Quest-scoped", async () => {
    const collection = {
      version: 1,
      questId: "quest_client_123",
      fossils: []
    };
    const fetchImpl = vi.fn(async () =>
      new Response(JSON.stringify({ collection }), {
        status: 200,
        headers: { "content-type": "application/json" }
      })
    );
    const client = createPlayerApiClient({
      fetchImpl,
      getToken: async () => "session-token",
      getClassroomId: () => "org_should_not_be_sent"
    });

    await client.getFossils("quest_client_123");
    await client.saveFossils(collection);

    const calls = /** @type {any[][]} */ (fetchImpl.mock.calls);
    expect(calls[0][0]).toBe(
      "/api/echo-fossils?questId=quest_client_123"
    );
    expect(calls[1]).toEqual([
      "/api/echo-fossils",
      expect.objectContaining({
        method: "PUT",
        body: JSON.stringify({ collection })
      })
    ]);
    for (const call of calls) {
      expect(new Headers(call[1].headers).has(
        "x-echo-maze-classroom-id"
      )).toBe(false);
    }
  });

  it("binds only Class Play data calls to the selected Classroom", async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(JSON.stringify({ record: null }), {
        status: 200,
        headers: { "content-type": "application/json" }
      })
    );
    const client = createPlayerApiClient({
      fetchImpl,
      getClassroomId: () => "org_morning_123"
    });

    await client.getProfile();
    await client.getQuestProgress();
    await client.getLearningJournal();
    await client.submitScore({
      idempotencyKey: "run_123",
      levelId: "trail-scout"
    });

    const calls = /** @type {any[][]} */ (fetchImpl.mock.calls);
    expect(new Headers(calls[0][1].headers).has(
      "x-echo-maze-classroom-id"
    )).toBe(false);
    for (const call of calls.slice(1)) {
      expect(
        new Headers(call[1].headers).get("x-echo-maze-classroom-id")
      ).toBe("org_morning_123");
    }
  });

  it("submits an Offline Run without attaching a Classroom scope", async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(JSON.stringify({ status: "accepted", duplicate: false }), {
        status: 200,
        headers: { "content-type": "application/json" }
      })
    );
    const client = createPlayerApiClient({
      fetchImpl,
      getToken: async () => "session-token",
      getClassroomId: () => "org_morning_123"
    });
    const submission = {
      idempotencyKey: "offline_run_01MOSSWATCH",
      receipt: { binding: { runId: "run_01MOSSWATCH" } },
      deviceInstallationHash: "a".repeat(64),
      contentPackHash: "b".repeat(64),
      terminalAt: "2026-08-01T13:00:00.000Z",
      actionLog: { version: 2, actions: [] }
    };

    await expect(client.submitOfflineRun(submission)).resolves.toEqual({
      status: "accepted",
      duplicate: false
    });
    const call = /** @type {any[][]} */ (fetchImpl.mock.calls)[0];
    expect(call[0]).toBe("/api/offline/submission");
    expect(new Headers(call[1].headers).get("authorization")).toBe(
      "Bearer session-token"
    );
    expect(new Headers(call[1].headers).has(
      "x-echo-maze-classroom-id"
    )).toBe(false);
  });

  it("requests one exact public scoreboard partition", async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(JSON.stringify({ entries: [], globalMaxScore: 0 }), {
        status: 200,
        headers: { "content-type": "application/json" }
      })
    );
    const client = createPlayerApiClient({ fetchImpl });

    await client.getLeaderboard({
      atlasRegionId: "advanced",
      rulesetRevision: "tide-doors-v1"
    });

    expect(/** @type {any[][]} */ (fetchImpl.mock.calls)[0]?.[0]).toBe(
      "/api/leaderboard?region=advanced&rules=tide-doors-v1"
    );
  });

  it("keeps the public Daily board unauthenticated and verified submissions global", async () => {
    const getToken = vi.fn(async () => "session-token");
    const fetchImpl = vi.fn(async () =>
      new Response(JSON.stringify({ entries: [] }), {
        status: 200,
        headers: { "content-type": "application/json" }
      })
    );
    const client = createPlayerApiClient({
      fetchImpl,
      getToken,
      getClassroomId: () => "org_morning_123"
    });
    const submission = { idempotencyKey: "daily_01J1MOSSWATCH" };

    await client.getVerifiedDailyLeaderboard();
    await client.submitVerifiedDaily(submission);

    const calls = /** @type {any[][]} */ (fetchImpl.mock.calls);
    expect(calls.map(([path]) => path)).toEqual([
      "/api/daily/leaderboard",
      "/api/daily/scores"
    ]);
    expect(getToken).toHaveBeenCalledOnce();
    expect(
      new Headers(calls[0][1].headers).has("authorization")
    ).toBe(false);
    expect(
      new Headers(calls[1][1].headers).get("authorization")
    ).toBe("Bearer session-token");
    expect(
      new Headers(calls[1][1].headers).has("x-echo-maze-classroom-id")
    ).toBe(false);
    expect(calls[1][1]).toEqual(
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify(submission)
      })
    );
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
