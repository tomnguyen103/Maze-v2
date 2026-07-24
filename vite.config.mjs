import { defineConfig } from "vitest/config";
import { loadEnv } from "vite";
import { createQuestionHandler } from "./server/question-route.js";
import { createQuestionService } from "./server/question-service.js";
import { createPlayerApi } from "./server/player-api.js";

/** @param {unknown} error */
function logProviderFallback(error) {
  const message = error instanceof Error ? error.message : "Unknown provider error";
  console.warn(
    `[questions] AI provider unavailable; using bundled deck: ${message}`
  );
}

export default defineConfig(({ mode }) => {
  const env = {
    ...globalThis.process.env,
    ...loadEnv(mode, globalThis.process.cwd(), "")
  };
  const questionHandler = createQuestionHandler(
    createQuestionService({
      env,
      onProviderError: logProviderFallback
    })
  );
  const playerApi = createPlayerApi(env);

  return {
    plugins: [
      {
        name: "question-api",
        configureServer(server) {
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
