// @vitest-environment happy-dom

import { beforeEach, describe, expect, it, vi } from "vitest";

const profile = {
  username: "Moss Runner",
  explorerPalette: "teal",
  playgroundPalette: "daylight"
};
const clerkBrowser = {
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
  getProfile: vi.fn(async () => ({ profile: null })),
  getQuestProgress: vi.fn(async () => ({ record: null })),
  saveProfile: vi.fn(async () => ({ profile })),
  saveQuestProgress: vi.fn(async () => ({
    record: { progress: { questId: "quest_cloud_123" }, revision: 1 }
  })),
  submitScore: vi.fn(async () => ({})),
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

vi.mock("../src/player/clerk-browser.js", () => ({
  createClerkBrowser: () => clerkBrowser
}));
vi.mock("../src/player/player-client.js", () => ({
  createPlayerApiClient: () => client,
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
      <ol id="scoreboard-list"></ol>
      <button id="scoreboard-button"></button>
      <p id="scoreboard-status"></p>
      <button id="player-sign-out"></button>
    `;
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
