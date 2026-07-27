import { defineConfig } from "vitest/config";
import { loadEnv } from "vite";
import { createQuestionHandler } from "./server/question-route.js";
import { createQuestionService } from "./server/question-service.js";
import { createPlayerApi } from "./server/player-api.js";
import { createRequestRateLimiter } from "./server/rate-limit-request.js";
import { logProviderFallback } from "./server/safe-error-log.js";
import { createSecurityHeadersMiddleware } from "./server/security-headers.js";

export default defineConfig(({ mode }) => {
  const env = {
    ...globalThis.process.env,
    ...loadEnv(mode, globalThis.process.cwd(), "")
  };
  const questionHandler = createQuestionHandler(
    createQuestionService({
      env,
      onProviderError: logProviderFallback
    }),
    { rateLimit: createRequestRateLimiter(env) }
  );
  const playerApi = createPlayerApi(env);
  // The preview server is what the Playwright suite drives, so the e2e run
  // exercises the same headers production serves.
  const securityHeaders = createSecurityHeadersMiddleware(env);

  return {
    plugins: [
      {
        name: "question-api",
        configureServer(server) {
          server.middlewares.use(securityHeaders);
          server.middlewares.use(questionHandler);
          server.middlewares.use(playerApi);
        },
        configurePreviewServer(server) {
          server.middlewares.use(securityHeaders);
          server.middlewares.use(questionHandler);
          server.middlewares.use(playerApi);
        }
      }
    ],
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
});
