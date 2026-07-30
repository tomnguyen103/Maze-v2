export class PlayerApiError extends Error {
  /** @param {string} message @param {number} status @param {Record<string, unknown>} [body] */
  constructor(message, status, body = {}) {
    super(message);
    this.name = "PlayerApiError";
    this.status = status;
    this.body = body;
  }
}

/**
 * @param {{
 *   fetchImpl?: typeof fetch,
 *   getToken?: () => Promise<string | null>,
 *   getClassroomId?: () => string | null,
 *   timeoutMs?: number
 * }} [dependencies]
 */
export function createPlayerApiClient({
  fetchImpl = fetch,
  getToken = async () => null,
  getClassroomId = () => null,
  timeoutMs = 8000
} = {}) {
  /**
   * @param {string} path
   * @param {RequestInit} [options]
   * @param {boolean} [authenticated]
   * @param {boolean} [classroomScoped]
   */
  async function request(
    path,
    options = {},
    authenticated = true,
    classroomScoped = false
  ) {
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
      const classroomId = classroomScoped ? getClassroomId() : null;
      if (classroomId) {
        headers.set("x-echo-maze-classroom-id", classroomId);
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
          response.status,
          body
        );
      }
      return body;
    }
  }

  return {
    async listClassrooms() {
      return request("/api/classrooms");
    },
    /** @param {string} name */
    async createClassroom(name) {
      return request("/api/classrooms", {
        method: "POST",
        body: JSON.stringify({ name })
      });
    },
    /** @param {string} classroomId */
    async getClassroomProgress(classroomId) {
      return request(
        `/api/classrooms/${encodeURIComponent(classroomId)}/progress`
      );
    },
    /** @param {string} classroomId */
    async getClassroomDomain(classroomId) {
      const payload = await request(
        `/api/classrooms/${encodeURIComponent(classroomId)}/domain`
      );
      return classroomDomainFrom(payload);
    },
    /** @param {string} classroomId @param {string} domain */
    async registerClassroomDomain(classroomId, domain) {
      const payload = await request(
        `/api/classrooms/${encodeURIComponent(classroomId)}/domain`,
        {
          method: "PUT",
          body: JSON.stringify({ domain })
        }
      );
      const registered = classroomDomainFrom(payload);
      if (!registered.domain) {
        throw new PlayerApiError(
          "Classroom service returned an invalid domain.",
          502
        );
      }
      return { domain: registered.domain };
    },
    /** @param {string} classroomId @param {string} email */
    async inviteClassroomStudent(classroomId, email) {
      return request(
        `/api/classrooms/${encodeURIComponent(classroomId)}/invitations`,
        {
          method: "POST",
          body: JSON.stringify({ email })
        }
      );
    },
    /** @param {string} classroomId */
    async listClassExpeditions(classroomId) {
      return request(
        `/api/classrooms/${encodeURIComponent(classroomId)}/expeditions`
      );
    },
    /**
     * @param {string} classroomId
     * @param {{
     *   atlasRegion: number,
     *   levelId: string,
     *   learningDeckId: string,
     *   learningDeckRevision: string,
     *   completionDate?: string | null
     * }} input
     */
    async createClassExpedition(classroomId, input) {
      return request(
        `/api/classrooms/${encodeURIComponent(classroomId)}/expeditions`,
        {
          method: "POST",
          body: JSON.stringify(input)
        }
      );
    },
    /**
     * @param {string} classroomId
     * @param {string} expeditionId
     * @param {{ runId: string, labyrinthNumber: number }} input
     */
    async issueClassRunGrant(classroomId, expeditionId, input) {
      return request(
        `/api/classrooms/${encodeURIComponent(
          classroomId
        )}/expeditions/${encodeURIComponent(expeditionId)}/grants`,
        {
          method: "POST",
          body: JSON.stringify(input)
        }
      );
    },
    /**
     * @param {string} classroomId
     * @param {string} expeditionId
     * @param {{
     *   runId: string,
     *   labyrinthNumber: number,
     *   outcome: "escaped" | "defeated"
     * }} input
     */
    async recordClassRunOutcome(classroomId, expeditionId, input) {
      return request(
        `/api/classrooms/${encodeURIComponent(
          classroomId
        )}/expeditions/${encodeURIComponent(expeditionId)}/grants/outcome`,
        {
          method: "POST",
          body: JSON.stringify(input)
        }
      );
    },
    /** @param {string} classroomId @param {string} expeditionId */
    async listClassExpeditionGrants(classroomId, expeditionId) {
      return request(
        `/api/classrooms/${encodeURIComponent(
          classroomId
        )}/expeditions/${encodeURIComponent(expeditionId)}/grants`
      );
    },
    /** @param {string} classroomId @param {string} expeditionId */
    async getClassExpeditionCapacity(classroomId, expeditionId) {
      return request(
        `/api/classrooms/${encodeURIComponent(
          classroomId
        )}/expeditions/${encodeURIComponent(expeditionId)}/capacity`
      );
    },
    /**
     * @param {string} classroomId
     * @param {string} expeditionId
     * @param {"base" | "extension"} kind
     */
    async purchaseClassExpeditionLicense(classroomId, expeditionId, kind) {
      return request(
        `/api/classrooms/${encodeURIComponent(
          classroomId
        )}/expeditions/${encodeURIComponent(expeditionId)}/license`,
        {
          method: "POST",
          body: JSON.stringify({ kind })
        }
      );
    },
    /**
     * @param {string} classroomId
     * @param {string} expeditionId
     * @param {"open" | "closed"} status
     */
    async setClassExpeditionStatus(classroomId, expeditionId, status) {
      return request(
        `/api/classrooms/${encodeURIComponent(
          classroomId
        )}/expeditions/${encodeURIComponent(expeditionId)}/status`,
        {
          method: "POST",
          body: JSON.stringify({ status })
        }
      );
    },
    async listAdminUsers() {
      return request("/api/admin/users");
    },
    /** @param {string} userId */
    async exportAdminUser(userId) {
      return request(`/api/admin/users/${encodeURIComponent(userId)}/export`);
    },
    /** @param {string} userId @param {string} role */
    async updateAdminRole(userId, role) {
      return request(`/api/admin/users/${encodeURIComponent(userId)}/role`, {
        method: "POST",
        body: JSON.stringify({ role })
      });
    },
    async listAdminQuestions() {
      return request("/api/admin/questions");
    },
    /** @param {string} questionId @param {unknown} draft */
    async saveAdminQuestion(questionId, draft) {
      return request(
        `/api/admin/questions/${encodeURIComponent(questionId)}`,
        { method: "PUT", body: JSON.stringify(draft) }
      );
    },
    /** @param {string} questionId @param {number} version */
    async publishAdminQuestion(questionId, version) {
      return request(
        `/api/admin/questions/${encodeURIComponent(questionId)}/publish`,
        { method: "POST", body: JSON.stringify({ version }) }
      );
    },
    /** @param {string} questionId */
    async deleteAdminQuestion(questionId) {
      return request(
        `/api/admin/questions/${encodeURIComponent(questionId)}`,
        { method: "DELETE" }
      );
    },
    /** @param {string} userId */
    async getAdminMembership(userId) {
      return request(
        `/api/admin/memberships/${encodeURIComponent(userId)}`
      );
    },
    /** @param {string} userId */
    async issueAdminRefund(userId) {
      return request(
        `/api/admin/memberships/${encodeURIComponent(userId)}/refund`,
        { method: "POST" }
      );
    },
    /** @param {number | null} [before] */
    async listAdminAudit(before = null) {
      const query = before === null ? "" : `?before=${before}`;
      return request(`/api/admin/audit${query}`);
    },
    async getAdminMetrics() {
      return request("/api/admin/metrics");
    },
    async listDeadWebhooks() {
      return request("/api/admin/webhooks/dead");
    },
    async getRunAccessConfig() {
      return request("/api/access/config", {}, false);
    },
    async getRunAccess() {
      return request("/api/access");
    },
    async getProfile() {
      return request("/api/profile");
    },
    async getAccessSettings() {
      return request("/api/me/settings");
    },
    /** @param {Record<string, unknown>} settings @param {number} expectedRevision */
    async saveAccessSettings(settings, expectedRevision) {
      return request("/api/me/settings", {
        method: "PUT",
        body: JSON.stringify({ settings, expectedRevision })
      });
    },
    async getQuestProgress() {
      return request("/api/quest-progress", {}, true, true);
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
    /**
     * @param {{ atlasRegionId: string, rulesetRevision: string }} partition
     */
    async getLeaderboard(partition) {
      const query = new URLSearchParams({
        region: partition.atlasRegionId,
        rules: partition.rulesetRevision
      });
      return request(`/api/leaderboard?${query}`);
    },
    async getVerifiedDailyLeaderboard() {
      return request("/api/daily/leaderboard", {}, false);
    },
    async getLearningJournal() {
      return request("/api/learning-journal", {}, true, true);
    },
    /** @param {unknown} journal @param {number} clearGeneration */
    async saveLearningJournal(journal, clearGeneration) {
      return request(
        "/api/learning-journal",
        {
          method: "PUT",
          body: JSON.stringify({ journal, clearGeneration })
        },
        true,
        true
      );
    },
    async clearLearningJournal() {
      return request(
        "/api/learning-journal",
        { method: "DELETE" },
        true,
        true
      );
    },
    /** @param {{ runId: string, seed: string, levelId: string, labyrinthNumber: number }} run */
    async authorizeRun(run) {
      return request("/api/access/runs", {
        method: "POST",
        body: JSON.stringify(run)
      });
    },
    /** @param {{ runId: string, seed: string, levelId: string, labyrinthNumber: number }} run */
    async authorizeGuestRun(run) {
      return request(
        "/api/access/guest-runs",
        {
          method: "POST",
          body: JSON.stringify(run)
        },
        false
      );
    },
    /** @param {Record<string, unknown>} progress @param {number} expectedRevision */
    async saveQuestProgress(progress, expectedRevision) {
      return request(
        "/api/quest-progress",
        {
          method: "PUT",
          body: JSON.stringify({ progress, expectedRevision })
        },
        true,
        true
      );
    },
    async createLifetimeCheckout() {
      return request("/api/lifetime-checkout", {
        method: "POST"
      });
    },
    /** @param {string} sessionId */
    async confirmLifetimeCheckout(sessionId) {
      return request("/api/lifetime-confirm", {
        method: "POST",
        body: JSON.stringify({ sessionId })
      });
    },
    /** @param {Record<string, unknown>} run */
    async submitScore(run) {
      return request(
        "/api/scores",
        {
          method: "POST",
          body: JSON.stringify(run)
        },
        true,
        true
      );
    },
    /** @param {Record<string, unknown>} submission */
    async submitVerifiedDaily(submission) {
      return request("/api/daily/scores", {
        method: "POST",
        body: JSON.stringify(submission)
      });
    }
  };
}

/** @param {unknown} payload */
function classroomDomainFrom(payload) {
  const body = payload && typeof payload === "object"
    ? /** @type {Record<string, unknown>} */ (payload)
    : {};
  const verifiedDomain =
    body.verifiedDomain && typeof body.verifiedDomain === "object"
      ? /** @type {Record<string, unknown>} */ (body.verifiedDomain)
      : {};
  return {
    domain:
      typeof verifiedDomain.domain === "string"
        ? verifiedDomain.domain
        : null
  };
}

/**
 * @param {{
 *   seed: string,
 *   moves: number,
 *   elapsedMs: number,
 *   score: number,
 *   atlasRegionId?: string,
 *   rulesetRevision?: string
 * }} run
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
    run.score,
    ...(run.atlasRegionId && run.rulesetRevision
      ? [run.atlasRegionId, run.rulesetRevision]
      : [])
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
