import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createQuestionHandler } from "./server/question-route.js";
import { createQuestionService } from "./server/question-service.js";
import { createPlayerApi } from "./server/player-api.js";
import { createRequestRateLimiter } from "./server/rate-limit-request.js";
import { logProviderFallback } from "./server/safe-error-log.js";
import { createSecurityHeadersMiddleware } from "./server/security-headers.js";

const app = express();
const rootDirectory = path.dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT) || 3000;

const questionService = createQuestionService({
  onProviderError: logProviderFallback
});

app.use(createSecurityHeadersMiddleware());
app.use(createQuestionHandler(questionService, {
  rateLimit: createRequestRateLimiter()
}));
app.use(createPlayerApi());
app.use(express.static(path.join(rootDirectory, "dist")));
app.use((_request, response) => {
  response.sendFile(path.join(rootDirectory, "dist", "index.html"));
});

app.listen(port, () => {
  console.log(`Echo Maze running on http://localhost:${port}`);
});
