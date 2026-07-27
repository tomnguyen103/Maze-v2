import { defineConfig } from "vitest/config";
import { loadEnv } from "vite";
import { createQuestionHandler } from "./server/question-route.js";
import { createQuestionService } from "./server/question-service.js";
import { createPlayerApi } from "./server/player-api.js";
import { createRequestRateLimiter } from "./server/rate-limit-request.js";
import { logProviderFallback } from "./server/safe-error-log.js";
import { createSecurityHeadersMiddleware } from "./server/security-headers.js";

export default defineConfig(({ mode }) => {
  const base = {
    test: {
      include: ["tests/*.test.js"]
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
   * config evaluation must stay side-effect free.
   *
   * @type {{
   *   securityHeaders: ReturnType<typeof createSecurityHeadersMiddleware>,
   *   questionHandler: ReturnType<typeof createQuestionHandler>,
   *   playerApi: ReturnType<typeof createPlayerApi>
   * } | null}
   */
  let middlewares = null;
  const buildMiddlewares = () => {
    if (middlewares) {
      return middlewares;
    }
    const env = {
      ...globalThis.process.env,
      ...loadEnv(mode, globalThis.process.cwd(), "")
    };
    middlewares = {
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
    return middlewares;
  };
  /** @param {import("vite").ViteDevServer | import("vite").PreviewServer} server */
  const applyMiddlewares = (server) => {
    const { securityHeaders, questionHandler, playerApi } = buildMiddlewares();
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
