/**
 * Which surface the app is lit with: `light`, `dark`, or `system`.
 *
 * `design.md` makes System the default and requires the choice to be applied
 * before first paint, so the reading and stamping live in a blocking script
 * in `index.html`. This module is the part that runs afterwards — reading the
 * stored preference back, changing it, and keeping a `system` choice in step
 * with the OS while the tab is open.
 *
 * @typedef {"light" | "dark" | "system"} ThemeChoice
 */

export const THEME_STORAGE_KEY = "echo-maze:theme";

/** @type {readonly ThemeChoice[]} */
export const THEME_CHOICES = Object.freeze(["system", "light", "dark"]);

/** @param {unknown} value @returns {value is ThemeChoice} */
export function isThemeChoice(value) {
  return (
    value === "light" || value === "dark" || value === "system"
  );
}

/**
 * The stored choice, or `system` when there is none or the stored value is
 * not one we recognise. A corrupted entry is a reason to fall back, never to
 * throw on a code path that runs before the page paints.
 *
 * @param {Pick<Storage, "getItem">} [storage]
 * @returns {ThemeChoice}
 */
export function readThemeChoice(storage = globalThis.localStorage) {
  try {
    const stored = storage?.getItem(THEME_STORAGE_KEY);
    return isThemeChoice(stored) ? stored : "system";
  } catch {
    // Private browsing, a blocked origin, a full quota: none of them are a
    // reason for the page not to render.
    return "system";
  }
}

/**
 * The surface a choice resolves to right now.
 *
 * @param {ThemeChoice} choice
 * @param {boolean} systemPrefersDark
 * @returns {"light" | "dark"}
 */
export function resolveTheme(choice, systemPrefersDark) {
  if (choice === "light" || choice === "dark") {
    return choice;
  }
  return systemPrefersDark ? "dark" : "light";
}

/**
 * The theme a control should offer next, and the one its icon should show.
 * One button, one tap: whatever is on screen now, this is the other one.
 *
 * @param {"light" | "dark"} current
 * @returns {"light" | "dark"}
 */
export function nextTheme(current) {
  return current === "dark" ? "light" : "dark";
}

/**
 * Apply a choice: stamp the root so CSS can see it, and remember it.
 *
 * `system` removes the attribute rather than writing one, so the media query
 * takes over again — writing `data-theme="light"` for a system-light visitor
 * would silently pin them to light when their OS later changed.
 *
 * @param {ThemeChoice} choice
 * @param {{
 *   root?: Pick<HTMLElement, "setAttribute" | "removeAttribute"> | null,
 *   storage?: Pick<Storage, "setItem" | "removeItem">
 * }} [options]
 */
export function applyThemeChoice(choice, options = {}) {
  const root = options.root ?? globalThis.document?.documentElement;
  const storage = options.storage ?? globalThis.localStorage;
  if (root) {
    if (choice === "system") {
      root.removeAttribute("data-theme");
    } else {
      root.setAttribute("data-theme", choice);
    }
  }
  try {
    if (choice === "system") {
      storage?.removeItem(THEME_STORAGE_KEY);
    } else {
      storage?.setItem(THEME_STORAGE_KEY, choice);
    }
  } catch {
    // The preference is a convenience; failing to persist it must not break
    // the change the player just asked for.
  }
}
