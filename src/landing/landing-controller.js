import { createPlayerApiClient } from "../player/player-client.js";
import { createClerkBrowser } from "../player/clerk-browser.js";

/** @param {HTMLElement} root */
export function renderLanding(root) {
  // index.html inlines this same markup statically so the hero text paints
  // before any JS runs (WP-02). A landing visit finds it already correct and
  // only wires listeners onto it; every other route clears it first (see
  // src/app.js), so a stale copy is never what this rebuilds onto. The two
  // copies have to keep the same DOM shape (whitespace aside) — see the
  // structural-equality test in tests/audit-performance.test.js.
  if (!document.getElementById("landing-title")) {
    root.innerHTML = `
    <a class="skip-link" href="#landing-main">Skip to the introduction</a>
    <header class="landing-header">
      <a class="wordmark" href="/" aria-label="Echo Maze home">Echo Maze</a>
      <button class="control-button" id="landing-sign-in" type="button">Sign in</button>
    </header>
    <main class="landing-page" id="landing-main">
      <section class="landing-hero" aria-labelledby="landing-title">
        <div class="landing-hero__copy">
          <p class="section-label">A learning adventure</p>
          <h1 id="landing-title">Echo Maze</h1>
          <p>Recover every Echo, outsmart Wardens with knowledge, then find the Gate.</p>
          <div class="landing-hero__actions">
            <a class="primary-button" href="/play" id="landing-primary-action">Enter the Maze</a>
            <button class="control-button" id="landing-sign-in-hero" type="button">Sign in</button>
          </div>
          <p class="landing-auth-status" id="landing-auth-status" role="status" hidden></p>
        </div>
        <div class="landing-labyrinth-mark" aria-hidden="true">
          <span></span><span></span><span></span><span></span><span></span>
          <span></span><span></span><span></span><span></span><span></span>
          <span></span><span></span><span></span><span></span><span></span>
          <span></span><span></span><span></span><span></span><span></span>
          <span></span><span></span><span></span><span></span><span></span>
        </div>
      </section>
      <section class="landing-path" aria-labelledby="landing-path-title">
        <h2 id="landing-path-title">Find your way through each Labyrinth</h2>
        <ol>
          <li><strong>Recover Echoes</strong><span>Reveal passages and gather every lost Echo.</span></li>
          <li><strong>Answer Challenges</strong><span>Use a Warden Question to clear the path.</span></li>
          <li><strong>Reach the Gate</strong><span>Escape when every Echo is safe.</span></li>
        </ol>
      </section>
      <section class="landing-levels" aria-labelledby="landing-levels-title">
        <div>
          <h2 id="landing-levels-title">Twenty Labyrinths await</h2>
          <p>Choose a Quest Level after you enter. Each Quest grows from a friendly first path to a final test.</p>
        </div>
        <ul>
          <li><strong>Bright Start</strong><span>Friendly foundations</span></li>
          <li><strong>Trail Scout</strong><span>Balanced reasoning</span></li>
          <li><strong>Maze Master</strong><span>Advanced mastery</span></li>
        </ul>
      </section>
      <section class="landing-account" aria-labelledby="landing-account-title">
        <div class="landing-account__copy">
          <h2 id="landing-account-title">Play your way</h2>
          <p>Play one Guest Run. After that, a free Explorer account includes three more Runs and saves your public username, color choices, and Global Scoreboard entries.</p>
        </div>
        <aside class="landing-membership-preview" aria-labelledby="landing-membership-title">
          <h3 id="landing-membership-title">Optional lifetime access</h3>
          <p class="landing-membership-price">$5.99 USD once</p>
          <ul>
            <li>Unlimited Runs for this Explorer account</li>
            <li>No subscription or renewal</li>
            <li>Same fair Warden rules, with no paid power</li>
          </ul>
          <p>Ask a parent or grown-up to help if you choose it. Guest play stays available.</p>
        </aside>
      </section>
    </main>
  `;
  }
  const headerSignIn = requiredElement("landing-sign-in", HTMLButtonElement);
  const heroSignIn = requiredElement(
    "landing-sign-in-hero",
    HTMLButtonElement
  );
  const authStatus = requiredElement("landing-auth-status", HTMLElement);
  const primaryAction = requiredElement(
    "landing-primary-action",
    HTMLAnchorElement
  );
  // Set once Clerk has been asked to initialize, so the first sign-in click
  // loads it and later ones do not wait on the check again.
  let clerkReady = false;
  let clerkAvailable = true;
  const clerkBrowser = createClerkBrowser({ onChange: syncAccount });
  const playerClient = createPlayerApiClient({
    getToken: clerkBrowser.getToken
  });

  headerSignIn.addEventListener("click", openAccount);
  heroSignIn.addEventListener("click", openAccount);

  // Clerk is 559 kB — 74.6% of this page, 94.9% of it unused by a visitor who
  // never signs in — and loading it eagerly was the whole of the measured LCP
  // failure here. A signed-out visitor now gets a working landing page
  // without it, and it arrives on the first click instead.
  //
  // `__client_uat` is Clerk's own signed-in hint: a Unix timestamp for a
  // visitor with a session, `0` for one without. Reading it costs nothing and
  // keeps a returning Explorer's name from flickering in.
  if (hasClerkSession()) {
    headerSignIn.disabled = true;
    heroSignIn.disabled = true;
    headerSignIn.setAttribute("aria-busy", "true");
    heroSignIn.setAttribute("aria-busy", "true");
    void syncAccount();
  }
  // Quest validation loads lazily so Deck identity stays out of the landing
  // bundle. If the chunk never arrives the call to action stays "Enter the
  // Maze", which still reaches the game route and resumes the stored Quest.
  void import("../game/quest-progress.js")
    .then(({ loadQuestProgress }) => {
      if (loadQuestProgress()) {
        primaryAction.textContent = "Continue Quest";
      }
    })
    .catch(() => {});

  /**
   * Whether Clerk believes this browser has a session. The cookie is set by
   * Clerk itself and is readable without the SDK; a missing or `0` value
   * means signed out, which is the case worth not paying 559 kB for.
   */
  function hasClerkSession() {
    return /(?:^|;\s*)__client_uat=(?!0(?:;|$))[^;]+/.test(
      globalThis.document?.cookie ?? ""
    );
  }

  async function openAccount() {
    // The first click is where a visitor who wants an account pays for one.
    if (!clerkReady) {
      headerSignIn.setAttribute("aria-busy", "true");
      heroSignIn.setAttribute("aria-busy", "true");
      await syncAccount();
      headerSignIn.removeAttribute("aria-busy");
      heroSignIn.removeAttribute("aria-busy");
      if (!clerkAvailable) return;
    }
    if (clerkBrowser.user) {
      await clerkBrowser.openUserProfile();
      return;
    }
    if (await clerkBrowser.openSignIn()) {
      authStatus.hidden = true;
      return;
    }
    authStatus.hidden = false;
    authStatus.textContent =
      "Sign-in is unavailable right now. You can still enter the Maze as a guest.";
  }

  async function syncAccount() {
    clerkReady = true;
    const available = await clerkBrowser.initialize();
    clerkAvailable = available;
    const user = clerkBrowser.user;
    headerSignIn.removeAttribute("aria-busy");
    heroSignIn.removeAttribute("aria-busy");
    if (!available) {
      headerSignIn.disabled = true;
      heroSignIn.disabled = true;
      headerSignIn.textContent = "Sign-in unavailable";
      heroSignIn.textContent = "Sign-in unavailable";
      return;
    }
    headerSignIn.disabled = false;
    heroSignIn.disabled = false;
    if (!user) {
      headerSignIn.textContent = "Sign in";
      heroSignIn.textContent = "Sign in";
      return;
    }
    let explorerName = "Explorer";
    try {
      explorerName = (await playerClient.getProfile()).profile?.username ?? explorerName;
    } catch {
      // Account presentation stays available when the profile service is down.
    }
    headerSignIn.textContent = explorerName;
    heroSignIn.textContent = "Manage Explorer";
  }
}

/**
 * @template {Element} T
 * @param {string} id
 * @param {new () => T} type
 * @returns {T}
 */
function requiredElement(id, type) {
  const element = document.getElementById(id);
  if (!(element instanceof type)) {
    throw new Error(`Expected #${id} to be a ${type.name}.`);
  }
  return element;
}
