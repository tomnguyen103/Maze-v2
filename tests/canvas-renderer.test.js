// @vitest-environment happy-dom

import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createCanvasRenderer } from "../src/game/canvas-renderer.js";
import { createRun } from "../src/game/game-session.js";
import { getLabyrinthConfig } from "../src/questions/quest-levels.js";
import { getQuestRunRuleset } from "../src/game/run-ruleset.js";

/**
 * Builds a recording 2D context and a canvas that returns it.
 * @param {{ width?: number, neatline?: boolean | "no-overlay" | "no-context" }} [options]
 */
function stubCanvas({ width = 640, neatline = false } = {}) {
  /** @type {string[]} */
  const labels = [];
  /** @type {Array<{ x: number, y: number, w: number, h: number }>} */
  const fillRects = [];
  /** @type {string[]} */
  const calls = [];
  const record = (/** @type {string} */ name) =>
    vi.fn(() => {
      calls.push(name);
    });
  const context = {
    arc: record("arc"),
    beginPath: record("beginPath"),
    clearRect: vi.fn(),
    closePath: record("closePath"),
    createPattern: vi.fn(() => ({ pattern: true })),
    createRadialGradient: vi.fn(() => ({ addColorStop: vi.fn() })),
    fill: record("fill"),
    fillRect: vi.fn((x, y, w, h) => {
      calls.push("fillRect");
      fillRects.push({ x, y, w, h });
    }),
    fillText: vi.fn((text) => labels.push(text)),
    lineTo: record("lineTo"),
    moveTo: record("moveTo"),
    restore: vi.fn(),
    rotate: vi.fn(),
    save: vi.fn(),
    setLineDash: vi.fn(),
    stroke: record("stroke"),
    rect: record("rect"),
    translate: vi.fn()
  };
  const canvas = {
    getBoundingClientRect: () => ({ width, height: width }),
    getContext: () => context,
    height: 640,
    width: 640
  };
  /** @type {Array<{ width: number, height: number, fills: Array<{ style: string, x: number, y: number, w: number, h: number }> }>} */
  const tiles = [];
  const createTile = (/** @type {number} */ tileWidth, /** @type {number} */ tileHeight) => {
    /** @type {Array<{ style: string, x: number, y: number, w: number, h: number }>} */
    const fills = [];
    const tileContext = {
      fillStyle: "",
      fillRect(/** @type {number} */ x, /** @type {number} */ y, /** @type {number} */ w, /** @type {number} */ h) {
        fills.push({ style: tileContext.fillStyle, x, y, w, h });
      }
    };
    const tile = { width: tileWidth, height: tileHeight, fills, getContext: () => tileContext };
    tiles.push(tile);
    return /** @type {never} */ (tile);
  };
  // The Neatline overlay sits beside the canvas inside an 18 pixel margin.
  /** @type {string[]} */
  const neatLabels = [];
  /** @type {string[]} */
  const neatFonts = [];
  /** @type {string[]} */
  const neatPaths = [];
  /** @type {Array<{ text: string, x: number, y: number, align: string, baseline: string }>} */
  const neatTexts = [];
  /** @type {number[][]} */
  const neatRects = [];
  const neatContext = {
    beginPath: vi.fn(() => neatPaths.push("beginPath")),
    clearRect: vi.fn(),
    fillStyle: "",
    fillText: vi.fn((/** @type {string} */ text, /** @type {number} */ x, /** @type {number} */ y) => {
      neatLabels.push(text);
      neatTexts.push({ text, x, y, align: neatContext.textAlign, baseline: neatContext.textBaseline });
    }),
    font: "",
    lineTo: vi.fn(() => neatPaths.push("lineTo")),
    lineWidth: 0,
    moveTo: vi.fn(() => neatPaths.push("moveTo")),
    stroke: vi.fn(() => neatPaths.push("stroke")),
    strokeRect: vi.fn((/** @type {number[]} */ ...rect) => {
      neatPaths.push("strokeRect");
      neatRects.push(rect);
    }),
    strokeStyle: "",
    textAlign: "",
    textBaseline: ""
  };
  const overlay = {
    width: 0,
    height: 0,
    getContext: () => (neatline === "no-context" ? null : neatContext)
  };
  if (neatline) {
    Object.defineProperty(neatContext, "font", {
      get: () => neatFonts.at(-1) ?? "",
      set: (value) => {
        neatFonts.push(value);
      }
    });
    Object.assign(canvas, {
      getBoundingClientRect: () => ({ left: 18, top: 18, width, height: width }),
      parentElement: {
        getBoundingClientRect: () => ({ left: 0, top: 0, width: width + 36, height: width + 36 }),
        querySelector: () => (neatline === "no-overlay" ? null : overlay)
      }
    });
  }
  const renderer = createCanvasRenderer(
    /** @type {HTMLCanvasElement} */ (/** @type {unknown} */ (canvas)),
    createTile
  );
  return {
    calls,
    context,
    fillRects,
    labels,
    neat: { context: neatContext, fonts: neatFonts, labels: neatLabels, overlay, paths: neatPaths, rects: neatRects, texts: neatTexts },
    renderer,
    tiles
  };
}

/** @param {string} seed @param {string} level @param {number} quest */
function questRun(seed, level, quest) {
  return createRun(seed, {
    ...getLabyrinthConfig(level, quest),
    ruleset: getQuestRunRuleset(quest)
  });
}

const tokensCss = readFileSync(resolve(process.cwd(), "tokens.css"), "utf8");

/** @param {string} selector */
function scopeOf(selector) {
  const start = tokensCss.indexOf(selector);
  return tokensCss.slice(start, tokensCss.indexOf("}", start));
}
const LIGHT = scopeOf(":root {");
// Night appears twice in tokens.css: the system-dark media block and the explicit dark block.
const NIGHT_SYSTEM = scopeOf(':root:not([data-theme="light"]) {');
const NIGHT_EXPLICIT = tokensCss.slice(tokensCss.indexOf(':root[data-theme="dark"] {'));

/**
 * Reads one canvas token from a scope and throws when it is absent.
 * @param {string} scope
 * @param {string} name
 */
function canvasToken(scope, name) {
  const hit = scope.match(new RegExp(`${name}:\\s*([^;]+);`));
  if (!hit) throw new Error(`missing token ${name}`);
  return hit[1].trim();
}

const SCOPES = [LIGHT, NIGHT_SYSTEM, NIGHT_EXPLICIT];

/** Every token a board mark reads, one row per mark (design.md palette rows). */
const BOARD_ROWS = [
  "--color-land",
  "--color-hatch",
  "--color-coastline",
  "--color-passage",
  "--color-fog",
  "--color-fog-dot",
  "--color-board-explorer-ring",
  "--color-danger-line",
  "--color-board-warden",
  "--color-board-light"
];

/**
 * Parses an `oklch(L% C H)` value into oklab [L, a, b].
 * @param {string} value
 * @returns {number[]}
 */
function oklabOf(value) {
  const hit = value.match(/^oklch\(([\d.]+)(%?) ([\d.]+) ([\d.]+)\)$/);
  if (!hit) throw new Error(`not an oklch value: ${value}`);
  const hue = (Number(hit[4]) * Math.PI) / 180;
  return [
    Number(hit[1]) / (hit[2] ? 100 : 1),
    Number(hit[3]) * Math.cos(hue),
    Number(hit[3]) * Math.sin(hue)
  ];
}

const unit = (/** @type {number} */ value) => Math.min(1, Math.max(0, value));

const daylightCss = readFileSync(resolve(process.cwd(), "src/daylight.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");

/**
 * Reads every `--name: value;` row of a CSS block into a map.
 * @param {string} block
 * @returns {Map<string, string>}
 */
function declarationsOf(block) {
  return new Map([...block.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)].map((hit) => [hit[1], hit[2].trim()]));
}

/**
 * Reads the rows of every daylight.css rule whose selector list holds `selector`, in file order.
 * @param {string} selector
 */
function daylightScope(selector) {
  /** @type {Map<string, string>} */
  const rows = new Map();
  for (const rule of daylightCss.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    if (!rule[1].split(",").some((part) => part.trim() === selector)) continue;
    for (const [name, value] of declarationsOf(rule[2])) rows.set(name, value);
  }
  return rows;
}

const LIGHT_TOKENS = declarationsOf(LIGHT);
const THEMES = /** @type {Record<string, Map<string, string>>} */ ({
  light: LIGHT_TOKENS,
  night: new Map([...LIGHT_TOKENS, ...declarationsOf(NIGHT_EXPLICIT)])
});
const MODES = /** @type {Record<string, string | null>} */ ({
  default: null,
  twilight: ':root[data-playground-palette="twilight"]',
  "sea-glass": ':root[data-playground-palette="sea-glass"]',
  dusk: ':root[data-playground-palette="dusk"]',
  strong: ':root[data-access-contrast="strong"]'
});
const EXPLORER_PALETTES = /** @type {Record<string, string | null>} */ ({
  default: null,
  sunset: ':root[data-explorer-palette="sunset"]',
  violet: ':root[data-explorer-palette="violet"]',
  gold: ':root[data-explorer-palette="gold"]'
});
const DISC = "--color-board-explorer-disc";

/**
 * Resolves a token through `var()` to an oklab colour with its alpha.
 * @param {Map<string, string>} tokens
 * @param {string} name
 * @returns {{ lab: number[], alpha: number }}
 */
function resolveColor(tokens, name) {
  const value = tokens.get(name);
  if (value === undefined) throw new Error(`missing token ${name}`);
  const reference = value.match(/^var\((--[\w-]+)\)$/);
  if (reference) return resolveColor(tokens, reference[1]);
  const [color, alpha] = value.split(" / ");
  return {
    lab: oklabOf(alpha ? `${color})` : color),
    alpha: alpha ? Number.parseFloat(alpha) / 100 : 1
  };
}

/** @param {number[]} lab */
function gammaRgb([L, a, b]) {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s
  ].map((channel) => {
    const linear = unit(channel);
    return linear <= 0.0031308 ? 12.92 * linear : 1.055 * linear ** (1 / 2.4) - 0.055;
  });
}

/** @param {number[]} rgb */
function luminanceOf(rgb) {
  const [red, green, blue] = rgb.map((channel) =>
    channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
  );
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

/**
 * Contrast of a mark over an opaque ground. A translucent mark blends in gamma sRGB, as a canvas does.
 * @param {{ lab: number[], alpha: number }} mark
 * @param {{ lab: number[], alpha: number }} ground
 */
function contrastOver(mark, ground) {
  const under = gammaRgb(ground.lab);
  const blended = gammaRgb(mark.lab).map((channel, index) => channel * mark.alpha + under[index] * (1 - mark.alpha));
  const [light, dark] = [luminanceOf(blended), luminanceOf(under)].sort((x, y) => y - x);
  return (light + 0.05) / (dark + 0.05);
}

/** Board contrast pairs: a mark, the ground it sits on, and its floor in default and strong modes. */
const BOARD_PAIRS = /** @type {const} */ ([
  ["--color-coastline", "--color-passage", 3],
  ["--color-coastline", "--color-land", 3],
  ["--color-board-explorer-ring", "--color-passage", 3],
  ["--color-board-warden", "--color-passage", 3],
  ["--color-danger-line", "--color-passage", 3],
  ["--color-board-gate", "--color-passage", 3],
  ["--color-board-echo", "--color-passage", 3],
  ["--color-board-light", "--color-passage", 3],
  ["--color-fog-dot", "--color-fog", 3],
  // The disc follows the theme paper, so its pairs keep the 3:1 floor in every mode.
  ["--color-explorer", DISC, 3],
  ["--color-board-explorer-ring", DISC, 3],
  // Pulse is a wash, so it needs only to show.
  ["--color-pulse", "--color-passage", 1.2],
  ["--color-pulse", "--color-land", 1.2]
]);

/**
 * Records every fill and stroke with its paint style and the path behind it.
 * @param {ReturnType<typeof stubCanvas>["context"]} context
 */
function recordPaints(context) {
  /** @type {Array<{ kind: "fill" | "stroke", style: string, path: string[] }>} */
  const paints = [];
  let fill = "";
  let stroke = "";
  /** @type {string[]} */
  let path = [];
  Object.defineProperty(context, "fillStyle", {
    configurable: true,
    get: () => fill,
    set: (value) => {
      fill = value;
    }
  });
  Object.defineProperty(context, "strokeStyle", {
    configurable: true,
    get: () => stroke,
    set: (value) => {
      stroke = value;
    }
  });
  context.beginPath = vi.fn(() => {
    path = [];
  });
  for (const name of ["moveTo", "lineTo", "arc", "rect", "closePath"]) {
    /** @type {Record<string, unknown>} */ (context)[name] = vi.fn((...args) => {
      path.push(`${name}(${args.map((arg) => Number(arg).toFixed(2)).join(",")})`);
    });
  }
  context.fill = vi.fn(() => {
    paints.push({ kind: "fill", style: fill, path: [...path] });
  });
  context.stroke = vi.fn(() => {
    paints.push({ kind: "stroke", style: stroke, path: [...path] });
  });
  return paints;
}

/**
 * A 2x2 board with one passage at 0,0 and nothing else drawn but the Explorer.
 * @param {Partial<ReturnType<typeof questRun>>} overrides
 */
function board(overrides) {
  return {
    ...questRun("PAPER-BOARD", "trail-scout", 9),
    echoBridges: [],
    echoes: [],
    gate: { row: 9, col: 9, open: false },
    labyrinth: [
      [1, 0],
      [0, 0]
    ],
    pulseVisible: [],
    revealed: [],
    signalBells: [],
    tideDoors: [],
    wardens: [],
    windways: [],
    ...overrides
  };
}

describe("Canvas renderer", () => {
  afterEach(() => {
    document.body.removeAttribute("style");
  });

  it("draws numbered Echo Bridge pairs through Fog", () => {
    const { labels, renderer } = stubCanvas();
    const run = questRun("VISIBLE-BRIDGE-PAIRS", "trail-scout", 9);

    renderer.render({ ...run, pulseVisible: [], revealed: [] });

    expect(labels).toEqual(
      run.echoBridges.map((bridge) => String(bridge.echoIndex + 1))
    );
  });

  it("US-02.1 fills the whole Fog from one pattern, built once per palette", () => {
    const { context, renderer } = stubCanvas();
    const run = questRun("VISIBLE-BRIDGE-PAIRS", "trail-scout", 9);
    /** @type {unknown[]} */
    const fogFills = [];
    let fillStyle = /** @type {unknown} */ ("");
    Object.defineProperty(context, "fillStyle", {
      get: () => fillStyle,
      set: (value) => {
        fillStyle = value;
      }
    });
    context.fillRect = vi.fn((_x, _y, w) => {
      if (w === 640) fogFills.push(fillStyle);
    });

    renderer.render({ ...run, pulseVisible: [], revealed: [] });
    renderer.render({ ...run, pulseVisible: [], revealed: [] });

    expect(context.createPattern).toHaveBeenCalledTimes(1);
    expect(context.rect).not.toHaveBeenCalled();
    expect(fogFills).toEqual([{ pattern: true }, { pattern: true }]);
  });

  it("US-02.2 builds an integer pixel Fog tile with 4 to 6 percent dots at each device ratio", () => {
    const original = window.devicePixelRatio;
    try {
      for (const ratio of [1, 2]) {
        window.devicePixelRatio = ratio;
        const { renderer, tiles } = stubCanvas();
        renderer.render(questRun("VISIBLE-BRIDGE-PAIRS", "trail-scout", 9));

        // The Fog tile builds first; the land hatch tile builds second.
        expect(tiles).toHaveLength(2);
        const [tile] = tiles;
        expect(tile.width).toBe(8 * ratio);
        expect(tile.height).toBe(8 * ratio);
        const dots = tile.fills.filter((fill) => fill.w < tile.width);
        const coverage =
          dots.reduce((sum, fill) => sum + fill.w * fill.h, 0) / (tile.width * tile.height);
        expect(coverage).toBeGreaterThanOrEqual(0.04);
        expect(coverage).toBeLessThanOrEqual(0.06);
      }
    } finally {
      window.devicePixelRatio = original;
    }
  });

  it("US-02.4 records identical calls for two renders of one Run", () => {
    const run = questRun("VISIBLE-BRIDGE-PAIRS", "trail-scout", 9);
    const record = () => {
      const { calls, renderer } = stubCanvas();
      renderer.render({ ...run, revealed: ["0,0", "0,1"], pulseVisible: ["1,1"] });
      return calls;
    };

    expect(record()).toEqual(record());
  });

  it("US-02.1 draws every Pulse cell under one translucent path", () => {
    document.body.style.setProperty("--color-pulse", "rgb(9, 9, 9)");
    const { context, renderer } = stubCanvas();
    const paints = recordPaints(context);

    renderer.render(board({ revealed: ["0,0"], pulseVisible: ["0,1", "1,0", "1,1"] }));

    expect(paints.filter((paint) => paint.style === "rgb(9, 9, 9)")).toHaveLength(1);
  });

  it("restores the canvas state after each frame", () => {
    const { context, renderer } = stubCanvas();
    const run = questRun("VISIBLE-BRIDGE-PAIRS", "trail-scout", 9);

    renderer.render({ ...run, pulseVisible: [], revealed: [] });

    const order = (/** @type {import("vitest").Mock} */ mock) =>
      mock.mock.invocationCallOrder;
    expect(order(context.save)[0]).toBeLessThan(order(context.clearRect)[0]);
    expect(order(context.restore).at(-1)).toBeGreaterThan(
      Math.max(...order(context.fill))
    );
    expect(context.restore).toHaveBeenCalledTimes(context.save.mock.calls.length);
  });

  it("draws every Tide Door and its shared visible phase through Fog", () => {
    const { labels, renderer } = stubCanvas();
    const run = questRun("VISIBLE-TIDE-PHASE", "trail-scout", 13);

    renderer.render({ ...run, pulseVisible: [], revealed: [] });

    expect(labels.filter((label) => label === "OPEN")).toHaveLength(
      run.tideDoors.length
    );
  });

  it("draws one-use Signal Bells through Fog with explicit state labels", () => {
    const { labels, renderer } = stubCanvas();
    const run = questRun("VISIBLE-SIGNAL-BELLS", "trail-scout", 17);

    expect(run.signalBells.length).toBeGreaterThanOrEqual(2);
    renderer.render({
      ...run,
      signalBells: [
        { ...run.signalBells[0], spent: false },
        { ...run.signalBells[1], spent: true }
      ],
      pulseVisible: [],
      revealed: []
    });

    expect(labels).toContain("RING");
    expect(labels).toContain("SPENT");
  });

  it("US-02.1 draws a passage as one water square with no dot at its centre", () => {
    const originalDpr = window.devicePixelRatio;
    try {
      window.devicePixelRatio = 2;
      const { fillRects, renderer } = stubCanvas({ width: 320 });
      const run = questRun("PASSAGE-MARKER-TEST", "bright-start", 1);

      renderer.render({
        ...run,
        pulseVisible: [],
        revealed: ["0,0", "0,1", "1,1"]
      });

      // Only the Fog fill is a rectangle call; a centre dot would add a small one.
      expect(fillRects.filter((call) => call.w < 10)).toEqual([]);
    } finally {
      window.devicePixelRatio = originalDpr;
    }
  });

  it("US-02.1 paints the Pulse layer after the land, so the land cannot hide it", () => {
    document.body.style.setProperty("--color-pulse", "rgb(9, 9, 9)");
    document.body.style.setProperty("--color-land", "rgb(250, 251, 252)");
    const { context, renderer } = stubCanvas();
    const paints = recordPaints(context);

    renderer.render(board({ revealed: [], pulseVisible: ["0,0", "1,1"] }));

    const order = paints.map((paint) => paint.style);
    expect(order).toContain("rgb(9, 9, 9)");
    expect(order.indexOf("rgb(9, 9, 9)")).toBeGreaterThan(order.indexOf("rgb(250, 251, 252)"));
  });

  it("US-02.3 keeps the Fog and hatch patterns in step when the device ratio changes", () => {
    const originalDpr = window.devicePixelRatio;
    try {
      const { renderer, tiles } = stubCanvas();
      const run = board({ revealed: ["0,0", "0,1"] });

      window.devicePixelRatio = 1;
      renderer.render(run);
      window.devicePixelRatio = 2;
      renderer.render(run);

      expect(tiles.map((tile) => tile.width)).toEqual([8, 6, 16, 12]);
    } finally {
      window.devicePixelRatio = originalDpr;
    }
  });

  it("US-02.3 clamps a negative mark scale so every mark still draws", () => {
    document.body.style.setProperty("--maze-mark-scale", "-2");
    const { context, renderer } = stubCanvas();
    // A real canvas throws IndexSizeError for a negative radius.
    /** @type {Record<string, unknown>} */ (context).arc = vi.fn((/** @type {number} */ _x, /** @type {number} */ _y, /** @type {number} */ radius) => {
      if (radius < 0) throw new RangeError("negative radius");
    });

    expect(() =>
      renderer.render(
        board({
          explorer: { row: 1, col: 1, vitality: 3, maxVitality: 3 },
          revealed: ["1,1"],
          wardens: [{ row: 1, col: 1, id: 0, mode: "patrol" }]
        })
      )
    ).not.toThrow();
  });

  it("gives each Warden mode its own drawn face", () => {
    const run = questRun("WARDEN-FACES", "trail-scout", 9);
    const base = { ...run, pulseVisible: [], revealed: ["1,1"] };
    const quiet = stubCanvas();
    quiet.renderer.render({ ...base, wardens: [] });
    /** @param {"patrol" | "hunt" | "intercept" | "lured"} mode */
    const face = (mode) => {
      const drawn = stubCanvas();
      drawn.renderer.render({
        ...base,
        wardens: [{ row: 1, col: 1, id: 0, mode }]
      });
      return drawn.calls.join(" ");
    };

    const faces = new Set([
      face("patrol"),
      face("hunt"),
      face("intercept"),
      face("lured")
    ]);

    expect(faces.size).toBe(4);
    expect(faces).not.toContain(quiet.calls.join(" "));
  });

  it("draws Echo numbers in the dark foreground and Warden faces in paper", () => {
    const { context, renderer } = stubCanvas();
    const run = questRun("WARDEN-FACES", "trail-scout", 9);
    /** @type {string[]} */
    const markFills = [];
    /** @type {string[][]} */
    const textFills = [];
    let fillStyle = "";
    Object.defineProperty(context, "fillStyle", {
      get: () => fillStyle,
      set: (value) => {
        fillStyle = value;
      }
    });
    context.fillText = vi.fn((text) => textFills.push([text, fillStyle]));
    context.fill = vi.fn(() => {
      markFills.push(fillStyle);
    });
    document.body.style.setProperty("--color-night-deep", "rgb(7, 8, 9)");
    document.body.style.setProperty("--color-land", "rgb(11, 12, 13)");
    document.body.style.setProperty("--color-board-warden", "rgb(200, 0, 0)");

    renderer.render({
      ...run,
      echoBridges: [],
      echoes: [{ row: 1, col: 1, collected: false }],
      explorer: { ...run.explorer, row: 0, col: 0 },
      pulseVisible: [],
      revealed: ["1,1", "2,2"],
      signalBells: [],
      tideDoors: [],
      wardens: [{ row: 2, col: 2, id: 0, mode: "patrol" }]
    });

    expect(textFills).toEqual([["1", "rgb(7, 8, 9)"]]);
    const wardenBody = markFills.indexOf("rgb(200, 0, 0)");
    expect(wardenBody).toBeGreaterThan(-1);
    expect(markFills[wardenBody + 1]).toBe("rgb(11, 12, 13)");
  });

  it("US-03.1 draws the Neatline ticks and the Grid reference on the overlay canvas", () => {
    const { neat, renderer } = stubCanvas({ neatline: true });

    renderer.render(board({ revealed: ["0,0"] }));

    // One 2px tick per tile line on all four edges, in one stroke, and one 1px border.
    expect(neat.paths.filter((step) => step === "moveTo")).toHaveLength(4 * 3);
    expect(neat.paths.filter((step) => step === "stroke")).toHaveLength(1);
    expect(neat.paths.filter((step) => step === "strokeRect")).toHaveLength(1);
    expect(neat.labels).toEqual(["A", "B", "1", "2"]);
    expect(neat.fonts.every((font) => font.startsWith("10px "))).toBe(true);
    expect(neat.overlay.width).toBe(676);
  });

  it("US-03.1 skips the Neatline when the frame has no overlay canvas", () => {
    const { calls, neat, renderer } = stubCanvas({ neatline: "no-overlay" });

    expect(() => renderer.render(board({ revealed: ["0,0"] }))).not.toThrow();
    expect(calls).toContain("fill");
    expect(neat.context.clearRect).not.toHaveBeenCalled();
    expect(neat.context.fillText).not.toHaveBeenCalled();
  });

  it("US-03.1 skips the Neatline when the overlay canvas has no 2D context", () => {
    const { calls, neat, renderer } = stubCanvas({ neatline: "no-context" });

    expect(() => renderer.render(board({ revealed: ["0,0"] }))).not.toThrow();
    expect(calls).toContain("fill");
    expect(neat.context.clearRect).not.toHaveBeenCalled();
    expect(neat.overlay.width).toBe(0);
  });

  it("US-03.1 sizes the Neatline from the board box when the backing store clamps to 320", () => {
    const { neat, renderer } = stubCanvas({ neatline: true, width: 200 });

    renderer.render(board({ revealed: ["0,0"] }));

    // The box is 200 CSS pixels at device ratio 1, left and top 18: border 1px wider on each side.
    expect(neat.rects).toEqual([[17.5, 17.5, 201, 201]]);
    expect(neat.overlay.width).toBe(236);
  });

  it("US-03.1 labels the columns centred above and the rows right-aligned left of the ticks", () => {
    const { neat, renderer } = stubCanvas({ neatline: true });

    renderer.render(board({ revealed: ["0,0"] }));

    // Box 640, left and top 18, tile 320, tick 2, gap 2: tick ends at 15, labels end 2 beyond.
    expect(neat.texts).toEqual([
      { text: "A", x: 178, y: 13, align: "center", baseline: "bottom" },
      { text: "B", x: 498, y: 13, align: "center", baseline: "bottom" },
      { text: "1", x: 13, y: 178, align: "right", baseline: "middle" },
      { text: "2", x: 13, y: 498, align: "right", baseline: "middle" }
    ]);
  });

  it("US-03.1 labels a 15 by 15 board with 15 letters and 15 numbers, all inside the frame", () => {
    const { neat, renderer } = stubCanvas({ neatline: true });
    const labyrinth = Array.from({ length: 15 }, () => Array.from({ length: 15 }, () => 0));

    renderer.render(board({ labyrinth, revealed: [] }));

    const letters = neat.texts.filter((label) => label.baseline === "bottom");
    const numbers = neat.texts.filter((label) => label.baseline === "middle");
    expect(letters.map((label) => label.text).join("")).toBe("ABCDEFGHIJKLMNO");
    expect(numbers.map((label) => label.text)).toEqual(
      Array.from({ length: 15 }, (_, index) => String(index + 1))
    );
    // Tile 640 / 15; the centre of tile 7 sits at 18 + 7.5 * 640 / 15 = 338.
    expect(letters[7].x).toBeCloseTo(338, 5);
    expect(numbers[14].y).toBeCloseTo(18 + (14.5 * 640) / 15, 5);
    for (const label of neat.texts) {
      expect(label.x).toBeGreaterThan(0);
      expect(label.y).toBeGreaterThan(0);
    }
  });

  it("US-03.1 keeps the Neatline canvas inside the canvas frame beside the maze canvas", () => {
    const html = readFileSync(resolve(process.cwd(), "index.html"), "utf8");
    const markup = html.slice(html.indexOf(">", html.indexOf("<body")) + 1);
    document.body.innerHTML = markup.replace(/<script[\s\S]*?<\/script>/g, "");
    // The play view lives inside a template, so the search covers each template content too.
    const scopes = [document, ...[...document.querySelectorAll("template")].map((t) => t.content)];
    const maze = scopes.map((scope) => scope.querySelector("#maze-canvas")).find(Boolean);

    try {
      expect(maze?.parentElement?.classList.contains("canvas-frame")).toBe(true);
      expect(maze?.parentElement?.querySelectorAll(":scope > canvas.neatline-canvas")).toHaveLength(1);
    } finally {
      document.body.innerHTML = "";
    }
  });

  it("writes the pause text in ink on a paper band between two ink rules", () => {
    const { context, renderer } = stubCanvas();
    const run = questRun("PALETTE-REREAD", "bright-start", 1);
    /** @type {string[][]} */
    const textFills = [];
    /** @type {Array<{ style: string, y: number, w: number, h: number }>} */
    const bands = [];
    let fillStyle = "";
    Object.defineProperty(context, "fillStyle", {
      get: () => fillStyle,
      set: (value) => {
        fillStyle = value;
      }
    });
    context.fillText = vi.fn((text) => textFills.push([text, fillStyle]));
    context.fillRect = vi.fn((_x, y, w, h) => {
      bands.push({ style: fillStyle, y, w, h });
    });
    document.body.style.setProperty("--color-ink", "rgb(4, 4, 4)");
    document.body.style.setProperty("--color-land", "rgb(250, 251, 252)");
    document.body.style.setProperty("--color-overlay", "rgb(1, 1, 1)");

    renderer.render({ ...run, pulseVisible: [], revealed: [], status: "paused" });

    expect(textFills).toContainEqual(["PAUSED", "rgb(4, 4, 4)"]);
    expect(bands.some((band) => band.style === "rgb(1, 1, 1)")).toBe(false);
    const paper = bands.find((band) => band.style === "rgb(250, 251, 252)" && band.w === 640);
    expect(paper).toBeDefined();
    expect(paper && paper.h).toBeLessThan(640 / 2);
    const rules = bands.filter((band) => band.style === "rgb(4, 4, 4)" && band.w === 640);
    expect(rules.map((rule) => rule.y)).toEqual([paper?.y, (paper?.y ?? 0) + (paper?.h ?? 0) - 1]);
  });

  it("US-02.1 puts the Signal light on the Gate Warden challenge band only", () => {
    document.body.style.setProperty("--color-board-light", "rgb(9, 9, 1)");
    const lightOn = (/** @type {"gate-warden" | undefined} */ kind) => {
      const { context, renderer } = stubCanvas();
      const paints = recordPaints(context);
      renderer.render(
        board({
          challenge: { kind, wardenId: 0, question: null, attempt: 0, feedback: null, hintRevealed: false },
          status: "challenge"
        })
      );
      return paints.some((paint) => paint.style === "rgb(9, 9, 1)");
    };

    expect(lightOn("gate-warden")).toBe(true);
    expect(lightOn(undefined)).toBe(false);
  });

  it("reads the canvas palette again on every frame", () => {
    const { renderer, tiles } = stubCanvas();
    const run = questRun("PALETTE-REREAD", "bright-start", 1);

    document.body.style.setProperty("--color-fog", "rgb(1, 2, 3)");
    renderer.render({ ...run, pulseVisible: [], revealed: [] });
    document.body.style.setProperty("--color-fog", "rgb(4, 5, 6)");
    renderer.render({ ...run, pulseVisible: [], revealed: [] });

    expect(tiles.map((tile) => tile.fills[0].style)).toEqual(["rgb(1, 2, 3)", "rgb(4, 5, 6)"]);
  });
});

describe("US-08 — Labyrinth canvas reads as paper", () => {
  afterEach(() => {
    document.body.removeAttribute("style");
  });

  it("US-08.1 draws a square water passage and paper land with an ink hatch", () => {
    for (const name of ["--color-fog", "--color-passage", "--color-land", "--color-hatch"]) {
      document.body.style.setProperty(name, canvasToken(LIGHT, name));
    }
    document.body.style.setProperty("--color-ink", canvasToken(LIGHT, "--color-ink"));
    const { context, renderer, tiles } = stubCanvas();
    const paints = recordPaints(context);

    renderer.render(board({ revealed: ["0,0", "0,1", "1,1"] }));

    const passage = oklabOf(canvasToken(LIGHT, "--color-passage"));
    expect(passage[0]).toBeGreaterThanOrEqual(0.95);
    expect(Math.hypot(passage[1], passage[2])).toBeLessThan(0.03);
    const water = paints.find(
      (paint) => paint.kind === "fill" && paint.style === canvasToken(LIGHT, "--color-passage")
    );
    expect(water?.path).toEqual(["rect(320.00,0.00,320.00,320.00)"]);
    const land = paints.find(
      (paint) => paint.kind === "fill" && paint.style === canvasToken(LIGHT, "--color-land")
    );
    expect(land?.path).toEqual(["rect(0.00,0.00,320.00,320.00)"]);
    const hatch = paints.find(
      (paint) => paint !== land && paint.kind === "fill" && paint.path.join() === land?.path.join()
    );
    expect(hatch).toBeDefined();
    const hatchTile = tiles[1];
    expect(hatchTile.width).toBe(6);
    expect(hatchTile.fills).toHaveLength(6);
    expect(hatchTile.fills.every((fill) => fill.style === canvasToken(LIGHT, "--color-hatch"))).toBe(true);
    expect(hatchTile.fills.every((fill) => fill.x + fill.y === 5)).toBe(true);
  });

  it("US-02.1 strokes one coastline path of wall and passage edges in opaque ink", () => {
    document.body.style.setProperty("--color-coastline", "rgb(7, 7, 7)");
    const { context, renderer } = stubCanvas();
    const paints = recordPaints(context);
    let lineWidth = 0;
    /** @type {number[]} */
    const widths = [];
    Object.defineProperty(context, "lineWidth", {
      configurable: true,
      get: () => lineWidth,
      set: (value) => {
        lineWidth = value;
      }
    });
    const stroke = context.stroke;
    context.stroke = vi.fn(() => {
      widths.push(lineWidth);
      stroke();
    });

    renderer.render(board({ revealed: ["0,0", "0,1", "1,0", "1,1"] }));

    const coast = paints.filter((paint) => paint.style === "rgb(7, 7, 7)");
    expect(coast).toHaveLength(1);
    expect(coast[0].kind).toBe("stroke");
    expect(coast[0].path.filter((step) => step.startsWith("moveTo"))).toHaveLength(2);
    expect(coast[0].path.every((step) => !step.startsWith("arc"))).toBe(true);
    // The wall (0,0) borders the passage (0,1) at x = 320 and the passage (1,0) at y = 320.
    const points = coast[0].path.map((step) => step.replace(/^\w+\(|\)$/g, "").split(",").map(Number));
    for (const [x, y] of points) {
      const near = (/** @type {number} */ value, /** @type {number} */ target) =>
        Math.abs(value - target) <= 0.5;
      const onVerticalEdge = near(x, 320) && (near(y, 0) || near(y, 320));
      const onHorizontalEdge = near(y, 320) && (near(x, 0) || near(x, 320));
      expect(onVerticalEdge || onHorizontalEdge, `${x},${y}`).toBe(true);
    }
    // tile 320 * 0.06 = 19.2, rounded to 19 device pixels.
    expect(widths).toContain(19);
    // An odd width sits on a half pixel across the edge; the ends sit on whole pixels; caps are butt.
    expect(points.every(([x, y]) => (x === 320.5 && Number.isInteger(y)) || (y === 320.5 && Number.isInteger(x)))).toBe(true);
    expect(/** @type {Record<string, unknown>} */ (context).lineCap).toBe("butt");
  });

  it("US-02.1 paints the Explorer as an ink ring on a paper disc with an Explorer dot", () => {
    document.body.style.setProperty("--color-board-explorer-ring", "rgb(5, 5, 5)");
    document.body.style.setProperty("--color-explorer", "rgb(6, 6, 6)");
    const { context, renderer } = stubCanvas();
    const paints = recordPaints(context);
    let lineWidth = 0;
    /** @type {number[]} */
    const ringWidths = [];
    Object.defineProperty(context, "lineWidth", {
      configurable: true,
      get: () => lineWidth,
      set: (value) => {
        lineWidth = value;
      }
    });
    const stroke = context.stroke;
    context.stroke = vi.fn(() => {
      ringWidths.push(lineWidth);
      stroke();
    });

    renderer.render(board({ explorer: { row: 1, col: 1, vitality: 3, maxVitality: 3 }, revealed: ["1,1"] }));

    expect(context.createRadialGradient).not.toHaveBeenCalled();
    const ring = paints.find((paint) => paint.kind === "stroke" && paint.style === "rgb(5, 5, 5)");
    // The 2x2 board has tile 320: the ring centres on 480,480 with radius 0.32 tile.
    expect(ring?.path).toEqual(["arc(480.00,480.00,102.40,0.00,6.28)"]);
    expect(ringWidths).toContain(25.6);
    const dot = paints.find((paint) => paint.kind === "fill" && paint.style === "rgb(6, 6, 6)");
    expect(dot?.path).toHaveLength(1);
    expect(dot?.path[0].startsWith("arc(480.00,480.00,")).toBe(true);
  });

  it("US-02.1 fills the Explorer disc with the theme paper token, not the on-fill colour", () => {
    document.body.style.setProperty("--color-board-explorer-disc", "rgb(8, 8, 8)");
    document.body.style.setProperty("--color-on-fill", "rgb(250, 250, 250)");
    const { context, renderer } = stubCanvas();
    const paints = recordPaints(context);

    renderer.render(board({ explorer: { row: 1, col: 1, vitality: 3, maxVitality: 3 }, revealed: ["1,1"] }));

    const disc = paints.find((paint) => paint.kind === "fill" && paint.style === "rgb(8, 8, 8)");
    expect(disc?.path).toEqual(["arc(480.00,480.00,102.40,0.00,6.28)"]);
    const onFillArcs = paints.filter(
      (paint) => paint.style === "rgb(250, 250, 250)" && paint.path.includes("arc(480.00,480.00,102.40,0.00,6.28)")
    );
    expect(onFillArcs).toHaveLength(0);
  });

  it("US-02.1 rings each Warden with a dotted danger line and paints it only as a stroke", () => {
    document.body.style.setProperty("--color-danger-line", "rgb(3, 3, 3)");
    document.body.style.setProperty("--color-board-warden", "rgb(200, 0, 0)");
    const { context, renderer } = stubCanvas();
    const paints = recordPaints(context);
    /** @type {number[]} */
    let dash = [];
    /** @type {Array<number[]>} */
    const dashAtStroke = [];
    context.setLineDash = vi.fn((/** @type {number[]} */ pattern) => {
      dash = pattern;
    });
    const stroke = context.stroke;
    context.stroke = vi.fn(() => {
      dashAtStroke.push(dash);
      stroke();
    });

    renderer.render(
      board({ revealed: ["1,1"], wardens: [{ row: 1, col: 1, id: 0, mode: "patrol" }] })
    );

    const strokes = paints.filter((paint) => paint.kind === "stroke");
    const index = strokes.findIndex((paint) => paint.style === "rgb(3, 3, 3)");
    expect(index).toBeGreaterThan(-1);
    expect(strokes[index].path).toEqual(["arc(480.00,480.00,147.20,0.00,6.28)"]);
    expect(dashAtStroke[index].length).toBeGreaterThan(0);
    expect(dash).toEqual([]);
    expect(paints.some((paint) => paint.kind === "fill" && paint.style === "rgb(3, 3, 3)")).toBe(false);
  });

  it("US-02.1 shows the Signal light only on the open sealed Gate and on lit states", () => {
    document.body.style.setProperty("--color-board-light", "rgb(9, 9, 1)");
    document.body.style.setProperty("--color-board-warden", "rgb(200, 0, 0)");
    const lightMarks = (/** @type {{ open: boolean, sealed?: boolean }} */ state) => {
      const { context, renderer } = stubCanvas();
      const paints = recordPaints(context);
      renderer.render(board({ revealed: ["1,1"], gate: { row: 1, col: 1, ...state } }));
      return paints.filter((paint) => paint.style === "rgb(9, 9, 1)");
    };

    expect(lightMarks({ open: false })).toHaveLength(0);
    expect(lightMarks({ open: true, sealed: false }).length).toBeGreaterThan(0);
    const sealed = lightMarks({ open: true, sealed: true });
    expect(sealed).toHaveLength(1);
    expect(sealed[0].kind).toBe("fill");
  });

  it("US-01.1 gives every board mark a row, and the two Night blocks the same rows", () => {
    for (const scope of SCOPES) {
      for (const name of BOARD_ROWS) {
        expect(() => canvasToken(scope, name), name).not.toThrow();
      }
      expect(canvasToken(scope, "--color-board-warden")).toBe("var(--color-ink)");
      const hatch = Number(canvasToken(scope, "--color-hatch").match(/ \/ (\d+)%\)$/)?.[1]);
      expect(hatch).toBeGreaterThanOrEqual(28);
      expect(hatch).toBeLessThanOrEqual(34);
    }
    const rows = (/** @type {string} */ scope) =>
      [...scope.matchAll(/(--[\w-]+):\s*([^;]+);/g)].map((hit) => `${hit[1]}: ${hit[2]}`).sort();
    expect(rows(NIGHT_SYSTEM)).toEqual(rows(NIGHT_EXPLICIT));
  });

  it("US-01.2 keeps every board mark at its floor in each theme, mode and Explorer palette", () => {
    /** @type {string[]} */
    const failures = [];
    for (const [theme, base] of Object.entries(THEMES)) {
      for (const [mode, modeSelector] of Object.entries(MODES)) {
        for (const [palette, paletteSelector] of Object.entries(EXPLORER_PALETTES)) {
          const tokens = new Map([
            ...base,
            ...(modeSelector ? daylightScope(modeSelector) : []),
            ...(paletteSelector ? daylightScope(paletteSelector) : [])
          ]);
          for (const [mark, ground, floor] of BOARD_PAIRS) {
            // Strong contrast lifts every pair on the passage and the land to 4.5:1.
            const needed = mode === "strong" && floor === 3 && ground !== DISC ? 4.5 : floor;
            const ratio = contrastOver(resolveColor(tokens, mark), resolveColor(tokens, ground));
            if (ratio < needed) {
              failures.push(`${theme}/${mode}/${palette}: ${mark} on ${ground} ${ratio.toFixed(2)} < ${needed}`);
            }
          }
        }
      }
    }
    expect(failures).toEqual([]);
  });

  it("US-01.2 keeps the Pulse wash translucent and the coastline opaque in each theme and mode", () => {
    for (const base of Object.values(THEMES)) {
      for (const selector of Object.values(MODES)) {
        const tokens = new Map([...base, ...(selector ? daylightScope(selector) : [])]);
        const { alpha } = resolveColor(tokens, "--color-pulse");
        expect(alpha).toBeGreaterThanOrEqual(0.2);
        expect(alpha).toBeLessThanOrEqual(0.4);
        expect(resolveColor(tokens, "--color-coastline").alpha).toBe(1);
      }
    }
  });

  it("US-01.3 makes every fallback palette colour equal the resolved light token", () => {
    const source = readFileSync(resolve(process.cwd(), "src/game/canvas-renderer.js"), "utf8");
    const fallbackBlock = source.match(/const FALLBACK_PALETTE = \{([^}]*)\};/)?.[1] ?? "";
    const fallbacks = new Map(
      [...fallbackBlock.matchAll(/(\w+): "([^"]*)"/g)].map((hit) => [hit[1], hit[2]])
    );
    const reads = [...source.matchAll(/(\w+): color\("(--[\w-]+)", FALLBACK_PALETTE\.(\w+)\)/g)];
    /** @param {string} name @returns {string} */
    const resolveRaw = (name) => {
      const value = LIGHT_TOKENS.get(name) ?? "";
      const reference = value.match(/^var\((--[\w-]+)\)$/);
      return reference ? resolveRaw(reference[1]) : value;
    };

    expect(reads.length).toBeGreaterThan(10);
    for (const [, key, token, fallbackKey] of reads) {
      expect(fallbackKey).toBe(key);
      // Font stacks are not colours, so they stay out of this parity.
      if (key.startsWith("font")) continue;
      expect(fallbacks.get(key), `${key} fallback vs ${token}`).toBe(resolveRaw(token));
    }
    expect([...fallbacks.keys()].sort()).toEqual(reads.map((hit) => hit[1]).sort());
  });

  it("US-03.1 draws the board focus ring on the frame edge and not on the canvas", () => {
    const ruleOf = (/** @type {string} */ selector) =>
      [...daylightCss.matchAll(/([^{}]+)\{([^{}]*)\}/g)].find((rule) =>
        rule[1].split(",").some((part) => part.trim() === selector)
      )?.[2] ?? "";

    expect(ruleOf("#maze-canvas:focus-visible")).toMatch(/outline:\s*none/);
    expect(ruleOf("#maze-canvas:focus")).toMatch(/outline:\s*none/);
    const frame = ruleOf(".canvas-frame:has(#maze-canvas:focus-visible)");
    expect(frame).toMatch(/outline:\s*0\.2rem solid var\(--color-focus\)/);
    expect(frame).toMatch(/outline-offset:\s*0\.2rem/);
  });

  it("US-08.1 leaves the passage colour to the canvas tokens, so no Region theme tints it", () => {
    const regionCss = readFileSync(resolve(process.cwd(), "src/game/region-theme.css"), "utf8");

    expect(regionCss).not.toMatch(/--color-passage\s*:/);
    expect(tokensCss).not.toMatch(/--color-tile-/);
  });

  it("US-08.2 gives each Warden state its own silhouette: round, pointed, chevron, ringed", () => {
    document.body.style.setProperty("--color-board-warden", "rgb(200, 0, 0)");
    const modes = /** @type {const} */ (["patrol", "hunt", "intercept", "lured"]);

    const shapes = modes.map((mode) => {
      const { context, renderer } = stubCanvas();
      const paints = recordPaints(context);
      renderer.render(board({ revealed: ["1,1"], wardens: [{ row: 1, col: 1, id: 0, mode }] }));
      return paints
        .filter((paint) => paint.style === "rgb(200, 0, 0)")
        .map((paint) => `${paint.kind}:${paint.path.join(";")}`)
        .join("|");
    });

    expect(shapes.every((shape) => shape.length > 0)).toBe(true);
    expect(new Set(shapes).size).toBe(4);
  });

  it("US-08.3 draws without changing the run it reads", () => {
    const { renderer } = stubCanvas();
    const run = board({
      revealed: ["0,0", "1,1"],
      wardens: [{ row: 1, col: 1, id: 0, mode: "hunt" }]
    });
    const before = structuredClone(run);

    renderer.render(run);

    expect(run).toEqual(before);
  });

  it("US-08.4 draws identical calls when the same state is drawn twice", () => {
    const state = board({
      revealed: ["0,0", "0,1", "1,1"],
      wardens: [{ row: 1, col: 1, id: 0, mode: "lured" }]
    });
    /** Draws the state on a fresh canvas and returns everything it painted. */
    const drawOnce = () => {
      const { calls, context, fillRects, renderer } = stubCanvas();
      const paints = recordPaints(context);
      renderer.render(state);
      return { calls: [...calls], fillRects, paints };
    };

    expect(drawOnce()).toEqual(drawOnce());
  });

  it("US-02.3 falls back to the Pilot Chart light values when every CSS variable is missing", () => {
    const { context, renderer } = stubCanvas();
    const paints = recordPaints(context);
    const run = questRun("VISIBLE-BRIDGE-PAIRS", "trail-scout", 9);
    const size = run.labyrinth.length;
    const revealed = run.labyrinth.flatMap((row, r) => row.map((_, c) => `${r},${c}`));

    renderer.render({
      ...run,
      revealed,
      wardens: [{ row: 0, col: 0, id: 0, mode: "patrol" }],
      pulseVisible: []
    });

    const styles = new Set(paints.map((paint) => paint.style));
    expect(size).toBeGreaterThan(1);
    for (const style of [
      "oklch(95.5% 0.022 232)",
      "oklch(18% 0.012 250)",
      "oklch(58% 0.24 340)",
      "oklch(52% 0.17 250)",
      "oklch(46% 0.17 250)"
    ]) {
      expect(styles, style).toContain(style);
    }
    for (const stale of ["oklch(98.5% 0.014 88)", "oklch(92% 0.018 85)", "oklch(58% 0.2 24)", "oklch(24% 0.015 60)"]) {
      expect(styles, stale).not.toContain(stale);
    }
  });

  it("US-08.5 falls back to the built-in palette when a CSS variable is missing and still draws", () => {
    const { context, renderer } = stubCanvas();
    const paints = recordPaints(context);

    expect(() =>
      renderer.render(
        board({
          revealed: ["0,0", "0,1", "1,1"],
          wardens: [{ row: 1, col: 1, id: 0, mode: "patrol" }]
        })
      )
    ).not.toThrow();
    expect(paints.length).toBeGreaterThan(0);
    expect(
      paints.every((paint) => typeof paint.style !== "string" || paint.style.length > 0)
    ).toBe(true);
    expect(paints.some((paint) => typeof paint.style === "string" && paint.style.startsWith("oklch("))).toBe(true);
  });
});
