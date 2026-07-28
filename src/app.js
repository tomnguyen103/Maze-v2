import "@fontsource-variable/bricolage-grotesque";
import "@fontsource-variable/geist";
import "@fontsource-variable/geist-mono";
import "./daylight.css";

import { renderLanding } from "./landing/landing-controller.js";

const rootElement = document.getElementById("game-root");
if (!(rootElement instanceof HTMLElement)) {
  throw new Error("Missing game root.");
}
const gameRoot = rootElement;
const templateElement = document.getElementById("game-template");
if (!(templateElement instanceof HTMLTemplateElement)) {
  throw new Error("Missing game template.");
}
const gameTemplate = templateElement;

if (import.meta.env.VITE_SENTRY_DSN) {
  // Optional and lazy: with the DSN unset at build time this branch is dead
  // code and the Sentry chunk never exists; a failed load must never block
  // play.
  void import("./error-reporting.js")
    .then((reporting) => reporting.initBrowserErrorTracking())
    .catch(() => {});
}

const url = new URL(window.location.href);
if (url.pathname === "/" && url.searchParams.has("seed")) {
  url.pathname = "/play";
  window.history.replaceState({}, "", `${url.pathname}${url.search}`);
  void startGameplay();
} else if (url.pathname === "/play") {
  void startGameplay();
} else if (url.pathname === "/admin") {
  // Loaded on demand: an Explorer who never opens /admin never pays for it.
  void import("./admin/admin-controller.js")
    .then((admin) => admin.renderAdmin(gameRoot))
    .catch(() => {
      // A stale deployment or an offline client rejects the import. Without
      // this the route renders nothing at all, which reads as a broken app
      // rather than as something to retry.
      gameRoot.dataset.adminState = "unavailable";
      gameRoot.innerHTML = `
        <main class="landing-page" id="admin-main">
          <p class="section-label">Admin</p>
          <h1>Admin could not load.</h1>
          <p>Reload to try again. Your Quest is unaffected.</p>
          <a class="primary-button" href="/admin">Try again</a>
        </main>
      `;
    });
} else if (url.pathname === "/class") {
  // Classroom code is isolated from guest play and the public landing page.
  void import("./classroom/classroom-controller.js")
    .then((classroom) => classroom.renderClassroom(gameRoot))
    .catch(() => {
      gameRoot.dataset.classroomState = "unavailable";
      gameRoot.innerHTML = `
        <main class="landing-page" id="classroom-main">
          <p class="section-label">Classroom</p>
          <h1>Classroom could not load.</h1>
          <p>Reload to try again. Personal Play is still available.</p>
          <a class="primary-button" href="/class">Try again</a>
          <a class="control-link" href="/play">Personal Play</a>
        </main>
      `;
    });
} else {
  renderLanding(gameRoot);
}

async function startGameplay() {
  delete gameRoot.dataset.gameReady;
  gameRoot.inert = true;
  gameRoot.setAttribute("aria-busy", "true");
  gameRoot.replaceChildren(gameTemplate.content.cloneNode(true));
  try {
    const { gameReady } = await import("./main.js");
    await gameReady;
    gameRoot.dataset.gameReady = "true";
  } catch {
    console.error("Echo Maze gameplay failed to load.");
    gameRoot.innerHTML = `
      <main class="landing-page" id="landing-main">
        <p class="section-label">Maze unavailable</p>
        <h1>Echo Maze could not load.</h1>
        <p>Try loading the Maze again. Your guest progress stays in this browser.</p>
        <a class="primary-button" href="/play">Try again</a>
      </main>
    `;
    const retryLink = gameRoot.querySelector(".primary-button");
    if (retryLink instanceof HTMLAnchorElement) {
      retryLink.href = window.location.href;
    }
  } finally {
    gameRoot.inert = false;
    gameRoot.removeAttribute("aria-busy");
    const canvas = gameRoot.querySelector("#maze-canvas");
    if (
      gameRoot.dataset.gameReady === "true" &&
      document.activeElement === document.body &&
      !gameRoot.querySelector("dialog[open]") &&
      canvas instanceof HTMLCanvasElement
    ) {
      canvas.focus({ preventScroll: true });
    }
  }
}
