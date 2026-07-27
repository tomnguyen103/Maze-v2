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
 * @param {HTMLElement} root
 * @param {{
 *   clerk?: { initialize: () => Promise<boolean>, mirroredRole: unknown },
 *   loadProfile?: () => Promise<unknown>
 * }} [dependencies]
 */
export async function renderAdmin(root, dependencies = {}) {
  const clerk =
    dependencies.clerk ??
    createClerkBrowser({
      onChange: () => {
        window.location.reload();
      }
    });
  const loadProfile =
    dependencies.loadProfile ??
    (() =>
      createPlayerApiClient({ getToken: () => clerkToken(clerk) }).getProfile());

  renderFrame(root, `<p class="admin-status" role="status">Checking access…</p>`);
  // Clerk has to load before the mirror exists; a failure to load is simply an
  // Explorer with no claim, which the guard already denies.
  await callIfPresent(clerk, "initialize");
  const result = await resolveAdminAccess({
    mirroredRole: mirroredRoleOf(clerk),
    loadProfile
  });
  if (result.state === "denied") {
    const copy = DENIAL_COPY[result.reason];
    renderFrame(
      root,
      `<h1>${copy.title}</h1>
       <p>${copy.body}</p>
       <a class="primary-button" href="/">Back to Echo Maze</a>`,
      result.reason
    );
    return result;
  }
  renderFrame(
    root,
    `<h1>Admin</h1>
     <p>Signed in as ${escapeHtml(roleOf(result.access))}.</p>
     <p class="admin-status" role="status">No admin tools are wired up yet.</p>`,
    "allowed"
  );
  return result;
}

/**
 * @param {HTMLElement} root
 * @param {string} inner
 * @param {string} [state]
 */
function renderFrame(root, inner, state = "checking") {
  root.dataset.adminState = state;
  root.innerHTML = `
    <a class="skip-link" href="#admin-main">Skip to the admin area</a>
    <header class="landing-header">
      <a class="wordmark" href="/" aria-label="Echo Maze home">Echo Maze</a>
    </header>
    <main class="landing-page" id="admin-main">
      <p class="section-label">Admin</p>
      ${inner}
    </main>
  `;
}

/** @param {unknown} clerk */
function mirroredRoleOf(clerk) {
  const source = /** @type {Record<string, unknown>} */ (clerk ?? {});
  if ("mirroredRole" in source) {
    return source.mirroredRole;
  }
  return null;
}

/**
 * @param {unknown} target
 * @param {string} method
 */
async function callIfPresent(target, method) {
  const source = /** @type {Record<string, unknown>} */ (target ?? {});
  const candidate = source[method];
  if (typeof candidate !== "function") {
    return null;
  }
  try {
    return await candidate.call(target);
  } catch {
    return null;
  }
}

/** @param {unknown} clerk */
async function clerkToken(clerk) {
  const token = await callIfPresent(clerk, "getToken");
  return typeof token === "string" ? token : null;
}

/** @param {unknown} access */
function roleOf(access) {
  const role = /** @type {Record<string, unknown>} */ (access ?? {}).role;
  return typeof role === "string" ? role : "staff";
}

/** @param {string} value */
function escapeHtml(value) {
  return value.replace(
    /[&<>"']/g,
    (character) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
      })[character] ?? character
  );
}
