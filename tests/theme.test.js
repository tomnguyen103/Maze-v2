import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  applyThemeChoice,
  isThemeChoice,
  nextThemeChoice,
  nextTheme,
  onThemeChoiceChange,
  readThemeChoice,
  resolveTheme,
  THEME_CHOICES,
  THEME_COLORS,
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

  it("survives a localStorage getter that throws", () => {
    // Chrome throws a SecurityError on the getter itself when site data is blocked.
    const original = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      get() {
        throw new Error("SecurityError");
      }
    });
    try {
      const root = fakeRoot();
      expect(readThemeChoice()).toBe("system");
      expect(() => applyThemeChoice("dark", { root })).not.toThrow();
      expect(root.attributes["data-theme"]).toBe("dark");
    } finally {
      if (original) Object.defineProperty(globalThis, "localStorage", original);
      else Reflect.deleteProperty(globalThis, "localStorage");
    }
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

/** The two browser bar metas from `index.html`, as a fake document. */
function fakeThemeColorDocument() {
  const metas = [
    { media: "(prefers-color-scheme: light)", content: THEME_COLORS.light },
    { media: "(prefers-color-scheme: dark)", content: THEME_COLORS.dark }
  ].map((attributes) => ({
    attributes: /** @type {Record<string, string>} */ (attributes),
    getAttribute(/** @type {string} */ name) {
      return this.attributes[name] ?? null;
    },
    setAttribute(/** @type {string} */ name, /** @type {string} */ value) {
      this.attributes[name] = value;
    }
  }));
  return {
    metas,
    querySelectorAll: (/** @type {string} */ selector) =>
      selector === 'meta[name="theme-color"]' ? metas : []
  };
}

describe("the Theme Choice sets the browser bar", () => {
  it("paints both metas dark for a dark choice on a light system", () => {
    // The repro: before the fix the light meta kept its light colour, so a
    // light system showed a light bar above a dark page.
    const document = fakeThemeColorDocument();
    applyThemeChoice("dark", { root: fakeRoot(), storage: fakeStorage(), document });
    expect(document.metas.map((meta) => meta.attributes.content)).toEqual([
      THEME_COLORS.dark,
      THEME_COLORS.dark
    ]);
  });

  it("paints both metas light for a light choice on a dark system", () => {
    const document = fakeThemeColorDocument();
    applyThemeChoice("light", { root: fakeRoot(), storage: fakeStorage(), document });
    expect(document.metas.map((meta) => meta.attributes.content)).toEqual([
      THEME_COLORS.light,
      THEME_COLORS.light
    ]);
  });

  it("gives each meta its own colour back for the system choice", () => {
    const document = fakeThemeColorDocument();
    applyThemeChoice("dark", { root: fakeRoot(), storage: fakeStorage(), document });
    applyThemeChoice("system", { root: fakeRoot(), storage: fakeStorage(), document });
    expect(document.metas.map((meta) => meta.attributes.content)).toEqual([
      THEME_COLORS.light,
      THEME_COLORS.dark
    ]);
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

  it("keeps the page, the boot script, and the module on one bar colour pair", () => {
    // The bar colour is `--color-paper` in each theme, so read it from the tokens.
    const tokens = source("tokens.css");
    const paper = (/** @type {string} */ block) =>
      /** @type {RegExpMatchArray} */ (
        block.match(/--color-paper: (oklch\([^)]*\))/)
      )[1];
    const media = tokens.indexOf("@media (prefers-color-scheme: dark)");
    const forced = tokens.indexOf(':root[data-theme="dark"]');
    expect(THEME_COLORS).toEqual({
      light: paper(tokens.slice(0, media)),
      dark: paper(tokens.slice(forced))
    });
    // The OS-dark bar colour in index.html reads the media block, so it must match too.
    expect(paper(tokens.slice(media, forced))).toBe(THEME_COLORS.dark);
    // The colours live in three files that cannot share an import. This is
    // what stops them drifting.
    const html = source("index.html");
    expect(html).toContain(
      `content="${THEME_COLORS.light}" media="(prefers-color-scheme: light)"`
    );
    expect(html).toContain(
      `content="${THEME_COLORS.dark}" media="(prefers-color-scheme: dark)"`
    );
    const boot = source("public/theme-boot.js");
    expect(boot).toContain(`"${THEME_COLORS.light}"`);
    expect(boot).toContain(`"${THEME_COLORS.dark}"`);
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
    expect(design).toContain("| Role | Light | Night |");
    expect(design).toContain("`theme-color` meta");
  });
});

describe("nextThemeChoice", () => {
  it("cycles light, dark, system, then back to light", () => {
    expect(nextThemeChoice("light")).toBe("dark");
    expect(nextThemeChoice("dark")).toBe("system");
    expect(nextThemeChoice("system")).toBe("light");
  });
});

describe("onThemeChoiceChange", () => {
  function setup(initial = {}) {
    const target = new EventTarget();
    const storage = fakeStorage(initial);
    const root = fakeRoot();
    /** @type {string[]} */
    const seen = [];
    onThemeChoiceChange((choice) => seen.push(choice), {
      target: /** @type {any} */ (target),
      storage,
      root,
      document: { querySelectorAll: () => [] }
    });
    /** @param {string} type @param {object} fields */
    const fire = (type, fields) =>
      target.dispatchEvent(Object.assign(new Event(type), fields));
    return { storage, root, seen, fire };
  }

  it("applies a choice another tab stored, and does not write it back", () => {
    const { storage, root, seen, fire } = setup();
    storage.values[THEME_STORAGE_KEY] = "dark";
    let writes = 0;
    const setItem = storage.setItem;
    storage.setItem = (key, value) => {
      writes += 1;
      setItem(key, value);
    };
    fire("storage", { key: THEME_STORAGE_KEY });
    expect(seen).toEqual(["dark"]);
    expect(root.attributes["data-theme"]).toBe("dark");
    expect(writes).toBe(0);
  });

  it("applies the stored choice when Back restores the page from the cache", () => {
    const { root, seen, fire } = setup({ [THEME_STORAGE_KEY]: "light" });
    fire("pageshow", { persisted: true });
    expect(seen).toEqual(["light"]);
    expect(root.attributes["data-theme"]).toBe("light");
  });

  it("ignores other keys and a fresh page load", () => {
    const { seen, fire } = setup({ [THEME_STORAGE_KEY]: "dark" });
    fire("storage", { key: "echo-maze:other" });
    fire("pageshow", { persisted: false });
    expect(seen).toEqual([]);
  });

  it("keeps the choice in memory when storage is blocked", () => {
    const { storage, seen, fire } = setup();
    storage.getItem = () => {
      throw new Error("blocked");
    };
    fire("pageshow", { persisted: true });
    expect(seen).toEqual([]);
  });

  it("keeps the choice in memory when the storage getter itself throws", () => {
    // A plain target calls the listener directly, so a throw reaches the test.
    /** @type {Record<string, (event: any) => void>} */
    const listeners = {};
    /** @type {string[]} */
    const seen = [];
    onThemeChoiceChange((choice) => seen.push(choice), {
      target: /** @type {any} */ ({
        /** @param {string} type @param {(event: any) => void} listener */
        addEventListener: (type, listener) => {
          listeners[type] = listener;
        }
      }),
      root: fakeRoot(),
      document: { querySelectorAll: () => [] }
    });
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      get() {
        throw new Error("SecurityError");
      }
    });
    try {
      expect(() => listeners.pageshow({ persisted: true })).not.toThrow();
      expect(seen).toEqual([]);
    } finally {
      // @ts-expect-error the stub is an own property this test added
      delete globalThis.localStorage;
    }
  });

  it("keeps a choice that storage refused when Back restores the page", () => {
    const { storage, seen, fire } = setup({ [THEME_STORAGE_KEY]: "light" });
    const refusing = {
      setItem() {
        throw new Error("QuotaExceededError");
      },
      removeItem() {}
    };
    applyThemeChoice("dark", { root: fakeRoot(), storage: refusing, document: null });
    try {
      fire("pageshow", { persisted: true });
      expect(seen).toEqual([]);
    } finally {
      // A write that lands clears the flag for the tests after this one.
      applyThemeChoice("light", { root: fakeRoot(), storage, document: null });
    }
    fire("pageshow", { persisted: true });
    expect(seen).toEqual(["light"]);
  });
});
