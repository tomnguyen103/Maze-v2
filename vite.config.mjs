import { defineConfig } from "vitest/config";
import { loadEnv } from "vite";

/** @type {import("vite").ResolveModulePreloadDependenciesFn} */
const resolveModulePreloadDependencies = (
  _filename,
  dependencies,
  { hostType }
) => {
  if (hostType !== "js") {
    return dependencies;
  }
  return dependencies.filter(
    (dependency) =>
      !dependency.includes("game-session-") &&
      !dependency.includes("tactics-lab-view-")
  );
};

export default defineConfig(({ mode }) => {
  const base = {
    test: {
      include: ["tests/*.test.js"],
      // The default fork pool has repeatedly lost workers on this Windows
      // workstation. A single thread keeps the local gate trustworthy; the
      // checked summary gate also detects any future partial run.
      pool: "threads",
      maxWorkers: 1,
      fileParallelism: false
    },
    build: {
      outDir: "dist",
      sourcemap: true,
      rolldownOptions: {
        output: {
          // Twelve chunks were byte-identical duplicates of six modules,
          // ~19.4 KB gzip of the same code downloaded more than once. These
          // are imported from several dynamic entry points, so the bundler
          // inlined a copy into each rather than emitting one shared chunk.
          advancedChunks: {
            groups: [
              {
                name: "quest-rules",
                test: /src[/\\]game[/\\](run-ruleset|quest-constants|quest-progress|quest-content|compare-keys|unique-id)[.]js$/
              }
            ]
          }
        }
      },
      modulePreload: {
        // These are already static ESM dependencies of the app shell or
        // Workshop route; normal imports keep them correct without repeating
        // their paths in every dynamic-import preload map.
        resolveDependencies: resolveModulePreloadDependencies
      }
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
