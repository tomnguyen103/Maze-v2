import { defineConfig } from "vitest/config";
import { loadEnv } from "vite";
import { createQuestionHandler } from "./server/question-route.js";
import { createQuestionService } from "./server/question-service.js";
import { createPlayerApi } from "./server/player-api.js";
import { logProviderFallback } from "./server/safe-error-log.js";

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
        },
        configurePreviewServer(server) {
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
