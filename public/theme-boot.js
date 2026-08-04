/*
 * Applies the player's stored theme before the first paint.
 *
 * Loaded synchronously from `index.html`'s head, ahead of the stylesheet, so
 * the attribute is on the root element before anything is painted. With no
 * stored choice the attribute is absent and the `prefers-color-scheme` query
 * in `tokens.css` decides, which is what makes System the default.
 *
 * Deliberately not a module and deliberately not inline: `script-src` is
 * `'self'` with neither `'unsafe-inline'` nor a nonce, and this runs before
 * the bundle exists. It duplicates one storage key and two string comparisons
 * from `src/player/theme.js`; `tests/theme.test.js` fails if the two drift.
 */
(function () {
  try {
    var stored = window.localStorage.getItem("echo-maze:theme");
    if (stored === "light" || stored === "dark") {
      document.documentElement.setAttribute("data-theme", stored);
    }
  } catch (error) {
    // Private browsing or a blocked origin. The media query decides, and the
    // page renders either way — this must never be the reason it does not.
  }
})();
