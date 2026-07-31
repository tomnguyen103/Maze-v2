// @vitest-environment happy-dom

import { beforeEach, describe, expect, it, vi } from "vitest";

const profile = {
  username: "Moss Runner",
  explorerPalette: "teal",
  playgroundPalette: "daylight"
};
const clerkBrowser = {
  /** @type {{ id: string } | null} */
  user: { id: "user_123" },
  getToken: vi.fn(async () => "token"),
  initialize: vi.fn(async () => true),
  openSignIn: vi.fn(async () => true),
  openSignUp: vi.fn(async () => true),
  openUserProfile: vi.fn(async () => true),
  signOut: vi.fn(async () => {})
};
const client = {
  getLeaderboard: vi.fn(async () => ({ entries: [], globalMaxScore: 0 })),
  getVerifiedDailyLeaderboard: vi.fn(async () => ({
    date: "2026-07-26",
    entries: []
  })),
  getProfile: vi.fn(
    /** @returns {Promise<{ profile: typeof profile | null }>} */
    async () => ({ profile: null })
  ),
  getQuestProgress: vi.fn(async () => ({ record: null })),
  saveProfile: vi.fn(async () => ({ profile })),
  saveQuestProgress: vi.fn(async () => ({
    record: { progress: { questId: "quest_cloud_123" }, revision: 1 }
  })),
  submitScore: vi.fn(async () => ({})),
  submitVerifiedDaily: vi.fn(async () => ({
    verification: "verified-replay-v1",
    bestResult: "created",
    improved: true
  })),
  authorizeRun: vi.fn(async () => ({
    allowed: true,
    duplicate: false,
    freeRunsRemaining: 2,
    state: "free"
  })),
  getRunAccessConfig: vi.fn(async () => ({ enforcementEnabled: false })),
  getRunAccess: vi.fn(async () => ({
    freeRunsRemaining: 3,
    state: "free"
  })),
  createLifetimeCheckout: vi.fn(async () => ({
    checkoutUrl: "https://checkout.stripe.com/c/pay/cs_test_echo",
    state: "checkout_open"
  })),
  confirmLifetimeCheckout: vi.fn(async () => ({
    lifetime: true,
    state: "lifetime_active"
  })),
  getLearningJournal: vi.fn(async () => ({
    journal: { version: 1, events: [] }
  })),
  saveLearningJournal: vi.fn(async (journal) => ({ journal })),
  clearLearningJournal: vi.fn(async () => {})
};

/** @type {() => void} */
let clerkOnChange = () => {};
vi.mock("../src/player/clerk-browser.js", () => ({
  createClerkBrowser: (
    /** @type {{ onChange: () => void }} */ options
  ) => {
    clerkOnChange = options.onChange;
    return clerkBrowser;
  }
}));
const createPlayerApiClient = vi.fn(
  /** @param {{ getClassroomId?: () => string | null }} [_options] */
  (_options) => {
    void _options;
    return client;
  }
);

vi.mock("../src/player/player-client.js", () => ({
  createPlayerApiClient,
  createRunIdempotencyKey: vi.fn(() => "run-key")
}));
vi.mock("../src/player/palettes.js", () => ({
  applyPlayerPalettes: vi.fn(),
  DEFAULT_PLAYER_PROFILE: {
    username: "",
    explorerPalette: "teal",
    playgroundPalette: "daylight"
  }
}));

const { createPlayerController } = await import(
  "../src/player/player-controller.js"
);

describe("Player Profile dialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // A controller's boot chain can outlive the test that created it, so a
    // one-shot Profile response is not safe here: a leaked call from the
    // previous test would consume it. Each test restores the signed-out
    // default and overrides it with a persistent value instead.
    client.getProfile.mockResolvedValue({ profile: null });
    clerkBrowser.user = { id: "user_123" };
    clerkOnChange = () => {};
    localStorage.clear();
    document.body.innerHTML = `
      <button id="player-auth-button"></button>
      <button id="player-close"></button>
      <dialog id="player-dialog">
        <p id="player-dialog-intro"></p>
        <form id="player-form">
          <input id="player-username" name="username" />
          <input type="radio" name="explorerPalette" value="teal" checked />
          <input type="radio" name="playgroundPalette" value="daylight" checked />
          <button id="player-save" type="submit">Save profile</button>
        </form>
        <p id="player-form-status"></p>
      </dialog>
      <span id="global-max-score"></span>
      <span id="player-name"></span>
      <button id="player-button"></button>
      <span id="player-score"></span>
      <button id="scoreboard-close"></button>
      <dialog id="scoreboard-dialog"></dialog>
      <label for="scoreboard-partition">Rules</label>
      <select id="scoreboard-partition"></select>
      <p id="scoreboard-partition-label"></p>
      <ol id="scoreboard-list"></ol>
      <button id="scoreboard-button"></button>
      <p id="scoreboard-status"></p>
      <button id="player-sign-out"></button>
      <a id="classroom-link" href="/class" hidden>Classroom</a>
    `;
  });

  it("defaults the board to the current Run partition and exposes Classic Rules", async () => {
    createPlayerController({
      getScorePartition: () => ({
        atlasRegionId: "advanced",
        rulesetRevision: "tide-doors-v1",
        regionLabel: "Advanced",
        rulesetLabel: "Tide Doors"
      })
    });

    await vi.waitFor(() =>
      expect(client.getLeaderboard).toHaveBeenCalledWith({
        atlasRegionId: "advanced",
        rulesetRevision: "tide-doors-v1"
      })
    );
    const select = /** @type {HTMLSelectElement} */ (
      document.getElementById("scoreboard-partition")
    );
    expect([...select.options].map((option) => option.textContent)).toEqual([
      "Advanced · Tide Doors",
      "Advanced · Classic Rules"
    ]);
    expect(document.getElementById("scoreboard-partition-label")?.textContent)
      .toBe("Showing Advanced · Tide Doors.");

    select.value = "classic-v1";
    select.dispatchEvent(new Event("change"));
    await vi.waitFor(() =>
      expect(client.getLeaderboard).toHaveBeenLastCalledWith({
        atlasRegionId: "advanced",
        rulesetRevision: "classic-v1"
      })
    );
  });

  it("submits an escaped Run with its exact Region and ruleset", async () => {
    client.getProfile.mockResolvedValue({ profile });
    const controller = createPlayerController();
    await vi.waitFor(() =>
      expect(document.getElementById("player-name")?.textContent).toBe(
        "Moss Runner"
      )
    );

    await controller.submitEscapedRun(
      {
        seed: "MOSS-WATCH-11",
        moves: 81,
        elapsedMs: 92000,
        score: 850,
        wardensDefeated: 2,
        echoesCollected: 3,
        atlasRegionId: "foundation",
        rulesetRevision: "echo-hush-v1"
      },
      "trail-scout",
      4
    );

    expect(client.submitScore).toHaveBeenCalledWith(expect.objectContaining({
      atlasRegionId: "foundation",
      rulesetRevision: "echo-hush-v1",
      score: 850
    }));
  });

  it("does not render a stale response under a newer partition label", async () => {
    /** @type {(value: { globalMaxScore: number, entries: Record<string, unknown>[] }) => void} */
    let resolveCurrent = () => {};
    const getLeaderboard = /** @type {any} */ (client.getLeaderboard);
    getLeaderboard
      .mockReset()
      .mockImplementationOnce(() => new Promise((resolve) => {
        resolveCurrent = resolve;
      }))
      .mockResolvedValueOnce({
        globalMaxScore: 700,
        entries: [{ username: "Classic Fox", score: 700 }]
      });
    createPlayerController({
      getScorePartition: () => ({
        atlasRegionId: "advanced",
        rulesetRevision: "tide-doors-v1",
        regionLabel: "Advanced",
        rulesetLabel: "Tide Doors"
      })
    });
    await vi.waitFor(() =>
      expect(client.getLeaderboard).toHaveBeenCalledTimes(1)
    );
    const select = /** @type {HTMLSelectElement} */ (
      document.getElementById("scoreboard-partition")
    );
    select.value = "classic-v1";
    select.dispatchEvent(new Event("change"));
    await vi.waitFor(() =>
      expect(document.getElementById("scoreboard-list")?.textContent)
        .toContain("Classic Fox")
    );
    expect(document.getElementById("scoreboard-partition-label")?.textContent)
      .toBe("Showing Advanced · Classic Rules.");

    resolveCurrent({
      globalMaxScore: 1200,
      entries: [{ username: "Tide Fox", score: 1200 }]
    });
    await Promise.resolve();
    await Promise.resolve();

    expect(document.getElementById("scoreboard-partition-label")?.textContent)
      .toBe("Showing Advanced · Classic Rules.");
    expect(document.getElementById("scoreboard-list")?.textContent)
      .not.toContain("Tide Fox");
    expect(document.getElementById("global-max-score")?.textContent)
      .toBe("700");
  });

  it("binds Class Play storage to scoped calls and shows useful navigation", async () => {
    localStorage.setItem(
      "echo-maze:selected-classroom:v1:user_123",
      "org_class_1"
    );
    createPlayerController();

    const options = createPlayerApiClient.mock.calls.at(-1)?.[0];
    expect(options?.getClassroomId?.()).toBe("org_class_1");
    await vi.waitFor(() => {
      expect(
        /** @type {HTMLAnchorElement} */ (
          document.getElementById("classroom-link")
        ).hidden
      ).toBe(false);
    });
  });

  it("reports the initial identity and its explicit sign-out", async () => {
    const onAuthenticationChange = vi.fn();
    const onIdentityEnd = vi.fn();
    clerkBrowser.signOut.mockImplementationOnce(async () => {
      clerkBrowser.user = null;
    });
    createPlayerController({ onAuthenticationChange, onIdentityEnd });

    await vi.waitFor(() => {
      expect(onAuthenticationChange).toHaveBeenCalledWith(true);
    });
    /** @type {HTMLButtonElement} */ (
      document.getElementById("player-sign-out")
    ).click();

    await vi.waitFor(() => {
      expect(onAuthenticationChange).toHaveBeenLastCalledWith(false);
      expect(onIdentityEnd).toHaveBeenCalledOnce();
    });
  });

  it("reports when Clerk removes the active account identity", async () => {
    const onAuthenticationChange = vi.fn();
    const onIdentityEnd = vi.fn();
    createPlayerController({ onAuthenticationChange, onIdentityEnd });
    await vi.waitFor(() => {
      expect(onAuthenticationChange).toHaveBeenCalledWith(true);
    });

    clerkBrowser.user = null;
    clerkOnChange();

    await vi.waitFor(() => {
      expect(onAuthenticationChange).toHaveBeenLastCalledWith(false);
      expect(onIdentityEnd).toHaveBeenCalledOnce();
    });
  });

  it("closes the required first-login dialog after a successful save", async () => {
    createPlayerController();
    const dialog = /** @type {HTMLDialogElement} */ (
      document.getElementById("player-dialog")
    );
    const form = /** @type {HTMLFormElement} */ (
      document.getElementById("player-form")
    );
    const username = /** @type {HTMLInputElement} */ (
      document.getElementById("player-username")
    );

    await vi.waitFor(() => expect(dialog.open).toBe(true));
    username.value = profile.username;
    form.dispatchEvent(
      new SubmitEvent("submit", { bubbles: true, cancelable: true })
    );

    await vi.waitFor(() => {
      expect(client.saveProfile).toHaveBeenCalledOnce();
      expect(dialog.open).toBe(false);
    });
  });

  it("delegates one stable id to the authenticated admission client", async () => {
    const controller = createPlayerController();

    await expect(
      controller.authorizeRun({
        runId: "access_01J1MOSSWATCH",
        seed: "MOSS-WATCH-11",
        levelId: "trail-scout",
        labyrinthNumber: 4
      })
    ).resolves.toMatchObject({
      allowed: true,
      freeRunsRemaining: 2
    });
    expect(client.authorizeRun).toHaveBeenCalledWith({
      runId: "access_01J1MOSSWATCH",
      seed: "MOSS-WATCH-11",
      levelId: "trail-scout",
      labyrinthNumber: 4
    });
  });

  it("reads the server-owned enforcement state", async () => {
    const controller = createPlayerController();

    await expect(controller.getRunAccessConfig()).resolves.toEqual({
      enforcementEnabled: false
    });
    expect(client.getRunAccessConfig).toHaveBeenCalledOnce();
  });

  it("reads the authenticated allowance status", async () => {
    const controller = createPlayerController();

    await expect(controller.getRunAccess()).resolves.toEqual({
      freeRunsRemaining: 3,
      state: "free"
    });
    expect(client.getRunAccess).toHaveBeenCalledOnce();
  });

  it("loads the public Daily board and verifies an authenticated Profile result", async () => {
    client.getProfile.mockResolvedValue({ profile });
    const controller = createPlayerController();
    await vi.waitFor(() =>
      expect(document.getElementById("player-name")?.textContent).toBe(
        "Moss Runner"
      )
    );
    const submission = { idempotencyKey: "daily_01J1MOSSWATCH" };

    await expect(controller.getVerifiedDailyLeaderboard()).resolves.toEqual({
      date: "2026-07-26",
      entries: []
    });
    await expect(
      controller.submitVerifiedDaily(submission)
    ).resolves.toMatchObject({
      state: "verified",
      verification: "verified-replay-v1",
      bestResult: "created",
      improved: true
    });
    expect(client.submitVerifiedDaily).toHaveBeenCalledWith(submission);
  });

  it("keeps Guest Daily submissions casual without calling the verified route", async () => {
    clerkBrowser.user = null;
    const controller = createPlayerController();

    await expect(
      controller.submitVerifiedDaily({
        idempotencyKey: "daily_01J1MOSSWATCH"
      })
    ).resolves.toEqual({ state: "signed-out" });
    expect(client.submitVerifiedDaily).not.toHaveBeenCalled();
  });

  it("requires a Player Profile before submitting a verified Daily result", async () => {
    const controller = createPlayerController();
    await vi.waitFor(() => expect(client.getProfile).toHaveBeenCalledOnce());
    client.getProfile.mockResolvedValueOnce({ profile: null });

    await expect(
      controller.submitVerifiedDaily({
        idempotencyKey: "daily_01J1MOSSWATCH"
      })
    ).resolves.toEqual({ state: "profile-required" });
    expect(client.submitVerifiedDaily).not.toHaveBeenCalled();
  });

  it("distinguishes rejected replays from unavailable verification", async () => {
    client.getProfile.mockResolvedValue({ profile });
    const controller = createPlayerController();
    await vi.waitFor(() =>
      expect(document.getElementById("player-name")?.textContent).toBe(
        "Moss Runner"
      )
    );
    client.submitVerifiedDaily
      .mockRejectedValueOnce(
        Object.assign(new Error("Replay result does not match the claim."), {
          status: 409
        })
      )
      .mockRejectedValueOnce(new Error("offline"))
      .mockRejectedValueOnce(
        Object.assign(new Error("Sign in again."), { status: 401 })
      )
      .mockRejectedValueOnce(
        Object.assign(new Error("Service unavailable."), { status: 503 })
      );
    const submission = { idempotencyKey: "daily_01J1MOSSWATCH" };

    await expect(
      controller.submitVerifiedDaily(submission)
    ).resolves.toEqual({
      state: "rejected",
      message: "Replay result does not match the claim."
    });
    await expect(
      controller.submitVerifiedDaily(submission)
    ).resolves.toEqual({
      state: "network-failure",
      message: "offline"
    });
    await expect(
      controller.submitVerifiedDaily(submission)
    ).resolves.toEqual({
      state: "signed-out",
      message: "Sign in again."
    });
    await expect(
      controller.submitVerifiedDaily(submission)
    ).resolves.toEqual({
      state: "unavailable",
      message: "Service unavailable."
    });
  });

  it("retries a pending authenticated Journal clear after reconnect", async () => {
    client.clearLearningJournal
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce();
    const controller = createPlayerController();
    await vi.waitFor(() =>
      expect(client.getLearningJournal).toHaveBeenCalledOnce()
    );

    controller.clearLanternJournal();
    await vi.waitFor(() =>
      expect(client.clearLearningJournal).toHaveBeenCalledOnce()
    );

    await controller.retryLanternJournalSync();

    expect(client.clearLearningJournal).toHaveBeenCalledTimes(2);
  });

  it("initializes Clerk before reading and saving Cloud Quest Progress", async () => {
    const controller = createPlayerController();
    const progress = { questId: "quest_cloud_123" };

    await expect(controller.getCloudQuestProgress()).resolves.toEqual({
      record: null
    });
    await controller.saveCloudQuestProgress(progress, 0);

    expect(clerkBrowser.initialize).toHaveBeenCalled();
    expect(client.getQuestProgress).toHaveBeenCalledOnce();
    expect(client.saveQuestProgress).toHaveBeenCalledWith(progress, 0);
  });

  it("initializes Clerk before creating authenticated Checkout", async () => {
    const controller = createPlayerController();

    await controller.createLifetimeCheckout();

    expect(clerkBrowser.initialize).toHaveBeenCalled();
    expect(
      clerkBrowser.initialize.mock.invocationCallOrder[0]
    ).toBeLessThan(
      client.createLifetimeCheckout.mock.invocationCallOrder[0]
    );
  });
});
