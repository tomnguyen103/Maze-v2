import {
  ClassroomAccessDeniedError,
  ClassroomContextError
} from "./classroom-context.js";
import { setRetryAfter } from "./http-retry.js";
import { ClassExpeditionStateError } from "./class-expedition-store.js";
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
import { isPublishedLearningDeckRevision } from "../src/questions/learning-deck-identity.js";
import { randomUUID } from "node:crypto";
import { URL } from "node:url";

const MAX_BODY_BYTES = 8 * 1024;
const CLASSROOM_ID_PATTERN = /^org_[A-Za-z0-9_-]{3,120}$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const EXPEDITION_SUBPATH_PATTERN =
  /^\/api\/classrooms\/org_[A-Za-z0-9_-]{3,120}\/expeditions\/(exped_[A-Za-z0-9_-]{3,120})\/(status|license|capacity|progress|constellation|grants|grants\/outcome)$/;
const RUN_ID_PATTERN = /^[a-zA-Z0-9_-]{12,128}$/;
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** @param {string} pathname */
export function isClassroomPath(pathname) {
  return (
    pathname === "/api/classrooms" ||
    /^\/api\/classrooms\/org_[A-Za-z0-9_-]{3,120}\/(?:domain|invitations|progress|expeditions)$/.test(
      pathname
    ) ||
    EXPEDITION_SUBPATH_PATTERN.test(pathname)
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
  setRetryAfter(response, status);
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

/** @param {unknown} value */
function atlasRegion(value) {
  if (!Number.isInteger(value) || Number(value) < 1 || Number(value) > 5) {
    throw new InputError("Choose an Atlas Region from 1 to 5.");
  }
  return Number(value);
}

/** @param {unknown} value */
function questLevelId(value) {
  if (
    value !== "bright-start" &&
    value !== "trail-scout" &&
    value !== "maze-master"
  ) {
    throw new InputError("Choose a Quest Level for the Class Expedition.");
  }
  return value;
}

/** @param {unknown} deckId @param {unknown} revisionId */
function publishedLearningDeck(deckId, revisionId) {
  if (
    typeof deckId !== "string" ||
    typeof revisionId !== "string" ||
    !isPublishedLearningDeckRevision(deckId, revisionId)
  ) {
    throw new InputError("Choose a published Learning Deck revision.");
  }
  return { deckId, revisionId };
}

/** @param {Record<string, unknown>} body */
function runGrantInput(body) {
  if (typeof body.runId !== "string" || !RUN_ID_PATTERN.test(body.runId)) {
    throw new InputError("Classroom Run Grant needs a valid Run identifier.");
  }
  if (
    !Number.isInteger(body.labyrinthNumber) ||
    Number(body.labyrinthNumber) < 1 ||
    Number(body.labyrinthNumber) > 20
  ) {
    throw new InputError(
      "Classroom Run Grant needs a Labyrinth Number from 1 to 20."
    );
  }
  return {
    runId: body.runId,
    labyrinthNumber: Number(body.labyrinthNumber)
  };
}

/** @param {unknown} value */
function advisoryCompletionDate(value) {
  if (value === undefined || value === null || value === "") {
    return null;
  }
  if (typeof value !== "string" || !ISO_DATE_PATTERN.test(value)) {
    throw new InputError("Completion date must look like 2026-09-15.");
  }
  const parsed = new Date(`${value}T00:00:00Z`);
  if (
    Number.isNaN(parsed.getTime()) ||
    parsed.toISOString().slice(0, 10) !== value
  ) {
    throw new InputError("Completion date must be a real calendar date.");
  }
  return value;
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
 *     }>,
 *     listExpeditions: (
 *       userId: string,
 *       classroomId: string
 *     ) => Promise<Record<string, unknown>[]>,
 *     createExpedition: (
 *       userId: string,
 *       classroomId: string,
 *       input: {
 *         expeditionId: string,
 *         atlasRegion: number,
 *         levelId: string,
 *         learningDeckId: string,
 *         learningDeckRevision: string,
 *         completionDate: string | null
 *       }
 *     ) => Promise<Record<string, unknown>>,
 *     setExpeditionStatus: (
 *       userId: string,
 *       classroomId: string,
 *       expeditionId: string,
 *       status: "open" | "closed"
 *     ) => Promise<Record<string, unknown>>,
 *     capacityForTeacher: (
 *       userId: string,
 *       classroomId: string,
 *       expeditionId: string
 *     ) => Promise<Record<string, unknown>>,
 *     issueRunGrant: (
 *       userId: string,
 *       classroomId: string,
 *       expeditionId: string,
 *       input: { runId: string, labyrinthNumber: number }
 *     ) => Promise<Record<string, unknown>>,
 *     recordRunOutcome: (
 *       userId: string,
 *       classroomId: string,
 *       expeditionId: string,
 *       input: {
 *         runId: string,
 *         labyrinthNumber: number,
 *         outcome: "escaped" | "defeated"
 *       }
 *     ) => Promise<unknown>,
 *     listOwnGrants: (
 *       userId: string,
 *       classroomId: string,
 *       expeditionId: string
 *     ) => Promise<Record<string, unknown>[]>,
 *     progressForExpedition: (
 *       userId: string,
 *       classroomId: string,
 *       expeditionId: string
 *     ) => Promise<Record<string, unknown>>,
 *     constellationForExpedition: (
 *       userId: string,
 *       classroomId: string,
 *       expeditionId: string
 *     ) => Promise<Record<string, unknown>>
 *   },
 *   billing?: {
 *     createLicenseCheckout: (purchase: {
 *       userId: string,
 *       classroomId: string,
 *       expeditionId: string,
 *       kind: "base" | "extension"
 *     }) => Promise<{ checkoutUrl: string, purchaseId: string }>
 *   } | null,
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
  billing = null,
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
      const expeditionMatch = pathname.match(EXPEDITION_SUBPATH_PATTERN);
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
      if (pathname.endsWith("/progress") && !expeditionMatch) {
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

      if (pathname.endsWith("/expeditions")) {
        if (request.method === "GET") {
          sendJson(response, 200, {
            expeditions: await store.listExpeditions(
              userId,
              selectedClassroomId
            )
          });
          return;
        }
        if (request.method !== "POST") {
          response.setHeader("allow", "GET, POST");
          sendJson(response, 405, {
            error: "Use GET or POST for Class Expeditions."
          });
          return;
        }
        const decision = await rateLimit(
          "classroom.expedition",
          request,
          userId
        );
        if (!decision.allowed) {
          sendRateLimited(
            response,
            decision,
            "Too many Class Expedition changes. Try again shortly."
          );
          return;
        }
        const body = /** @type {Record<string, unknown>} */ (
          await readJsonBody(request)
        );
        const deck = publishedLearningDeck(
          body.learningDeckId,
          body.learningDeckRevision
        );
        const expedition = await store.createExpedition(
          userId,
          selectedClassroomId,
          {
            expeditionId: `exped_${randomUUID().replaceAll("-", "")}`,
            atlasRegion: atlasRegion(body.atlasRegion),
            levelId: questLevelId(body.levelId),
            learningDeckId: deck.deckId,
            learningDeckRevision: deck.revisionId,
            completionDate: advisoryCompletionDate(body.completionDate)
          }
        );
        await recordAudit(request, {
          actorId: userId,
          action: "classroom.expedition.create",
          resource: { type: "classroom", id: selectedClassroomId },
          after: {
            expeditionId: expedition.id,
            atlasRegion: expedition.atlasRegion,
            levelId: expedition.levelId,
            learningDeckId: expedition.learningDeckId,
            learningDeckRevision: expedition.learningDeckRevision,
            status: expedition.status
          }
        });
        sendJson(response, 201, { expedition });
        return;
      }

      if (expeditionMatch) {
        const expeditionId = expeditionMatch[1];
        const subResource = expeditionMatch[2];
        if (subResource === "grants") {
          if (request.method === "GET") {
            sendJson(response, 200, {
              grants: await store.listOwnGrants(
                userId,
                selectedClassroomId,
                expeditionId
              )
            });
            return;
          }
          if (request.method !== "POST") {
            response.setHeader("allow", "GET, POST");
            sendJson(response, 405, {
              error: "Use GET or POST for Classroom Run Grants."
            });
            return;
          }
          const decision = await rateLimit(
            "classroom.grant",
            request,
            userId
          );
          if (!decision.allowed) {
            sendRateLimited(
              response,
              decision,
              "Too many Classroom Run Grant requests. Try again shortly."
            );
            return;
          }
          const body = /** @type {Record<string, unknown>} */ (
            await readJsonBody(request)
          );
          const grantInput = runGrantInput(body);
          const grant = await store.issueRunGrant(
            userId,
            selectedClassroomId,
            expeditionId,
            grantInput
          );
          await recordAudit(request, {
            actorId: userId,
            action: "classroom.expedition.grant",
            resource: { type: "classroom", id: selectedClassroomId },
            after: {
              expeditionId,
              labyrinthNumber: grantInput.labyrinthNumber,
              duplicate: grant.duplicate === true
            }
          });
          sendJson(response, 201, { grant });
          return;
        }
        if (subResource === "grants/outcome") {
          if (request.method !== "POST") {
            response.setHeader("allow", "POST");
            sendJson(response, 405, {
              error: "Use POST for Classroom Run outcomes."
            });
            return;
          }
          const decision = await rateLimit(
            "classroom.grant",
            request,
            userId
          );
          if (!decision.allowed) {
            sendRateLimited(
              response,
              decision,
              "Too many Classroom Run Grant requests. Try again shortly."
            );
            return;
          }
          const body = /** @type {Record<string, unknown>} */ (
            await readJsonBody(request)
          );
          const grantInput = runGrantInput(body);
          if (body.outcome !== "escaped" && body.outcome !== "defeated") {
            throw new InputError(
              "Classroom Run outcome must be escaped or defeated."
            );
          }
          await store.recordRunOutcome(
            userId,
            selectedClassroomId,
            expeditionId,
            { ...grantInput, outcome: body.outcome }
          );
          await recordAudit(request, {
            actorId: userId,
            action: "classroom.expedition.outcome",
            resource: { type: "classroom", id: selectedClassroomId },
            after: {
              expeditionId,
              labyrinthNumber: grantInput.labyrinthNumber,
              outcome: body.outcome
            }
          });
          sendJson(response, 200, { recorded: true });
          return;
        }
        if (subResource === "capacity") {
          if (request.method !== "GET") {
            response.setHeader("allow", "GET");
            sendJson(response, 405, {
              error: "Use GET for Class Expedition capacity."
            });
            return;
          }
          sendJson(response, 200, {
            capacity: await store.capacityForTeacher(
              userId,
              selectedClassroomId,
              expeditionId
            )
          });
          return;
        }
        if (subResource === "progress") {
          if (request.method !== "GET") {
            response.setHeader("allow", "GET");
            sendJson(response, 405, {
              error: "Use GET for Class Expedition progress."
            });
            return;
          }
          sendJson(response, 200, {
            progress: await store.progressForExpedition(
              userId,
              selectedClassroomId,
              expeditionId
            )
          });
          return;
        }
        if (subResource === "constellation") {
          if (request.method !== "GET") {
            response.setHeader("allow", "GET");
            sendJson(response, 405, {
              error: "Use GET for the Class Constellation."
            });
            return;
          }
          await store.requireTeacher(userId, selectedClassroomId);
          sendJson(response, 200, {
            constellation: await store.constellationForExpedition(
              userId,
              selectedClassroomId,
              expeditionId
            )
          });
          return;
        }
        if (request.method !== "POST") {
          response.setHeader("allow", "POST");
          sendJson(response, 405, {
            error: "Use POST for Class Expedition changes."
          });
          return;
        }
        const decision = await rateLimit(
          "classroom.expedition",
          request,
          userId
        );
        if (!decision.allowed) {
          sendRateLimited(
            response,
            decision,
            "Too many Class Expedition changes. Try again shortly."
          );
          return;
        }
        if (subResource === "license") {
          if (!billing) {
            sendJson(response, 503, {
              error:
                "Class Expedition License purchases are not configured."
            });
            return;
          }
          await store.requireTeacher(userId, selectedClassroomId);
          const body = /** @type {Record<string, unknown>} */ (
            await readJsonBody(request)
          );
          if (body.kind !== "base" && body.kind !== "extension") {
            throw new InputError(
              "Class Expedition License kind must be base or extension."
            );
          }
          const checkout = await billing.createLicenseCheckout({
            userId,
            classroomId: selectedClassroomId,
            expeditionId,
            kind: body.kind
          });
          await recordAudit(request, {
            actorId: userId,
            action: "classroom.expedition.license",
            resource: { type: "classroom", id: selectedClassroomId },
            after: {
              expeditionId,
              kind: body.kind,
              purchaseId: checkout.purchaseId
            }
          });
          sendJson(response, 201, checkout);
          return;
        }
        const body = /** @type {Record<string, unknown>} */ (
          await readJsonBody(request)
        );
        if (body.status !== "open" && body.status !== "closed") {
          throw new InputError(
            "Class Expedition status must be open or closed."
          );
        }
        const expedition = await store.setExpeditionStatus(
          userId,
          selectedClassroomId,
          expeditionId,
          body.status
        );
        await recordAudit(request, {
          actorId: userId,
          action: "classroom.expedition.status",
          resource: { type: "classroom", id: selectedClassroomId },
          after: {
            expeditionId,
            status: body.status
          }
        });
        sendJson(response, 200, { expedition });
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
      if (
        error instanceof ClassroomDomainConflictError ||
        error instanceof ClassExpeditionStateError
      ) {
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
