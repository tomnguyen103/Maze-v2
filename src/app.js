import "@fontsource-variable/bricolage-grotesque";
import "@fontsource-variable/geist";
import "@fontsource-variable/geist-mono";
import "./daylight.css";

import { renderLanding } from "./landing/landing-controller.js";

const gameRoot = document.getElementById("game-root");
if (!(gameRoot instanceof HTMLElement)) {
  throw new Error("Missing game root.");
}

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
  await import("./main.js");
}
