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
 * @param {{ width?: number, neatline?: boolean }} [options]
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
  const neatContext = {
    beginPath: vi.fn(() => neatPaths.push("beginPath")),
    clearRect: vi.fn(),
    fillStyle: "",
    fillText: vi.fn((/** @type {string} */ text) => neatLabels.push(text)),
    font: "",
    lineTo: vi.fn(() => neatPaths.push("lineTo")),
    lineWidth: 0,
    moveTo: vi.fn(() => neatPaths.push("moveTo")),
    stroke: vi.fn(() => neatPaths.push("stroke")),
    strokeRect: vi.fn(() => neatPaths.push("strokeRect")),
    strokeStyle: "",
    textAlign: "",
    textBaseline: ""
  };
  const overlay = { width: 0, height: 0, getContext: () => neatContext };
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
        querySelector: () => overlay
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
    neat: { fonts: neatFonts, labels: neatLabels, overlay, paths: neatPaths },
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

/** Non-text pairs from the spec: a mark must reach 3:1 against the ground it sits on. */
const BOARD_PAIRS = [
  ["--color-coastline", "--color-passage"],
  ["--color-coastline", "--color-land"],
  ["--color-board-explorer-ring", "--color-passage"],
  ["--color-board-warden", "--color-passage"],
  ["--color-danger-line", "--color-passage"],
  ["--color-board-gate", "--color-passage"],
  ["--color-board-echo", "--color-passage"],
  ["--color-board-light", "--color-passage"],
  ["--color-explorer", "--color-land"]
];

/**
 * Reads a token as oklab and follows `var()` inside the scope first, then the light scope.
 * @param {string} scope
 * @param {string} name
 * @returns {number[]}
 */
function boardColor(scope, name) {
  let value;
  try {
    value = canvasToken(scope, name);
  } catch {
    value = canvasToken(LIGHT, name);
  }
  return value.startsWith("var(") ? boardColor(scope, value.slice(4, -1)) : oklabOf(value);
}

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

/** @param {number[]} lab */
function relativeLuminance([L, a, b]) {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const red = unit(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s);
  const green = unit(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s);
  const blue = unit(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s);
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

/**
 * @param {number[]} first
 * @param {number[]} second
 */
function contrastRatio(first, second) {
  const [light, dark] = [relativeLuminance(first), relativeLuminance(second)].sort((x, y) => y - x);
  return (light + 0.05) / (dark + 0.05);
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

  it("scales passage coordinate markers by capped device pixel ratio", () => {
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

      expect(
        fillRects.filter((call) => call.w === 3 && call.h === 3).length
      ).toBeGreaterThan(0);
    } finally {
      window.devicePixelRatio = originalDpr;
    }
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
    expect(neat.labels).toEqual(["A", "1", "B", "2"]);
    expect(neat.fonts.every((font) => font.startsWith("10px "))).toBe(true);
    expect(neat.overlay.width).toBe(676);
  });

  it("US-03.1 skips the Neatline when the board has no overlay canvas", () => {
    const { renderer } = stubCanvas();

    expect(() => renderer.render(board({ revealed: ["0,0"] }))).not.toThrow();
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

  it("US-01.2 keeps every board mark at 3:1 against the passage or the land in light and Night", () => {
    for (const scope of SCOPES) {
      for (const [mark, ground] of BOARD_PAIRS) {
        expect(
          contrastRatio(boardColor(scope, mark), boardColor(scope, ground)),
          `${mark} on ${ground}`
        ).toBeGreaterThanOrEqual(3);
      }
    }
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
