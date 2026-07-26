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

const url = new URL(window.location.href);
if (url.pathname === "/" && url.searchParams.has("seed")) {
  url.pathname = "/play";
  window.history.replaceState({}, "", `${url.pathname}${url.search}`);
  void startGameplay();
} else if (url.pathname === "/play") {
  void startGameplay();
} else {
  renderLanding(gameRoot);
}

async function startGameplay() {
  gameRoot.replaceChildren(gameTemplate.content.cloneNode(true));
  try {
    await import("./main.js");
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
  }
}
