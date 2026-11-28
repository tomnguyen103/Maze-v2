/**
 * @typedef {ReturnType<typeof import("./game-session.js").createRun>} GameRun
 * @typedef {{ row: number, col: number }} Position
 * @typedef {Position & { vitality: number, maxVitality: number }} Explorer
 * @typedef {Position & { collected: boolean }} Echo
 * @typedef {Position & { open: boolean, sealed?: boolean }} Gate
 * @typedef {Position & { id: number, mode: "patrol" | "hunt" | "intercept" | "lured" }} Warden
 * @typedef {{
 *   source: Position,
 *   destination: Position,
 *   direction: "up" | "right" | "down" | "left"
 * }} Windway
 * @typedef {{
 *   echoIndex: number,
 *   from: Position,
 *   to: Position,
 *   open: boolean
 * }} EchoBridge
 * @typedef {{
 *   id: number,
 *   from: Position,
 *   to: Position,
 *   open: boolean
 * }} TideDoor
 * @typedef {Position & {
 *   id: number,
 *   spent: boolean
 * }} SignalBell
 */

/**
 * @param {number} width
 * @param {number} height
 * @returns {OffscreenCanvas | HTMLCanvasElement}
 */
function createDetachedCanvas(width, height) {
  if (typeof OffscreenCanvas !== "undefined") return new OffscreenCanvas(width, height);
  const tile = document.createElement("canvas");
  tile.width = width;
  tile.height = height;
  return tile;
}

/** @typedef {{ canvas: OffscreenCanvas | HTMLCanvasElement, context: CanvasRenderingContext2D }} Layer */

/**
 * The tile CSS px that gives each tile at least 48 device px, and never less than 24 px.
 * @param {number} devicePixelRatio
 */
export function tileFloor(devicePixelRatio) {
  return Math.max(24, Math.ceil(48 / devicePixelRatio));
}

/**
 * The scroll offset that keeps the span [start, start + length] inside a view of `view` px.
 * @param {number} start @param {number} length @param {number} current @param {number} view
 */
export function followOffset(start, length, current, view) {
  return Math.max(start + length - view, Math.min(current, start));
}

/**
 * @param {HTMLCanvasElement} canvas
 * @param {() => Promise<unknown>} [loadArt] Loads the board art; null or a rejection keeps the shape marks.
 * @param {() => boolean} [isBrightStart] True while the Bright Start Quest Level shows; it softens the Fangmoor art.
 * @param {typeof createDetachedCanvas} [createLayer] Builds the two offscreen layers: the chart and the Fog.
 */
export function createCanvasRenderer(
  canvas,
  loadArt = () => import("../looks/popup/board-art.js"),
  isBrightStart = () => false,
  createLayer = createDetachedCanvas
) {
  const visible = getCanvasContext(canvas);
  // A layer pass rebinds the drawing target; every other pass draws on the visible canvas.
  let context = visible;
  /** @type {Layer | null} */
  let chartLayer = null;
  /** @type {Layer | null} */
  let fogLayer = null;
  /** @type {unknown[]} */
  let chartKey = [];
  let fogKey = "";
  /** @type {any} */
  let art = null;
  let artRequested = false;

  let palette = readPalette();
  // The palette is cached: the first render, a repaint and a token attribute change read it again.
  let paletteStale = true;
  let deviceRatio = 1;
  /** @type {GameRun | null} */
  let lastRun = null;
  /** Set by destroy(), so a late art load or repaint paints nothing. */
  let destroyed = false;
  /** The Explorer tile and board width of the last follow, so an appearance repaint keeps a manual scroll. */
  let lastFollow = "";
  /** @type {GameRun["labyrinth"] | null} */
  let lastFollowLabyrinth = null;

  function devicePixel() {
    return Math.max(1, Math.round(deviceRatio));
  }

  /**
   * A stroke coordinate that centres a line of `width` device pixels on whole pixels, so the edge stays crisp.
   * @param {number} value
   * @param {number} width
   */
  function snapStroke(value, width) {
    const half = (width % 2) / 2;
    return Math.round(value - half) + half;
  }

  /**
   * One tile box with edges on whole pixels, so adjacent tiles leave no seam.
   * @param {number} row
   * @param {number} col
   * @param {number} tile
   */
  function tileBox(row, col, tile) {
    const left = Math.round(col * tile);
    const top = Math.round(row * tile);
    return {
      left,
      top,
      width: Math.round((col + 1) * tile) - left,
      height: Math.round((row + 1) * tile) - top
    };
  }

  /**
   * Traces one tile with edges on whole pixels, so adjacent tiles leave no seam.
   * @param {number} row
   * @param {number} col
   * @param {number} tile
   */
  function traceTile(row, col, tile) {
    const { left, top, width, height } = tileBox(row, col, tile);
    context.rect(left, top, width, height);
  }

  function resize() {
    const bounds = canvas.getBoundingClientRect();
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    deviceRatio = ratio;
    const width = Math.max(1, Math.round(bounds.width * ratio));
    const height = Math.max(1, Math.round(bounds.height * ratio));
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
  }

  /** @param {GameRun} run */
  function render(run) {
    if (destroyed) return;
    lastRun = run;
    // Read the tokens before resize() can clear the canvas on a size change, so a missing token leaves the last board.
    if (paletteStale) {
      palette = readPalette();
      paletteStale = false;
    }
    // The play board CSS reads both for its tile floor; the Run Replay canvas ignores them.
    canvas.style.setProperty("--board-size", String(run.labyrinth.length));
    canvas.style.setProperty("--tile-floor", `${tileFloor(window.devicePixelRatio || 1)}px`);
    resize();
    followExplorer(run);
    // Each frame starts from the default line, text, and fill state, and ends on it even when a mark throws.
    context.save();
    try {
      paint(run);
    } finally {
      context.restore();
    }
    requestArt();
  }

  /** The frame scrolls the Explorer tile, with the margin that holds its ticks, into view. @param {GameRun} run */
  function followExplorer(run) {
    const frame = canvas.parentElement;
    if (!frame) return;
    const width = canvas.getBoundingClientRect().width;
    const tile = width / run.labyrinth.length;
    const { col, row } = run.explorer;
    const follow = `${col}:${row}:${width}:${frame.clientWidth}:${frame.clientHeight}`;
    if (follow === lastFollow && run.labyrinth === lastFollowLabyrinth) return;
    lastFollow = follow;
    lastFollowLabyrinth = run.labyrinth;
    frame.scrollLeft = followOffset(col * tile, tile + 2 * canvas.offsetLeft, frame.scrollLeft, frame.clientWidth);
    frame.scrollTop = followOffset(row * tile, tile + 2 * canvas.offsetTop, frame.scrollTop, frame.clientHeight);
  }

  /** @param {GameRun} run */
  function paint(run) {
    const size = run.labyrinth.length;
    const tile = canvas.width / size;
    const revealed = new Set([...run.revealed, ...run.pulseVisible]);
    const ratio = deviceRatio;
    context.clearRect(0, 0, canvas.width, canvas.height);
    if (run.status === "paused") {
      // The cover is opaque, so nothing of the board shows on a paused Run.
      context.fillStyle = palette.cover;
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.fillStyle = palette.coverInk;
      context.font = `700 ${Math.max(22 * ratio, canvas.width * 0.045)}px ${palette.fontBody}`;
      context.textAlign = "center";
      context.textBaseline = "middle";
      context.fillText("PAUSED", canvas.width / 2, canvas.height / 2);
      drawNeatline(size);
      return;
    }
    const chart = (chartLayer ??= newLayer());
    const fog = (fogLayer ??= newLayer());
    // The chart repaints on a new labyrinth, a new backing size, a new device ratio or a new palette; a Move never repaints it.
    const nextChartKey = [run.labyrinth, canvas.width, canvas.height, deviceRatio, palette];
    const chartDirty = nextChartKey.some((part, index) => part !== chartKey[index]);
    // Each key clears before its pass writes the layer, so a pass that throws leaves no key that names a half-painted layer.
    if (chartDirty) {
      chartKey = [];
      onLayer(chart, () => paintChart(run, tile));
    }
    // The Fog repaints whole with the chart or when the known set changes, so no stale cell shows.
    const nextFogKey = `${run.revealed.join(";")}|${run.pulseVisible.join(";")}`;
    if (chartDirty || nextFogKey !== fogKey) {
      fogKey = "";
      onLayer(fog, () => paintFog(run, revealed, tile, chart.canvas));
      fogKey = nextFogKey;
    }
    // The chart key lands last, so a throw in either pass repaints both on the next frame.
    if (chartDirty) chartKey = nextChartKey;
    context.drawImage(fog.canvas, 0, 0);

    if (revealed.has(`${run.gate.row},${run.gate.col}`)) {
      isolated(() => drawGate(run.gate, tile));
    }
    for (const windway of run.windways) {
      // A Windway shows its mark when either end is known. The partner tile gets no terrain or other mark.
      if (
        revealed.has(`${windway.source.row},${windway.source.col}`) ||
        revealed.has(`${windway.destination.row},${windway.destination.col}`)
      ) {
        drawWindway(windway, tile);
      }
    }
    for (const bridge of run.echoBridges) {
      drawEchoBridge(bridge, tile);
    }
    for (const door of run.tideDoors) {
      drawTideDoor(door, tile);
    }
    for (const bell of run.signalBells) {
      drawSignalBell(bell, tile);
    }
    for (const [echoIndex, echo] of run.echoes.entries()) {
      if (!echo.collected && revealed.has(`${echo.row},${echo.col}`)) {
        drawEcho(echo, tile, echoIndex + 1);
      }
    }
    // In a Warden Challenge the Wardens draw over the Explorer, so the Warden shows on its tile.
    const challenge = run.status === "challenge";
    if (challenge) drawExplorer(run.explorer, tile);
    for (const warden of run.wardens) {
      if (revealed.has(`${warden.row},${warden.col}`)) {
        isolated(() => drawWarden(warden, tile));
      }
    }
    if (!challenge) drawExplorer(run.explorer, tile);

    if (challenge) {
      const fontSize = Math.max(22 * ratio, canvas.width * 0.045);
      const subSize = Math.max(14 * ratio, canvas.width * 0.022);
      const gap = Math.max(28 * ratio, canvas.width * 0.055);
      const gateWarden = run.challenge?.kind === "gate-warden";
      drawBand(gap + fontSize * 2.4);
      const headingY = canvas.height / 2 - gap / 2;
      context.fillStyle = palette.boardInk;
      context.font = `700 ${fontSize}px ${palette.fontBody}`;
      context.fillText(gateWarden ? "GATE WARDEN" : "WARDEN CHALLENGE", canvas.width / 2, headingY);
      context.font = `500 ${subSize}px ${palette.fontBody}`;
      context.fillText(
        gateWarden ? "Break the seal with your answer." : "Your knowledge clears the path.",
        canvas.width / 2,
        headingY + gap
      );
      if (gateWarden) {
        // The Signal light marks the Gate Warden only.
        context.beginPath();
        context.arc(canvas.width / 2, headingY - fontSize * 0.95, fontSize * 0.2, 0, Math.PI * 2);
        context.fillStyle = palette.light;
        context.fill();
      }
    }
    drawNeatline(size);
  }

  function newLayer() {
    const layer = createLayer(canvas.width, canvas.height);
    return { canvas: layer, context: getCanvasContext(/** @type {HTMLCanvasElement} */ (layer)) };
  }

  /**
   * Runs one pass on a layer. A size write clears the layer and resets its state.
   * @param {Layer} layer
   * @param {() => void} pass
   */
  function onLayer(layer, pass) {
    layer.canvas.width = canvas.width;
    layer.canvas.height = canvas.height;
    context = layer.context;
    try {
      pass();
    } finally {
      context = visible;
    }
  }

  /**
   * Passages and Land cards for every cell; the Fog layer clips the part that shows.
   * @param {GameRun} run
   * @param {number} tile
   */
  function paintChart(run, tile) {
    /** @type {Array<[number, number]>} */
    const landCells = [];
    /** @type {Array<[number, number]>} */
    const passageCells = [];
    run.labyrinth.forEach((cells, row) =>
      cells.forEach((cell, col) => {
        // ADR 0067: a passage (1) is a cream square, a wall (0) is a meadow Land card.
        (cell === 1 ? passageCells : landCells).push([row, col]);
      })
    );
    drawPassages(passageCells, tile);
    drawLand(landCells, tile);
  }

  /**
   * The opaque Fog layer: the board paper, a sky card on each unknown tile, the chart through the known tiles and a peeled flap on each Pulse tile.
   * @param {GameRun} run
   * @param {Set<string>} revealed
   * @param {number} tile
   * @param {CanvasImageSource} chart
   */
  function paintFog(run, revealed, tile, chart) {
    context.fillStyle = palette.casing;
    context.fillRect(0, 0, canvas.width, canvas.height);
    /** @type {Array<[number, number]>} */
    const fogCells = [];
    /** @type {Array<[number, number]>} */
    const pulseCells = [];
    context.save();
    context.beginPath();
    for (let row = 0; row < run.labyrinth.length; row += 1) {
      for (let col = 0; col < run.labyrinth.length; col += 1) {
        const key = `${row},${col}`;
        if (!revealed.has(key)) {
          fogCells.push([row, col]);
          continue;
        }
        traceTile(row, col, tile);
        if (run.pulseVisible.includes(key) && !run.revealed.includes(key)) pulseCells.push([row, col]);
      }
    }
    context.clip();
    context.drawImage(chart, 0, 0);
    context.restore();
    drawFogCards(fogCells, tile);
    drawPulseFlaps(pulseCells, tile, run.labyrinth);
  }

  /**
   * One sky card per unknown tile: a card fill, a fog-edge stroke and a folded corner, each from one path.
   * @param {Array<[number, number]>} cells
   * @param {number} tile
   */
  function drawFogCards(cells, tile) {
    if (cells.length === 0) return;
    const unit = devicePixel();
    const step = tile / 24;
    // The stroke centre sits 1.5/24 tile inside the tile edge.
    const inset = snapStroke(1.5 * step, unit);
    const radius = 4 * step;
    const traceCards = () => {
      context.beginPath();
      for (const [row, col] of cells) {
        const { left, top, width, height } = tileBox(row, col, tile);
        appendRoundedRect(left + inset, top + inset, width - 2 * inset, height - 2 * inset, radius);
      }
    };
    traceCards();
    context.fillStyle = palette.fog;
    context.fill();
    context.beginPath();
    for (const [row, col] of cells) {
      const { left, top, width } = tileBox(row, col, tile);
      const right = left + width - inset;
      const edge = top + inset;
      // The fold corner follows the card corner, so the fold never leaves the card.
      context.moveTo(right - 7.5 * step, edge);
      context.lineTo(right - radius, edge);
      context.arc(right - radius, edge + radius, radius, -Math.PI / 2, 0);
      context.lineTo(right, edge + 7.5 * step);
      context.closePath();
    }
    context.fillStyle = palette.fogSoft;
    context.fill();
    // The edge strokes last, so the fold fill cannot cover it.
    traceCards();
    context.strokeStyle = palette.fogEdge;
    context.lineWidth = unit;
    context.stroke();
  }

  /**
   * A tile in Pulse sight shows the chart plus a peeled Fog flap along its top edge, each from one path.
   * @param {Array<[number, number]>} cells
   * @param {number} tile
   * @param {GameRun["labyrinth"]} labyrinth
   */
  function drawPulseFlaps(cells, tile, labyrinth) {
    if (cells.length === 0) return;
    const unit = devicePixel();
    const step = tile / 24;
    const cardInset = landInset(tile);
    const outline = coastlineWidth(tile);
    // A flap on a Land card starts inside the Coastline, so it never covers the outline.
    const landFlapInset = snapStroke(cardInset + outline + unit / 2, unit);
    // A compact Run Replay tile has little or no room inside the Coastline, so its Land flap draws as a Passage flap.
    const roomy = tile - 2 * (cardInset + outline) >= tile / 2;
    const insideCoastline = (/** @type {number} */ row, /** @type {number} */ col) => roomy && labyrinth[row][col] === 0;
    isolated(() => {
      // The clip follows the inner edge of the Coastline, so the flap corners stay off its rounded corners too.
      context.beginPath();
      for (const [row, col] of cells) {
        const { left, top, width, height } = tileBox(row, col, tile);
        if (!insideCoastline(row, col)) {
          context.rect(left, top, width, height);
          continue;
        }
        const edge = cardInset + outline;
        appendRoundedRect(left + edge, top + edge, width - 2 * edge, height - 2 * edge, Math.max(0, 5 * step - outline));
      }
      context.clip();
      context.beginPath();
      for (const [row, col] of cells) {
        const { left, top, width } = tileBox(row, col, tile);
        const inset = insideCoastline(row, col) ? landFlapInset : snapStroke(step, unit);
        const near = left + inset;
        const far = left + width - inset;
        const edge = top + inset;
        const low = snapStroke(edge + 16 * step, unit);
        context.moveTo(near, edge);
        context.lineTo(far, edge);
        context.lineTo(snapStroke(far - 6 * step, unit), low);
        context.lineTo(snapStroke(near + 6 * step, unit), low);
        context.closePath();
      }
      context.fillStyle = palette.fogSoft;
      context.fill();
      context.strokeStyle = palette.fogEdge;
      context.lineWidth = unit;
      context.lineJoin = "miter";
      context.stroke();
    });
  }

  /** @param {() => void} draw Runs one mark with its own line, text and fill state. */
  function isolated(draw) {
    context.save();
    try {
      draw();
    } finally {
      context.restore();
    }
  }

  // The art loads once, after the first paint, so it never delays the first board.
  function requestArt() {
    if (artRequested) return;
    artRequested = true;
    // A failed or empty load keeps the shape marks, with no retry in this page.
    Promise.resolve()
      .then(loadArt)
      .then((/** @type {any} */ loaded) => {
        const found = loaded && "drawFigure" in loaded ? loaded : loaded?.default;
        if (!found) return;
        art = found;
        if (lastRun) render(lastRun);
      })
      .catch(() => {});
  }

  /**
   * A paper band across the board centre with an ink rule above and below.
   * @param {number} height
   */
  function drawBand(height) {
    const unit = devicePixel();
    const top = Math.round((canvas.height - height) / 2);
    const band = Math.round(height);
    context.fillStyle = palette.casing;
    context.fillRect(0, top, canvas.width, band);
    context.fillStyle = palette.boardInk;
    context.fillRect(0, top, canvas.width, unit);
    context.fillRect(0, top + band - unit, canvas.width, unit);
    context.textAlign = "center";
    context.textBaseline = "middle";
  }

  /**
   * The Neatline is a 1px ink border with one 2px tick per tile line, and the Grid
   * reference labels the columns and rows. It draws on the overlay canvas in the
   * board margin, so the maze tile maths stays the same.
   * @param {number} size
   */
  function drawNeatline(size) {
    const frame = canvas.parentElement;
    const overlay = /** @type {HTMLCanvasElement | null | undefined} */ (
      frame?.querySelector(".neatline-canvas")
    );
    const neat = overlay?.getContext("2d");
    if (!frame || !overlay || !neat) return;
    const frameBox = frame.getBoundingClientRect();
    const box = canvas.getBoundingClientRect();
    const width = Math.max(1, Math.round(frameBox.width * deviceRatio));
    const height = Math.max(1, Math.round(frameBox.height * deviceRatio));
    if (overlay.width !== width || overlay.height !== height) {
      overlay.width = width;
      overlay.height = height;
    }
    const unit = devicePixel();
    const left = Math.round((box.left - frameBox.left) * deviceRatio);
    const top = Math.round((box.top - frameBox.top) * deviceRatio);
    const side = canvas.width;
    const tick = 2 * unit;
    const gap = 2 * unit;
    const half = (unit % 2) / 2;
    neat.clearRect(0, 0, width, height);
    // The Neatline sits on the paper casing in every mode, so it takes the Coastline ink, not the page ink.
    neat.strokeStyle = palette.coastline;
    neat.lineWidth = unit;
    neat.strokeRect(left - unit / 2, top - unit / 2, side + unit, side + unit);
    neat.beginPath();
    for (let line = 0; line <= size; line += 1) {
      const offset = Math.round((line * side) / size);
      const x = left + offset + half;
      const y = top + offset + half;
      neat.moveTo(x, top - unit);
      neat.lineTo(x, top - unit - tick);
      neat.moveTo(x, top + side + unit);
      neat.lineTo(x, top + side + unit + tick);
      neat.moveTo(left - unit, y);
      neat.lineTo(left - unit - tick, y);
      neat.moveTo(left + side + unit, y);
      neat.lineTo(left + side + unit + tick, y);
    }
    neat.stroke();
    neat.fillStyle = palette.coastline;
    // The Grid reference is 0.625 rem: 10 px at a 16 px root.
    const gridSize = (Number.parseFloat(getComputedStyle(document.documentElement).fontSize) || 16) * 0.625 * deviceRatio;
    neat.font = gridFont(gridSize);
    // Every tick stays. Label every k-th line, with k the smallest step whose pitch fits the widest label.
    const labelWidth = neat.measureText(String(size)).width + 2 * unit;
    const rowWidth = Math.max(labelWidth, gridSize);
    const steps = [1, 2, 5, 10];
    const fits = (/** @type {number} */ candidate) => (candidate * side) / size >= rowWidth;
    const step = steps.find(fits) ?? steps[steps.length - 1];
    const labelled = (/** @type {number} */ index) =>
      index === 0 || index === size - 1 || (index % step === 0 && size - 1 - index >= step);
    // Column letters sit centred above the top ticks. Row numbers end right at the left ticks.
    neat.textAlign = "center";
    neat.textBaseline = "bottom";
    for (let index = 0; index < size; index += 1) {
      if (!labelled(index)) continue;
      const middle = ((index + 0.5) * side) / size;
      neat.fillText(String.fromCharCode(65 + index), left + middle, top - unit - tick - gap);
    }
    neat.textAlign = "right";
    neat.textBaseline = "middle";
    for (let index = 0; index < size; index += 1) {
      if (!labelled(index)) continue;
      const middle = ((index + 0.5) * side) / size;
      neat.fillText(String(index + 1), left - unit - tick - gap, top + middle);
    }
  }

  /**
   * Appends a rounded rectangle to the current path with plain arcs.
   * @param {number} x
   * @param {number} y
   * @param {number} width
   * @param {number} height
   * @param {number} radius
   */
  function appendRoundedRect(x, y, width, height, radius) {
    const r = Math.max(0, Math.min(radius, width / 2, height / 2));
    context.moveTo(x + r, y);
    context.lineTo(x + width - r, y);
    context.arc(x + width - r, y + r, r, -Math.PI / 2, 0);
    context.lineTo(x + width, y + height - r);
    context.arc(x + width - r, y + height - r, r, 0, Math.PI / 2);
    context.lineTo(x + r, y + height);
    context.arc(x + r, y + height - r, r, Math.PI / 2, Math.PI);
    context.lineTo(x, y + r);
    context.arc(x + r, y + r, r, Math.PI, Math.PI * 1.5);
    context.closePath();
  }

  /**
   * Draws a dark rounded label badge with light text.
   * @param {string} text
   * @param {number} x
   * @param {number} y
   * @param {number} tile
   * @param {number} fontScale
   */
  function drawLabel(text, x, y, tile, fontScale) {
    const fontSize = Math.max(7 * deviceRatio, tile * fontScale * palette.markScale);
    const width = Math.max(tile * 0.3, fontSize * (text.length * 0.68 + 0.9));
    const height = fontSize * 1.55;
    context.beginPath();
    appendRoundedRect(x - width / 2, y - height / 2, width, height, height / 2);
    context.fillStyle = palette.night;
    context.fill();
    context.fillStyle = palette.onFill;
    context.font = `700 ${fontSize}px ${palette.fontBody}`;
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText(text, x, y);
  }

  /**
   * Known passages are cream squares from one path (ADR 0067).
   * @param {Array<[number, number]>} cells
   * @param {number} tile
   */
  function drawPassages(cells, tile) {
    if (cells.length === 0) return;
    context.beginPath();
    for (const [row, col] of cells) traceTile(row, col, tile);
    context.fillStyle = palette.passage;
    context.fill();
  }

  /** @param {number} tile The gap between a tile edge and its Land card. */
  function landInset(tile) {
    return Math.max(1, Math.round(tile / 24));
  }

  /** @param {number} tile The Coastline width. Where Land is paper (strong contrast, a palette mode), it doubles (ADR 0067). */
  function coastlineWidth(tile) {
    return Math.max(1, Math.round(tile * 0.06)) * (palette.paperLand ? 2 : 1);
  }

  /**
   * Known walls are meadow Land cards: a card fill, a lip along the bottom and an ink outline, each from one path.
   * The outline is the Coastline.
   * @param {Array<[number, number]>} cells
   * @param {number} tile
   */
  function drawLand(cells, tile) {
    if (cells.length === 0) return;
    const step = tile / 24;
    const inset = landInset(tile);
    const outline = coastlineWidth(tile);
    const lip = Math.max(1, Math.round(6 * step));
    const radius = 5 * step;
    const boxes = cells.map(([row, col]) => {
      const { left, top, width, height } = tileBox(row, col, tile);
      return { x: left + inset, y: top + inset, width: width - 2 * inset, height: height - 2 * inset };
    });
    context.beginPath();
    for (const { x, y, width, height } of boxes) appendRoundedRect(x, y, width, height, radius);
    context.fillStyle = palette.land;
    context.fill();
    context.beginPath();
    // The lip has a flat top and the card's bottom corners, so it stays inside the card outline.
    const lipRadius = Math.min(radius, lip);
    for (const { x, y, width, height } of boxes) {
      const bottom = y + height;
      context.moveTo(x, bottom - lip);
      context.lineTo(x + width, bottom - lip);
      context.arc(x + width - lipRadius, bottom - lipRadius, lipRadius, 0, Math.PI / 2);
      context.arc(x + lipRadius, bottom - lipRadius, lipRadius, Math.PI / 2, Math.PI);
      context.closePath();
    }
    context.fillStyle = palette.landLip;
    context.fill();
    // The outline sits inside the card edge, so an odd width fills whole device pixels.
    const half = outline / 2;
    context.beginPath();
    for (const { x, y, width, height } of boxes) {
      appendRoundedRect(x + half, y + half, width - outline, height - outline, radius - half);
    }
    context.strokeStyle = palette.coastline;
    context.lineWidth = outline;
    context.stroke();
  }

  /**
   * @param {"explorer" | "fangmoor"} key @param {string} mode @param {number} x @param {number} y @param {number} tile
   * @returns {boolean} False when the art failed and the caller draws the shape mark.
   */
  function drawArt(key, mode, x, y, tile) {
    const side = tile * 1.2 * palette.markScale;
    let soft = false;
    try {
      soft = key === "fangmoor" && isBrightStart();
    } catch {
      // A failing level getter draws the full Fangmoor and keeps the art on for the page.
    }
    context.save();
    try {
      context.translate(x - side / 2, y - side / 2);
      art.drawFigure(context, key, mode, side, palette.flat, soft);
      return true;
    } catch {
      // An engine without a canvas feature the art needs keeps the shape marks for this page.
      art = null;
      return false;
    } finally {
      context.restore();
    }
  }

  /** @param {Explorer} explorer @param {number} tile */
  function drawExplorer(explorer, tile) {
    const { x, y } = centerOf(explorer, tile);
    if (art && drawArt("explorer", "idle", x, y, tile)) return;
    const scale = palette.markScale;
    const radius = tile * 0.32 * scale;

    // A position fix is a ring on a paper disc, with a dot in the Explorer colour.
    context.beginPath();
    context.arc(x, y, radius, 0, Math.PI * 2);
    context.fillStyle = palette.explorerDisc;
    context.fill();
    context.lineWidth = Math.max(2, tile * 0.08 * scale);
    context.strokeStyle = palette.explorerRing;
    context.stroke();

    context.beginPath();
    context.arc(x, y, radius * 0.38, 0, Math.PI * 2);
    context.fillStyle = palette.explorer;
    context.fill();
  }

  /**
   * @param {Echo} echo
   * @param {number} tile
   * @param {number} pairNumber
   */
  function drawEcho(echo, tile, pairNumber) {
    const { x, y } = centerOf(echo, tile);
    const scale = palette.markScale;
    // An Echo is a coral disc with an ink outline, a dashed ring and its pair number. It has no halo.
    const step = (tile / 24) * scale;
    context.beginPath();
    context.arc(x, y, 9.5 * step, 0, Math.PI * 2);
    context.fillStyle = palette.echo;
    context.fill();
    context.lineWidth = Math.max(1, 2 * step);
    context.strokeStyle = palette.boardInk;
    context.stroke();

    context.save();
    context.beginPath();
    context.arc(x, y, 6.5 * step, 0, Math.PI * 2);
    context.setLineDash([2 * step, 2 * step]);
    context.lineWidth = 1.2 * step;
    context.strokeStyle = palette.echoText;
    context.stroke();
    context.restore();

    // design.md: the number draws at 12 CSS px or more; a tile below 24 CSS px keeps the plain mark.
    if (tile < 24 * deviceRatio) return;
    context.save();
    context.fillStyle = palette.echoText;
    context.font =
      `700 ${Math.max(12 * deviceRatio, tile * 0.22 * scale)}px ${palette.fontBody}`;
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText(String(pairNumber), x, y);
    context.restore();
  }

  /** @param {Gate} gate @param {number} tile */
  function drawGate(gate, tile) {
    const { x, y } = centerOf(gate, tile);
    const scale = palette.markScale;
    const half = tile * 0.27 * scale;
    const color = gate.open
      ? gate.sealed
        ? palette.warden
        : palette.light
      : palette.gate;

    // The Gate is a rounded arch door.
    context.beginPath();
    context.arc(x, y, half, Math.PI, 0);
    context.lineTo(x + half, y + half);
    context.lineTo(x - half, y + half);
    context.closePath();
    context.fillStyle = gate.open ? palette.onFill : color;
    context.fill();
    context.strokeStyle = color;
    context.lineWidth = Math.max(1.5, tile * 0.06 * scale);
    context.lineJoin = "round";
    context.lineCap = "round";
    context.stroke();

    context.beginPath();
    if (gate.open && gate.sealed) {
      // The arch fill is white in every theme, so the X takes the night ink, not the Night-light Warden ink.
      context.strokeStyle = palette.night;
      context.moveTo(x - tile * 0.13 * scale, y - tile * 0.09 * scale);
      context.lineTo(x + tile * 0.13 * scale, y + tile * 0.17 * scale);
      context.moveTo(x + tile * 0.13 * scale, y - tile * 0.09 * scale);
      context.lineTo(x - tile * 0.13 * scale, y + tile * 0.17 * scale);
      context.stroke();
      // The Gate Warden waits behind the seal: one small Signal light above the arch.
      context.beginPath();
      const lightRadius = tile * 0.05 * scale;
      // The light stays inside the Gate tile at the large mark scale.
      const lightRise = Math.min(half * 1.45, tile * 0.5 - lightRadius);
      context.arc(x, y - lightRise, lightRadius, 0, Math.PI * 2);
      context.fillStyle = palette.light;
      context.fill();
    } else if (gate.open) {
      // The arrow sits on the white arch, so it takes the on-fill light.
      context.strokeStyle = palette.lightOnFill;
      context.moveTo(x, y + tile * 0.18 * scale);
      context.lineTo(x, y - tile * 0.12 * scale);
      context.moveTo(x - tile * 0.1 * scale, y - tile * 0.02 * scale);
      context.lineTo(x, y - tile * 0.13 * scale);
      context.lineTo(x + tile * 0.1 * scale, y - tile * 0.02 * scale);
      context.stroke();
    } else {
      // The keyhole has its own ink: Land is paper in strong and palette modes, and forced colours paint the Gate CanvasText.
      context.arc(x, y - tile * 0.02 * scale, tile * 0.06 * scale, 0, Math.PI * 2);
      context.fillStyle = palette.gateInk;
      context.fill();
      context.fillRect(
        x - tile * 0.025 * scale,
        y,
        tile * 0.05 * scale,
        tile * 0.14 * scale
      );
    }
  }

  /** @param {Windway} windway @param {number} tile */
  function drawWindway(windway, tile) {
    const source = centerOf(windway.source, tile);
    const destination = centerOf(windway.destination, tile);
    const scale = palette.markScale;
    const rowDelta = windway.destination.row - windway.source.row;
    const colDelta = windway.destination.col - windway.source.col;
    const startX = source.x + colDelta * tile * 0.18;
    const startY = source.y + rowDelta * tile * 0.18;
    const endX = destination.x - colDelta * tile * 0.2;
    const endY = destination.y - rowDelta * tile * 0.2;
    const sideX = -rowDelta;
    const sideY = colDelta;

    context.save();
    context.beginPath();
    context.arc(source.x, source.y, tile * 0.18 * scale, 0, Math.PI * 2);
    context.fillStyle = palette.onFill;
    context.fill();
    context.strokeStyle = palette.light;
    context.lineWidth = Math.max(2, tile * 0.08 * scale);
    context.lineCap = "round";
    context.lineJoin = "round";
    context.stroke();
    context.beginPath();
    context.moveTo(startX, startY);
    context.lineTo(endX, endY);
    context.lineTo(
      endX - colDelta * tile * 0.18 + sideX * tile * 0.13,
      endY - rowDelta * tile * 0.18 + sideY * tile * 0.13
    );
    context.moveTo(endX, endY);
    context.lineTo(
      endX - colDelta * tile * 0.18 - sideX * tile * 0.13,
      endY - rowDelta * tile * 0.18 - sideY * tile * 0.13
    );
    context.stroke();
    context.restore();
  }

  /**
   * Strokes the current path over a wider casing in the board casing token, so
   * a Signal line keeps 3:1 against the Fog. Light themes cast a light casing
   * that is faint on the Passage; Night casts night ink.
   * @param {number} tile
   */
  function strokeSignal(tile) {
    strokeCasing(tile);
    context.stroke();
  }

  /**
   * Strokes only the casing of the current path. A composite mark casts every
   * casing first, so no casing cuts an ink stroke of the same mark.
   * @param {number} tile
   */
  function strokeCasing(tile) {
    const { lineWidth, strokeStyle } = context;
    context.strokeStyle = palette.casing;
    context.lineWidth = lineWidth + 2 * Math.max(1, tile * 0.02 * palette.markScale);
    context.stroke();
    context.strokeStyle = strokeStyle;
    context.lineWidth = lineWidth;
  }

  /** @param {EchoBridge} bridge @param {number} tile */
  function drawEchoBridge(bridge, tile) {
    const from = centerOf(bridge.from, tile);
    const to = centerOf(bridge.to, tile);
    const midpoint = {
      x: (from.x + to.x) / 2,
      y: (from.y + to.y) / 2
    };
    const scale = palette.markScale;
    const color = bridge.open ? palette.light : palette.gate;

    context.save();
    context.strokeStyle = color;
    context.lineCap = "round";
    // The trail is one plain line: dashed while closed, solid once open.
    const lineDash = bridge.open ? [] : [tile * 0.16 * scale, tile * 0.13 * scale];
    const lineWidth = Math.max(2, tile * 0.05 * scale);
    context.lineWidth = lineWidth;
    const traceLine = () => {
      context.beginPath();
      context.moveTo(from.x, from.y);
      context.lineTo(to.x, to.y);
    };
    const traceCross = () => {
      context.beginPath();
      context.moveTo(midpoint.x - tile * 0.1, midpoint.y - tile * 0.1);
      context.lineTo(midpoint.x + tile * 0.1, midpoint.y + tile * 0.1);
      context.moveTo(midpoint.x + tile * 0.1, midpoint.y - tile * 0.1);
      context.lineTo(midpoint.x - tile * 0.1, midpoint.y + tile * 0.1);
    };
    // Casing first under the line and the X, then the line ink, then the X ink.
    context.setLineDash(lineDash);
    traceLine();
    strokeCasing(tile);
    if (!bridge.open) {
      context.setLineDash([]);
      context.lineWidth = Math.max(2, tile * 0.06 * scale);
      traceCross();
      strokeCasing(tile);
      context.lineWidth = lineWidth;
      context.setLineDash(lineDash);
    }
    traceLine();
    context.stroke();
    context.setLineDash([]);
    context.lineWidth = Math.max(1.5, tile * 0.05 * scale);
    for (const endpoint of [from, to]) {
      context.beginPath();
      context.arc(endpoint.x, endpoint.y, tile * 0.12 * scale, 0, Math.PI * 2);
      context.fillStyle = palette.onFill;
      context.fill();
      strokeSignal(tile);
    }
    if (!bridge.open) {
      context.lineWidth = Math.max(2, tile * 0.06 * scale);
      traceCross();
      context.stroke();
    }
    drawLabel(
      String(bridge.echoIndex + 1),
      midpoint.x,
      midpoint.y - tile * 0.26 * scale,
      tile,
      0.19
    );
    context.restore();
  }

  /** @param {TideDoor} door @param {number} tile */
  function drawTideDoor(door, tile) {
    const from = centerOf(door.from, tile);
    const to = centerOf(door.to, tile);
    const midpoint = {
      x: (from.x + to.x) / 2,
      y: (from.y + to.y) / 2
    };
    const horizontal = from.y === to.y;
    const offset = tile * 0.08 * palette.markScale;
    const offsetX = horizontal ? 0 : offset;
    const offsetY = horizontal ? offset : 0;
    context.save();
    context.strokeStyle = door.open ? palette.light : palette.gate;
    context.lineWidth = Math.max(2, tile * 0.065 * palette.markScale);
    context.lineCap = "round";
    context.setLineDash(door.open ? [] : [tile * 0.11, tile * 0.09]);
    for (const direction of [-1, 1]) {
      context.beginPath();
      context.moveTo(
        from.x + offsetX * direction,
        from.y + offsetY * direction
      );
      context.lineTo(to.x + offsetX * direction, to.y + offsetY * direction);
      strokeSignal(tile);
    }
    context.setLineDash([]);
    drawLabel(
      door.open ? "OPEN" : "SEALED",
      midpoint.x,
      midpoint.y - tile * 0.05,
      tile,
      0.14
    );
    context.restore();
  }

  /** @param {SignalBell} bell @param {number} tile */
  function drawSignalBell(bell, tile) {
    const { x, y } = centerOf(bell, tile);
    const scale = palette.markScale;
    const color = bell.spent ? palette.gate : palette.light;
    context.save();
    context.strokeStyle = color;
    context.fillStyle = palette.onFill;
    context.lineWidth = Math.max(2, tile * 0.06 * scale);
    context.lineJoin = "round";
    const traceSlash = () => {
      context.beginPath();
      context.moveTo(x - tile * 0.22, y - tile * 0.22);
      context.lineTo(x + tile * 0.22, y + tile * 0.24);
    };
    const traceBody = () => {
      context.beginPath();
      context.arc(x, y - tile * 0.04, tile * 0.2 * scale, Math.PI, 0);
      context.lineTo(x + tile * 0.25 * scale, y + tile * 0.2 * scale);
      context.lineTo(x - tile * 0.25 * scale, y + tile * 0.2 * scale);
      context.closePath();
    };
    const traceClapper = (/** @type {number} */ extra) => {
      context.beginPath();
      context.arc(x, y + tile * 0.27 * scale, tile * 0.06 * scale + extra, 0, Math.PI * 2);
    };
    // Casing first under the outline, the clapper and the slash, then the outline ink, the clapper ink, the slash ink.
    traceBody();
    context.fill();
    strokeCasing(tile);
    // The clapper hangs on bare Fog: its casing disc grows by the margin strokeCasing adds per side.
    traceClapper(Math.max(1, tile * 0.02 * scale));
    context.fillStyle = palette.casing;
    context.fill();
    if (bell.spent) {
      context.lineCap = "round";
      traceSlash();
      strokeCasing(tile);
    }
    traceBody();
    context.stroke();
    traceClapper(0);
    context.fillStyle = color;
    context.fill();
    if (bell.spent) {
      traceSlash();
      context.stroke();
    }
    drawLabel(bell.spent ? "SPENT" : "RING", x, y + tile * 0.04, tile, 0.12);
    context.restore();
  }

  /** @param {Warden} warden @param {number} tile */
  function drawWarden(warden, tile) {
    const { x, y } = centerOf(warden, tile);
    const scale = palette.markScale;
    const radius = tile * 0.27 * scale;
    // A dotted danger line rings the Warden, under its body. An ink outline
    // under each coral dash keeps the line at 3:1 on every Passage hue.
    const dangerWidth = Math.max(1, tile * 0.02 * scale);
    context.beginPath();
    context.arc(x, y, Math.min(tile * 0.46 * scale, tile * 0.48), 0, Math.PI * 2);
    context.setLineDash([Math.max(1, tile * 0.02), Math.max(2, tile * 0.05)]);
    context.strokeStyle = palette.boardInk;
    context.lineWidth = dangerWidth + 2 * Math.max(1, tile * 0.01 * scale);
    context.stroke();
    context.strokeStyle = palette.danger;
    context.lineWidth = dangerWidth;
    context.stroke();
    context.setLineDash([]);
    if (art && drawArt("fangmoor", warden.mode, x, y, tile)) return;
    // Each mode has its own silhouette: Patrol round, Hunt pointed,
    // Intercept chevron, Lured ringed.
    context.beginPath();
    if (warden.mode === "hunt") {
      context.moveTo(x, y - radius * 1.3);
      context.lineTo(x + radius, y);
      context.arc(x, y, radius, 0, Math.PI);
    } else if (warden.mode === "intercept") {
      context.moveTo(x, y - radius);
      context.lineTo(x + radius, y + radius * 0.2);
      context.lineTo(x + radius, y + radius);
      context.lineTo(x, y + radius * 0.45);
      context.lineTo(x - radius, y + radius);
      context.lineTo(x - radius, y + radius * 0.2);
    } else {
      context.arc(x, y, warden.mode === "lured" ? radius * 0.8 : radius, 0, Math.PI * 2);
    }
    context.closePath();
    context.fillStyle = palette.warden;
    context.fill();
    context.strokeStyle = palette.land;
    context.lineWidth = Math.max(1, tile * 0.025 * scale);
    context.lineJoin = "round";
    context.stroke();
    if (warden.mode === "lured") {
      context.beginPath();
      context.arc(x, y, radius * 1.2, 0, Math.PI * 2);
      context.strokeStyle = palette.warden;
      context.lineWidth = Math.max(1.5, tile * 0.04 * scale);
      context.stroke();
    }

    // Each mode keeps its own paper face too, so the mode never rests on shape alone.
    context.fillStyle = palette.land;
    context.strokeStyle = palette.land;
    context.lineCap = "round";
    context.lineWidth = Math.max(1.5, tile * 0.045 * scale);

    if (warden.mode === "lured") {
      for (const direction of [-1, 1]) {
        context.beginPath();
        context.arc(
          x,
          y,
          tile * 0.1 * scale,
          direction < 0 ? Math.PI * 0.55 : -Math.PI * 0.45,
          direction < 0 ? Math.PI * 1.45 : Math.PI * 0.45
        );
        context.stroke();
      }
      return;
    }

    if (warden.mode === "hunt") {
      // Angry brows over two eyes.
      for (const side of [-1, 1]) {
        context.beginPath();
        context.moveTo(x + side * tile * 0.15 * scale, y - tile * 0.09 * scale);
        context.lineTo(x + side * tile * 0.04 * scale, y - tile * 0.03 * scale);
        context.stroke();
        context.beginPath();
        context.arc(
          x + side * tile * 0.09 * scale,
          y + tile * 0.04 * scale,
          tile * 0.045 * scale,
          0,
          Math.PI * 2
        );
        context.fill();
      }
      return;
    }

    if (warden.mode === "intercept") {
      context.fillRect(
        x - tile * 0.14 * scale,
        y - tile * 0.01 * scale,
        tile * 0.28 * scale,
        Math.max(2, tile * 0.07 * scale)
      );
      context.fillRect(
        x - tile * 0.035 * scale,
        y - tile * 0.11 * scale,
        Math.max(2, tile * 0.07 * scale),
        tile * 0.27 * scale
      );
      return;
    }

    // Patrol: one calm eye.
    context.beginPath();
    context.arc(
      x,
      y + tile * 0.03 * scale,
      tile * 0.065 * scale,
      0,
      Math.PI * 2
    );
    context.fill();
  }

  /**
   * @param {number} size The font shorthand of the Grid labels.
   * @param {string} [family]
   */
  function gridFont(size, family = palette.fontMono) {
    return `${size}px ${family}`;
  }

  /**
   * Resolves when the Grid font and the body font have settled, loaded or failed. `fonts.ready` and `loadingdone` miss a lazy load on some engines.
   * The tokens are read at call time, so a theme change before the call reaches the load.
   * @returns {Promise<void>}
   */
  async function loadFonts() {
    if (!document.fonts) return;
    const { fontBody, fontMono } = readPalette();
    await Promise.allSettled([
      document.fonts.load(gridFont(10, fontMono)),
      document.fonts.load(`700 10px ${fontBody}`),
      document.fonts.load(`500 10px ${fontBody}`)
    ]);
  }

  // A scheme or theme change moves the tokens; the cached chart and Fog layers hold the old colours.
  function repaint() {
    paletteStale = true;
    if (destroyed) return;
    // A detached canvas or one without a layout box, such as a closed dialog, paints on its next render.
    if (!lastRun || !canvas.isConnected || !canvas.getClientRects().length) return;
    try {
      render(lastRun);
    } catch (error) {
      // A listener has no caller to catch this, so the console gets the token name.
      console.error("Echo Maze board repaint failed.", error);
    }
  }
  const forcedColors = window.matchMedia?.("(forced-colors: active)");
  // An explicit light or dark theme wins over the system scheme, unless forced colours replace the tokens.
  const onSchemeChange = () => {
    const theme = document.documentElement.getAttribute("data-theme");
    if ((theme === "light" || theme === "dark") && !forcedColors?.matches) return;
    repaint();
  };
  const mediaListeners = [
    { media: window.matchMedia?.("(prefers-color-scheme: dark)"), listener: onSchemeChange },
    { media: forcedColors, listener: repaint },
    { media: window.matchMedia?.("(prefers-contrast: more)"), listener: repaint }
  ];
  for (const { media, listener } of mediaListeners) media?.addEventListener?.("change", listener);
  // Each attribute moves a board token or the mark scale: the theme, the contrast, the large marks and the two palettes.
  const observer = new MutationObserver(repaint);
  observer.observe(document.documentElement, {
    attributeFilter: [
      "data-theme",
      "data-access-contrast",
      "data-access-marks",
      "data-explorer-palette",
      "data-playground-palette"
    ],
    attributes: true
  });

  // The Neatline stays at frame size, so a scroll paints its ticks again from the new offset.
  const scrollFrame = canvas.parentElement;
  const onFrameScroll = () => lastRun && drawNeatline(lastRun.labyrinth.length);
  scrollFrame?.addEventListener("scroll", onFrameScroll, { passive: true });

  function destroy() {
    destroyed = true;
    observer.disconnect();
    for (const { media, listener } of mediaListeners) media?.removeEventListener?.("change", listener);
    scrollFrame?.removeEventListener("scroll", onFrameScroll);
  }

  return { destroy, loadFonts, render, resize };
}

/** @param {{ row: number, col: number }} position @param {number} tile */
function centerOf(position, tile) {
  return {
    x: position.col * tile + tile / 2,
    y: position.row * tile + tile / 2
  };
}

/** @param {HTMLCanvasElement} canvas */
function getCanvasContext(canvas) {
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("Canvas rendering is unavailable.");
  }
  return context;
}

export class MissingBoardTokenError extends Error {
  /** @param {string} token The CSS custom property that read empty. */
  constructor(token) {
    super(`Board token ${token} is empty.`);
    this.name = "MissingBoardTokenError";
    this.token = token;
  }
}

function readPalette() {
  // Read from body so a scope set on body reaches the canvas. The board marks
  // use their own tokens, because Night draws them on a light passage.
  const styles = getComputedStyle(document.body ?? document.documentElement);
  /** @param {string} name */
  const color = (name) => {
    const value = styles.getPropertyValue(name).trim();
    // An empty token means the stylesheet did not load; a guessed colour would hide that.
    if (!value) throw new MissingBoardTokenError(name);
    return value;
  };
  return {
    coastline: color("--color-coastline"),
    danger: color("--color-danger-line"),
    echo: color("--color-board-echo"),
    echoText: color("--color-board-echo-text"),
    boardInk: color("--color-board-ink"),
    casing: color("--color-board-casing"),
    cover: color("--color-board-cover"),
    coverInk: color("--color-board-cover-ink"),
    explorer: color("--color-board-explorer"),
    explorerDisc: color("--color-board-explorer-disc"),
    explorerRing: color("--color-board-explorer-ring"),
    fontBody: color("--font-body"),
    fontMono: color("--font-utility"),
    // High contrast and forced colours keep the art but drop the glow.
    flat:
      document.documentElement.dataset.accessContrast === "strong" ||
      Boolean(window.matchMedia?.("(forced-colors: active)")?.matches),
    fog: color("--color-fog"),
    fogEdge: color("--color-fog-edge"),
    fogSoft: color("--color-fog-soft"),
    gate: color("--color-board-gate"),
    gateInk: color("--color-board-gate-ink"),
    land: color("--color-land"),
    landLip: color("--color-land-lip"),
    light: color("--color-board-light"),
    lightOnFill: color("--color-board-light-on-fill"),
    // A negative scale would make `arc` throw, so the scale keeps a positive floor.
    markScale: Math.max(0.25, Number.parseFloat(styles.getPropertyValue("--maze-mark-scale")) || 1),
    night: color("--color-night-deep"),
    onFill: color("--color-on-fill"),
    // The resolved colours decide, so each mode that sets `--color-land` to paper doubles the Coastline, and forced colours does not.
    paperLand: color("--color-land") === color("--board-paper"),
    passage: color("--color-passage"),
    warden: color("--color-board-warden")
  };
}
