import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("Gate legend", () => {
  it("names distinct non-color marks for locked, sealed, and open Gates", async () => {
    const markup = await readFile(new URL("../index.html", import.meta.url), "utf8");

    expect(markup).toContain(
      '<li><span class="legend-mark legend-mark--gate-locked"></span>Locked Gate</li>'
    );
    expect(markup).toContain(
      '<li><span class="legend-mark legend-mark--gate-sealed"></span>Open, sealed Gate</li>'
    );
    expect(markup).toContain(
      '<li><span class="legend-mark legend-mark--gate-open"></span>Open Gate</li>'
    );
  });
});
