import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createQuestionHandler } from "./server/question-route.js";
import { createQuestionService } from "./server/question-service.js";
import { createPlayerApi } from "./server/player-api.js";

const app = express();
const rootDirectory = path.dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT) || 3000;

/** @param {unknown} error */
function logProviderFallback(error) {
  const message = error instanceof Error ? error.message : "Unknown provider error";
  console.warn(
    `[questions] AI provider unavailable; using bundled deck: ${message}`
  );
}

const questionService = createQuestionService({
  onProviderError: logProviderFallback
});

app.use(createQuestionHandler(questionService));
app.use(createPlayerApi());
app.use(express.static(path.join(rootDirectory, "dist")));
app.use((_request, response) => {
  response.sendFile(path.join(rootDirectory, "dist", "index.html"));
});

app.listen(port, () => {
  console.log(`Echo Maze running on http://localhost:${port}`);
});
