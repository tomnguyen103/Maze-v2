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

/** The Fog tile is 8 by 8 pixels at one device pixel per tile pixel. */
const FOG_TILE = 8;
/** The hatch tile is 6 backing-store pixels square, so the 45 degree pitch is about 4 device pixels at every ratio. */
const HATCH_TILE = 6;
/** Row and column steps to the four neighbours of a cell. */
const NEIGHBOURS = [
  [-1, 0],
  [1, 0],
  [0, -1],
  [0, 1]
];
/** Three one-pixel dots in the 8 by 8 tile give 4.7 percent coverage. */
const FOG_DOTS = [
  [1, 1],
  [5, 3],
  [2, 6]
];

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

/**
 * @param {HTMLCanvasElement} canvas
 * @param {typeof createDetachedCanvas} [createTile] Builds the detached Fog tile canvas.
 */
export function createCanvasRenderer(canvas, createTile = createDetachedCanvas) {
  const context = getCanvasContext(canvas);

  let palette = readPalette();
  let deviceRatio = 1;
  /** @type {Map<string, CanvasPattern | null>} */
  const patterns = new Map();

  /**
   * One pattern per paint and device pixel size. Without a tile context the caller gets null.
   * @param {string} key
   * @param {number} side
   * @param {(tileContext: CanvasRenderingContext2D) => void} paint
   */
  function cachedPattern(key, side, paint) {
    if (!patterns.has(key)) {
      const tile = createTile(side, side);
      // Software raster: a GPU tile and a CPU tile round translucent dots differently, which shows after a reload.
      const tileContext = /** @type {CanvasRenderingContext2D | null} */ (
        tile.getContext("2d", { willReadFrequently: true })
      );
      let pattern = null;
      if (tileContext) {
        paint(tileContext);
        pattern = context.createPattern(tile, "repeat");
      }
      patterns.set(key, pattern);
    }
    return patterns.get(key) ?? null;
  }

  function devicePixel() {
    return Math.max(1, Math.round(deviceRatio));
  }

  /** The Fog fills flat when no tile context exists. */
  function fogFill() {
    // High contrast paints the Fog flat: no stipple.
    if (palette.strong) return palette.fog;
    const unit = devicePixel();
    const side = FOG_TILE * unit;
    return (
      cachedPattern(`fog|${palette.fog}|${palette.fogDot}|${unit}`, side, (tileContext) => {
        tileContext.fillStyle = palette.fog;
        tileContext.fillRect(0, 0, side, side);
        tileContext.fillStyle = palette.fogDot;
        for (const [x, y] of FOG_DOTS) tileContext.fillRect(x * unit, y * unit, unit, unit);
      }) ?? palette.fog
    );
  }

  /** The hatch is one backing-store pixel ink line at 45 degrees, with no device ratio factor. */
  function hatchFill() {
    return cachedPattern(`hatch|${palette.hatch}`, HATCH_TILE, (tileContext) => {
      tileContext.fillStyle = palette.hatch;
      for (let i = 0; i < HATCH_TILE; i += 1) {
        tileContext.fillRect(i, HATCH_TILE - 1 - i, 1, 1);
      }
    });
  }

  /**
   * Traces one tile with edges on whole pixels, so adjacent tiles leave no seam.
   * @param {number} row
   * @param {number} col
   * @param {number} tile
   */
  function traceTile(row, col, tile) {
    // The edges round like the coastline edges, so no land strip shows on the water side.
    const left = Math.round(col * tile);
    const top = Math.round(row * tile);
    context.rect(
      left,
      top,
      Math.round((col + 1) * tile) - left,
      Math.round((row + 1) * tile) - top
    );
  }

  function resize() {
    const bounds = canvas.getBoundingClientRect();
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    deviceRatio = ratio;
    const width = Math.max(320, Math.round(bounds.width * ratio));
    const height = Math.max(320, Math.round(bounds.height * ratio));
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
  }

  /** @param {GameRun} run */
  function render(run) {
    resize();
    palette = readPalette();
    const size = run.labyrinth.length;
    const tile = canvas.width / size;
    const revealed = new Set([...run.revealed, ...run.pulseVisible]);
    for (const windway of run.windways) {
      const sourceKey = `${windway.source.row},${windway.source.col}`;
      const destinationKey =
        `${windway.destination.row},${windway.destination.col}`;
      if (revealed.has(sourceKey) || revealed.has(destinationKey)) {
        revealed.add(sourceKey);
        revealed.add(destinationKey);
      }
    }
    // Each frame starts from the default line, text, and fill state.
    context.save();
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = fogFill();
    context.fillRect(0, 0, canvas.width, canvas.height);

    /** @type {Array<[number, number]>} */
    const pulseCells = [];
    /** @type {Array<[number, number]>} */
    const wallCells = [];
    for (let row = 0; row < size; row += 1) {
      for (let col = 0; col < size; col += 1) {
        const key = `${row},${col}`;
        if (!revealed.has(key)) continue;
        if (run.labyrinth[row][col] === 1) {
          wallCells.push([row, col]);
        } else {
          drawPassage(row, col, tile);
        }
        if (run.pulseVisible.includes(key) && !run.revealed.includes(key)) {
          pulseCells.push([row, col]);
        }
      }
    }
    drawLand(wallCells, tile);
    if (pulseCells.length > 0) {
      // The Pulse layer paints over land and water. One path stops the translucent layer from doubling.
      context.beginPath();
      for (const [row, col] of pulseCells) traceTile(row, col, tile);
      context.fillStyle = palette.pulse;
      context.fill();
    }
    drawCoastline(run, revealed, tile);

    if (revealed.has(`${run.gate.row},${run.gate.col}`)) {
      drawGate(run.gate, tile);
    }
    for (const windway of run.windways) {
      if (revealed.has(`${windway.source.row},${windway.source.col}`)) {
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
    for (const warden of run.wardens) {
      if (revealed.has(`${warden.row},${warden.col}`)) {
        drawWarden(warden, tile);
      }
    }
    drawExplorer(run.explorer, tile);

    if (run.status === "paused") {
      const fontSize = Math.max(22, canvas.width * 0.045);
      drawBand(fontSize * 2.6);
      context.fillStyle = palette.boardInk;
      context.font = `700 ${fontSize}px ${palette.fontBody}`;
      context.fillText("PAUSED", canvas.width / 2, canvas.height / 2);
    } else if (run.status === "challenge") {
      const fontSize = Math.max(22, canvas.width * 0.045);
      const subSize = Math.max(14, canvas.width * 0.022);
      const gap = Math.max(28, canvas.width * 0.055);
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
    context.restore();
  }

  /**
   * A paper band across the board centre with an ink rule above and below.
   * @param {number} height
   */
  function drawBand(height) {
    const unit = devicePixel();
    const top = Math.round((canvas.height - height) / 2);
    const band = Math.round(height);
    context.fillStyle = palette.land;
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
    // The board box in device pixels. The backing store clamps to 320 and cannot size the Neatline.
    const side = Math.round(box.width * deviceRatio);
    const tick = 2 * unit;
    const gap = 2 * unit;
    const half = (unit % 2) / 2;
    neat.clearRect(0, 0, width, height);
    neat.strokeStyle = palette.ink;
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
    neat.fillStyle = palette.ink;
    neat.font = gridFont(10 * deviceRatio);
    // Every tick stays. Label every k-th line, with k the smallest step whose pitch fits the widest label.
    const labelWidth = neat.measureText(String(size)).width + 2 * unit;
    const rowWidth = Math.max(labelWidth, 10 * deviceRatio);
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
   * Traces a rounded rectangle path with plain arcs.
   * @param {number} x
   * @param {number} y
   * @param {number} width
   * @param {number} height
   * @param {number} radius
   */
  function traceRoundedRect(x, y, width, height, radius) {
    const r = Math.min(radius, width / 2, height / 2);
    context.beginPath();
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
    const fontSize = Math.max(7, tile * fontScale * palette.markScale);
    const width = Math.max(tile * 0.3, fontSize * (text.length * 0.68 + 0.9));
    const height = fontSize * 1.55;
    traceRoundedRect(x - width / 2, y - height / 2, width, height, height / 2);
    context.fillStyle = palette.night;
    context.fill();
    context.fillStyle = palette.onFill;
    context.font = `700 ${fontSize}px ${palette.fontBody}`;
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText(text, x, y);
  }

  /**
   * A passage is a square of water.
   * @param {number} row
   * @param {number} col
   * @param {number} tile
   */
  function drawPassage(row, col, tile) {
    context.beginPath();
    traceTile(row, col, tile);
    context.fillStyle = palette.passage;
    context.fill();
  }

  /**
   * Known walls are paper land with one ink hatch, each layer from one path.
   * @param {Array<[number, number]>} cells
   * @param {number} tile
   */
  function drawLand(cells, tile) {
    if (cells.length === 0) return;
    context.beginPath();
    for (const [row, col] of cells) traceTile(row, col, tile);
    context.fillStyle = palette.land;
    context.fill();
    const hatch = hatchFill();
    if (hatch) {
      context.fillStyle = hatch;
      context.fill();
    }
  }

  /**
   * One ink stroke along every edge where known land meets a known passage.
   * @param {GameRun} run
   * @param {Set<string>} revealed
   * @param {number} tile
   */
  function drawCoastline(run, revealed, tile) {
    const size = run.labyrinth.length;
    // High contrast doubles the line.
    const width = Math.max(1, Math.round(tile * 0.06)) * (palette.strong ? 2 : 1);
    // An odd width centres across the edge on a half pixel, so the stroke fills whole device pixels.
    // Along the edge, the ends sit on whole pixels.
    const across = (/** @type {number} */ edge) => Math.round(edge) + (width % 2) / 2;
    // An end that meets a crossing stroke reaches its far side, so a land corner has no notch. A free end stops on the edge.
    // An odd stroke covers floor(w/2) pixels before the edge and ceil(w/2) pixels after it.
    const reachStart = Math.floor(width / 2);
    const reachEnd = Math.ceil(width / 2);
    const along = (/** @type {number} */ edge) => Math.round(edge);
    /** @param {number} row @param {number} col */
    const kindAt = (row, col) =>
      row < 0 || col < 0 || row >= size || col >= size || !revealed.has(`${row},${col}`)
        ? -1
        : run.labyrinth[row][col] === 1
          ? 1
          : 0;
    /** An edge lies between one known wall and one known passage. */
    const isEdge = (/** @type {number} */ rowA, /** @type {number} */ colA, /** @type {number} */ rowB, /** @type {number} */ colB) =>
      kindAt(rowA, colA) + kindAt(rowB, colB) === 1 && kindAt(rowA, colA) >= 0 && kindAt(rowB, colB) >= 0;
    // Row line r and column line c meet at corner (r, c). A stroke reaches past a corner only where a crossing stroke meets it.
    const meetsAcross = (/** @type {number} */ lineRow, /** @type {number} */ lineCol, /** @type {boolean} */ horizontal) =>
      horizontal
        ? isEdge(lineRow - 1, lineCol - 1, lineRow - 1, lineCol) || isEdge(lineRow, lineCol - 1, lineRow, lineCol)
        : isEdge(lineRow - 1, lineCol - 1, lineRow, lineCol - 1) || isEdge(lineRow - 1, lineCol, lineRow, lineCol);
    context.beginPath();
    let edges = 0;
    for (let row = 0; row < size; row += 1) {
      for (let col = 0; col < size; col += 1) {
        if (run.labyrinth[row][col] !== 1 || !revealed.has(`${row},${col}`)) continue;
        for (const [dRow, dCol] of NEIGHBOURS) {
          const nRow = row + dRow;
          const nCol = col + dCol;
          if (nRow < 0 || nCol < 0 || nRow >= size || nCol >= size) continue;
          if (run.labyrinth[nRow][nCol] === 1 || !revealed.has(`${nRow},${nCol}`)) continue;
          const edgeRow = dRow === 0 ? row : row + (dRow > 0 ? 1 : 0);
          const edgeCol = dCol === 0 ? col : col + (dCol > 0 ? 1 : 0);
          if (dCol === 0) {
            const y = across(edgeRow * tile);
            const start = meetsAcross(edgeRow, edgeCol, true) ? reachStart : 0;
            const end = meetsAcross(edgeRow, edgeCol + 1, true) ? reachEnd : 0;
            context.moveTo(along(edgeCol * tile) - start, y);
            context.lineTo(along((edgeCol + 1) * tile) + end, y);
          } else {
            const x = across(edgeCol * tile);
            const start = meetsAcross(edgeRow, edgeCol, false) ? reachStart : 0;
            const end = meetsAcross(edgeRow + 1, edgeCol, false) ? reachEnd : 0;
            context.moveTo(x, along(edgeRow * tile) - start);
            context.lineTo(x, along((edgeRow + 1) * tile) + end);
          }
          edges += 1;
        }
      }
    }
    if (edges === 0) return;
    context.strokeStyle = palette.coastline;
    context.lineWidth = width;
    context.lineCap = "butt";
    context.stroke();
  }

  /** @param {Explorer} explorer @param {number} tile */
  function drawExplorer(explorer, tile) {
    const { x, y } = centerOf(explorer, tile);
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
    // An Echo is a soft lantern: a halo, a lit core, and its pair number.
    context.beginPath();
    context.arc(x, y, tile * 0.34 * scale, 0, Math.PI * 2);
    context.fillStyle = palette.pulse;
    context.fill();
    context.beginPath();
    context.arc(x, y, tile * 0.22 * scale, 0, Math.PI * 2);
    context.fillStyle = palette.echo;
    context.fill();
    context.lineWidth = Math.max(1.5, tile * 0.045 * scale);
    context.strokeStyle = palette.onFill;
    context.stroke();

    context.save();
    context.fillStyle = palette.echoText;
    context.font =
      `700 ${Math.max(8, tile * 0.22 * scale)}px ${palette.fontBody}`;
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
      context.arc(x, y - tile * 0.02 * scale, tile * 0.06 * scale, 0, Math.PI * 2);
      context.fillStyle = palette.land;
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
    const { lineWidth, strokeStyle } = context;
    context.strokeStyle = palette.casing;
    context.lineWidth = lineWidth + 2 * Math.max(1, tile * 0.02 * palette.markScale);
    context.stroke();
    context.strokeStyle = strokeStyle;
    context.lineWidth = lineWidth;
    context.stroke();
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
    context.lineWidth = Math.max(2, tile * 0.05 * scale);
    context.setLineDash(
      bridge.open ? [] : [tile * 0.16 * scale, tile * 0.13 * scale]
    );
    context.beginPath();
    context.moveTo(from.x, from.y);
    context.lineTo(to.x, to.y);
    strokeSignal(tile);
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
      context.beginPath();
      context.moveTo(midpoint.x - tile * 0.1, midpoint.y - tile * 0.1);
      context.lineTo(midpoint.x + tile * 0.1, midpoint.y + tile * 0.1);
      context.moveTo(midpoint.x + tile * 0.1, midpoint.y - tile * 0.1);
      context.lineTo(midpoint.x - tile * 0.1, midpoint.y + tile * 0.1);
      // A plain stroke: a casing would cut the dashed line the X sits on.
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
    context.beginPath();
    context.arc(x, y - tile * 0.04, tile * 0.2 * scale, Math.PI, 0);
    context.lineTo(x + tile * 0.25 * scale, y + tile * 0.2 * scale);
    context.lineTo(x - tile * 0.25 * scale, y + tile * 0.2 * scale);
    context.closePath();
    context.fill();
    strokeSignal(tile);
    context.beginPath();
    context.arc(
      x,
      y + tile * 0.27 * scale,
      tile * 0.06 * scale,
      0,
      Math.PI * 2
    );
    context.fillStyle = color;
    context.fill();
    if (bell.spent) {
      context.lineCap = "round";
      context.beginPath();
      context.moveTo(x - tile * 0.22, y - tile * 0.22);
      context.lineTo(x + tile * 0.22, y + tile * 0.24);
      // A plain stroke: a casing would cut the bell outline the slash crosses.
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
    // A dotted danger line rings the Warden, under its body.
    context.beginPath();
    context.arc(x, y, Math.min(tile * 0.46 * scale, tile * 0.48), 0, Math.PI * 2);
    context.setLineDash([Math.max(1, tile * 0.02), Math.max(2, tile * 0.05)]);
    context.strokeStyle = palette.danger;
    context.lineWidth = Math.max(1, tile * 0.02 * scale);
    context.stroke();
    context.setLineDash([]);
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

  return { loadFonts, render, resize };
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

function readPalette() {
  // Read from body so a scope set on body reaches the canvas. The board marks
  // use their own tokens, because Night draws them on a light passage.
  const styles = getComputedStyle(document.body ?? document.documentElement);
  /**
   * @param {string} name
   * @param {string} fallback
   */
  const color = (name, fallback) => styles.getPropertyValue(name).trim() || fallback;
  return {
    coastline: color("--color-coastline", FALLBACK_PALETTE.coastline),
    danger: color("--color-danger-line", FALLBACK_PALETTE.danger),
    echo: color("--color-board-echo", FALLBACK_PALETTE.echo),
    echoText: color("--color-board-echo-text", FALLBACK_PALETTE.echoText),
    boardInk: color("--color-board-ink", FALLBACK_PALETTE.boardInk),
    casing: color("--color-board-casing", FALLBACK_PALETTE.casing),
    explorer: color("--color-board-explorer", FALLBACK_PALETTE.explorer),
    explorerDisc: color("--color-board-explorer-disc", FALLBACK_PALETTE.explorerDisc),
    explorerRing: color("--color-board-explorer-ring", FALLBACK_PALETTE.explorerRing),
    fontBody: color("--font-body", FALLBACK_PALETTE.fontBody),
    fontMono: color("--font-utility", FALLBACK_PALETTE.fontMono),
    fog: color("--color-fog", FALLBACK_PALETTE.fog),
    fogDot: color("--color-fog-dot", FALLBACK_PALETTE.fogDot),
    gate: color("--color-board-gate", FALLBACK_PALETTE.gate),
    hatch: color("--color-hatch", FALLBACK_PALETTE.hatch),
    ink: color("--color-ink", FALLBACK_PALETTE.ink),
    land: color("--color-land", FALLBACK_PALETTE.land),
    light: color("--color-board-light", FALLBACK_PALETTE.light),
    lightOnFill: color("--color-board-light-on-fill", FALLBACK_PALETTE.lightOnFill),
    // A negative scale would make `arc` throw, so the scale keeps a positive floor.
    markScale: Math.max(0.25, Number.parseFloat(styles.getPropertyValue("--maze-mark-scale")) || 1),
    night: color("--color-night-deep", FALLBACK_PALETTE.night),
    onFill: color("--color-on-fill", FALLBACK_PALETTE.onFill),
    passage: color("--color-passage", FALLBACK_PALETTE.passage),
    pulse: color("--color-pulse", FALLBACK_PALETTE.pulse),
    strong: document.documentElement.dataset.accessContrast === "strong",
    warden: color("--color-board-warden", FALLBACK_PALETTE.warden)
  };
}

// Used when a CSS variable is missing, so the board never paints with an empty style.
// The values equal the light block of tokens.css.
const FALLBACK_PALETTE = {
  boardInk: "oklch(18% 0.012 250)",
  casing: "oklch(100% 0 0)",
  coastline: "oklch(18% 0.012 250)",
  danger: "oklch(18% 0.012 250)",
  echo: "oklch(52% 0.17 250)",
  echoText: "oklch(100% 0 0)",
  explorer: "oklch(46% 0.17 250)",
  explorerDisc: "oklch(99% 0.004 95)",
  explorerRing: "oklch(18% 0.012 250)",
  fontBody: "Arial, sans-serif",
  fontMono: "monospace",
  fog: "oklch(99% 0.004 95)",
  fogDot: "oklch(18% 0.012 250 / 80%)",
  gate: "oklch(58% 0.24 340)",
  hatch: "oklch(18% 0.012 250 / 30%)",
  ink: "oklch(18% 0.012 250)",
  land: "oklch(99% 0.004 95)",
  light: "oklch(58% 0.24 340)",
  lightOnFill: "oklch(58% 0.24 340)",
  night: "oklch(18% 0.012 250)",
  onFill: "oklch(100% 0 0)",
  passage: "oklch(95.5% 0.022 232)",
  pulse: "oklch(52% 0.17 250 / 28%)",
  warden: "oklch(18% 0.012 250)"
};
