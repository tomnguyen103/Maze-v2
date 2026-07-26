import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("Gate legend", () => {
  it("names distinct non-color marks for locked, sealed, and open Gates", async () => {
    const markup = await readFile(new URL("../index.html", import.meta.url), "utf8");

    expect(markup).toContain("legend-mark--gate-locked");
    expect(markup).toContain(">Locked Gate</li>");
    expect(markup).toContain("legend-mark--gate-sealed");
    expect(markup).toContain(">Open, sealed Gate</li>");
    expect(markup).toContain("legend-mark--gate-open");
    expect(markup).toContain(">Open Gate</li>");
  });
});
