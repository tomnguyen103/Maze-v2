import { URL } from "node:url";

const MAX_BODY_BYTES = 4 * 1024;
const RUN_ID_PATTERN = /^[a-zA-Z0-9_-]{12,128}$/;
export const ACCESS_PATHS = new Set([
  "/api/access",
  "/api/access/config",
  "/api/access/guest-runs",
  "/api/access/runs"
]);

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
async function readRunRequest(request) {
  let body = "";
  for await (const chunk of request) {
    body += chunk;
    if (Buffer.byteLength(body) > MAX_BODY_BYTES) {
      throw new Error("Request body is too large.");
    }
  }
  let parsed;
  try {
    parsed = JSON.parse(body);
  } catch {
    throw new Error("Request body must be valid JSON.");
  }
  const run =
    parsed && typeof parsed === "object"
      ? /** @type {Record<string, unknown>} */ (parsed)
      : {};
  const runId = run.runId;
  if (typeof runId !== "string" || !RUN_ID_PATTERN.test(runId)) {
    throw new Error("Run id must be 12-128 letters, numbers, dashes, or underscores.");
  }
  if (
    typeof run.seed !== "string" ||
    !/^[A-Z0-9]+(?:-[A-Z0-9]+)*$/.test(run.seed) ||
    run.seed.length > 24
  ) {
    throw new Error("Run seed is invalid.");
  }
  if (
    run.levelId !== "bright-start" &&
    run.levelId !== "trail-scout" &&
    run.levelId !== "maze-master"
  ) {
    throw new Error("Quest Level is invalid.");
  }
  if (
    !Number.isInteger(run.labyrinthNumber) ||
    Number(run.labyrinthNumber) < 1 ||
    Number(run.labyrinthNumber) > 20
  ) {
    throw new Error("Labyrinth Number is invalid.");
  }
  return {
    runId,
    seed: run.seed,
    levelId: run.levelId,
    labyrinthNumber: Number(run.labyrinthNumber)
  };
}

/**
 * @param {{
 *   store: {
 *     getAccess: (userId: string) => Promise<{
 *       freeRunsRemaining: number,
 *       state: string
 *     }>,
 *     authorizeRun: (userId: string, run: {
 *       runId: string,
 *       seed: string,
 *       levelId: string,
 *       labyrinthNumber: number
 *     }) => Promise<{
 *       allowed: boolean,
 *       duplicate: boolean,
 *       freeRunsRemaining: number,
 *       state: string
 *     }>
 *   },
 *   guestStore?: {
 *     authorizeGuestRun: (
 *       addressHash: string,
 *       run: {
 *         runId: string,
 *         seed: string,
 *         levelId: string,
 *         labyrinthNumber: number
 *       }
 *     ) => Promise<{
 *       allowed: boolean,
 *       duplicate: boolean,
 *       freeRunsRemaining: number,
 *       state: string
 *     }>
 *   },
 *   addressHashFor?: (
 *     request: import("node:http").IncomingMessage
 *   ) => string | null,
 *   getUserId: (
 *     request: import("node:http").IncomingMessage
 *   ) => string | null | Promise<string | null>,
 *   enforcementEnabled?: boolean,
 *   guestDemoEnforcementEnabled?: boolean,
 *   recordEvent?: (
 *     eventName: string,
 *     fields: Record<string, unknown>
 *   ) => void,
 *   recordAudit?: import("./audit.js").RecordAudit
 * }} dependencies
 */
export function createRunAccessHandler({
  store,
  guestStore = undefined,
  addressHashFor = () => null,
  getUserId,
  enforcementEnabled = false,
  guestDemoEnforcementEnabled = false,
  recordEvent = () => {},
  recordAudit = async () => {}
}) {
  /**
   * @param {import("node:http").IncomingMessage} request
   * @param {import("node:http").ServerResponse} response
   * @param {(() => void) | undefined} next
   */
  return async function runAccessHandler(request, response, next) {
    const pathname = new URL(request.url ?? "", "http://local").pathname;
    if (!ACCESS_PATHS.has(pathname)) {
      next?.();
      return;
    }

    try {
      if (pathname === "/api/access/config") {
        if (request.method !== "GET") {
          response.setHeader("allow", "GET");
          sendJson(response, 405, {
            error: "Use GET for Run Access configuration."
          });
          return;
        }
        sendJson(response, 200, {
          enforcementEnabled,
          guestDemoEnforcementEnabled
        });
        return;
      }
      if (pathname === "/api/access/guest-runs") {
        if (request.method !== "POST") {
          response.setHeader("allow", "POST");
          sendJson(response, 405, {
            error: "Use POST to start a guest Run."
          });
          return;
        }
        const runRequest = await readRunRequest(request);
        const addressHash = addressHashFor(request);
        let metered = false;
        let degraded = false;
        let result;
        if (guestDemoEnforcementEnabled && guestStore && addressHash) {
          try {
            result = await guestStore.authorizeGuestRun(
              addressHash,
              runRequest
            );
            metered = true;
          } catch {
            // The demo boundary must never make the game unavailable. If either
            // durable auditing or the counter store is down, admit the Run
            // without claiming it was metered.
            degraded = true;
            result = guestDemoFallback();
          }
          if (metered && result.allowed && !result.duplicate) {
            try {
              await recordAudit(request, {
                action: "guest_run_access.decision",
                resource: { type: "guest_run_access" },
                after: {
                  allowed: true,
                  labyrinthNumber: runRequest.labyrinthNumber,
                  levelId: runRequest.levelId
                }
              });
            } catch {
              // Production auditing already reports and swallows append
              // failures. Keep the public fallback true for injected auditors
              // that do throw.
            }
          }
        } else {
          result = guestDemoFallback();
        }
        recordEvent("guest_demo_access_decision", {
          degraded,
          duplicate: result.duplicate,
          enforcementEnabled: guestDemoEnforcementEnabled,
          metered,
          outcome: degraded
            ? "degraded"
            : metered
              ? result.allowed
                ? "admitted"
                : "blocked"
              : "unmetered"
        });
        sendJson(response, 200, {
          ...result,
          degraded,
          guestDemoEnforcementEnabled,
          metered
        });
        return;
      }
      const userId = await getUserId(request);
      if (!userId) {
        sendJson(response, 401, { error: "Sign in to continue." });
        return;
      }

      if (pathname === "/api/access") {
        if (request.method !== "GET") {
          response.setHeader("allow", "GET");
          sendJson(response, 405, { error: "Use GET for Run Access." });
          return;
        }
        sendJson(response, 200, {
          ...(await store.getAccess(userId)),
          enforcementEnabled
        });
        return;
      }

      if (request.method !== "POST") {
        response.setHeader("allow", "POST");
        sendJson(response, 405, { error: "Use POST to start a Run." });
        return;
      }
      const runRequest = await readRunRequest(request);
      const result = enforcementEnabled
        ? await store.authorizeRun(userId, runRequest)
        : {
            ...(await store.getAccess(userId)),
            allowed: true,
            duplicate: false
          };
      recordEvent("run_access_decision", {
        accessState: result.state,
        duplicate: result.duplicate,
        enforcementEnabled,
        outcome: enforcementEnabled
          ? result.allowed
            ? "admitted"
            : "blocked"
          : "unmetered"
      });
      // Only the enforced path changes state. With enforcement off the request
      // reads current access and grants nothing, so there is nothing to audit.
      if (enforcementEnabled) {
        await recordAudit(request, {
          actorId: userId,
          action: "run_access.decision",
          resource: { type: "run_access_grant", id: runRequest.runId },
          after: {
            allowed: result.allowed,
            duplicate: result.duplicate,
            labyrinthNumber: runRequest.labyrinthNumber,
            levelId: runRequest.levelId,
            state: result.state
          }
        });
      }
      sendJson(response, 200, { ...result, enforcementEnabled });
    } catch (error) {
      if (
        error instanceof Error &&
        (error.message.startsWith("Request body") ||
          error.message.startsWith("Run ") ||
          error.message.startsWith("Quest ") ||
          error.message.startsWith("Labyrinth "))
      ) {
        sendJson(response, 400, { error: error.message });
        return;
      }
      if (error instanceof Error && error.name === "RunAccessConflictError") {
        sendJson(response, 409, { error: error.message });
        return;
      }
      console.error("[access] API request failed");
      recordEvent("run_access_error", { category: "temporary" });
      sendJson(response, 503, {
        error: "Run access could not be checked. Try again."
      });
    }
  };
}

function guestDemoFallback() {
  return {
    allowed: true,
    duplicate: false,
    freeRunsRemaining: 0,
    state: "guest-demo"
  };
}
