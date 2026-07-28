import { defineConfig } from "vitest/config";
import { loadEnv } from "vite";

export default defineConfig(({ mode }) => {
  const base = {
    test: {
      include: ["tests/*.test.js"],
      // This Windows workstation has 32 logical cores, but one full Vitest
      // fan-out competes with the browser/MCP processes used by the local
      // workflow. Eight forks keeps the gate deterministic without retries.
      maxWorkers: 8
    },
    build: {
      outDir: "dist",
      sourcemap: true
    },
    server: {
      port: 3000,
      strictPort: true
    },
    preview: {
      port: 4173,
      strictPort: true
    }
  };

  // A vitest run serves no HTTP API, so it gets no API plugin at all. Building
  // one here used to construct a real pg Pool (plus Stripe and Clerk clients)
  // inside the vitest process whenever .env.local held a DATABASE_URL — the
  // suspected source of the intermittent post-run "Vitest caught 1 unhandled
  // error" that turned a green gate into a silently blocked push.
  if (mode === "test") {
    return base;
  }

  /**
   * Built when a dev or preview server actually starts, never at config load:
   * config evaluation must stay side-effect free. The server modules are
   * imported dynamically for the same reason — a static import would
   * evaluate `server/telemetry-bootstrap.js` (and everything else the player
   * API pulls in) inside every vitest and build process.
   *
   * @type {Promise<{
   *   securityHeaders: ReturnType<typeof import("./server/security-headers.js")["createSecurityHeadersMiddleware"]>,
   *   questionHandler: ReturnType<typeof import("./server/question-route.js")["createQuestionHandler"]>,
   *   playerApi: ReturnType<typeof import("./server/player-api.js")["createPlayerApi"]>
   * }> | null}
   */
  let middlewares = null;
  const buildMiddlewares = () => {
    middlewares ??= (async () => {
      const [
        { createQuestionHandler },
        { createQuestionService },
        { createPlayerApi },
        { createRequestRateLimiter },
        { logProviderFallback },
        { createSecurityHeadersMiddleware }
      ] = await Promise.all([
        import("./server/question-route.js"),
        import("./server/question-service.js"),
        import("./server/player-api.js"),
        import("./server/rate-limit-request.js"),
        import("./server/safe-error-log.js"),
        import("./server/security-headers.js")
      ]);
      const env = {
        ...globalThis.process.env,
        ...loadEnv(mode, globalThis.process.cwd(), "")
      };
      return {
        securityHeaders: createSecurityHeadersMiddleware(env),
        questionHandler: createQuestionHandler(
          createQuestionService({
            env,
            onProviderError: logProviderFallback
          }),
          { rateLimit: createRequestRateLimiter(env) }
        ),
        playerApi: createPlayerApi(env)
      };
    })();
    return middlewares;
  };
  /** @param {import("vite").ViteDevServer | import("vite").PreviewServer} server */
  const applyMiddlewares = async (server) => {
    const { securityHeaders, questionHandler, playerApi } =
      await buildMiddlewares();
    server.middlewares.use(securityHeaders);
    server.middlewares.use(questionHandler);
    server.middlewares.use(playerApi);
  };

  return {
    ...base,
    plugins: [
      {
        name: "question-api",
        configureServer: applyMiddlewares,
        // The preview server is what the Playwright suite drives, so the e2e
        // run exercises the same headers production serves.
        configurePreviewServer: applyMiddlewares
      }
    ]
  };
});
