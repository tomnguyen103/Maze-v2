import { resolveAdminAccess } from "./admin-access.js";
import { createClerkBrowser } from "../player/clerk-browser.js";
import { createPlayerApiClient } from "../player/player-client.js";

const DENIAL_COPY = {
  role: {
    title: "This area is for staff.",
    body: "Sign in with a staff account to reach the admin area. Your Quest is unaffected."
  },
  profile: {
    title: "This area is for staff.",
    body: "This account does not have an admin role. If that is wrong, ask an admin to grant it."
  },
  unavailable: {
    title: "Admin is unavailable.",
    body: "The role could not be confirmed just now. Reload to try again."
  }
};

/**
 * The `/admin` shell. Phase 7's dashboard hangs off this; today it renders the
 * frame and the guard, and nothing here fetches admin data — a denied Explorer
 * causes no admin request at all.
 *
 * Staff, not admins alone: the gate is `audit:read`, so a moderator reaches the
 * shell and then sees only what their own permissions allow, the same way
 * `isStaff` gates staff UI elsewhere.
 *
 * @param {HTMLElement} root
 * @param {{
 *   clerk?: { initialize: () => Promise<boolean>, mirroredRole: unknown },
 *   createClerk?: (options?: { onChange?: () => void }) => {
 *     initialize: () => Promise<boolean>,
 *     mirroredRole: unknown
 *   },
 *   loadProfile?: () => Promise<unknown>
 * }} [dependencies]
 */
export async function renderAdmin(root, dependencies = {}) {
  // Called with no options on purpose. createClerkBrowser fires onChange on
  // every load rather than only on a real auth change, so a reloading callback
  // here would loop forever; this page has no sign-in affordance to change
  // state from anyway. Phase 7 revisits that when it adds one.
  const createClerk = dependencies.createClerk ?? createClerkBrowser;
  const clerk = dependencies.clerk ?? createClerk();
  const loadProfile =
    dependencies.loadProfile ??
    (() =>
      createPlayerApiClient({
        getToken: async () => {
          const token = await /** @type {{ getToken?: () => Promise<unknown> }} */ (
            clerk
          ).getToken?.();
          return typeof token === "string" ? token : null;
        }
      }).getProfile());

  renderFrame(root, "Checking access…");
  // Clerk has to load before the mirror exists. A failure to load leaves an
  // Explorer with no claim, which the guard already denies.
  try {
    await clerk.initialize();
  } catch {
    // Denial is the right outcome, so there is nothing to report here.
  }
  const result = await resolveAdminAccess({
    mirroredRole: clerk.mirroredRole,
    loadProfile
  });
  if (result.state === "denied") {
    const copy = DENIAL_COPY[result.reason];
    renderFrame(root, copy.body, result.reason, copy.title, true);
    return result;
  }
  renderFrame(
    root,
    "No admin tools are wired up yet.",
    "allowed",
    "Admin",
    false,
    `Signed in as ${roleOf(result.access)}.`
  );
  return result;
}

/**
 * Dynamic text goes in through `textContent`, never through the template, so
 * a role string out of Clerk cannot become markup.
 *
 * @param {HTMLElement} root
 * @param {string} status
 * @param {string} [state]
 * @param {string} [title]
 * @param {boolean} [withHomeLink]
 * @param {string} [detail]
 */
function renderFrame(
  root,
  status,
  state = "checking",
  title = "Admin",
  withHomeLink = false,
  detail = ""
) {
  root.dataset.adminState = state;
  root.innerHTML = `
    <a class="skip-link" href="#admin-main">Skip to the admin area</a>
    <header class="landing-header">
      <a class="wordmark" href="/" aria-label="Echo Maze home">Echo Maze</a>
    </header>
    <main class="landing-page" id="admin-main">
      <p class="section-label">Admin</p>
      <h1 id="admin-title"></h1>
      <p id="admin-detail"${detail ? "" : " hidden"}></p>
      <p class="admin-status" id="admin-status" role="status"></p>
      ${withHomeLink ? '<a class="primary-button" href="/">Back to Echo Maze</a>' : ""}
    </main>
  `;
  setText(root, "#admin-title", title);
  setText(root, "#admin-detail", detail);
  setText(root, "#admin-status", status);
}

/**
 * @param {HTMLElement} root
 * @param {string} selector
 * @param {string} text
 */
function setText(root, selector, text) {
  const element = root.querySelector(selector);
  if (element) {
    element.textContent = text;
  }
}

/** @param {unknown} access */
function roleOf(access) {
  const role = /** @type {Record<string, unknown>} */ (access ?? {}).role;
  return typeof role === "string" ? role : "staff";
}
