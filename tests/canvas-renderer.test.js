// @vitest-environment happy-dom

import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { MissingBoardTokenError, createCanvasRenderer } from "../src/game/canvas-renderer.js";
import { createRun } from "../src/game/game-session.js";
import { getLabyrinthConfig } from "../src/questions/quest-levels.js";
import { getQuestRunRuleset } from "../src/game/run-ruleset.js";
import { BOARD_TOKENS, resolveBoardToken, seedBoardTokens } from "./helpers/board-tokens.js";

/**
 * Builds a recording 2D context and a canvas that returns it.
 * @param {{ width?: number, height?: number, neatline?: boolean | "no-overlay" | "no-context", seed?: boolean, loadArt?: () => Promise<unknown>, isBrightStart?: () => boolean, ownLayerContexts?: boolean }} [options]
 */
function stubCanvas({ width = 640, height = width, neatline = false, seed = true, loadArt = () => new Promise(() => {}), isBrightStart, ownLayerContexts = false } = {}) {
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
    clip: record("clip"),
    createPattern: vi.fn(() => ({ pattern: true })),
    createRadialGradient: vi.fn(() => ({ addColorStop: vi.fn() })),
    drawImage: record("drawImage"),
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
    getBoundingClientRect: () => ({ width, height }),
    getContext: () => context,
    height: 640,
    style: { setProperty: vi.fn() },
    width: 640
  };
  /** @type {Array<{ width: number, height: number, contextArgs: unknown[], fills: Array<{ style: string, x: number, y: number, w: number, h: number }> }>} */
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
    /** @type {unknown[]} */
    const contextArgs = [];
    const tile = {
      width: tileWidth,
      height: tileHeight,
      fills,
      contextArgs,
      getContext: (/** @type {unknown[]} */ ...args) => {
        contextArgs.push(...args);
        return tileContext;
      }
    };
    tiles.push(tile);
    return /** @type {never} */ (tile);
  };
  // A layer draws on the shared recording context unless it asks for its own, so the paints record in layer order.
  /** @type {Array<{ width: number, height: number, context: any }>} */
  const layers = [];
  const ownContext = () => {
    /** @type {Record<string | symbol, any>} */
    const state = { fills: [] };
    return new Proxy(state, {
      get: (target, name) => {
        if (name in target) return target[name];
        if (name === "createRadialGradient") return () => ({ addColorStop() {} });
        return () => {
          if (name === "fill") target.fills.push(target.fillStyle);
        };
      }
    });
  };
  const createLayer = (/** @type {number} */ layerWidth, /** @type {number} */ layerHeight) => {
    const layerContext = ownLayerContexts ? ownContext() : context;
    const layer = { width: layerWidth, height: layerHeight, context: layerContext, getContext: () => layerContext };
    layers.push(layer);
    return /** @type {never} */ (layer);
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
    measureText: vi.fn((/** @type {string} */ text) => ({ width: text.length * 6 })),
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
      getBoundingClientRect: () => ({ left: 18, top: 18, width, height }),
      parentElement: {
        addEventListener: vi.fn(),
        getBoundingClientRect: () => ({ left: 0, top: 0, width: width + 36, height: height + 36 }),
        querySelector: () => (neatline === "no-overlay" ? null : overlay)
      }
    });
  }
  if (seed) seedBoardTokens();
  const renderer = createCanvasRenderer(
    /** @type {HTMLCanvasElement} */ (/** @type {unknown} */ (canvas)),
    createTile,
    /** @type {never} */ (loadArt),
    isBrightStart,
    createLayer
  );
  return {
    calls,
    layers,
    canvas,
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

const tokensCss = readFileSync(resolve(process.cwd(), "src/looks/popup/tokens.css"), "utf8");

/** @param {string} selector */
function scopeOf(selector) {
  const start = tokensCss.indexOf(selector);
  return tokensCss.slice(start, tokensCss.indexOf("}", start));
}
const LIGHT = scopeOf(":root {");
// Night appears twice in tokens.css: the system-dark media block and the explicit dark block.
const NIGHT_SYSTEM = scopeOf(':root:not([data-theme="light"]) {');
// The explicit Night block ends where the more-contrast block starts.
const NIGHT_EXPLICIT = tokensCss.slice(
  tokensCss.indexOf(':root[data-theme="dark"] {'),
  tokensCss.indexOf("@media (prefers-contrast: more)")
);

/**
 * Reads one canvas token from a scope and throws when it is absent. A `var()` chain resolves through the scope, then the light scope.
 * @param {string} scope
 * @param {string} name
 * @returns {string}
 */
function canvasToken(scope, name) {
  const read = (/** @type {string} */ from) => from.match(new RegExp(`${name}:\\s*([^;]+);`))?.[1].trim();
  const value = read(scope) ?? read(LIGHT);
  if (!value) throw new Error(`missing token ${name}`);
  const reference = value.match(/^var\((--[\w-]+)\)$/);
  return reference ? canvasToken(scope, reference[1]) : value;
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
  // The ring is the board ink in every mode, so it reads at the text floor.
  ["--color-board-explorer-ring", "--color-passage", 4.5],
  ["--color-board-warden", "--color-passage", 3],
  // Popup draws an ink outline under each coral dash, so the outline carries the 3:1 edge.
  ["--color-board-ink", "--color-passage", 3],
  // Popup draws the Gate, the Light and the Echo as sun fills with an ink outline, so the outline carries the 3:1 edge.
  ["--color-board-ink", "--color-board-gate", 3],
  ["--color-board-ink", "--color-board-echo", 3],
  ["--color-board-ink", "--color-board-light", 3],
  ["--color-board-ink", "--color-board-casing", 3],
  ["--color-fog-dot", "--color-fog", 3],
  // The Fog dots carry the known/unknown edge, because the Fog fill is close to the Passage.
  ["--color-fog-dot", "--color-passage", 3],
  // The Echo pair number sits on the Echo fill.
  ["--color-board-echo-text", "--color-board-echo", 4.5],
  // The closed Gate keyhole is board ink on the sun fill: it reads on its own fill.
  ["--color-night-deep", "--color-on-fill", 3],
  // The disc is the board paper, so its ring keeps the text floor in every mode; the clover Explorer sits inside the ring.
  ["--color-board-explorer-ring", DISC, 4.5],
  // The pause cover writes its ink on the cover fill.
  ["--color-board-cover-ink", "--color-board-cover", 4.5],
  // The challenge band writes the board ink on the board paper.
  ["--color-board-ink", "--color-board-casing", 4.5],
  // Pulse is a wash, so it needs only to show.
  ["--color-pulse", "--color-passage", 1.2],
  ["--color-pulse", "--color-land", 1.2],
  // The open Gate arrow strokes on the white arch fill, not on the Passage.
  ["--color-board-light-on-fill", "--color-on-fill", 3]
]);

/** Strong mode paints the Fog flat, so the Fog edge alone separates known tiles from unknown ones. */
const STRONG_ONLY_PAIRS = /** @type {const} */ ([
  ["--color-fog", "--color-passage", 3],
  ["--color-coastline", "--color-fog", 3]
]);

/** The on-fill colour that the Windway tests give the Windway source disc. */
const WINDWAY_DISC = "rgb(251, 252, 253)";

/**
 * Return the Windway source discs: on-fill arcs that no other mark on a plain board draws.
 * @param {Array<{ kind: "fill" | "stroke", style: string, path: string[] }>} paints
 */
function windwayDiscs(paints) {
  return paints.filter(
    (paint) => paint.kind === "fill" && paint.style === WINDWAY_DISC && paint.path[0]?.startsWith("arc(")
  );
}

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
 * Records each clip as the rect paths behind it, one "left,top,width,height" string per tile.
 * @param {ReturnType<typeof stubCanvas>["context"]} context
 */
function recordClips(context) {
  /** @type {string[][]} */
  const clips = [];
  /** @type {string[]} */
  let path = [];
  const target = /** @type {Record<string, any>} */ (context);
  const begin = target.beginPath;
  const rect = target.rect;
  target.beginPath = vi.fn(() => {
    path = [];
    begin();
  });
  target.rect = vi.fn((/** @type {number[]} */ ...args) => {
    path.push(args.join(","));
    rect(...args);
  });
  target.clip = vi.fn(() => {
    clips.push([...path]);
  });
  return clips;
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
  afterEach(async () => {
    document.documentElement.removeAttribute("data-access-contrast");
    // Let the attribute observers repaint while the board tokens still exist.
    await new Promise((done) => setTimeout(done, 0));
    document.body.removeAttribute("style");
  });

  describe("board art", () => {
    const run = () => {
      const base = questRun("BOARD-ART", "trail-scout", 9);
      return {
        ...base,
        pulseVisible: [],
        revealed: ["1,1", "0,1"],
        wardens: [
          { row: 1, col: 1, id: 0, mode: /** @type {const} */ ("patrol") },
          { row: 0, col: 1, id: 1, mode: /** @type {const} */ ("hunt") },
          { row: 0, col: 0, id: 2, mode: /** @type {const} */ ("lured") }
        ]
      };
    };
    const flush = () => new Promise((done) => setTimeout(done, 0));
    const shapeCalls = () => {
      const plain = stubCanvas({ loadArt: () => Promise.resolve(null) });
      plain.renderer.render(run());
      return plain.calls.join(" ");
    };

    it("draws the shape marks while loadArt never resolves", async () => {
      const drawn = stubCanvas({ loadArt: () => new Promise(() => {}) });
      drawn.renderer.render(run());
      await flush();
      expect(drawn.calls.join(" ")).toBe(shapeCalls());
    });

    it("drops the art and draws the shape marks when the art throws", async () => {
      const art = {
        drawFigure: vi.fn(() => {
          throw new TypeError("roundRect is not a function");
        })
      };
      const drawn = stubCanvas({ loadArt: () => Promise.resolve(art) });
      drawn.renderer.render(run());
      await flush();
      expect(art.drawFigure).toHaveBeenCalledTimes(1);
      drawn.calls.length = 0;
      expect(() => drawn.renderer.render(run())).not.toThrow();
      expect(art.drawFigure).toHaveBeenCalledTimes(1);
      expect(drawn.calls.join(" ")).toBe(shapeCalls());
    });

    it("draws the shape marks and throws nothing when loadArt rejects", async () => {
      const drawn = stubCanvas({ loadArt: () => Promise.reject(new Error("offline")) });
      expect(() => drawn.renderer.render(run())).not.toThrow();
      await flush();
      expect(() => drawn.renderer.render(run())).not.toThrow();
      expect(drawn.calls.join(" ")).toContain(shapeCalls());
    });

    it("draws the shape marks when the art is null", async () => {
      const loadArt = vi.fn(() => Promise.resolve(null));
      const drawn = stubCanvas({ loadArt });
      drawn.renderer.render(run());
      await flush();
      drawn.renderer.render(run());
      expect(loadArt).toHaveBeenCalledTimes(1);
      expect(drawn.calls.slice(-shapeCalls().split(" ").length).join(" ")).toBe(shapeCalls());
    });

    it("draws one Explorer and one figure per visible Warden with its Mode, then renders again once", async () => {
      const art = { drawFigure: vi.fn() };
      const loadArt = vi.fn(() => Promise.resolve(art));
      const drawn = stubCanvas({ loadArt });
      drawn.renderer.render(run());
      expect(art.drawFigure).not.toHaveBeenCalled();
      await flush();
      expect(loadArt).toHaveBeenCalledTimes(1);
      const figures = art.drawFigure.mock.calls.map(([, key, mode]) => `${key}:${mode}`);
      expect(figures).toEqual(["fangmoor:patrol", "fangmoor:hunt", "explorer:idle"]);
      // The figure fills 0.9 of one tile.
      expect(art.drawFigure.mock.calls[0][3]).toBeCloseTo((640 / run().labyrinth.length) * 0.9);
      expect(art.drawFigure.mock.calls[0][4]).toBe(false);
      expect(art.drawFigure.mock.calls.every((call) => call[5] === false)).toBe(true);
    });

    it("passes soft to the Fangmoor art alone while Bright Start shows", async () => {
      const art = { drawFigure: vi.fn() };
      const drawn = stubCanvas({ loadArt: () => Promise.resolve(art), isBrightStart: () => true });
      drawn.renderer.render(run());
      await flush();
      const soft = art.drawFigure.mock.calls.map(([, key, , , , flag]) => `${key}:${flag}`);
      expect(soft).toEqual(["fangmoor:true", "fangmoor:true", "explorer:false"]);
    });

    it("keeps the danger ring under the Warden art and skips the glow in high contrast", async () => {
      document.documentElement.dataset.accessContrast = "strong";
      const art = { drawFigure: vi.fn() };
      const drawn = stubCanvas({ loadArt: () => Promise.resolve(art) });
      drawn.renderer.render(run());
      await flush();
      expect(art.drawFigure.mock.calls.every((call) => call[4] === true)).toBe(true);
      expect(drawn.context.setLineDash).toHaveBeenCalled();
    });
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

    // The chart pass builds the hatch pattern too, so the Fog pattern is the one built from the 8 pixel tile.
    expect(
      /** @type {Array<Array<{ width: number }>>} */ (context.createPattern.mock.calls).filter(([tile]) => tile.width === 8)
    ).toHaveLength(1);
    // The chart traces each cell once; the Fog pass traces no known tile.
    expect(context.rect).toHaveBeenCalledTimes(run.labyrinth.length ** 2);
    // The second frame blits the cached Fog layer: the Fog fills once.
    expect(fogFills).toEqual([{ pattern: true }]);
  });

  it("US-02.4 paints each pattern tile on a software canvas, so a reload gives the same pixels", () => {
    const { renderer, tiles } = stubCanvas();
    const run = questRun("VISIBLE-BRIDGE-PAIRS", "trail-scout", 9);

    renderer.render({ ...run, pulseVisible: [], revealed: ["0,0"] });

    expect(tiles.length).toBeGreaterThan(0);
    for (const tile of tiles) {
      expect(tile.contextArgs).toEqual(["2d", { willReadFrequently: true }]);
    }
  });

  it("US-02.2 builds an integer pixel Fog tile with 4 to 6 percent dots at each device ratio", () => {
    const original = window.devicePixelRatio;
    try {
      for (const ratio of [1, 2]) {
        window.devicePixelRatio = ratio;
        const { renderer, tiles } = stubCanvas();
        renderer.render(questRun("VISIBLE-BRIDGE-PAIRS", "trail-scout", 9));

        // The chart pass builds the land hatch tile first; the Fog pass builds the Fog tile second.
        expect(tiles).toHaveLength(2);
        const tile = tiles[1];
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

      // The Fog tile scales with the device ratio. The hatch tile stays 6 backing-store pixels at every ratio.
      // B-95: the ratio change clears the cache, so the hatch tile is built again.
      // The chart pass builds the hatch tile before the Fog pass builds the Fog tile.
      expect(tiles.map((tile) => tile.width)).toEqual([6, 8, 6, 16]);
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
    document.body.style.setProperty("--color-board-echo-text", "rgb(7, 8, 9)");
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

  it("B-10 follows the Explorer on a move and keeps a manual scroll through an appearance repaint", () => {
    const { canvas, renderer } = stubCanvas({ neatline: true });
    const frame = Object.assign(/** @type {{ parentElement: object }} */ (/** @type {unknown} */ (canvas)).parentElement, { clientWidth: 100, clientHeight: 100, scrollLeft: 0, scrollTop: 0 });
    Object.assign(canvas, { offsetLeft: 18, offsetTop: 18 });
    const base = board({});
    const start = { ...base, explorer: { ...base.explorer, col: 1, row: 0 } };

    renderer.render(start);
    const followed = frame.scrollLeft;
    expect(followed).toBeGreaterThan(0);

    // A repaint of the same Run, such as a theme change, keeps the scroll that the player chose.
    frame.scrollLeft = 5;
    renderer.render(start);
    expect(frame.scrollLeft).toBe(5);

    // A move follows the Explorer again.
    renderer.render({ ...start, explorer: { ...start.explorer, row: 1 } });
    expect(frame.scrollLeft).toBe(followed);
    expect(frame.scrollTop).toBeGreaterThan(0);
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

  it("US-02.1 draws the Echo pair number in the Echo text token", () => {
    document.body.style.setProperty("--color-board-echo-text", "rgb(1, 2, 3)");
    document.body.style.setProperty("--color-night-deep", "rgb(7, 8, 9)");
    const { context, renderer } = stubCanvas();
    let fillStyle = "";
    Object.defineProperty(context, "fillStyle", {
      get: () => fillStyle,
      set: (value) => {
        fillStyle = value;
      }
    });
    /** @type {string[]} */
    const textStyles = [];
    context.fillText = vi.fn(() => textStyles.push(fillStyle));

    renderer.render(board({ revealed: ["1,1"], echoes: [{ row: 1, col: 1, collected: false }] }));

    expect(textStyles).toEqual(["rgb(1, 2, 3)"]);
  });

  it("US-02.1 draws the closed Gate keyhole in the land colour, not the on-fill white", () => {
    document.body.style.setProperty("--color-land", "rgb(11, 12, 13)");
    document.body.style.setProperty("--color-on-fill", "rgb(250, 250, 250)");
    const { context, renderer } = stubCanvas();
    const paints = recordPaints(context);

    renderer.render(board({ revealed: ["1,1"], gate: { row: 1, col: 1, open: false } }));

    const fills = paints.filter((paint) => paint.kind === "fill");
    expect(fills.some((paint) => paint.style === "rgb(11, 12, 13)" && paint.path[0].startsWith("arc("))).toBe(true);
    expect(fills.some((paint) => paint.style === "rgb(250, 250, 250)")).toBe(false);
  });

  it("US-02.1 draws the sealed Gate X in the night ink, not the Warden ink", () => {
    document.body.style.setProperty("--color-night-deep", "rgb(7, 8, 9)");
    document.body.style.setProperty("--color-board-warden", "rgb(200, 0, 0)");
    const { context, renderer } = stubCanvas();
    const paints = recordPaints(context);

    renderer.render(board({ revealed: ["1,1"], gate: { row: 1, col: 1, open: true, sealed: true } }));

    const cross = paints.filter((paint) => paint.kind === "stroke" && paint.path[0].startsWith("moveTo("));
    expect(cross).toHaveLength(1);
    expect(cross[0].style).toBe("rgb(7, 8, 9)");
  });

  it("US-02.1 clamps the Warden danger ring inside its tile at the large mark scale", () => {
    document.body.style.setProperty("--maze-mark-scale", "1.22");
    document.body.style.setProperty("--color-danger-line", "rgb(3, 3, 3)");
    const { context, renderer } = stubCanvas();
    const paints = recordPaints(context);

    renderer.render(board({ revealed: ["1,1"], wardens: [{ row: 1, col: 1, id: 0, mode: "patrol" }] }));

    const ring = paints.find((paint) => paint.kind === "stroke" && paint.style === "rgb(3, 3, 3)");
    const radius = Number(ring?.path[0].match(/^arc\([^,]+,[^,]+,([^,]+),/)?.[1]);
    expect(radius).toBeLessThanOrEqual(320 * 0.48 + 0.005);
    expect(radius).toBeGreaterThan(0);
  });

  it("US-03.1 labels every index on a wide board and every k-th index on a narrow one", () => {
    const wide = stubCanvas({ width: 640, neatline: true });
    wide.renderer.render(board({ revealed: ["0,0"] }));
    expect(wide.neat.labels).toEqual(["A", "B", "1", "2"]);

    const labyrinth = Array.from({ length: 23 }, () => Array.from({ length: 23 }, () => 0));
    const narrow = stubCanvas({ width: 114, neatline: true });
    narrow.renderer.render(board({ labyrinth, revealed: ["0,0"] }));
    // Pitch is about 5px and the label 14px, so k is 5. The first and the last index stay labelled.
    expect(narrow.neat.labels.filter((text) => /^\d+$/.test(text)).map(Number)).toEqual([1, 6, 11, 16, 23]);
    expect(narrow.neat.labels.filter((text) => /^[A-Z]$/.test(text))).toEqual(["A", "F", "K", "P", "W"]);
    // Every tick stays: 24 lines on four edges.
    expect(narrow.neat.paths.filter((step) => step === "moveTo")).toHaveLength(4 * 24);
  });

  it("US-03.1 labels a short board by its font height and keeps the first and last row", () => {
    const labyrinth = Array.from({ length: 9 }, () => Array.from({ length: 9 }, () => 0));
    // Pitch is 8px: the label is 8px wide but 10px tall, so every row cannot stay.
    const small = stubCanvas({ width: 72, neatline: true });
    small.renderer.render(board({ labyrinth, revealed: ["0,0"] }));
    expect(small.neat.labels.filter((text) => /^\d+$/.test(text)).map(Number)).toEqual([1, 3, 5, 7, 9]);

    const tiny = stubCanvas({ width: 20, neatline: true });
    tiny.renderer.render(board({ labyrinth, revealed: ["0,0"] }));
    const rows = tiny.neat.labels.filter((text) => /^\d+$/.test(text)).map(Number);
    expect(rows[0]).toBe(1);
    expect(rows.at(-1)).toBe(9);
  });

  it("US-02.1 strokes the open Gate arrow in the on-fill light token", () => {
    document.body.style.setProperty("--color-board-light", "rgb(9, 9, 1)");
    document.body.style.setProperty("--color-board-light-on-fill", "rgb(7, 7, 2)");
    const { context, renderer } = stubCanvas();
    const paints = recordPaints(context);
    renderer.render(board({ revealed: ["1,1"], gate: { row: 1, col: 1, open: true, sealed: false } }));
    expect(paints.some((paint) => paint.kind === "stroke" && paint.style === "rgb(7, 7, 2)")).toBe(true);
  });

  it("US-01.2 doubles the Coastline and fills the Fog flat in high contrast", () => {
    /** @param {boolean} strong */
    const measure = (strong) => {
      if (strong) document.documentElement.dataset.accessContrast = "strong";
      const { context, renderer, tiles } = stubCanvas();
      /** @type {number[]} */
      const widths = [];
      const stroke = context.stroke;
      context.stroke = vi.fn(() => {
        widths.push(/** @type {{ lineWidth: number }} */ (/** @type {unknown} */ (context)).lineWidth);
        stroke();
      });
      renderer.render(board({ revealed: ["0,0", "0,1"] }));
      document.documentElement.removeAttribute("data-access-contrast");
      return { coast: widths[0], fogTile: tiles.some((tile) => tile.width === 8) };
    };

    const normal = measure(false);
    const strong = measure(true);
    expect(strong.coast).toBe(normal.coast * 2);
    expect(normal.fogTile).toBe(true);
    expect(strong.fogTile).toBe(false);
  });

  it("US-01.2 snaps land fills to the coastline edges at a fractional tile size", () => {
    const labyrinth = Array.from({ length: 23 }, (_, row) =>
      Array.from({ length: 23 }, (_, col) => (row === 0 && col === 1 ? 0 : 1))
    );
    const { context, renderer } = stubCanvas({ width: 320 });
    const paints = recordPaints(context);

    renderer.render(board({ labyrinth, revealed: ["0,0", "0,1"] }));

    // 320 / 23 = 13.91: the wall at column 1 spans 14 to 28, the rounded coastline edges.
    expect(paints.some((paint) => paint.kind === "fill" && paint.path.includes("rect(14.00,0.00,14.00,14.00)"))).toBe(true);
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

  it("US-03.1 sizes the Neatline from the board box of a small board", () => {
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

  it("A-40 covers the whole board on pause and draws no mark under the cover", () => {
    const { calls, context, renderer } = stubCanvas();
    const run = questRun("PALETTE-REREAD", "bright-start", 1);
    /** @type {Array<{ style: string, w: number, h: number }>} */
    const rects = [];
    /** @type {string[]} */
    const textFills = [];
    let fillStyle = "";
    Object.defineProperty(context, "fillStyle", {
      get: () => fillStyle,
      set: (value) => {
        fillStyle = value;
      }
    });
    context.fillRect = vi.fn((_x, _y, w, h) => {
      rects.push({ style: fillStyle, w, h });
    });
    context.fillText = vi.fn((text) => textFills.push(`${text}|${fillStyle}`));
    document.body.style.setProperty("--color-board-cover", "rgb(250, 251, 252)");
    document.body.style.setProperty("--color-board-cover-ink", "rgb(4, 4, 4)");
    const here = `${run.explorer.row},${run.explorer.col}`;

    renderer.render({
      ...run,
      pulseVisible: [],
      revealed: [here],
      status: "paused",
      wardens: [{ row: run.explorer.row, col: run.explorer.col, id: 0, mode: "hunt" }]
    });

    expect(rects).toEqual([{ style: "rgb(250, 251, 252)", w: 640, h: 640 }]);
    expect(textFills).toEqual(["PAUSED|rgb(4, 4, 4)"]);
    expect(calls.filter((call) => call !== "fillRect")).toEqual([]);
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

  it("B-89 keeps the cached palette across frames and reads it again on a repaint attribute", async () => {
    // happy-dom 20 holds its observer callbacks through a WeakRef, so a garbage collection can silence a real observer.
    /** @type {{ callback: () => void, options: MutationObserverInit }[]} */
    const observed = [];
    vi.stubGlobal(
      "MutationObserver",
      class {
        /** @param {() => void} callback */
        constructor(callback) {
          observed.push({ callback, options: {} });
        }
        /** @param {Node} _target @param {MutationObserverInit} options */
        observe(_target, options) {
          observed[observed.length - 1].options = options;
        }
      }
    );
    try {
      const { renderer, tiles } = stubCanvas();
      const run = questRun("PALETTE-REREAD", "bright-start", 1);
      const frame = () => renderer.render({ ...run, pulseVisible: [], revealed: [] });
      const settle = () => new Promise((done) => setTimeout(done, 0));
      expect(observed).toHaveLength(1);
      const { callback, options } = observed[0];
      expect(options.attributeFilter).toEqual(
        expect.arrayContaining(["data-access-contrast", "data-access-marks"])
      );

      document.body.style.setProperty("--color-fog", "rgb(1, 2, 3)");
      frame();
      document.body.style.setProperty("--color-fog", "rgb(4, 5, 6)");
      frame();
      // The second frame reuses the palette and the Fog pattern.
      expect(tiles.filter((tile) => tile.width === 8).map((tile) => tile.fills[0].style)).toEqual(["rgb(1, 2, 3)"]);

      // happy-dom needs a tick before a computed style shows an inline change.
      await settle();
      // A token attribute change reads the palette again and repaints the last Run.
      callback();
      expect(tiles.at(-1)?.fills[0].style).toBe("rgb(4, 5, 6)");

      document.body.style.setProperty("--color-fog", "rgb(7, 8, 9)");
      await settle();
      callback();
      expect(tiles.at(-1)?.fills[0].style).toBe("rgb(7, 8, 9)");
    } finally {
      vi.unstubAllGlobals();
    }
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
    const clips = recordClips(context);

    renderer.render(board({ revealed: ["0,0", "0,1", "1,1"] }));

    // The chart paints every cell; the Fog clip shows the three known tiles only.
    expect(clips).toEqual([["0,0,320,320", "320,0,320,320", "320,320,320,320"]]);

    // Popup paints the passage as a light meadow tile and the land as a darker hedge.
    expect(oklabOf(canvasToken(LIGHT, "--color-passage"))[0]).toBeGreaterThan(oklabOf(canvasToken(LIGHT, "--color-land"))[0]);
    const water = paints.find(
      (paint) => paint.kind === "fill" && paint.style === canvasToken(LIGHT, "--color-passage")
    );
    // ADR 0052 item 1: the passage (0,0) is water, and the walls (0,1) and (1,1) are land.
    expect(water?.path).toEqual(["rect(0.00,0.00,320.00,320.00)"]);
    const land = paints.find(
      (paint) => paint.kind === "fill" && paint.style === canvasToken(LIGHT, "--color-land")
    );
    // The chart paints the unknown wall (1,0) too; the Fog clip above hides it.
    expect(land?.path).toEqual([
      "rect(320.00,0.00,320.00,320.00)",
      "rect(0.00,320.00,320.00,320.00)",
      "rect(320.00,320.00,320.00,320.00)"
    ]);
    const hatch = paints.find(
      (paint) => paint !== land && paint.kind === "fill" && paint.path.join() === land?.path.join()
    );
    expect(hatch).toBeDefined();
    // The chart pass builds the hatch tile before the Fog pass builds the Fog tile.
    const hatchTile = tiles[0];
    expect(hatchTile.width).toBe(6);
    expect(hatchTile.height).toBe(6);
    expect(hatchTile.fills).toHaveLength(6);
    expect(hatchTile.fills.every((fill) => fill.w === 1 && fill.h === 1)).toBe(true);
    expect(hatchTile.fills.every((fill) => fill.style === canvasToken(LIGHT, "--color-hatch"))).toBe(true);
    expect(hatchTile.fills.every((fill) => fill.x + fill.y === 5)).toBe(true);
  });

  it("US-02.1 paints each passage cell (1) as water and each wall cell (0) as land, with the coastline between", () => {
    document.body.style.setProperty("--color-passage", "rgb(1, 1, 9)");
    document.body.style.setProperty("--color-land", "rgb(9, 9, 1)");
    document.body.style.setProperty("--color-coastline", "rgb(7, 7, 7)");
    const { context, renderer } = stubCanvas();
    const paints = recordPaints(context);

    renderer.render(board({ revealed: ["0,0", "0,1", "1,0", "1,1"] }));

    // ADR 0052 item 1 and design.md: a passage is water and a wall is land.
    const water = paints.filter((paint) => paint.kind === "fill" && paint.style === "rgb(1, 1, 9)");
    expect(water.map((paint) => paint.path)).toEqual([["rect(0.00,0.00,320.00,320.00)"]]);
    const land = paints.filter((paint) => paint.kind === "fill" && paint.style === "rgb(9, 9, 1)");
    expect(land.map((paint) => paint.path)).toEqual([
      ["rect(320.00,0.00,320.00,320.00)", "rect(0.00,320.00,320.00,320.00)", "rect(320.00,320.00,320.00,320.00)"]
    ]);
    const coast = paints.filter((paint) => paint.kind === "stroke" && paint.style === "rgb(7, 7, 7)");
    expect(coast).toHaveLength(1);
    expect(coast[0].path.filter((step) => step.startsWith("moveTo"))).toHaveLength(2);
  });

  it("US-02.1 paints every known passage in one water fill (ADR 0052 item 1)", () => {
    document.body.style.setProperty("--color-passage", "rgb(1, 1, 9)");
    const { context, renderer } = stubCanvas();
    const paints = recordPaints(context);

    renderer.render(
      board({
        labyrinth: [
          [1, 1],
          [0, 1]
        ],
        revealed: ["0,0", "0,1", "1,0", "1,1"]
      })
    );

    const water = paints.filter((paint) => paint.kind === "fill" && paint.style === "rgb(1, 1, 9)");
    expect(water.map((paint) => paint.path)).toEqual([
      ["rect(0.00,0.00,320.00,320.00)", "rect(320.00,0.00,320.00,320.00)", "rect(320.00,320.00,320.00,320.00)"]
    ]);
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
    // The passage (0,0) borders the wall (0,1) at x = 320 and the wall (1,0) at y = 320.
    const points = coast[0].path.map((step) => step.replace(/^\w+\(|\)$/g, "").split(",").map(Number));
    // tile 320 * 0.06 = 19.2, rounded to 19 device pixels. Centred on 320.5, it covers 311..330.
    expect(widths).toContain(19);
    const reachEnd = 10;
    // An odd width sits on a half pixel across the edge and the ends sit on whole pixels.
    expect(points.every(([x, y]) => (x === 320.5 && Number.isInteger(y)) || (y === 320.5 && Number.isInteger(x)))).toBe(true);
    // The joined end reaches the far side of the crossing stroke. The free ends stop on the edge.
    const horizontal = points.filter(([, y]) => y === 320.5).map(([x]) => x);
    const vertical = points.filter(([x]) => x === 320.5).map(([, y]) => y);
    expect(Math.min(...horizontal)).toBe(0);
    expect(Math.max(...horizontal)).toBe(320 + reachEnd);
    expect(Math.min(...vertical)).toBe(0);
    expect(Math.max(...vertical)).toBe(320 + reachEnd);
    expect(/** @type {Record<string, unknown>} */ (context).lineCap).toBe("butt");
  });

  it("US-02.1 reaches past the ends of a coastline edge only at joined corners", () => {
    document.body.style.setProperty("--color-coastline", "rgb(7, 7, 7)");
    const { context, renderer } = stubCanvas();
    const paints = recordPaints(context);
    const labyrinth = Array.from({ length: 4 }, (_, row) =>
      Array.from({ length: 4 }, (_, col) => (row === 1 && col === 1 ? 1 : 0))
    );
    const revealed = labyrinth.flatMap((cells, row) => cells.map((_, col) => `${row},${col}`));

    renderer.render(board({ labyrinth, revealed }));

    // The wall ring has four joined corners. Tile 160 gives width 10: reach 5 on each side.
    const coast = paints.find((paint) => paint.style === "rgb(7, 7, 7)");
    const top = coast?.path.filter((step) => /,160\.00\)$/.test(step)).map((step) => Number(step.match(/\(([\d.]+),/)?.[1]));
    expect(top).toEqual([155, 325]);

    // One wall edge with unknown tiles around it has free ends: no reach past the edge.
    const lone = stubCanvas();
    const lonePaints = recordPaints(lone.context);
    lone.renderer.render(board({ revealed: ["0,0", "0,1"] }));
    const loneCoast = lonePaints.find((paint) => paint.style === "rgb(7, 7, 7)");
    const ys = loneCoast?.path.map((step) => Number(step.match(/,([\d.]+)\)$/)?.[1]));
    expect(Math.min(...(ys ?? []))).toBe(0);
    expect(Math.max(...(ys ?? []))).toBe(320);
  });

  it("US-03.1 loads the Grid and body fonts with the tokens read at call time", async () => {
    document.body.style.setProperty("--font-utility", "Old Mono");
    const load = vi.fn(() => Promise.resolve([]));
    Object.defineProperty(document, "fonts", { configurable: true, value: { load } });
    try {
      const { renderer } = stubCanvas();
      document.body.style.setProperty("--font-utility", "Geist Mono");
      document.body.style.setProperty("--font-body", "Geist");
      await renderer.loadFonts();
      expect(load).toHaveBeenCalledWith("10px Geist Mono");
      expect(load).toHaveBeenCalledWith("700 10px Geist");
      expect(load).toHaveBeenCalledWith("500 10px Geist");
      expect(load).not.toHaveBeenCalledWith("10px Old Mono");
    } finally {
      Reflect.deleteProperty(document, "fonts");
    }
  });

  it("US-03.1 resolves once every font has settled, even when one load fails", async () => {
    /** @type {Array<() => void>} */
    const bodyLoads = [];
    const load = vi.fn((/** @type {string} */ shorthand) => {
      if (shorthand.startsWith("10px")) return Promise.reject(new Error("grid font failed"));
      return new Promise((done) => {
        bodyLoads.push(() => done([]));
      });
    });
    Object.defineProperty(document, "fonts", { configurable: true, value: { load } });
    try {
      const { renderer } = stubCanvas();
      let settled = false;
      const loading = renderer.loadFonts().then(() => {
        settled = true;
      });
      await Promise.resolve();
      expect(settled).toBe(false);
      expect(bodyLoads).toHaveLength(2);
      for (const finish of bodyLoads) finish();
      await loading;
      expect(settled).toBe(true);
    } finally {
      Reflect.deleteProperty(document, "fonts");
    }
  });

  it("US-02.1 paints the Explorer as an ink ring on a paper disc with an Explorer dot", () => {
    document.body.style.setProperty("--color-board-explorer-ring", "rgb(5, 5, 5)");
    document.body.style.setProperty("--color-board-explorer", "rgb(6, 6, 6)");
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

  it("US-01.2 casts a white casing under each Signal line in every contrast mode", () => {
    document.body.style.setProperty("--color-board-light", "rgb(9, 9, 1)");
    document.body.style.setProperty("--color-board-gate", "rgb(9, 9, 2)");
    document.body.style.setProperty("--color-on-fill", "rgb(240, 240, 240)");
    document.body.style.setProperty("--color-board-casing", "rgb(250, 250, 250)");
    const magenta = ["rgb(9, 9, 1)", "rgb(9, 9, 2)"];
    const marks = {
      echoBridges: [{ echoIndex: 0, from: { row: 0, col: 0 }, to: { row: 1, col: 1 }, open: true }],
      signalBells: [{ id: 0, row: 0, col: 1, spent: false }],
      tideDoors: [{ id: 0, from: { row: 0, col: 0 }, to: { row: 0, col: 1 }, open: false }]
    };
    /** @param {boolean} strong */
    const strokes = (strong) => {
      if (strong) document.documentElement.dataset.accessContrast = "strong";
      const { context, renderer } = stubCanvas();
      const paints = recordPaints(context);
      /** @type {number[]} */
      const widths = [];
      const stroke = context.stroke;
      context.stroke = vi.fn(() => {
        widths.push(/** @type {{ lineWidth: number }} */ (/** @type {unknown} */ (context)).lineWidth);
        stroke();
      });
      renderer.render(board({ revealed: ["1,1"], ...marks }));
      document.documentElement.removeAttribute("data-access-contrast");
      return paints.filter((paint) => paint.kind === "stroke").map((paint, index) => ({ ...paint, width: widths[index] }));
    };

    for (const strong of [false, true]) {
      const all = strokes(strong);
      const lines = all.filter((paint) => magenta.includes(paint.style));
      expect(lines.length).toBeGreaterThan(0);
      for (const line of lines) {
        const casing = all[all.indexOf(line) - 1];
        expect(casing.style).toBe("rgb(250, 250, 250)");
        expect(casing.path).toEqual(line.path);
        expect(casing.width).toBeGreaterThan(line.width);
      }
    }
  });

  it("US-01.2 casts the dark Night casing under a Signal line, never the white on-fill", () => {
    document.body.style.setProperty("--color-board-light", "rgb(9, 9, 1)");
    document.body.style.setProperty("--color-on-fill", "rgb(255, 255, 255)");
    document.body.style.setProperty("--color-board-casing", "rgb(20, 22, 30)");
    const { context, renderer } = stubCanvas();
    const paints = recordPaints(context);

    renderer.render(board({
      revealed: ["1,1"],
      echoBridges: [{ echoIndex: 0, from: { row: 0, col: 0 }, to: { row: 1, col: 1 }, open: true }]
    }));

    const lines = paints.flatMap((paint, index) =>
      paint.kind === "stroke" && paint.style === "rgb(9, 9, 1)" ? [index] : []
    );
    expect(lines.length).toBeGreaterThan(0);
    for (const index of lines) expect(paints[index - 1].style).toBe("rgb(20, 22, 30)");
    expect(paints.some((paint) => paint.kind === "stroke" && paint.style === "rgb(255, 255, 255)")).toBe(false);
  });

  it("US-01.2 casts the casing for the closed-bridge X and the spent-bell slash before every ink stroke of the mark", () => {
    document.body.style.setProperty("--color-board-light", "rgb(9, 9, 1)");
    document.body.style.setProperty("--color-board-gate", "rgb(9, 9, 2)");
    document.body.style.setProperty("--color-board-casing", "rgb(250, 250, 250)");
    const casing = "rgb(250, 250, 250)";
    /** @param {Partial<ReturnType<typeof board>>} marks @param {boolean} strong */
    const magentaStrokes = (marks, strong) => {
      if (strong) document.documentElement.dataset.accessContrast = "strong";
      const { context, renderer } = stubCanvas();
      const paints = recordPaints(context);
      renderer.render(board({ revealed: ["1,1"], ...marks }));
      document.documentElement.removeAttribute("data-access-contrast");
      return paints.filter(
        (paint) => paint.kind === "stroke" && ["rgb(9, 9, 1)", "rgb(9, 9, 2)", casing].includes(paint.style)
      );
    };

    for (const strong of [false, true]) {
      const bridge = magentaStrokes({
        echoBridges: [{ echoIndex: 0, from: { row: 0, col: 0 }, to: { row: 1, col: 1 }, open: false }]
      }, strong);
      const cross = bridge[bridge.length - 1];
      expect(cross.style).toBe("rgb(9, 9, 2)");
      expect(cross.path).toHaveLength(4);
      const crossCasing = bridge.findIndex((paint) => paint.style === casing && paint.path.length === 4);
      expect(crossCasing).toBeGreaterThanOrEqual(0);
      expect(bridge[crossCasing].path).toEqual(cross.path);
      const firstInk = bridge.findIndex((paint) => paint.style !== casing);
      expect(crossCasing).toBeLessThan(firstInk);

      const bell = magentaStrokes({ signalBells: [{ id: 0, row: 0, col: 1, spent: true }] }, strong);
      // Body casing, slash casing, then the outline ink and the slash ink.
      expect(bell.map((paint) => paint.style)).toEqual([casing, casing, "rgb(9, 9, 2)", "rgb(9, 9, 2)"]);
      expect(bell[1].path).toEqual(bell[3].path);
      expect(bell[1].path).toHaveLength(2);
    }
  });

  it("US-01.2 casts the clapper casing disc before the clapper ink and the bell outline ink, live and spent", () => {
    document.body.style.setProperty("--color-board-light", "rgb(9, 9, 1)");
    document.body.style.setProperty("--color-board-gate", "rgb(9, 9, 2)");
    document.body.style.setProperty("--color-board-casing", "rgb(250, 250, 250)");
    const casing = "rgb(250, 250, 250)";
    for (const [spent, ink] of /** @type {const} */ ([[false, "rgb(9, 9, 1)"], [true, "rgb(9, 9, 2)"]])) {
      const { context, renderer } = stubCanvas();
      const paints = recordPaints(context);
      renderer.render(board({ revealed: ["1,1"], signalBells: [{ id: 0, row: 0, col: 1, spent }] }));
      const disc = paints.findIndex((paint) => paint.kind === "fill" && paint.style === casing);
      const clapperInk = paints.findIndex((paint) => paint.kind === "fill" && paint.style === ink);
      const outlineInk = paints.findIndex((paint) => paint.kind === "stroke" && paint.style === ink);
      expect(disc).toBeGreaterThanOrEqual(0);
      expect(disc).toBeLessThan(clapperInk);
      expect(disc).toBeLessThan(outlineInk);
      // The casing disc shares the clapper centre and is wider than the clapper ink.
      const arc = (/** @type {string[]} */ path) => path[0].match(/arc\(([^)]*)\)/)?.[1].split(",").map(Number) ?? [];
      const [dx, dy, dr] = arc(paints[disc].path);
      const [cx, cy, cr] = arc(paints[clapperInk].path);
      expect([dx, dy]).toEqual([cx, cy]);
      expect(dr).toBeGreaterThan(cr);
    }
  });

  it("US-01.2 keeps the casing the light board paper in every theme and mode", () => {
    for (const [theme, base] of Object.entries(THEMES)) {
      for (const [mode, selector] of Object.entries(MODES)) {
        const tokens = new Map([...base, ...(selector ? daylightScope(selector) : [])]);
        const [lightness] = resolveColor(tokens, "--color-board-casing").lab;
        // Popup keeps the board paper light in Night, because the board paints the same tiles in every theme.
        expect(lightness, `${theme}/${mode}`).toBeGreaterThan(0.95);
      }
    }
    expect(canvasToken(NIGHT_SYSTEM, "--color-board-casing")).toBe(canvasToken(NIGHT_EXPLICIT, "--color-board-casing"));
  });

  it("US-02.1 keeps the sealed Gate light inside its tile at the large mark scale", () => {
    document.body.style.setProperty("--maze-mark-scale", "1.22");
    document.body.style.setProperty("--color-board-light", "rgb(9, 9, 1)");
    const { context, renderer } = stubCanvas();
    const paints = recordPaints(context);

    renderer.render(board({ revealed: ["1,1"], gate: { row: 1, col: 1, open: true, sealed: true } }));

    const light = paints.find((paint) => paint.kind === "fill" && paint.style === "rgb(9, 9, 1)");
    const arc = /** @type {string} */ (light?.path[0] ?? "").match(/^arc\([\d.]+,([\d.]+),([\d.]+),/);
    const [y, radius] = [Number(arc?.[1]), Number(arc?.[2])];
    // The 2x2 board has 320 pixel tiles, so the Gate tile spans y 320 to 640.
    expect(y - radius).toBeGreaterThanOrEqual(320);
  });

  it("US-01.1 gives every board mark a row, and the two Night blocks the same rows", () => {
    for (const scope of SCOPES) {
      for (const name of BOARD_ROWS) {
        expect(() => canvasToken(scope, name), name).not.toThrow();
      }
      expect(canvasToken(scope, "--color-board-warden")).toBe(canvasToken(scope, "--fur"));
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
            // Strong mode paints the Fog flat with no dots, so only the dot-on-Fog pair does not apply there.
            if (mode === "strong" && mark === "--color-fog-dot") continue;
            // Strong contrast lifts every pair on the passage and the land to 4.5:1.
            const needed = mode === "strong" && floor === 3 ? 4.5 : floor;
            const ratio = contrastOver(resolveColor(tokens, mark), resolveColor(tokens, ground));
            if (ratio < needed) {
              failures.push(`${theme}/${mode}/${palette}: ${mark} on ${ground} ${ratio.toFixed(2)} < ${needed}`);
            }
          }
        }
      }
    }
    const strong = Object.entries(THEMES).flatMap(([theme, base]) => {
      const tokens = new Map([...base, ...daylightScope(/** @type {string} */ (MODES.strong))]);
      return STRONG_ONLY_PAIRS.map(([mark, ground, floor]) => {
        const ratio = contrastOver(resolveColor(tokens, mark), resolveColor(tokens, ground));
        return ratio < floor ? `${theme}/strong: ${mark} on ${ground} ${ratio.toFixed(2)} < ${floor}` : "";
      });
    });
    failures.push(...strong.filter(Boolean));
    expect(failures).toEqual([]);
  });

  it("US-01.2 paints the Explorer disc in the forced light paper in every forced mode", () => {
    for (const [theme, base] of Object.entries(THEMES)) {
      for (const [mode, selector] of Object.entries(MODES)) {
        const tokens = new Map([...base, ...(selector ? daylightScope(selector) : [])]);
        const expected = resolveColor(tokens, "--board-paper");
        expect(resolveColor(tokens, DISC).lab, `${theme}/${mode}`).toEqual(expected.lab);
        const ring = resolveColor(tokens, "--color-board-explorer-ring").lab;
        const ink = resolveColor(tokens, "--board-ink").lab;
        expect(ring, `${theme}/${mode} ring`).toEqual(ink);
      }
    }
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

  it("US-03.3 throws an error that names the token when a board token is empty", () => {
    seedBoardTokens();
    document.body.style.removeProperty("--color-passage");
    expect(() => stubCanvas({ seed: false })).toThrow(MissingBoardTokenError);
    expect(() => stubCanvas({ seed: false })).toThrow("--color-passage");
  });

  it("US-03.3 resolves each board token and paints a Run from the Popup tokens", () => {
    for (const name of BOARD_TOKENS) expect(resolveBoardToken(name), name).not.toBe("");
    for (const name of BOARD_TOKENS) document.body.style.removeProperty(name);
    seedBoardTokens();
    expect(document.body.style.getPropertyValue("--color-passage")).toBe(resolveBoardToken("--color-passage"));
    const { renderer } = stubCanvas({ seed: false });
    const run = questRun("VISIBLE-BRIDGE-PAIRS", "trail-scout", 9);
    expect(() => renderer.render({ ...run, pulseVisible: [], revealed: [] })).not.toThrow();
  });

  it("US-03.1 repaints the last Run with a new palette when the colour scheme changes", () => {
    /** @type {() => void} */
    let onChange = () => {};
    vi.stubGlobal("matchMedia", () => ({
      addEventListener: (/** @type {string} */ _type, /** @type {() => void} */ listener) => {
        onChange = listener;
      }
    }));
    try {
      const { renderer, tiles } = stubCanvas();
      const run = questRun("VISIBLE-BRIDGE-PAIRS", "trail-scout", 9);
      onChange();
      expect(tiles).toHaveLength(0);
      renderer.render({ ...run, pulseVisible: [], revealed: [] });
      const built = tiles.length;
      document.body.style.setProperty("--color-fog", "rgb(1, 2, 3)");
      onChange();
      expect(tiles.length).toBeGreaterThan(built);
      expect(tiles.some((tile) => tile.fills[0]?.style === "rgb(1, 2, 3)")).toBe(true);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("US-03.1 repaints the last Run when data-theme changes", async () => {
    const { renderer, tiles } = stubCanvas();
    const run = questRun("VISIBLE-BRIDGE-PAIRS", "trail-scout", 9);
    renderer.render({ ...run, pulseVisible: [], revealed: [] });
    document.body.style.setProperty("--color-fog", "rgb(4, 5, 6)");
    document.documentElement.setAttribute("data-theme", "dark");
    try {
      await vi.waitFor(() => expect(tiles.some((tile) => tile.fills[0]?.style === "rgb(4, 5, 6)")).toBe(true));
    } finally {
      document.documentElement.removeAttribute("data-theme");
    }
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

  it("US-03.1 keeps a canvas focus ring in a browser without :has()", () => {
    const fallback = daylightCss.match(/@supports not selector\(:has\(\*\)\)\s*\{\s*#maze-canvas:focus-visible\s*\{([^{}]*)\}/)?.[1] ?? "";
    expect(fallback).toMatch(/outline:\s*0\.2rem solid var\(--color-focus\)/);
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

  it("US-02.3 falls back to the built-in light values when every CSS variable is missing", () => {
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
    // Meadow passage, hedge land, board ink, sun, board paper, night ink, Pulse wash, coral danger line, fur Warden, Explorer.
    for (const style of [
      "oklch(73.4% 0.177 137.9)",
      "oklch(60% 0.12 140)",
      "oklch(30.5% 0.07 310.3)",
      "oklch(90.1% 0.106 84.7)",
      "oklch(98.6% 0.014 84.6)",
      "oklch(20% 0.05 310)",
      "oklch(45% 0.13 243 / 30%)",
      "oklch(68.5% 0.206 32.5)",
      "oklch(26% 0.086 299.6)",
      "oklch(84.4% 0.092 2)"
    ]) {
      expect(styles, style).toContain(style);
    }
    for (const stale of ["oklch(95.5% 0.022 232)", "oklch(18% 0.012 250)", "oklch(52% 0.17 250)", "oklch(98.5% 0.014 88)"]) {
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
      paints.every((paint) => (typeof paint.style === "string" ? paint.style.length > 0 : /** @type {{ pattern?: boolean }} */ (paint.style)?.pattern === true))
    ).toBe(true);
    expect(paints.some((paint) => typeof paint.style === "string" && paint.style.startsWith("oklch("))).toBe(true);
  });
});

describe("R1a renderer findings", () => {
  const settle = () => new Promise((done) => setTimeout(done, 0));

  afterEach(async () => {
    document.documentElement.style.removeProperty("font-size");
    document.documentElement.removeAttribute("data-access-contrast");
    await settle();
    document.body.removeAttribute("style");
  });

  /**
   * Gives the stub context a line state that save and restore keep, and records the state at every stroke.
   * @param {ReturnType<typeof stubCanvas>["context"]} context
   */
  function trackLineState(context) {
    const state = { lineCap: "butt", lineJoin: "miter" };
    /** @type {Array<{ lineCap: string, lineJoin: string }>} */
    const strokes = [];
    /** @type {Array<typeof state>} */
    const stack = [];
    for (const key of /** @type {const} */ (["lineCap", "lineJoin"])) {
      Object.defineProperty(context, key, {
        configurable: true,
        get: () => state[key],
        set: (value) => {
          state[key] = value;
        }
      });
    }
    context.save = vi.fn(() => {
      stack.push({ ...state });
    });
    context.restore = vi.fn(() => {
      Object.assign(state, stack.pop());
    });
    context.stroke = vi.fn(() => {
      strokes.push({ ...state });
    });
    return strokes;
  }

  /** @param {ReturnType<typeof stubCanvas>["context"]} context */
  function trackFonts(context) {
    /** @type {string[]} */
    const fonts = [];
    Object.defineProperty(context, "font", {
      configurable: true,
      get: () => fonts.at(-1) ?? "",
      set: (value) => {
        fonts.push(value);
      }
    });
    return fonts;
  }

  /** @param {number} ratio @param {() => void} body */
  function atDeviceRatio(ratio, body) {
    const original = window.devicePixelRatio;
    window.devicePixelRatio = ratio;
    try {
      body();
    } finally {
      window.devicePixelRatio = original;
    }
  }

  it("B-81 restores the line cap and join after a Gate", () => {
    const { context, renderer } = stubCanvas();
    const strokes = trackLineState(context);

    renderer.render(
      board({
        explorer: { row: 1, col: 1, vitality: 3, maxVitality: 3 },
        gate: { row: 0, col: 1, open: false },
        revealed: ["0,1", "1,1"]
      })
    );

    // The Explorer ring is the last stroke, drawn after the Gate.
    expect(strokes.at(-1)).toEqual({ lineCap: "butt", lineJoin: "miter" });
  });

  it("B-81 restores the line cap and join after a Warden", () => {
    const { context, renderer } = stubCanvas();
    const strokes = trackLineState(context);

    renderer.render(
      board({
        explorer: { row: 1, col: 1, vitality: 3, maxVitality: 3 },
        revealed: ["0,1", "1,1"],
        wardens: [{ row: 0, col: 1, id: 0, mode: "hunt" }]
      })
    );

    expect(strokes.at(-1)).toEqual({ lineCap: "butt", lineJoin: "miter" });
  });

  it("B-82 draws the Explorer before the Wardens in a Warden Challenge", () => {
    const { context, renderer } = stubCanvas();
    const paints = recordPaints(context);
    // Unique colours keep other marks from matching.
    const disc = "rgb(11, 11, 11)";
    const warden = "rgb(22, 22, 22)";
    document.body.style.setProperty("--color-board-explorer-disc", disc);
    document.body.style.setProperty("--color-board-warden", warden);

    renderer.render(
      board({
        explorer: { row: 1, col: 1, vitality: 3, maxVitality: 3 },
        revealed: ["1,1"],
        status: "challenge",
        wardens: [{ row: 1, col: 1, id: 0, mode: "patrol" }]
      })
    );

    const explorerAt = paints.findIndex((paint) => paint.kind === "fill" && paint.style === disc);
    const wardenAt = paints.findIndex((paint) => paint.kind === "fill" && paint.style === warden);
    expect(explorerAt).toBeGreaterThanOrEqual(0);
    expect(wardenAt).toBeGreaterThan(explorerAt);
  });

  it("B-83 draws a Windway from one known end without revealing the partner tile", () => {
    document.body.style.setProperty("--color-on-fill", WINDWAY_DISC);
    const { context, renderer } = stubCanvas();
    const paints = recordPaints(context);
    const clips = recordClips(context);

    renderer.render(
      board({
        revealed: ["1,0"],
        windways: [{ source: { row: 1, col: 0 }, destination: { row: 0, col: 0 }, direction: "up" }]
      })
    );

    // Tile 0,0 is a passage. The chart paints its water, so the Fog clip must hold tile 1,0 only.
    expect(clips).toEqual([["0,320,320,320"]]);
    expect(windwayDiscs(paints)).toHaveLength(1);
  });

  it("B-83 draws a Windway from the destination end alone", () => {
    document.body.style.setProperty("--color-on-fill", WINDWAY_DISC);
    const { context, renderer } = stubCanvas();
    const paints = recordPaints(context);

    renderer.render(
      board({
        revealed: ["0,0"],
        windways: [{ source: { row: 1, col: 0 }, destination: { row: 0, col: 0 }, direction: "up" }]
      })
    );

    expect(windwayDiscs(paints)).toHaveLength(1);
  });

  it("US-03.1 repaints the last Run when the contrast preference changes", () => {
    /** @type {Record<string, () => void>} */
    const listeners = {};
    vi.stubGlobal("matchMedia", (/** @type {string} */ query) => ({
      addEventListener: (/** @type {string} */ _type, /** @type {() => void} */ listener) => {
        listeners[query] = listener;
      }
    }));
    try {
      const { renderer, tiles } = stubCanvas();
      const run = questRun("VISIBLE-BRIDGE-PAIRS", "trail-scout", 9);
      renderer.render({ ...run, pulseVisible: [], revealed: [] });
      const built = tiles.length;
      document.body.style.setProperty("--color-fog", "rgb(7, 8, 9)");
      expect(listeners["(prefers-contrast: more)"]).toBeTypeOf("function");
      listeners["(prefers-contrast: more)"]();
      expect(tiles.length).toBeGreaterThan(built);
      expect(tiles.some((tile) => tile.fills[0]?.style === "rgb(7, 8, 9)")).toBe(true);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("B-85 restores the context when a mark throws", () => {
    const { context, renderer } = stubCanvas();
    context.fillRect = vi.fn(() => {
      throw new Error("canvas lost");
    });

    expect(() => renderer.render(board({ revealed: ["0,0"] }))).toThrow("canvas lost");
    expect(context.save.mock.calls.length).toBeGreaterThan(0);
    expect(context.restore.mock.calls.length).toBe(context.save.mock.calls.length);
  });

  it("B-86 and B-24 sizes the backing store from a 400x300 box without a 320 clamp", () => {
    const wide = stubCanvas({ width: 400, height: 300 });
    wide.renderer.render(board({ revealed: ["0,0"] }));
    expect([wide.canvas.width, wide.canvas.height]).toEqual([400, 300]);

    const small = stubCanvas({ width: 200 });
    small.renderer.render(board({ revealed: ["0,0"] }));
    expect([small.canvas.width, small.canvas.height]).toEqual([200, 200]);
  });

  it("B-23 scales the font floors by the device ratio", () => {
    atDeviceRatio(2, () => {
      const paused = stubCanvas({ width: 200 });
      const pausedFonts = trackFonts(paused.context);
      paused.renderer.render(board({ status: "paused" }));
      // 200 CSS pixels at ratio 2 is a 400 pixel store. The floor is 22 CSS pixels, so 44.
      expect(pausedFonts.some((font) => font.startsWith("700 44px "))).toBe(true);

      const challenge = stubCanvas({ width: 200 });
      const challengeFonts = trackFonts(challenge.context);
      challenge.renderer.render(
        board({
          explorer: { row: 1, col: 1, vitality: 3, maxVitality: 3 },
          revealed: ["1,1"],
          status: "challenge",
          wardens: [{ row: 1, col: 1, id: 0, mode: "patrol" }]
        })
      );
      expect(challengeFonts.some((font) => font.startsWith("700 44px "))).toBe(true);
      expect(challengeFonts.some((font) => font.startsWith("500 28px "))).toBe(true);
    });
  });

  it("B-92 sizes the Grid reference font from the root font size", () => {
    document.documentElement.style.fontSize = "20px";
    const { neat, renderer } = stubCanvas({ neatline: true });

    renderer.render(board({ revealed: ["0,0"] }));

    // 0.625 of a 20 px root is 12.5 px.
    expect(neat.fonts.length).toBeGreaterThan(0);
    expect(neat.fonts.every((font) => font.startsWith("12.5px "))).toBe(true);
  });

  it("B-95 rebuilds the Fog and hatch patterns when the device ratio changes", () => {
    const { renderer, tiles } = stubCanvas();
    const run = board({ revealed: ["0,0", "0,1"] });
    atDeviceRatio(1, () => renderer.render(run));
    const first = tiles.length;
    atDeviceRatio(1, () => renderer.render(run));
    expect(tiles).toHaveLength(first);
    atDeviceRatio(2, () => renderer.render(run));
    expect(tiles.length).toBeGreaterThan(first);
    // The hatch tile is 6 pixels at every ratio, so only a cleared cache builds it again.
    expect(tiles.filter((tile) => tile.width === 6)).toHaveLength(2);
  });

  it("B-91 gives the game canvas an image role and fallback text", () => {
    const html = readFileSync(resolve(process.cwd(), "index.html"), "utf8");
    const canvas = html.match(/<canvas\s+id="maze-canvas"[\s\S]*?<\/canvas>/)?.[0] ?? "";

    expect(canvas).toMatch(/role="img"/);
    expect(canvas).toMatch(/aria-label="[^"]+"/);
    expect(canvas).toMatch(/>\s*\S[^<]*<\/canvas>/);
  });

  describe("B-93 forced colours", () => {
    const SYSTEM = new Set(["Canvas", "CanvasText", "GrayText", "Highlight", "HighlightText"]);
    const NAMES = [
      "--color-fog",
      "--color-fog-dot",
      "--color-passage",
      "--color-land",
      "--color-coastline",
      "--color-hatch",
      "--color-danger-line",
      ...BOARD_TOKENS.filter((name) => name.startsWith("--color-board-"))
    ];

    it("maps every board token to a system colour in the Popup tokens", () => {
      const css = readFileSync(resolve(process.cwd(), "src/looks/popup/tokens.css"), "utf8");
      const forced = css.slice(css.indexOf("@media (forced-colors: active)"));
      const value = (/** @type {string} */ name) => forced.match(new RegExp(`${name}:\\s*([^;]+);`))?.[1].trim();

      for (const name of NAMES) expect(SYSTEM.has(value(name) ?? ""), name).toBe(true);
      expect(value("--color-passage")).not.toBe(value("--color-land"));
    });

    it("raises the Popup forced-colors selector above the daylight palette rules", () => {
      const css = readFileSync(resolve(process.cwd(), "src/looks/popup/tokens.css"), "utf8");
      const forced = css.slice(css.indexOf("@media (forced-colors: active)"));
      expect(forced).toContain(':root:root:not([data-theme="light"])');
      expect(forced).toContain(':root:root[data-theme="light"]');
    });

    it("maps the ink, on-fill and night tokens to system colours", () => {
      const css = readFileSync(resolve(process.cwd(), "src/looks/popup/tokens.css"), "utf8");
      const forced = css.slice(css.indexOf("@media (forced-colors: active)"));
      const value = (/** @type {string} */ name) => forced.match(new RegExp(`${name}:\\s*([^;]+);`))?.[1].trim();
      expect(value("--color-ink")).toBe("CanvasText");
      expect(value("--color-on-fill")).toBe("Canvas");
      // drawLabel fills the badge with night and writes on-fill text, so the two must differ.
      expect(value("--color-night-deep")).toBe("CanvasText");
    });

    it("paints a Run when every board token holds a system colour keyword", () => {
      const { context, renderer } = stubCanvas();
      const paints = recordPaints(context);
      const keywords = ["Canvas", "CanvasText", "GrayText", "Highlight", "HighlightText"];
      NAMES.forEach((name, index) => document.body.style.setProperty(name, keywords[index % keywords.length]));
      document.body.style.setProperty("--color-passage", "Canvas");
      document.body.style.setProperty("--color-land", "Highlight");

      expect(() =>
        renderer.render(
          board({
            explorer: { row: 1, col: 1, vitality: 3, maxVitality: 3 },
            revealed: ["0,0", "0,1", "1,0", "1,1"]
          })
        )
      ).not.toThrow();
      const styles = paints.map((paint) => paint.style);
      expect(styles).toContain("Canvas");
      expect(styles).toContain("Highlight");
    });
  });

  describe("PR 312 follow-ups", () => {
    const withWarden = () =>
      board({
        revealed: ["1,1"],
        wardens: [{ row: 1, col: 1, id: 0, mode: "patrol" }]
      });

    it("A treats a throwing Bright Start getter as false and keeps the art on", async () => {
      const art = { drawFigure: vi.fn() };
      const { renderer } = stubCanvas({
        loadArt: () => Promise.resolve(art),
        isBrightStart: () => {
          throw new Error("level lost");
        }
      });

      expect(() => renderer.render(withWarden())).not.toThrow();
      await settle();
      expect(art.drawFigure).toHaveBeenCalled();
      expect(art.drawFigure.mock.calls.every((call) => call[5] === false)).toBe(true);
      expect(() => renderer.render(withWarden())).not.toThrow();
    });
  });
});

describe("R1b layered renderer", () => {
  const settle = () => new Promise((done) => setTimeout(done, 0));

  afterEach(async () => {
    vi.unstubAllGlobals();
    document.documentElement.removeAttribute("data-access-contrast");
    await settle();
    document.body.removeAttribute("style");
  });

  /** A 2x2 board with one known passage; each pass leaves its own count. */
  function layered(options = {}) {
    const stub = stubCanvas(options);
    const paints = recordPaints(stub.context);
    const clips = recordClips(stub.context);
    const passage = document.body.style.getPropertyValue("--color-passage");
    return {
      ...stub,
      clips,
      // The chart pass paints the one passage of the board; one water fill is one chart repaint.
      chartPaints: () => paints.filter((paint) => paint.kind === "fill" && paint.style === passage).length,
      blits: () => stub.context.drawImage.mock.calls.length
    };
  }

  const run = board({ revealed: ["0,0"] });

  it("US-01.1 repaints the marks alone on a Move with no sight change", () => {
    const { chartPaints, clips, blits, renderer } = layered();

    renderer.render(run);
    const blitsBefore = blits();
    renderer.render({ ...run, explorer: { ...run.explorer, row: 1, col: 0 } });

    expect(chartPaints()).toBe(1);
    expect(clips).toHaveLength(1);
    // The visible canvas blits the Fog layer once; the Fog layer does not blit the chart again.
    expect(blits() - blitsBefore).toBe(1);
  });

  it("US-01.2 repaints the Fog on a new cell, and both layers on a size or palette change", async () => {
    /** @type {() => void} */
    let onChange = () => {};
    vi.stubGlobal("matchMedia", () => ({
      addEventListener: (/** @type {string} */ _type, /** @type {() => void} */ listener) => {
        onChange = listener;
      }
    }));
    const { canvas, chartPaints, clips, renderer } = layered();

    renderer.render(run);
    renderer.render({ ...run, revealed: ["0,0", "0,1"] });
    expect([chartPaints(), clips.length]).toEqual([1, 2]);

    canvas.getBoundingClientRect = () => ({ width: 320, height: 320 });
    renderer.render({ ...run, revealed: ["0,0", "0,1"] });
    expect([chartPaints(), clips.length]).toEqual([2, 3]);

    document.body.style.setProperty("--color-fog", "rgb(1, 2, 3)");
    onChange();
    expect([chartPaints(), clips.length]).toEqual([3, 4]);
  });

  it("US-01.4 repaints the Fog for a second Pulse and for a backward step", () => {
    const { clips, renderer } = layered();

    renderer.render({ ...run, pulseVisible: ["0,1"] });
    renderer.render({ ...run, pulseVisible: ["1,0"] });
    renderer.render({ ...run, revealed: ["0,0", "0,1"], pulseVisible: [] });
    renderer.render(run);

    expect(clips).toEqual([
      ["0,0,320,320", "320,0,320,320"],
      ["0,0,320,320", "0,320,320,320"],
      ["0,0,320,320", "320,0,320,320"],
      ["0,0,320,320"]
    ]);
  });

  it("US-01.5 changes the mark pass alone for a pause, a Challenge and the art load", async () => {
    const drawFigure = vi.fn();
    const { chartPaints, clips, labels, renderer } = layered({ loadArt: () => Promise.resolve({ drawFigure }) });

    renderer.render(run);
    renderer.render({ ...run, status: "paused" });
    renderer.render({ ...run, status: "challenge", challenge: /** @type {never} */ ({ kind: "gate-warden" }) });
    await settle();

    expect(labels).toContain("GATE WARDEN");
    expect(drawFigure).toHaveBeenCalled();
    expect([chartPaints(), clips.length]).toEqual([1, 1]);
  });

  it("US-02.2 puts each Neatline tick on its tile line in a 375 px box", () => {
    const { neat, renderer } = layered({ neatline: true, width: 375 });

    renderer.render(run);

    // Left 18 plus Math.round(line * 375 / 2) plus the half pixel: 0, 188 (rounded from 187.5) and 375.
    const topTicks = /** @type {number[][]} */ (neat.context.moveTo.mock.calls).filter((_call, index) => index % 4 === 0).map(([x]) => x);
    expect(topTicks).toEqual([18.5, 206.5, 393.5]);
  });

/** @param {number} ratio @param {() => void} body */
  function atRatio(ratio, body) {
    const original = window.devicePixelRatio;
    window.devicePixelRatio = ratio;
    try {
      body();
    } finally {
      window.devicePixelRatio = original;
    }
  }

  it("US-01.2 repaints both layers on a device ratio change that keeps the backing size", () => {
    const { canvas, chartPaints, clips, renderer } = layered();

    atRatio(1, () => renderer.render(run));
    // Browser zoom: half the CSS box at twice the ratio gives the same 640 pixel backing size.
    canvas.getBoundingClientRect = () => ({ width: 320, height: 320 });
    atRatio(2, () => renderer.render(run));

    expect([canvas.width, canvas.height]).toEqual([640, 640]);
    expect([chartPaints(), clips.length]).toEqual([2, 2]);
  });

  it("PR 317 repaints the Fog on a return to the last good frame after a Fog pass throws", () => {
    const { context, clips, renderer } = layered();
    const target = /** @type {Record<string, any>} */ (context);

    renderer.render(run);
    const clip = target.clip;
    target.clip = vi.fn(() => {
      throw new Error("canvas lost");
    });
    expect(() => renderer.render({ ...run, revealed: ["0,0", "0,1"] })).toThrow("canvas lost");
    target.clip = clip;
    // A Replay step back to the first frame finds the Fog layer half painted, so the Fog repaints.
    renderer.render(run);

    expect(clips).toEqual([["0,0,320,320"], ["0,0,320,320"]]);
  });

  it("PR 317 repaints the chart on a return to the last good frame after a chart pass throws", () => {
    const { canvas, context, chartPaints, renderer } = layered();
    const target = /** @type {Record<string, any>} */ (context);
    const box = canvas.getBoundingClientRect;

    renderer.render(run);
    canvas.getBoundingClientRect = () => ({ width: 320, height: 320 });
    const fill = target.fill;
    target.fill = vi.fn(() => {
      throw new Error("canvas lost");
    });
    expect(() => renderer.render(run)).toThrow("canvas lost");
    target.fill = fill;
    canvas.getBoundingClientRect = box;
    renderer.render(run);

    expect(chartPaints()).toBe(2);
  });

  it("US-01.2 repaints the chart on a width-only backing change", () => {
    const { canvas, chartPaints, renderer } = layered({ width: 640, height: 640 });

    renderer.render(run);
    canvas.getBoundingClientRect = () => ({ width: 480, height: 640 });
    renderer.render(run);

    expect([canvas.width, canvas.height]).toEqual([480, 640]);
    expect(chartPaints()).toBe(2);
  });

  it("US-01.2 repaints the chart on a height-only backing change", () => {
    const { canvas, chartPaints, renderer } = layered({ width: 640, height: 640 });

    renderer.render(run);
    canvas.getBoundingClientRect = () => ({ width: 640, height: 480 });
    renderer.render(run);

    expect([canvas.width, canvas.height]).toEqual([640, 480]);
    expect(chartPaints()).toBe(2);
  });

  it("US-01.2 paints each pass on its own layer and draws the marks on the visible canvas", () => {
    const { calls, canvas, context, layers, renderer } = stubCanvas({ ownLayerContexts: true });
    const passage = document.body.style.getPropertyValue("--color-passage");
    /** @type {string[]} */
    const visibleFills = [];
    let style = "";
    Object.defineProperty(context, "fillStyle", { configurable: true, get: () => style, set: (value) => { style = value; } });
    const fill = context.fill;
    context.fill = vi.fn(() => {
      visibleFills.push(style);
      fill();
    });

    renderer.render(run);

    const [chart, fog] = layers;
    // (a) Water and land fill on the chart layer, never on the visible canvas.
    expect(chart.context.fills).toContain(passage);
    expect(visibleFills).not.toContain(passage);
    // (b) The visible canvas blits the Fog layer first, then draws the marks.
    expect(context.drawImage.mock.calls).toEqual([[fog, 0, 0]]);
    expect(calls[0]).toBe("drawImage");
    // (d) The Explorer ring draws after the blit, on the visible context.
    expect(calls.slice(1)).toContain("arc");

    // (c) A new backing size resizes both layers with the visible canvas.
    canvas.getBoundingClientRect = () => ({ width: 320, height: 240 });
    renderer.render(run);
    for (const layer of layers) expect([layer.width, layer.height]).toEqual([canvas.width, canvas.height]);
    expect([canvas.width, canvas.height]).toEqual([320, 240]);
  });

  it("R-05 draws no Echo outside the known set", () => {
    const { labels, renderer } = layered();
    const echoes = [{ row: 1, col: 1, collected: false }];

    renderer.render({ ...run, echoes });
    expect(labels).toEqual([]);
    renderer.render({ ...run, revealed: ["0,0", "1,1"], echoes });
    expect(labels).toEqual(["1"]);
  });

  it("R-06 draws no Warden outside the known set", () => {
    document.body.style.setProperty("--color-danger-line", "rgb(33, 44, 55)");
    const { context, renderer } = layered();
    const paints = recordPaints(context);
    const wardens = [{ row: 1, col: 1, id: 0, mode: /** @type {const} */ ("patrol") }];
    const rings = () => paints.filter((paint) => paint.kind === "stroke" && paint.style === "rgb(33, 44, 55)");

    renderer.render({ ...run, wardens });
    expect(rings()).toEqual([]);
    renderer.render({ ...run, revealed: ["0,0", "1,1"], wardens });
    expect(rings()).toHaveLength(1);
  });

  it("R-07 draws no Gate outside the known set", () => {
    document.body.style.setProperty("--color-board-gate", "rgb(66, 77, 88)");
    const { context, renderer } = layered();
    const paints = recordPaints(context);
    const gate = { row: 1, col: 1, open: false };
    const arches = () => paints.filter((paint) => paint.kind === "fill" && paint.style === "rgb(66, 77, 88)");

    renderer.render({ ...run, gate });
    expect(arches()).toEqual([]);
    renderer.render({ ...run, revealed: ["0,0", "1,1"], gate });
    expect(arches()).toHaveLength(1);
  });
});
