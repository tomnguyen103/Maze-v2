import { DEFAULT_ROLE, isRole } from "../shared/permissions.js";
import { QuestionBankInputError } from "./question-bank-store.js";
import { RoleWriteError } from "./rbac.js";
import { safeErrorName } from "./safe-error-log.js";
import { URL } from "node:url";
import { setRetryAfter } from "./http-retry.js";

const MAX_BODY_BYTES = 4 * 1024;
const ROLE_PATH = /^\/api\/admin\/users\/([A-Za-z0-9_-]{1,255})\/role$/;
const EXPORT_PATH = /^\/api\/admin\/users\/([A-Za-z0-9_-]{1,255})\/export$/;
const USERNAME_PATH =
  /^\/api\/admin\/users\/([A-Za-z0-9_-]{1,255})\/username$/;
const USERS_PATH = /^\/api\/admin\/users$/;
const QUESTIONS_PATH = /^\/api\/admin\/questions$/;
const QUESTION_PATH =
  /^\/api\/admin\/questions\/([A-Za-z0-9_-]{1,255})$/;
const QUESTION_PUBLISH_PATH =
  /^\/api\/admin\/questions\/([A-Za-z0-9_-]{1,255})\/publish$/;
const MEMBERSHIP_PATH =
  /^\/api\/admin\/memberships\/([A-Za-z0-9_-]{1,255})$/;
const REFUND_PATH =
  /^\/api\/admin\/memberships\/([A-Za-z0-9_-]{1,255})\/refund$/;
const AUDIT_PATH = /^\/api\/admin\/audit$/;
const METRICS_PATH = /^\/api\/admin\/metrics$/;
const DEAD_WEBHOOKS_PATH = /^\/api\/admin\/webhooks\/dead$/;

/** @typedef {{ userId: string, role: import("../shared/permissions.js").Role }} AdminDecision */

/** @param {string} pathname */
export function isAdminPath(pathname) {
  return pathname.startsWith("/api/admin/");
}

/**
 * Admin API. Every route is permission-checked and every route that changes
 * something, or discloses an Explorer's own data, is audited; there is no
 * unguarded path in this file.
 *
 * @param {{
 *   store: {
 *     setRole: (change: { userId: string, role: string, grantedBy: string }) => Promise<{
 *       previousRole: import("../shared/permissions.js").Role,
 *       role: string
 *     }>
 *     listUsers?: () => Promise<{
 *       users: Record<string, unknown>[],
 *       hasMore: boolean
 *     }>,
 *     membershipFor?: (userId: string) => Promise<Record<string, unknown> | null>,
 *     listAuditEvents?: (options: {
 *       beforeId: number | null,
 *       limit: number
 *     }) => Promise<Record<string, unknown>[]>,
 *     dashboardMetrics?: () => Promise<Record<string, number>>
 *   },
 *   questionStore?: {
 *     listQuestions: () => Promise<Record<string, unknown>[]>,
 *     saveDraft: (input: {
 *       id: string,
 *       levelId: string,
 *       difficultyBand: string,
 *       questionOrdinal: number,
 *       content: unknown
 *     }, editedBy: string) => Promise<unknown>,
 *     publishVersion: (id: string, version: number) => Promise<unknown>,
 *     deleteQuestion: (id: string) => Promise<unknown>
 *   },
 *   requirePermission: (permission: string) => (
 *     request: import("node:http").IncomingMessage
 *   ) => Promise<
 *     { allowed: true, userId: string, role: import("../shared/permissions.js").Role } |
 *     { allowed: false, status: 401 | 403, error: string }
 *   >,
 *   exportUser?: (userId: string) => Promise<unknown>,
 *   listDeadWebhooks?: () => Promise<Record<string, unknown>[]>,
 *   refundPayment?: (payment: {
 *     paymentIntentId: string,
 *     purchaseId: string
 *   }) => Promise<{ refundId: string, status: string }>,
 *   recordAudit?: import("./audit.js").RecordAudit,
 *   mirrorRole?: (userId: string, role: string) => Promise<void>
 *   clearUsername?: ((userId: string) => Promise<{
 *     cleared: boolean,
 *     previousUsername: string | null
 *   }>) | null
 * }} dependencies
 */
export function createAdminHandler({
  store,
  questionStore = unavailableQuestionStore(),
  requirePermission,
  exportUser = async () => {
    throw new Error("Admin export is not configured.");
  },
  listDeadWebhooks = async () => {
    throw new Error("The webhook inbox is not configured.");
  },
  refundPayment = async () => {
    throw new Error("Refunds are not configured.");
  },
  recordAudit = async () => {},
  mirrorRole = async () => {},
  clearUsername = null
}) {
  // Each sub-path carries its own permission — they are separate grants — but
  // the check still runs before any shape check, so an unauthorized caller
  // cannot map the admin surface by reading 404s and 405s. An unmatched path is
  // checked against the fallback permission below, so it answers exactly as a
  // real route would.
  const routes = [
    {
      pattern: ROLE_PATH,
      permissions: { POST: "users:roles:write" },
      handle: handleRole
    },
    {
      pattern: EXPORT_PATH,
      permissions: { GET: "export:any" },
      handle: handleExport
    },
    {
      pattern: USERNAME_PATH,
      permissions: { POST: "users:names:write" },
      handle: handleUsername
    },
    {
      pattern: USERS_PATH,
      permissions: { GET: "users:read" },
      handle: handleUsers
    },
    {
      pattern: QUESTIONS_PATH,
      permissions: { GET: "questions:read" },
      handle: handleQuestions
    },
    {
      pattern: QUESTION_PUBLISH_PATH,
      permissions: { POST: "questions:publish" },
      handle: handleQuestionPublish
    },
    {
      pattern: QUESTION_PATH,
      permissions: {
        PUT: "questions:write",
        DELETE: "questions:publish"
      },
      handle: handleQuestion
    },
    {
      pattern: REFUND_PATH,
      permissions: { POST: "refunds:issue" },
      handle: handleRefund
    },
    {
      pattern: MEMBERSHIP_PATH,
      permissions: { GET: "refunds:issue" },
      handle: handleMembership
    },
    {
      pattern: AUDIT_PATH,
      permissions: { GET: "audit:read" },
      handle: handleAudit
    },
    {
      pattern: METRICS_PATH,
      permissions: { GET: "refunds:issue" },
      handle: handleMetrics
    },
    {
      pattern: DEAD_WEBHOOKS_PATH,
      permissions: { GET: "webhooks:read" },
      handle: handleDeadWebhooks
    }
  ].map((route) => ({
    ...route,
    checks: new Map(
      Object.entries(route.permissions).map(([method, permission]) => [
        method,
        requirePermission(permission)
      ])
    )
  }));
  const checkUnknownRoute = requirePermission("users:roles:write");

  /**
   * @param {import("node:http").IncomingMessage} request
   * @param {import("node:http").ServerResponse} response
   * @param {(() => void) | undefined} [next]
   */
  return async function adminHandler(request, response, next) {
    const url = new URL(request.url ?? "", "http://local");
    if (!isAdminPath(url.pathname)) {
      next?.();
      return;
    }
    /** @type {(typeof routes)[number] | undefined} */
    let route;
    /** @type {RegExpExecArray | null} */
    let match = null;
    for (const candidate of routes) {
      match = candidate.pattern.exec(url.pathname);
      if (match) {
        route = candidate;
        break;
      }
    }
    const decision = await (
      route?.checks.get(request.method ?? "") ?? checkUnknownRoute
    )(request);
    if (!decision.allowed) {
      sendJson(response, decision.status, { error: decision.error });
      return;
    }
    if (!route || !match) {
      sendJson(response, 404, { error: "Unknown admin route." });
      return;
    }
    await route.handle(request, response, decision, match[1]);
  };

  /**
   * @param {import("node:http").IncomingMessage} request
   * @param {import("node:http").ServerResponse} response
   * @param {{ userId: string, role: import("../shared/permissions.js").Role }} decision
   * @param {string} targetUserId
   */
  async function handleRole(request, response, decision, targetUserId) {
    if (request.method !== "POST") {
      response.setHeader("allow", "POST");
      sendJson(response, 405, { error: "Use POST to change a role." });
      return;
    }

    if (targetUserId === decision.userId) {
      // Belt and braces with the migration's CHECK. An admin editing their own
      // role is either a mistake or an escalation attempt; neither is served.
      sendJson(response, 403, { error: "You cannot change your own role." });
      return;
    }

    try {
      const body = await readJsonBody(request);
      const role = body.role;
      if (!isRole(role)) {
        sendJson(response, 400, { error: "Role is not supported." });
        return;
      }
      const result = await store.setRole({
        userId: targetUserId,
        role,
        grantedBy: decision.userId
      });
      const changed = result.previousRole !== role;
      // The mirror is for client-side UI gating only, so a failure to write it
      // must not fail the request or leave the database unchanged.
      try {
        await mirrorRole(targetUserId, role);
      } catch (error) {
        console.error("[admin] role mirror failed", {
          name: safeErrorName(error)
        });
      }
      // No row for a no-op. Re-granting a role someone already holds changes
      // nothing, and an audit log padded with non-events is harder to read.
      if (changed) {
        // Best-effort, like the mirror: the role write has already committed, so
        // a failure here must not report 503 for a change that succeeded. A
        // retry would be a no-op and would write no row at all.
        try {
          await recordAudit(request, {
            actorId: decision.userId,
            actorRole: decision.role,
            action: role === DEFAULT_ROLE ? "role.revoke" : "role.grant",
            resource: { type: "user_role", id: targetUserId },
            before: { role: result.previousRole },
            after: { role }
          });
        } catch (error) {
          console.error("[admin] role audit failed", {
            name: safeErrorName(error)
          });
        }
      }
      sendJson(response, 200, { userId: targetUserId, role, changed });
    } catch (error) {
      if (error instanceof RoleWriteError || error instanceof AdminInputError) {
        sendJson(response, 400, { error: error.message });
        return;
      }
      console.error("[admin] role change failed", {
        name: safeErrorName(error)
      });
      sendJson(response, 503, { error: "Role changes are unavailable." });
    }
  }

  /**
   * GDPR/support export of any Explorer's data. Reuses the self-export builder
   * unchanged, so the payload an admin sees is byte-identical to the one the
   * Explorer can download themselves — one schema, one code path.
   *
   * @param {import("node:http").IncomingMessage} request
   * @param {import("node:http").ServerResponse} response
   * @param {{ userId: string, role: import("../shared/permissions.js").Role }} decision
   * @param {string} targetUserId
   */
  /**
   * `POST /api/admin/users/:id/username` — retire one public name.
   *
   * A username is shown to anonymous readers on the Global Scoreboard and the
   * Explorers choosing them are children. Screening at write time stops the
   * obvious cases; what gets past it needed a remedy, and until now the only
   * one staff had was deleting the child's account. This blanks the name and
   * nothing else: Quest Progress, Run Records and Journal are untouched, and
   * the Explorer picks a new one on their next visit.
   *
   * @param {import("node:http").IncomingMessage} request
   * @param {import("node:http").ServerResponse} response
   * @param {{ userId: string, role: import("../shared/permissions.js").Role }} decision
   * @param {string} targetUserId
   */
  async function handleUsername(request, response, decision, targetUserId) {
    if (request.method !== "POST") {
      response.setHeader("allow", "POST");
      sendJson(response, 405, { error: "Use POST to retire a username." });
      return;
    }
    if (!clearUsername) {
      sendJson(response, 503, { error: "Username changes are unavailable." });
      return;
    }
    try {
      const { cleared, previousUsername } = await clearUsername(targetUserId);
      // Recorded whether or not a name was there to clear: the attempt is
      // what an operator needs to see, and an absent one is not an error.
      // The retired name is recorded too, because an action taken against a
      // child's account has to be appealable.
      await recordAudit(request, {
        actorId: decision.userId,
        actorRole: decision.role,
        action: "user.username.clear",
        resource: { type: "player_account", id: targetUserId },
        before: { username: previousUsername },
        after: { cleared }
      });
      sendJson(response, 200, { cleared });
    } catch (error) {
      console.error("[admin] username clear failed", {
        name: safeErrorName(error)
      });
      sendJson(response, 503, { error: "Username changes are unavailable." });
    }
  }

  /**
   * @param {import("node:http").IncomingMessage} request
   * @param {import("node:http").ServerResponse} response
   * @param {{ userId: string, role: import("../shared/permissions.js").Role }} decision
   * @param {string} targetUserId
   */
  async function handleExport(request, response, decision, targetUserId) {
    if (request.method !== "GET") {
      response.setHeader("allow", "GET");
      sendJson(response, 405, { error: "Use GET for an Explorer's export." });
      return;
    }
    try {
      const exported = await exportUser(targetUserId);
      // Sequenced before the body, like the self-export: reading another
      // Explorer's data always has its audit attempt behind it.
      await recordAudit(request, {
        actorId: decision.userId,
        actorRole: decision.role,
        action: "export.admin",
        resource: { type: "player_account", id: targetUserId }
      });
      response.statusCode = 200;
      response.setHeader("content-type", "application/json; charset=utf-8");
      response.setHeader("cache-control", "no-store");
      response.setHeader(
        "content-disposition",
        `attachment; filename="echo-maze-export-${targetUserId}.json"`
      );
      response.end(JSON.stringify(exported));
    } catch (error) {
      console.error("[admin] export failed", { name: safeErrorName(error) });
      sendJson(response, 503, { error: "Exports are unavailable." });
    }
  }

  /**
   * @param {import("node:http").IncomingMessage} request
   * @param {import("node:http").ServerResponse} response
   * @param {AdminDecision} decision
   */
  async function handleUsers(request, response, decision) {
    if (request.method !== "GET") {
      methodNotAllowed(response, "GET", "Use GET to list Explorers.");
      return;
    }
    try {
      const directory = await configured(store.listUsers, "Explorer listing")();
      await auditRead(request, decision, "users.read", "player_accounts");
      sendJson(response, 200, directory);
    } catch (error) {
      unavailable(response, "Explorer listing", error);
    }
  }

  /**
   * @param {import("node:http").IncomingMessage} request
   * @param {import("node:http").ServerResponse} response
   * @param {AdminDecision} decision
   */
  async function handleQuestions(request, response, decision) {
    if (request.method !== "GET") {
      methodNotAllowed(response, "GET", "Use GET to list Warden Questions.");
      return;
    }
    try {
      const questions = await questionStore.listQuestions();
      await auditRead(request, decision, "questions.read", "questions");
      sendJson(response, 200, { questions });
    } catch (error) {
      unavailable(response, "Warden Question listing", error);
    }
  }

  /**
   * @param {import("node:http").IncomingMessage} request
   * @param {import("node:http").ServerResponse} response
   * @param {AdminDecision} decision
   * @param {string} questionId
   */
  async function handleQuestion(request, response, decision, questionId) {
    if (request.method === "PUT") {
      try {
        const body = await readJsonBody(request);
        const draft = questionDraft(body, questionId);
        const result = await questionStore.saveDraft(draft, decision.userId);
        await auditMutation(request, decision, "question.draft.write", {
          type: "question",
          id: questionId
        });
        sendJson(response, 200, result);
      } catch (error) {
        adminFailure(response, "Warden Question draft", error);
      }
      return;
    }
    if (request.method === "DELETE") {
      try {
        const result = await questionStore.deleteQuestion(questionId);
        await auditMutation(request, decision, "question.delete", {
          type: "question",
          id: questionId
        });
        sendJson(response, 200, result);
      } catch (error) {
        adminFailure(response, "Warden Question deletion", error);
      }
      return;
    }
    methodNotAllowed(
      response,
      "PUT, DELETE",
      "Use PUT to save a draft or DELETE to remove a Warden Question."
    );
  }

  /**
   * @param {import("node:http").IncomingMessage} request
   * @param {import("node:http").ServerResponse} response
   * @param {AdminDecision} decision
   * @param {string} questionId
   */
  async function handleQuestionPublish(
    request,
    response,
    decision,
    questionId
  ) {
    if (request.method !== "POST") {
      methodNotAllowed(
        response,
        "POST",
        "Use POST to publish a Warden Question."
      );
      return;
    }
    try {
      const body = await readJsonBody(request);
      const version = positiveInteger(body.version, "Version");
      const result = await questionStore.publishVersion(questionId, version);
      await auditMutation(request, decision, "question.publish", {
        type: "question",
        id: questionId
      });
      sendJson(response, 200, result);
    } catch (error) {
      adminFailure(response, "Warden Question publishing", error);
    }
  }

  /**
   * @param {import("node:http").IncomingMessage} request
   * @param {import("node:http").ServerResponse} response
   * @param {AdminDecision} decision
   * @param {string} userId
   */
  async function handleMembership(request, response, decision, userId) {
    if (request.method !== "GET") {
      methodNotAllowed(response, "GET", "Use GET to look up a membership.");
      return;
    }
    try {
      const membership = await configured(
        store.membershipFor,
        "Membership lookup"
      )(userId);
      await auditRead(
        request,
        decision,
        "membership.read",
        "player_access",
        userId
      );
      sendJson(response, 200, { membership });
    } catch (error) {
      unavailable(response, "Membership lookup", error);
    }
  }

  /**
   * @param {import("node:http").IncomingMessage} request
   * @param {import("node:http").ServerResponse} response
   * @param {AdminDecision} decision
   * @param {string} userId
   */
  async function handleRefund(request, response, decision, userId) {
    if (request.method !== "POST") {
      methodNotAllowed(response, "POST", "Use POST to issue a refund.");
      return;
    }
    try {
      const membership = await configured(
        store.membershipFor,
        "Membership lookup"
      )(userId);
      const record = /** @type {Record<string, unknown>} */ (membership ?? {});
      const paymentIntentId = String(record.paymentIntentId ?? "");
      const purchaseId = String(record.purchaseId ?? "");
      if (
        record.membershipState !== "active" ||
        record.purchaseStatus !== "paid" ||
        !paymentIntentId ||
        !purchaseId
      ) {
        throw new AdminInputError(
          "This Explorer does not have a refundable Lifetime Membership."
        );
      }
      const refund = await refundPayment({ paymentIntentId, purchaseId });
      await auditMutation(request, decision, "refund.issue", {
        type: "lifetime_purchase",
        id: purchaseId
      });
      sendJson(response, 202, { userId, ...refund });
    } catch (error) {
      adminFailure(response, "Refund", error);
    }
  }

  /**
   * @param {import("node:http").IncomingMessage} request
   * @param {import("node:http").ServerResponse} response
   * @param {AdminDecision} decision
   */
  async function handleAudit(request, response, decision) {
    if (request.method !== "GET") {
      methodNotAllowed(response, "GET", "Use GET to read the audit trail.");
      return;
    }
    try {
      const url = new URL(request.url ?? "", "http://local");
      const beforeId = optionalPositiveInteger(
        url.searchParams.get("before"),
        "Before"
      );
      const limit = optionalPositiveInteger(
        url.searchParams.get("limit"),
        "Limit"
      );
      const pageSize = Math.min(limit ?? 50, 100);
      const events = await configured(
        store.listAuditEvents,
        "Audit trail"
      )({ beforeId, limit: pageSize });
      await auditRead(request, decision, "audit.read", "audit_events");
      sendJson(response, 200, {
        events,
        nextBefore:
          events.length === pageSize
            ? Number(events[events.length - 1]?.id) || null
            : null
      });
    } catch (error) {
      adminFailure(response, "Audit trail", error);
    }
  }

  /**
   * @param {import("node:http").IncomingMessage} request
   * @param {import("node:http").ServerResponse} response
   * @param {AdminDecision} decision
   */
  async function handleMetrics(request, response, decision) {
    if (request.method !== "GET") {
      methodNotAllowed(response, "GET", "Use GET to read admin metrics.");
      return;
    }
    try {
      const metrics = await configured(
        store.dashboardMetrics,
        "Admin metrics"
      )();
      await auditRead(request, decision, "metrics.read", "admin_metrics");
      sendJson(response, 200, { metrics });
    } catch (error) {
      unavailable(response, "Admin metrics", error);
    }
  }

  /**
   * Dead deliveries the retry loop gave up on: each one is a provider state
   * change that was never applied, and until now `npm run webhooks:dead` was
   * the only way to see one. Read-only, so there is nothing to audit beyond the
   * request log.
   *
   * @param {import("node:http").IncomingMessage} request
   * @param {import("node:http").ServerResponse} response
   * @param {{ userId: string, role: import("../shared/permissions.js").Role }} decision
   */
  async function handleDeadWebhooks(request, response, decision) {
    if (request.method !== "GET") {
      response.setHeader("allow", "GET");
      sendJson(response, 405, { error: "Use GET to list dead deliveries." });
      return;
    }
    try {
      const rows = await listDeadWebhooks();
      await auditRead(
        request,
        decision,
        "webhooks.dead.read",
        "webhook_inbox"
      );
      sendJson(response, 200, {
        deliveries: rows.map((row) => ({
          provider: String(row.provider),
          eventId: String(row.event_id),
          eventType: String(row.event_type),
          attempts: Number(row.attempts ?? 0),
          // The payload never leaves the database, so `last_error` is the only
          // diagnostic here; it is already a bare error name.
          lastError: row.last_error === null ? null : String(row.last_error),
          receivedAt:
            row.received_at instanceof Date
              ? row.received_at.toISOString()
              : String(row.received_at)
        }))
      });
    } catch (error) {
      console.error("[admin] dead webhook listing failed", {
        name: safeErrorName(error)
      });
      sendJson(response, 503, {
        error: "Dead webhook deliveries are unavailable."
      });
    }
  }

  /**
   * @param {import("node:http").IncomingMessage} request
   * @param {AdminDecision} decision
   * @param {string} action
   * @param {string} resourceType
   * @param {string | null} [resourceId]
   */
  async function auditRead(
    request,
    decision,
    action,
    resourceType,
    resourceId = null
  ) {
    await recordAudit(request, {
      actorId: decision.userId,
      actorRole: decision.role,
      action,
      resource: { type: resourceType, id: resourceId }
    });
  }

  /**
   * @param {import("node:http").IncomingMessage} request
   * @param {AdminDecision} decision
   * @param {string} action
   * @param {{ type: string, id: string | null }} resource
   */
  async function auditMutation(request, decision, action, resource) {
    try {
      await recordAudit(request, {
        actorId: decision.userId,
        actorRole: decision.role,
        action,
        resource
      });
    } catch (error) {
      console.error("[admin] mutation audit failed", {
        name: safeErrorName(error)
      });
    }
  }
}

class AdminInputError extends Error {}

function unavailableQuestionStore() {
  const fail = async () => {
    throw new Error("The Warden Question editor is not configured.");
  };
  return {
    listQuestions: fail,
    saveDraft: fail,
    publishVersion: fail,
    deleteQuestion: fail
  };
}

/**
 * @template {(...args: any[]) => any} T
 * @param {T | undefined} value
 * @param {string} name
 * @returns {T}
 */
function configured(value, name) {
  if (typeof value !== "function") {
    throw new Error(`${name} is not configured.`);
  }
  return value;
}

/** @param {unknown} value @param {string} label */
function positiveInteger(value, label) {
  if (!Number.isSafeInteger(value) || Number(value) < 1) {
    throw new AdminInputError(`${label} must be a positive integer.`);
  }
  return Number(value);
}

/** @param {string | null} value @param {string} label */
function optionalPositiveInteger(value, label) {
  if (value === null || value === "") {
    return null;
  }
  return positiveInteger(Number(value), label);
}

/**
 * @param {Record<string, unknown>} body
 * @param {string} id
 */
function questionDraft(body, id) {
  if (
    typeof body.levelId !== "string" ||
    typeof body.difficultyBand !== "string" ||
    !Number.isSafeInteger(body.questionOrdinal) ||
    Number(body.questionOrdinal) < 0 ||
    Number(body.questionOrdinal) > 32_767 ||
    !body.content ||
    typeof body.content !== "object" ||
    Array.isArray(body.content)
  ) {
    throw new AdminInputError(
      "Warden Question metadata and content are required."
    );
  }
  return {
    id,
    levelId: body.levelId,
    difficultyBand: body.difficultyBand,
    questionOrdinal: Number(body.questionOrdinal),
    content: body.content
  };
}

/**
 * @param {import("node:http").ServerResponse} response
 * @param {string} allow
 * @param {string} error
 */
function methodNotAllowed(response, allow, error) {
  response.setHeader("allow", allow);
  sendJson(response, 405, { error });
}

/**
 * @param {import("node:http").ServerResponse} response
 * @param {string} operation
 * @param {unknown} error
 */
function adminFailure(response, operation, error) {
  if (
    error instanceof AdminInputError ||
    error instanceof QuestionBankInputError
  ) {
    sendJson(response, 400, { error: error.message });
    return;
  }
  unavailable(response, operation, error);
}

/**
 * @param {import("node:http").ServerResponse} response
 * @param {string} operation
 * @param {unknown} error
 */
function unavailable(response, operation, error) {
  console.error(`[admin] ${operation.toLowerCase()} failed`, {
    name: safeErrorName(error)
  });
  sendJson(response, 503, { error: `${operation} is unavailable.` });
}

/** @param {import("node:http").IncomingMessage} request */
async function readJsonBody(request) {
  let body = "";
  for await (const chunk of request) {
    body += chunk;
    if (Buffer.byteLength(body) > MAX_BODY_BYTES) {
      throw new AdminInputError("Request body is too large.");
    }
  }
  try {
    const parsed = JSON.parse(body);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new AdminInputError("Request body must be an object.");
    }
    return /** @type {Record<string, unknown>} */ (parsed);
  } catch (error) {
    if (error instanceof AdminInputError) {
      throw error;
    }
    throw new AdminInputError("Request body must be valid JSON.");
  }
}

/**
 * @param {import("node:http").ServerResponse} response
 * @param {number} status
 * @param {unknown} body
 */
function sendJson(response, status, body) {
  response.statusCode = status;
  setRetryAfter(response, status);
  response.setHeader("content-type", "application/json; charset=utf-8");
  response.setHeader("cache-control", "no-store");
  response.end(JSON.stringify(body));
}
