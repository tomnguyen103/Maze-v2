import { readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

describe("popup landing hero", () => {
  const read = (/** @type {string} */ file) =>
    readFileSync(fileURLToPath(new URL(`../${file}`, import.meta.url)), "utf8");

  for (const file of ["index.html", "src/landing/landing-controller.js"]) {
    it(`names the Popup hero images in ${file}`, () => {
      const text = read(file);
      expect(text).toContain("/landing-popup-light.webp");
      expect(text).toContain("/landing-popup-night.webp");
      expect(text).not.toContain("landing-chart-");
    });
  }

  for (const name of ["light", "night"]) {
    it(`keeps landing-popup-${name}.webp within 40 KB and 640x480`, () => {
      const file = fileURLToPath(
        new URL(`../public/landing-popup-${name}.webp`, import.meta.url)
      );
      expect(statSync(file).size).toBeLessThanOrEqual(40960);
      const head = readFileSync(file).subarray(0, 32);
      expect(head.toString("ascii", 0, 4)).toBe("RIFF");
      expect(head.toString("ascii", 8, 12)).toBe("WEBP");
      const kind = head.toString("ascii", 12, 16);
      let size;
      if (kind === "VP8 ") {
        expect([...head.subarray(23, 26)]).toEqual([0x9d, 0x01, 0x2a]);
        size = [head.readUInt16LE(26) & 0x3fff, head.readUInt16LE(28) & 0x3fff];
      } else if (kind === "VP8L") {
        const bits = head.readUInt32LE(21);
        size = [(bits & 0x3fff) + 1, ((bits >> 14) & 0x3fff) + 1];
      } else {
        expect(kind).toBe("VP8X");
        size = [head.readUIntLE(24, 3) + 1, head.readUIntLE(27, 3) + 1];
      }
      expect(size).toEqual([640, 480]);
    });
  }
});

describe("look fonts (D9)", () => {
  /** @param {string} path */
  const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

  /** @param {string} path @param {RegExp} rule */
  const ruleBody = (path, rule) => {
    const match = read(path).match(rule);
    expect(match, `${path} has no rule ${rule}`).not.toBeNull();
    return match?.[1] ?? "";
  };

  it("defines --font-code as Geist Mono", () => {
    expect(read("src/looks/popup/tokens.css")).toContain(
      '--font-code: "Geist Mono Variable", "Courier New", monospace;'
    );
  });

  it("sets the Popup readout font to Andika", () => {
    const popupUtility = ruleBody("src/looks/popup/tokens.css", /--font-utility: ([^;]+);/);
    expect(popupUtility).toContain("Andika");
    expect(popupUtility).not.toContain("Geist");
  });

  it("sets the seed code and the admin textarea to --font-code", () => {
    expect(ruleBody("src/daylight.css", /\.seed-copy strong \{([^}]*)\}/)).toContain(
      "var(--font-code)"
    );
    expect(ruleBody("src/admin/admin.css", /\.admin-field textarea \{([^}]*)\}/)).toContain(
      "var(--font-code)"
    );
    expect(
      ruleBody("src/game/game-dialogs.css", /\.run-records \.run-records__seed \{([^}]*)\}/)
    ).toContain("var(--font-code)");
    expect(ruleBody("src/looks/popup/surface.css", /:root #result-seed \{([^}]*)\}/)).toContain(
      "var(--font-code)"
    );
  });
});

describe("one look", () => {
  it("leaves no look flag, alias, or Pilot path in the build sources", () => {
    const root = fileURLToPath(new URL("../", import.meta.url));
    /** @param {string} dir @returns {string[]} */
    const walk = (dir) =>
      readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
        const path = `${dir}/${entry.name}`;
        return entry.isDirectory() ? walk(path) : [path];
      });
    const files = [
      ...["src", "scripts", "public"].flatMap((dir) => walk(`${root}${dir}`)),
      `${root}index.html`,
      `${root}vite.config.mjs`
    ].filter((file) => !/\.(webp|png|woff2?|ico)$/.test(file));
    const banned = ["@look/", "looks/pilot", "VITE_LOOK"];
    for (const file of files) {
      const text = readFileSync(file, "utf8");
      for (const word of banned) {
        expect(text.includes(word), `${file} contains ${word}`).toBe(false);
      }
    }
  });
});
