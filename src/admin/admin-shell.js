/**
 * The one shell every `/admin` state renders through. Before this, the
 * authorized workbench, the access-check/denial frame, and the
 * chunk-load-failure fallback each built their own skip-link, header, and
 * main landmark independently — three near-duplicates that drifted (only
 * one used the admin-specific chrome; the other two borrowed the marketing
 * `.landing-header`/`.landing-page` classes and read as a different app for
 * a denied Explorer). This is the single owner all three call now (SHELL-11).
 *
 * @param {HTMLElement} root
 * @param {{
 *   state: string,
 *   eyebrow?: string,
 *   exit?: { href: string, label: string },
 *   withRail?: boolean
 * }} options
 * @returns {{ main: HTMLElement, rail: HTMLElement | null }}
 */
export function renderAdminShell(root, { state, eyebrow, exit, withRail = false }) {
  root.dataset.adminState = state;
  root.innerHTML = `
    <a class="skip-link" href="#admin-main">Skip to the admin area</a>
    <header class="admin-command">
      <a class="wordmark" href="/" aria-label="Echo Maze home">Echo Maze</a>
      <div>
        ${eyebrow ? `<p class="admin-command__eyebrow">${eyebrow}</p>` : ""}
        <h1>Admin</h1>
      </div>
      ${exit ? `<a class="admin-command__exit" href="${exit.href}">${exit.label}</a>` : ""}
    </header>
    <div class="admin-layout">
      ${withRail ? '<nav class="admin-rail" aria-label="Admin tools"></nav>' : ""}
      <main class="admin-main" id="admin-main" tabindex="-1"></main>
    </div>
  `;
  return {
    main: /** @type {HTMLElement} */ (root.querySelector(".admin-main")),
    rail: root.querySelector(".admin-rail")
  };
}
