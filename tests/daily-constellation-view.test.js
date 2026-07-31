// @vitest-environment happy-dom

import { beforeEach, describe, expect, it } from "vitest";
import {
  CONSTELLATION_FORMING_MESSAGE,
  createDailyConstellationView
} from "../src/game/daily-constellation-view.js";

/** @returns {{ map: HTMLElement, status: HTMLElement }} */
function elements() {
  document.body.innerHTML = `
    <p id="daily-constellation-status" role="status" aria-live="polite"></p>
    <div id="daily-constellation-map" role="img"></div>
  `;
  const map = document.getElementById("daily-constellation-map");
  const status = document.getElementById("daily-constellation-status");
  if (!map || !status) {
    throw new Error("Constellation fixture is incomplete.");
  }
  return { map, status };
}

describe("Daily Trail Constellation surface", () => {
  /** @type {ReturnType<typeof elements>} */
  let fixture;
  /** @type {ReturnType<typeof createDailyConstellationView>} */
  let view;

  beforeEach(() => {
    fixture = elements();
    view = createDailyConstellationView(fixture);
  });

  it("shows the forming message rather than a sparse map below threshold", () => {
    view.render({ published: false, markers: [] }, { size: 13 });

    expect(fixture.status.textContent).toBe(CONSTELLATION_FORMING_MESSAGE);
    expect(fixture.map.hidden).toBe(true);
    expect(fixture.map.children).toHaveLength(0);
  });

  it("draws one tile per visible marker in its density band", () => {
    view.render(
      {
        published: true,
        markers: [
          { kind: "cell", x: 1, y: 1, band: "bright" },
          { kind: "passage", x: 2, y: 1, band: "glowing" },
          { kind: "pulse", x: 3, y: 1, band: "quiet" }
        ]
      },
      { size: 13 }
    );

    expect(fixture.map.hidden).toBe(false);
    const tiles = [...fixture.map.children];
    expect(tiles).toHaveLength(3);
    expect(tiles.map((tile) => tile.getAttribute("data-band"))).toEqual([
      "bright",
      "glowing",
      "quiet"
    ]);
    expect(tiles.map((tile) => tile.getAttribute("data-kind"))).toEqual([
      "cell",
      "passage",
      "pulse"
    ]);
  });

  it("leaks no count, percentage, identity, time, or answer", () => {
    view.render(
      {
        published: true,
        markers: [
          { kind: "cell", x: 1, y: 1, band: "bright" },
          { kind: "cell", x: 3, y: 1, band: "quiet" }
        ]
      },
      { size: 13 }
    );

    const rendered = fixture.map.outerHTML + fixture.status.outerHTML;
    // Coordinates are grid geometry, carried as CSS custom properties, so the
    // readable surface is checked for numerals rather than the whole markup.
    const readable = [
      fixture.status.textContent ?? "",
      fixture.map.getAttribute("aria-label") ?? "",
      fixture.map.textContent ?? "",
      ...[...fixture.map.children].map(
        (tile) => `${tile.textContent} ${tile.getAttribute("aria-label") ?? ""}`
      )
    ].join(" ");
    expect(readable).not.toMatch(/\d/);
    expect(readable).not.toMatch(/%|contributor|Explorer|second|answer/i);
    expect(rendered).not.toMatch(/contributorCount|username|elapsed/i);
  });

  it("keeps the map out of the accessibility tree tile by tile", () => {
    view.render(
      {
        published: true,
        markers: [{ kind: "cell", x: 1, y: 1, band: "bright" }]
      },
      { size: 13 }
    );

    expect(fixture.map.getAttribute("role")).toBe("img");
    expect(fixture.map.getAttribute("aria-label")).toBe(
      "Daily Trail Constellation: shared paths shown as three density bands."
    );
    for (const tile of fixture.map.children) {
      expect(tile.getAttribute("aria-hidden")).toBe("true");
    }
  });

  it("states plainly when the Constellation could not be read", () => {
    view.renderUnavailable();

    expect(fixture.status.textContent).toBe(
      "The Constellation could not be loaded. Your Daily result is unaffected."
    );
    expect(fixture.map.hidden).toBe(true);
  });

  it("announces one polite status per action", () => {
    expect(fixture.status.getAttribute("aria-live")).toBe("polite");
    view.renderLoading();
    expect(fixture.status.textContent).toBe("Reading today’s Constellation…");
    view.render({ published: false, markers: [] }, { size: 13 });
    expect(fixture.status.textContent).toBe(CONSTELLATION_FORMING_MESSAGE);
  });
});
