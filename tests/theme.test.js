import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  applyThemeChoice,
  isThemeChoice,
  nextTheme,
  readThemeChoice,
  resolveTheme,
  THEME_CHOICES,
  THEME_STORAGE_KEY
} from "../src/player/theme.js";

/** @param {string} relative */
function source(relative) {
  return readFileSync(
    fileURLToPath(new URL(`../${relative}`, import.meta.url)),
    "utf8"
  );
}

function fakeStorage(initial = {}) {
  /** @type {Record<string, string>} */
  const values = { ...initial };
  return {
    getItem: (/** @type {string} */ key) => values[key] ?? null,
    setItem: (/** @type {string} */ key, /** @type {string} */ value) => {
      values[key] = value;
    },
    removeItem: (/** @type {string} */ key) => {
      delete values[key];
    },
    values
  };
}

function fakeRoot() {
  /** @type {Record<string, string>} */
  const attributes = {};
  return {
    attributes,
    setAttribute: (/** @type {string} */ name, /** @type {string} */ value) => {
      attributes[name] = value;
    },
    removeAttribute: (/** @type {string} */ name) => {
      delete attributes[name];
    }
  };
}

describe("theme choice", () => {
  it("defaults to system", () => {
    expect(readThemeChoice(fakeStorage())).toBe("system");
    expect(THEME_CHOICES[0]).toBe("system");
  });

  it("falls back to system rather than trusting a corrupted value", () => {
    expect(readThemeChoice(fakeStorage({ [THEME_STORAGE_KEY]: "dusk" }))).toBe(
      "system"
    );
    expect(isThemeChoice("dusk")).toBe(false);
  });

  it("never throws when storage is unreachable", () => {
    // Private browsing and blocked origins both do this, and neither is a
    // reason for the page not to render.
    const hostile = {
      getItem: () => {
        throw new Error("blocked");
      }
    };
    expect(readThemeChoice(hostile)).toBe("system");
  });

  it("resolves system against the OS and an explicit choice against nothing", () => {
    expect(resolveTheme("system", true)).toBe("dark");
    expect(resolveTheme("system", false)).toBe("light");
    // An explicit choice wins in both directions: choosing Light on a dark OS
    // has to actually give light.
    expect(resolveTheme("light", true)).toBe("light");
    expect(resolveTheme("dark", false)).toBe("dark");
  });

  it("offers the other surface, so one control is one tap", () => {
    expect(nextTheme("light")).toBe("dark");
    expect(nextTheme("dark")).toBe("light");
  });

  it("stamps an explicit choice and stores it", () => {
    const root = fakeRoot();
    const storage = fakeStorage();
    applyThemeChoice("dark", { root, storage });
    expect(root.attributes["data-theme"]).toBe("dark");
    expect(storage.values[THEME_STORAGE_KEY]).toBe("dark");
  });

  it("removes both when the choice is system", () => {
    // Writing `data-theme="light"` for a system-light visitor would pin them
    // to light the day their OS changed.
    const root = fakeRoot();
    const storage = fakeStorage({ [THEME_STORAGE_KEY]: "dark" });
    applyThemeChoice("system", { root, storage });
    expect(root.attributes["data-theme"]).toBeUndefined();
    expect(storage.values[THEME_STORAGE_KEY]).toBeUndefined();
  });

  it("keeps the change when storage refuses to persist it", () => {
    const root = fakeRoot();
    const hostile = {
      setItem: () => {
        throw new Error("quota");
      },
      removeItem: () => {
        throw new Error("quota");
      }
    };
    expect(() =>
      applyThemeChoice("dark", { root, storage: hostile })
    ).not.toThrow();
    expect(root.attributes["data-theme"]).toBe("dark");
  });
});

describe("SHELL-07 — the theme is applied before first paint", () => {
  it("loads the boot script synchronously, ahead of the bundle", () => {
    const html = source("index.html");
    const boot = html.indexOf('<script src="/theme-boot.js"></script>');
    expect(boot).toBeGreaterThan(-1);
    // No `defer` and no `type="module"`: both would run after parsing, which
    // is a flash of the wrong theme.
    expect(html.slice(boot - 10, boot + 60)).not.toContain("defer");
    expect(html.slice(boot, boot + 60)).not.toContain("module");
    expect(boot).toBeLessThan(html.indexOf("</head>"));
  });

  it("does not reach for an inline script the CSP forbids", () => {
    // `script-src` is `'self'` with neither `'unsafe-inline'` nor a nonce,
    // and that is a deliberate decision this feature must not spend.
    const headers = source("server/security-headers.js");
    expect(headers).toContain('["script-src"');
    const scriptSrc = headers.slice(headers.indexOf('["script-src"'));
    expect(scriptSrc.slice(0, 120)).not.toContain("unsafe-inline");
  });

  it("keeps the boot script and the module on one storage key", () => {
    // The boot script cannot import the module — it runs before the bundle
    // exists — so the key is duplicated. This is what stops it drifting.
    expect(source("public/theme-boot.js")).toContain(
      `"${THEME_STORAGE_KEY}"`
    );
  });
});

describe("SHELL-07 — night is declared, and both ways", () => {
  it("stops hard-locking the light surface", () => {
    const tokens = source("tokens.css");
    // `color-scheme: light` on :root with no dark branch is what made the
    // OS-dark screenshot byte-identical to the light one.
    expect(tokens).toContain("@media (prefers-color-scheme: dark)");
    expect(tokens).toContain(':root[data-theme="dark"]');
  });

  it("lets an explicit choice win over the OS in both directions", () => {
    const tokens = source("tokens.css");
    // Without the `:not([data-theme="light"])`, a light choice on a dark OS
    // would still resolve dark.
    expect(tokens).toContain(':root:not([data-theme="light"])');
  });

  it("keeps the two declarations in step", () => {
    const tokens = source("tokens.css");
    const mediaAt = tokens.indexOf("@media (prefers-color-scheme: dark)");
    const explicitAt = tokens.lastIndexOf(':root[data-theme="dark"]');
    expect(mediaAt).toBeLessThan(explicitAt);
    const media = tokens.slice(mediaAt, explicitAt);
    const explicit = tokens.slice(explicitAt);
    const declared = (/** @type {string} */ block) =>
      [...block.matchAll(/(--[a-z0-9-]+):/g)].map((match) => match[1]).sort();
    expect(declared(explicit)).toEqual(declared(media));
    expect(declared(explicit).length).toBeGreaterThan(20);
  });

  it("says so in the design system it amends", () => {
    const design = source("design.md");
    expect(design).toContain("**Night**");
    expect(design).toContain("prefers-color-scheme");
  });
});
