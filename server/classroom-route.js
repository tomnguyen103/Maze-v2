import {
  ClassroomAccessDeniedError,
  ClassroomContextError
} from "./classroom-context.js";
import {
  ClassroomDomainConflictError,
  ClassroomDomainInputError,
  normalizeClassroomDomain,
  verifiedEmailDomain
} from "./classroom-domain.js";
import { InputError } from "./player-validation.js";
import { UNMETERED } from "./rate-limit-config.js";
import { sendRateLimited } from "./rate-limit-request.js";
import { safeErrorName } from "./safe-error-log.js";
import { URL } from "node:url";

const MAX_BODY_BYTES = 8 * 1024;
const CLASSROOM_ID_PATTERN = /^org_[A-Za-z0-9_-]{3,120}$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** @param {string} pathname */
export function isClassroomPath(pathname) {
  return (
    pathname === "/api/classrooms" ||
    /^\/api\/classrooms\/org_[A-Za-z0-9_-]{3,120}\/(?:domain|invitations|progress)$/.test(
      pathname
    )
  );
}

/** @param {import("node:http").ServerResponse} response */
function noStore(response) {
  response.setHeader("cache-control", "no-store");
}

/**
 * @param {import("node:http").ServerResponse} response
 * @param {number} status
 * @param {unknown} body
 */
function sendJson(response, status, body) {
  response.statusCode = status;
  response.setHeader("content-type", "application/json; charset=utf-8");
  noStore(response);
  response.end(JSON.stringify(body));
}

/** @param {import("node:http").IncomingMessage} request */
async function readJsonBody(request) {
  let body = "";
  for await (const chunk of request) {
    body += chunk;
    if (Buffer.byteLength(body) > MAX_BODY_BYTES) {
      throw new InputError("Request body is too large.");
    }
  }
  let value;
  try {
    value = JSON.parse(body);
  } catch {
    throw new InputError("Request body must be valid JSON.");
  }
  if (
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value)
  ) {
    throw new InputError("Request body must be a JSON object.");
  }
  return value;
}

/** @param {unknown} value */
function classroomName(value) {
  const name = typeof value === "string" ? value.trim() : "";
  if (name.length < 1 || name.length > 120) {
    throw new InputError("Classroom name must be 1 to 120 characters.");
  }
  return name;
}

/** @param {unknown} value */
function invitationEmail(value) {
  const emailAddress =
    typeof value === "string" ? value.trim().toLowerCase() : "";
  if (emailAddress.length > 254 || !EMAIL_PATTERN.test(emailAddress)) {
    throw new InputError("Enter a valid Student email address.");
  }
  return emailAddress;
}

/** @param {string} pathname */
function classroomId(pathname) {
  const id = pathname.split("/")[3] ?? "";
  if (!CLASSROOM_ID_PATTERN.test(id)) {
    throw new ClassroomContextError();
  }
  return id;
}

/**
 * @param {{
 *   store: {
 *     listForUser: (userId: string) => Promise<Record<string, unknown>[]>,
 *     requireTeacher: (
 *       userId: string,
 *       classroomId: string
 *     ) => Promise<string>,
 *     domainForTeacher: (
 *       userId: string,
 *       classroomId: string
 *     ) => Promise<{
 *       domain: string,
 *       autoJoinEnabled: boolean
 *     } | null>,
 *     registerDomain: (
 *       userId: string,
 *       classroomId: string,
 *       domain: string
 *     ) => Promise<{
 *       domain: string,
 *       autoJoinEnabled: boolean
 *     }>,
     *     progressForTeacher: (
     *       userId: string,
     *       classroomId: string
     *     ) => Promise<{
     *       progress: Record<string, unknown>[],
     *       truncated: boolean
     *     }>
 *   },
 *   provider: {
 *     createClassroom: (
 *       input: { name: string, creatorUserId: string }
 *     ) => Promise<{ id: string, name: string }>,
 *     inviteStudent: (
 *       input: {
 *         classroomId: string,
 *         emailAddress: string,
 *         inviterUserId: string,
 *         redirectUrl: string
 *       }
 *     ) => Promise<{
 *       id: string,
 *       emailAddress: string,
 *       status: string,
 *       url: string | null
 *     }>
 *     verifiedPrimaryEmail: (userId: string) => Promise<string | null>
 *   } | null,
 *   getUserId: (
 *     request: import("node:http").IncomingMessage
 *   ) => string | null | Promise<string | null>,
 *   recordAudit?: import("./audit.js").RecordAudit,
 *   rateLimit?: import("./rate-limit-request.js").RateLimit
 * }} dependencies
 */
export function createClassroomHandler({
  store,
  provider,
  getUserId,
  recordAudit = async () => {},
  rateLimit = async () => UNMETERED
}) {
  /**
   * @param {import("node:http").IncomingMessage} request
   * @param {import("node:http").ServerResponse} response
   * @param {(() => void) | undefined} next
   */
  return async function classroomHandler(
    request,
    response,
    next = undefined
  ) {
    const pathname = new URL(request.url ?? "", "http://local").pathname;
    if (!isClassroomPath(pathname)) {
      next?.();
      return;
    }

    try {
      const userId = await getUserId(request);
      if (!userId) {
        sendJson(response, 401, { error: "Sign in to continue." });
        return;
      }

      if (pathname === "/api/classrooms") {
        if (request.method === "GET") {
          sendJson(response, 200, {
            classrooms: await store.listForUser(userId)
          });
          return;
        }
        if (request.method !== "POST") {
          response.setHeader("allow", "GET, POST");
          sendJson(response, 405, {
            error: "Use GET or POST for Classrooms."
          });
          return;
        }
        if (!provider) {
          sendJson(response, 503, {
            error: "Classroom creation is not configured."
          });
          return;
        }
        const decision = await rateLimit("classroom.create", request, userId);
        if (!decision.allowed) {
          sendRateLimited(
            response,
            decision,
            "Too many Classroom changes. Try again shortly."
          );
          return;
        }
        const body = /** @type {Record<string, unknown>} */ (
          await readJsonBody(request)
        );
        const created = await provider.createClassroom({
          name: classroomName(body.name),
          creatorUserId: userId
        });
        await recordAudit(request, {
          actorId: userId,
          action: "classroom.create",
          resource: { type: "classroom", id: created.id },
          after: { name: created.name, syncState: "awaiting-webhook" }
        });
        sendJson(response, 201, {
          classroom: created,
          syncState: "awaiting-webhook"
        });
        return;
      }

      const selectedClassroomId = classroomId(pathname);
      if (pathname.endsWith("/domain")) {
        await store.requireTeacher(userId, selectedClassroomId);
        if (request.method === "GET") {
          sendJson(response, 200, {
            verifiedDomain: await store.domainForTeacher(
              userId,
              selectedClassroomId
            )
          });
          return;
        }
        if (request.method !== "PUT") {
          response.setHeader("allow", "GET, PUT");
          sendJson(response, 405, {
            error: "Use GET or PUT for the Verified Classroom Domain."
          });
          return;
        }
        if (!provider) {
          sendJson(response, 503, {
            error: "Classroom domain verification is not configured."
          });
          return;
        }
        const decision = await rateLimit(
          "classroom.domain",
          request,
          userId
        );
        if (!decision.allowed) {
          sendRateLimited(
            response,
            decision,
            "Too many Classroom domain changes. Try again shortly."
          );
          return;
        }
        const body = /** @type {Record<string, unknown>} */ (
          await readJsonBody(request)
        );
        const domain = normalizeClassroomDomain(body.domain);
        const verifiedEmail = await provider.verifiedPrimaryEmail(userId);
        if (verifiedEmailDomain(verifiedEmail) !== domain) {
          throw new ClassroomDomainInputError(
            "Use the domain from your verified primary email."
          );
        }
        const registered = await store.registerDomain(
          userId,
          selectedClassroomId,
          domain
        );
        await recordAudit(request, {
          actorId: userId,
          action: "org.domain.register",
          resource: { type: "classroom", id: selectedClassroomId },
          after: registered
        });
        sendJson(response, 200, { verifiedDomain: registered });
        return;
      }
      if (pathname.endsWith("/progress")) {
        if (request.method !== "GET") {
          response.setHeader("allow", "GET");
          sendJson(response, 405, {
            error: "Use GET for Classroom progress."
          });
          return;
        }
        const progress = await store.progressForTeacher(
          userId,
          selectedClassroomId
        );
        sendJson(response, 200, {
          classroomId: selectedClassroomId,
          ...progress
        });
        return;
      }

      if (request.method !== "POST") {
        response.setHeader("allow", "POST");
        sendJson(response, 405, {
          error: "Use POST for Classroom invitations."
        });
        return;
      }
      await store.requireTeacher(userId, selectedClassroomId);
      if (!provider) {
        sendJson(response, 503, {
          error: "Classroom invitations are not configured."
        });
        return;
      }
      const decision = await rateLimit("classroom.invite", request, userId);
      if (!decision.allowed) {
        sendRateLimited(
          response,
          decision,
          "Too many Classroom invitations. Try again shortly."
        );
        return;
      }
      const body = /** @type {Record<string, unknown>} */ (
        await readJsonBody(request)
      );
      const invitation = await provider.inviteStudent({
        classroomId: selectedClassroomId,
        emailAddress: invitationEmail(body.email),
        inviterUserId: userId,
        redirectUrl: "/class"
      });
      await recordAudit(request, {
        actorId: userId,
        action: "classroom.invite",
        resource: { type: "classroom", id: selectedClassroomId },
        after: {
          invitationId: invitation.id,
          status: invitation.status
        }
      });
      sendJson(response, 201, { invitation });
    } catch (error) {
      if (
        error instanceof InputError ||
        error instanceof ClassroomContextError ||
        error instanceof ClassroomDomainInputError
      ) {
        sendJson(response, 400, { error: error.message });
        return;
      }
      if (error instanceof ClassroomDomainConflictError) {
        sendJson(response, 409, { error: error.message });
        return;
      }
      if (error instanceof ClassroomAccessDeniedError) {
        sendJson(response, 403, {
          error: "Teacher Classroom Membership is required."
        });
        return;
      }
      console.error("[classrooms] API request failed", {
        name: safeErrorName(error)
      });
      sendJson(response, 502, {
        error: "Classroom service is temporarily unavailable."
      });
    }
  };
}
