import {
  createPlayerApiClient,
  createRunIdempotencyKey
} from "./player-client.js";
import {
  applyPlayerPalettes,
  DEFAULT_PLAYER_PROFILE
} from "./palettes.js";
import {
  INITIAL_PLAYER_STATE,
  reducePlayerState
} from "./player-state.js";
import { createClerkBrowser } from "./clerk-browser.js";
import { createJournalContinuity } from "../learning/journal-continuity.js";
import { loadSelectedClassroom } from "../classroom/classroom-selection.js";

/**
 * @typedef {{
 *   username: string,
 *   explorerPalette: string,
 *   playgroundPalette: string
 * }} PlayerProfile
 */

/**
 * @param {{
 *   onPaletteChange?: () => void,
 *   onAuthenticationChange?: (signedIn: boolean) => void,
 *   onJournalChange?: (journal: ReturnType<typeof import("../learning/lantern-journal.js").createLanternJournal>) => void,
 *   onJournalStatusChange?: (message: string) => void
 * }} [options]
 */
export function createPlayerController({
  onPaletteChange = () => {},
  onAuthenticationChange = () => {},
  onJournalChange = () => {},
  onJournalStatusChange = () => {}
} = {}) {
  const elements = {
    auth: requiredElement("player-auth-button", HTMLButtonElement),
    close: requiredElement("player-close", HTMLButtonElement),
    dialog: requiredElement("player-dialog", HTMLDialogElement),
    form: requiredElement("player-form", HTMLFormElement),
    formStatus: requiredElement("player-form-status", HTMLElement),
    globalMax: requiredElement("global-max-score", HTMLElement),
    intro: requiredElement("player-dialog-intro", HTMLElement),
    name: requiredElement("player-name", HTMLElement),
    open: requiredElement("player-button", HTMLButtonElement),
    save: requiredElement("player-save", HTMLButtonElement),
    score: requiredElement("player-score", HTMLElement),
    scoreboardClose: requiredElement("scoreboard-close", HTMLButtonElement),
    scoreboardDialog: requiredElement("scoreboard-dialog", HTMLDialogElement),
    scoreboardList: requiredElement("scoreboard-list", HTMLOListElement),
    scoreboardOpen: requiredElement("scoreboard-button", HTMLButtonElement),
    scoreboardStatus: requiredElement("scoreboard-status", HTMLElement),
    signOut: requiredElement("player-sign-out", HTMLButtonElement),
    username: requiredElement("player-username", HTMLInputElement)
  };
  const clerkBrowser = createClerkBrowser({
    onChange: () => {
      onAuthenticationChange(Boolean(clerkBrowser.user));
      void syncAuthenticatedPlayer();
    }
  });
  let clerkAvailable = false;
  /** @type {Parameters<typeof reducePlayerState>[0]} */
  let playerState = { ...INITIAL_PLAYER_STATE };
  let score = 0;
  const client = createPlayerApiClient({
    getToken: clerkBrowser.getToken,
    getClassroomId: () =>
      loadSelectedClassroom(globalThis.localStorage, clerkBrowser.user?.id)
  });
  const journalContinuity = createJournalContinuity({
    client,
    onChange: onJournalChange,
    onStatus: onJournalStatusChange
  });

  setPalettes(DEFAULT_PLAYER_PROFILE);
  bindEvents();
  renderAuth();
  void refreshLeaderboard();
  void journalContinuity.selectUser("");
  void initializeClerk();

  return {
    async getRunAccessConfig() {
      return client.getRunAccessConfig();
    },
    async getRunAccess() {
      return client.getRunAccess();
    },
    async getCloudQuestProgress() {
      await clerkBrowser.initialize();
      return client.getQuestProgress();
    },
    async getCloudAccessSettings() {
      await clerkBrowser.initialize();
      return client.getAccessSettings();
    },
    /** @param {Record<string, unknown>} settings @param {number} expectedRevision */
    async saveCloudAccessSettings(settings, expectedRevision) {
      await clerkBrowser.initialize();
      return client.saveAccessSettings(settings, expectedRevision);
    },
    /** @param {Record<string, unknown>} progress @param {number} expectedRevision */
    async saveCloudQuestProgress(progress, expectedRevision) {
      await clerkBrowser.initialize();
      return client.saveQuestProgress(progress, expectedRevision);
    },
    async createLifetimeCheckout() {
      await clerkBrowser.initialize();
      return client.createLifetimeCheckout();
    },
    /** @param {string} sessionId */
    async confirmLifetimeCheckout(sessionId) {
      await clerkBrowser.initialize();
      return client.confirmLifetimeCheckout(sessionId);
    },
    hasAuthenticatedUser() {
      return Boolean(clerkBrowser.user);
    },
    getAuthenticatedUserId() {
      return clerkBrowser.user?.id ?? null;
    },
    getLanternJournal() {
      return journalContinuity.getJournal();
    },
    /**
     * @param {{ id: string, topicId: string, learningObjectiveId: string, difficultyBand: string }} question
     * @param {"correct" | "wrong" | "hint" | "skip"} outcome
     */
    recordLearningOutcome(question, outcome) {
      return journalContinuity.record(question, outcome);
    },
    clearLanternJournal() {
      journalContinuity.clear();
    },
    async retryLanternJournalSync() {
      await journalContinuity.retry();
    },
    async isAuthenticated() {
      await clerkBrowser.initialize();
      return Boolean(clerkBrowser.user);
    },
    async openAccountCreation() {
      if (clerkBrowser.user) {
        return true;
      }
      return clerkBrowser.openSignUp();
    },
    /** @param {{ runId: string, seed: string, levelId: string, labyrinthNumber: number }} run */
    async authorizeRun(run) {
      return client.authorizeRun(run);
    },
    /** @param {{ runId: string, seed: string, levelId: string, labyrinthNumber: number }} run */
    async authorizeGuestRun(run) {
      return client.authorizeGuestRun(run);
    },
    /** @param {number} nextScore */
    updateScore(nextScore) {
      score = nextScore;
      elements.score.textContent = String(score);
    },
    /**
     * @param {{
     *   seed: string,
     *   moves: number,
     *   elapsedMs: number,
     *   score: number,
     *   wardensDefeated: number,
     *   echoesCollected: number
     * }} run
     * @param {string} levelId
     * @param {number} labyrinthNumber
     */
    async submitEscapedRun(run, levelId, labyrinthNumber) {
      if (!clerkBrowser.user || !playerState.profile) {
        return;
      }
      try {
        await client.submitScore({
          idempotencyKey: createRunIdempotencyKey(
            run,
            levelId,
            labyrinthNumber
          ),
          levelId,
          labyrinthNumber,
          seed: run.seed,
          wardensDefeated: run.wardensDefeated,
          echoesCollected: run.echoesCollected,
          moves: run.moves,
          elapsedMs: Math.round(run.elapsedMs),
          escaped: true
        });
        await refreshLeaderboard();
      } catch (error) {
        setFormStatus(errorMessage(error), "error");
      }
    }
  };

  function bindEvents() {
    elements.open.addEventListener("click", openPlayerDialog);
    elements.close.addEventListener("click", () => elements.dialog.close());
    elements.dialog.addEventListener("close", () => {
      setPalettes(playerState.profile ?? DEFAULT_PLAYER_PROFILE);
    });
    elements.dialog.addEventListener("cancel", (event) => {
      if (playerState.profileRequired) {
        event.preventDefault();
      }
    });
    elements.auth.addEventListener("click", () => {
      if (clerkBrowser.user) {
        void clerkBrowser.openUserProfile();
      } else {
        void clerkBrowser.openSignIn();
      }
    });
    elements.signOut.addEventListener("click", async () => {
      await clerkBrowser.signOut();
      playerState = reducePlayerState(playerState, {
        type: "auth-changed",
        userId: ""
      });
      if (elements.dialog.open) {
        elements.dialog.close();
      }
    });
    elements.form.addEventListener("submit", saveProfile);
    elements.form.addEventListener("change", previewPalettes);
    elements.scoreboardOpen.addEventListener("click", () => {
      if (!elements.scoreboardDialog.open) {
        elements.scoreboardDialog.showModal();
      }
      void refreshLeaderboard();
    });
    elements.scoreboardClose.addEventListener("click", () =>
      elements.scoreboardDialog.close()
    );
  }

  async function initializeClerk() {
    clerkAvailable = await clerkBrowser.initialize();
    if (!clerkAvailable) {
      elements.auth.disabled = true;
      elements.auth.textContent = "Sign-in unavailable";
      elements.intro.textContent =
        "Guest play is ready while account services are unavailable.";
      return;
    }
    await syncAuthenticatedPlayer();
  }

  async function syncAuthenticatedPlayer() {
    const userId = clerkBrowser.user?.id ?? "";
    if (userId === playerState.userId) {
      renderAuth();
      return;
    }
    playerState = reducePlayerState(playerState, {
      type: "auth-changed",
      userId
    });
    await journalContinuity.selectUser(userId);
    if (!userId) {
      setPalettes(DEFAULT_PLAYER_PROFILE);
      renderAuth();
      return;
    }
    renderAuth(true);
    try {
      const result = await client.getProfile();
      playerState = reducePlayerState(playerState, {
        type: "profile-loaded",
        profile: result.profile
      });
      if (playerState.profile) {
        setPalettes(playerState.profile);
        fillProfileForm(playerState.profile);
      } else {
        fillProfileForm(DEFAULT_PLAYER_PROFILE);
        openPlayerDialog();
      }
    } catch (error) {
      setFormStatus(errorMessage(error), "error");
    }
    renderAuth();
  }

  function openPlayerDialog() {
    fillProfileForm(playerState.profile ?? DEFAULT_PLAYER_PROFILE);
    setFormStatus("");
    if (!elements.dialog.open) {
      elements.dialog.showModal();
    }
    if (playerState.profileRequired) {
      requestAnimationFrame(() => elements.username.focus());
    }
  }

  /** @param {SubmitEvent} event */
  async function saveProfile(event) {
    event.preventDefault();
    if (!clerkBrowser.user) {
      setFormStatus(
        "Sign in before saving an Explorer profile.",
        "error"
      );
      return;
    }
    const form = new FormData(elements.form);
    const profileWasRequired = playerState.profileRequired;
    elements.save.disabled = true;
    setFormStatus("Saving…", "loading");
    try {
      const result = await client.saveProfile({
        username: String(form.get("username") ?? ""),
        explorerPalette: String(form.get("explorerPalette") ?? ""),
        playgroundPalette: String(form.get("playgroundPalette") ?? "")
      });
      if (!result.profile) {
        throw new Error("Player service returned an empty profile.");
      }
      playerState = reducePlayerState(playerState, {
        type: "profile-saved",
        profile: result.profile
      });
      setPalettes(result.profile);
      renderAuth();
      setFormStatus("Profile saved.", "success");
      elements.close.disabled = false;
      if (profileWasRequired && elements.dialog.open) {
        elements.dialog.close();
      }
    } catch (error) {
      setFormStatus(errorMessage(error), "error");
    } finally {
      elements.save.disabled = false;
    }
  }

  function previewPalettes() {
    const form = new FormData(elements.form);
    setPalettes({
      explorerPalette: String(form.get("explorerPalette")),
      playgroundPalette: String(form.get("playgroundPalette"))
    });
  }

  /** @param {{ explorerPalette?: string, playgroundPalette?: string }} nextProfile */
  function setPalettes(nextProfile) {
    applyPlayerPalettes(nextProfile);
    onPaletteChange();
  }

  /** @param {PlayerProfile} nextProfile */
  function fillProfileForm(nextProfile) {
    elements.username.value = nextProfile.username;
    for (const input of elements.form.querySelectorAll("input[type='radio']")) {
      if (input instanceof HTMLInputElement) {
        input.checked =
          input.value ===
          nextProfile[
            input.name === "explorerPalette"
              ? "explorerPalette"
              : "playgroundPalette"
          ];
      }
    }
  }

  /** @param {boolean} [loading] */
  function renderAuth(loading = false) {
    const signedIn = Boolean(clerkBrowser.user);
    const classroomLink = document.getElementById("classroom-link");
    if (classroomLink instanceof HTMLAnchorElement) {
      classroomLink.hidden = !signedIn;
    }
    elements.name.textContent = loading
      ? "Loading…"
      : playerState.profile?.username ?? (signedIn ? "New Explorer" : "Guest");
    elements.auth.hidden = signedIn;
    elements.auth.disabled = !clerkAvailable;
    elements.auth.textContent = "Sign in";
    elements.signOut.hidden = !signedIn;
    elements.form.hidden = !signedIn;
    elements.close.disabled = playerState.profileRequired;
    elements.intro.textContent = signedIn
      ? playerState.profileRequired
        ? "Choose a unique username before joining the Global Scoreboard."
        : "Your username and colors follow you on this browser."
      : "Sign in to save a username, colors, and escaped-run scores.";
  }

  /**
   * @param {string} message
   * @param {"idle" | "loading" | "success" | "error"} [state]
   */
  function setFormStatus(message, state = "idle") {
    elements.formStatus.textContent = message;
    elements.formStatus.dataset.state = state;
  }

  async function refreshLeaderboard() {
    elements.scoreboardStatus.textContent = "Loading scores…";
    try {
      const result = await client.getLeaderboard();
      elements.globalMax.textContent = String(result.globalMaxScore ?? 0);
      renderLeaderboard(result.entries ?? []);
    } catch (error) {
      elements.globalMax.textContent = "—";
      elements.scoreboardList.replaceChildren();
      elements.scoreboardStatus.textContent = errorMessage(error);
    }
  }

  /** @param {Record<string, unknown>[]} entries */
  function renderLeaderboard(entries) {
    elements.scoreboardList.replaceChildren(
      ...entries.map((entry, index) => {
        const item = document.createElement("li");
        const position = document.createElement("span");
        const identity = document.createElement("span");
        const scoreValue = document.createElement("strong");
        const details = document.createElement("small");
        position.className = "scoreboard-list__rank";
        position.textContent = `#${entry.rank ?? index + 1}`;
        identity.className = "scoreboard-list__identity";
        identity.textContent = String(entry.username ?? "Explorer");
        scoreValue.textContent = String(entry.score ?? 0);
        details.textContent =
          `Labyrinth ${entry.labyrinthNumber ?? 1} · ${entry.moves ?? 0} moves · ${formatTime(Number(entry.elapsedMs ?? 0))}`;
        item.append(position, identity, scoreValue, details);
        return item;
      })
    );
    elements.scoreboardStatus.textContent =
      entries.length === 0
        ? "No escaped runs yet. The first Gate is waiting."
        : `${entries.length} ${entries.length === 1 ? "Explorer" : "Explorers"} ranked.`;
  }
}

/** @param {unknown} error */
function errorMessage(error) {
  return error instanceof Error
    ? error.message
    : "Player services are unavailable. Guest play still works.";
}

/** @param {number} elapsedMs */
function formatTime(elapsedMs) {
  const totalSeconds = Math.floor(elapsedMs / 1000);
  return `${String(Math.floor(totalSeconds / 60)).padStart(2, "0")}:${String(totalSeconds % 60).padStart(2, "0")}`;
}

/**
 * @template {typeof HTMLElement} T
 * @param {string} id
 * @param {T} type
 * @returns {InstanceType<T>}
 */
function requiredElement(id, type) {
  const element = document.getElementById(id);
  if (!(element instanceof type)) {
    throw new Error(`Expected #${id} to be a ${type.name}.`);
  }
  return /** @type {InstanceType<T>} */ (element);
}
