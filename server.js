import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createQuestionApi } from "./server/question-api.js";
import { createPlayerApi } from "./server/player-api.js";
import { createSecurityHeadersMiddleware } from "./server/security-headers.js";
import { safeErrorName } from "./server/safe-error-log.js";
import { setRetryAfter } from "./server/http-retry.js";
import { resolveEnforcementEnabled } from "./server/lifetime-config.js";

// The long-running deployment refuses to boot on a misconfiguration that the
// serverless one can only log: here there is one process, a supervisor to
// notice, and no other route to take down with it.
resolveEnforcementEnabled(process.env);

const app = express();
const rootDirectory = path.dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT) || 3000;

app.use(createSecurityHeadersMiddleware());
app.use(createQuestionApi());
app.use(createPlayerApi());
app.use(express.static(path.join(rootDirectory, "dist")));
app.use((_request, response) => {
  response.sendFile(path.join(rootDirectory, "dist", "index.html"));
});

/*
 * The terminal error handler. `server/dispatch.js` forwards a rejected route
 * to `next(error)`, and without a four-argument handler here that reaches
 * Express's built-in one — which renders the message and the Node stack
 * trace, absolute paths included, into the response body whenever
 * `NODE_ENV` is not "production". `npm start` never sets it. That would undo,
 * on the persistent server, exactly the internal-text leak the routes close.
 *
 * Four arguments are required for Express to recognise this as the error
 * handler; `next` is unused and must still be declared.
 */
app.use(
  (
    /** @type {unknown} */ error,
    /** @type {import("express").Request} */ _request,
    /** @type {import("express").Response} */ response,
    // Express identifies an error handler by arity, so the fourth parameter
    // has to be declared even though nothing here delegates further.
    // eslint-disable-next-line no-unused-vars
    /** @type {import("express").NextFunction} */ _next
  ) => {
    console.error("[server] request failed", { name: safeErrorName(error) });
    if (response.headersSent) {
      response.end();
      return;
    }
    response.status(503);
    response.setHeader("cache-control", "no-store");
    setRetryAfter(response, 503);
    response.json({ error: "Something went wrong. Try again." });
  }
);

const server = app.listen(port, () => {
  console.log(`Echo Maze running on http://localhost:${port}`);
});

/*
 * This process serves every player at once, so both of the ways Node ends a
 * process by default have to be decided here rather than inherited.
 *
 * Route rejections are forwarded by `server/dispatch.js` and never arrive
 * here. What does arrive is a rejection with no owner at all — a timer, a
 * background write, a listener. Logging and staying up is right for those:
 * the work that failed is already lost, and the Runs in flight are not.
 */
process.on("unhandledRejection", (reason) => {
  console.error("[server] unhandled rejection", {
    name: safeErrorName(reason)
  });
});

/*
 * An uncaught exception is different. Execution was abandoned partway through
 * an unknown call stack, so nothing here can say which state is still sound.
 * Stop accepting connections, let the in-flight ones drain, and exit non-zero
 * for a supervisor to restart — rather than keep serving from a process that
 * may be halfway through a transaction.
 */
process.on("uncaughtException", (error) => {
  console.error("[server] uncaught exception", { name: safeErrorName(error) });
  server.close(() => process.exit(1));
  // A hung connection must not hold a broken process open indefinitely.
  setTimeout(() => process.exit(1), 5000).unref();
});
