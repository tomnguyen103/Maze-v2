/** @param {import("@playwright/test").Page} page */
export async function installSignedInQuestPlayer(page) {
  await page.addInitScript(() => {
    /** @type {{ id: string } | null} */
    let currentUser = { id: "user_recovery_privacy" };
    const profile = {
      username: "Moss Runner",
      explorerPalette: "teal",
      playgroundPalette: "daylight"
    };
    Reflect.set(window, "__echoMazePlayerDependencies", {
      clerkBrowser: {
        get user() {
          return currentUser;
        },
        getToken: async () => "e2e-session-token",
        initialize: async () => true,
        openSignIn: async () => true,
        openSignUp: async () => true,
        openUserProfile: async () => true,
        signOut: async () => {
          currentUser = null;
        }
      },
      client: {
        getLeaderboard: async () => ({
          entries: [],
          globalMaxScore: 0
        }),
        getVerifiedDailyLeaderboard: async () => ({
          date: "2026-07-26",
          entries: []
        }),
        getProfile: async () => ({ profile }),
        getQuestProgress: async () => ({ record: null }),
        saveQuestProgress: async (
          /** @type {Record<string, unknown>} */ progress
        ) => ({
          record: { progress, revision: 1 }
        }),
        getAccessSettings: async () => ({ record: null }),
        saveAccessSettings: async (
          /** @type {Record<string, unknown>} */ settings
        ) => ({
          record: { settings, revision: 1 }
        }),
        authorizeRun: async () => ({
          allowed: true,
          duplicate: false,
          freeRunsRemaining: 2,
          state: "free"
        }),
        getRunAccessConfig: async () => ({
          enforcementEnabled: false
        }),
        getRunAccess: async () => ({
          freeRunsRemaining: 3,
          state: "free"
        }),
        getLearningJournal: async () => ({
          journal: { version: 1, events: [] },
          clearGeneration: 0
        }),
        saveLearningJournal: async (
          /** @type {Record<string, unknown>} */ journal
        ) => ({ journal }),
        clearLearningJournal: async () => {},
        submitScore: async () => ({})
      }
    });
  });
}
