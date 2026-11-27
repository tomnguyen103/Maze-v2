import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const markup = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const legend = markup.slice(markup.indexOf('<div class="legend"'), markup.indexOf('<p class="field-note"'));
const items = [...legend.matchAll(/<li[^>]*><span class="legend-mark ([\w-]+)"><\/span>([^<]+)<\/li>/g)].map(
  (hit) => ({ mark: hit[1], label: hit[2].trim() })
);

describe("Map marks legend", () => {
  it("B-12 lists one item per Warden Mode, each with its own mark", () => {
    for (const mode of ["patrol", "hunt", "intercept", "lured"]) {
      const label = mode[0].toUpperCase() + mode.slice(1);
      expect(items).toContainEqual({ mark: `legend-mark--warden-${mode}`, label });
    }
    expect(items.some((item) => item.label === "Warden")).toBe(false);
  });

  it("B-12 and B-48 list the Danger line and the Pulse tiles", () => {
    expect(items).toContainEqual({ mark: "legend-mark--danger", label: "Danger line" });
    expect(items).toContainEqual({ mark: "legend-mark--pulse", label: "Pulse tiles" });
  });

  it("lists the terrain marks and lists no telegraph or Memory dot", () => {
    const labels = items.map((item) => item.label);
    expect(labels).toEqual(expect.arrayContaining(["Passage", "Land", "Coastline", "Fog"]));
    expect(legend).not.toMatch(/telegraph|memory/i);
  });

  it("gives each swatch a rule in the shared styles", () => {
    const css = readFileSync(new URL("../src/daylight.css", import.meta.url), "utf8");
    for (const { mark } of items) expect(css).toContain(`.${mark}`);
  });
});
