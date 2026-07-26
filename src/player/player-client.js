export class PlayerApiError extends Error {
  /** @param {string} message @param {number} status */
  constructor(message, status) {
    super(message);
    this.name = "PlayerApiError";
    this.status = status;
  }
}

/**
 * @param {{
 *   fetchImpl?: typeof fetch,
 *   getToken?: () => Promise<string | null>,
 *   timeoutMs?: number
 * }} [dependencies]
 */
export function createPlayerApiClient({
  fetchImpl = fetch,
  getToken = async () => null,
  timeoutMs = 8000
} = {}) {
  /**
   * @param {string} path
   * @param {RequestInit} [options]
   * @param {boolean} [authenticated]
   */
  async function request(path, options = {}, authenticated = true) {
    const controller = new AbortController();
    /** @type {(reason?: unknown) => void} */
    let rejectTimeout = () => {};
    const timeoutPromise = new Promise((_, reject) => {
      rejectTimeout = reject;
    });
    const timeout = setTimeout(() => {
      controller.abort();
      rejectTimeout(new DOMException("Player request timed out.", "AbortError"));
    }, timeoutMs);
    try {
      return await Promise.race([performRequest(), timeoutPromise]);
    } finally {
      clearTimeout(timeout);
    }

    async function performRequest() {
      const token = authenticated ? await getToken() : null;
      const headers = new Headers(options.headers);
      headers.set("accept", "application/json");
      if (options.body) {
        headers.set("content-type", "application/json");
      }
      if (token) {
        headers.set("authorization", `Bearer ${token}`);
      }
      const response = await fetchImpl(path, {
        ...options,
        credentials: "same-origin",
        headers,
        signal: controller.signal
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new PlayerApiError(
          typeof body.error === "string"
            ? body.error
            : "Player services are unavailable. Guest play still works.",
          response.status
        );
      }
      return body;
    }
  }

  return {
    async getRunAccessConfig() {
      return request("/api/access/config", {}, false);
    },
    async getRunAccess() {
      return request("/api/access");
    },
    async getProfile() {
      return request("/api/profile");
    },
    /**
     * @param {{ username: FormDataEntryValue | string, explorerPalette: FormDataEntryValue | string, playgroundPalette: FormDataEntryValue | string }} profile
     */
    async saveProfile(profile) {
      return request("/api/profile", {
        method: "PUT",
        body: JSON.stringify(profile)
      });
    },
    async getLeaderboard() {
      return request("/api/leaderboard");
    },
    /** @param {{ runId: string, seed: string, levelId: string, labyrinthNumber: number }} run */
    async authorizeRun(run) {
      return request("/api/access/runs", {
        method: "POST",
        body: JSON.stringify(run)
      });
    },
    /** @param {Record<string, unknown>} run */
    async submitScore(run) {
      return request("/api/scores", {
        method: "POST",
        body: JSON.stringify(run)
      });
    }
  };
}

/**
 * @param {{ seed: string, moves: number, elapsedMs: number, score: number }} run
 * @param {string} levelId
 * @param {number} labyrinthNumber
 */
export function createRunIdempotencyKey(run, levelId, labyrinthNumber) {
  const source = [
    run.seed,
    levelId,
    labyrinthNumber,
    run.moves,
    run.elapsedMs,
    run.score
  ].join("|");
  let hash = 2166136261;
  for (const character of source) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return `run_${Math.abs(hash).toString(36).padStart(8, "0")}_${run.moves}_${run.elapsedMs}`
    .toLowerCase()
    .slice(0, 128);
}
