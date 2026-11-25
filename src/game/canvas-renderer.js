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
  /** @type {{ key: string, pattern: CanvasPattern | null } | null} */
  let fogPattern = null;

  /** One pattern per palette and device ratio. Without a tile context the Fog fills flat. */
  function fogFill() {
    const unit = Math.max(1, Math.round(deviceRatio));
    const key = `${palette.fog}|${palette.fogDot}|${unit}`;
    if (fogPattern?.key !== key) {
      const side = FOG_TILE * unit;
      const tile = createTile(side, side);
      const tileContext = /** @type {CanvasRenderingContext2D | null} */ (tile.getContext("2d"));
      let pattern = null;
      if (tileContext) {
        tileContext.fillStyle = palette.fog;
        tileContext.fillRect(0, 0, side, side);
        tileContext.fillStyle = palette.fogDot;
        for (const [x, y] of FOG_DOTS) {
          tileContext.fillRect(x * unit, y * unit, unit, unit);
        }
        pattern = context.createPattern(tile, "repeat");
      }
      fogPattern = { key, pattern };
    }
    return fogPattern.pattern ?? palette.fog;
  }

  /**
   * Traces one tile with edges on whole pixels, so adjacent tiles leave no seam.
   * @param {number} row
   * @param {number} col
   * @param {number} tile
   */
  function traceTile(row, col, tile) {
    const left = Math.floor(col * tile);
    const top = Math.floor(row * tile);
    context.rect(
      left,
      top,
      Math.ceil((col + 1) * tile) - left,
      Math.ceil((row + 1) * tile) - top
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
    for (let row = 0; row < size; row += 1) {
      for (let col = 0; col < size; col += 1) {
        const key = `${row},${col}`;
        if (!revealed.has(key)) continue;
        drawKnownTile(run.labyrinth[row][col] === 1, row, col, tile);
        if (run.pulseVisible.includes(key) && !run.revealed.includes(key)) {
          pulseCells.push([row, col]);
        }
      }
    }
    if (pulseCells.length > 0) {
      // One path keeps the translucent Pulse layer from doubling where tiles touch.
      context.beginPath();
      for (const [row, col] of pulseCells) traceTile(row, col, tile);
      context.fillStyle = palette.pulse;
      context.fill();
    }

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
      context.fillStyle = palette.overlay;
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.fillStyle = palette.onFill;
      context.font = `700 ${Math.max(22, canvas.width * 0.045)}px ${palette.fontBody}`;
      context.textAlign = "center";
      context.fillText("PAUSED", canvas.width / 2, canvas.height / 2);
    } else if (run.status === "challenge") {
      context.fillStyle = palette.overlay;
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.fillStyle = palette.explorer;
      context.font = `700 ${Math.max(22, canvas.width * 0.045)}px ${palette.fontBody}`;
      context.textAlign = "center";
      context.fillText(
        run.challenge?.kind === "gate-warden"
          ? "GATE WARDEN"
          : "WARDEN CHALLENGE",
        canvas.width / 2,
        canvas.height / 2
      );
      context.fillStyle = palette.onFill;
      context.font = `500 ${Math.max(14, canvas.width * 0.022)}px ${palette.fontBody}`;
      context.fillText(
        run.challenge?.kind === "gate-warden"
          ? "Break the seal with your answer."
          : "Your knowledge clears the path.",
        canvas.width / 2,
        canvas.height / 2 + Math.max(28, canvas.width * 0.055)
      );
    }
    context.restore();
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
   * @param {boolean} isPassage
   * @param {number} row
   * @param {number} col
   * @param {number} tile
   */
  function drawKnownTile(isPassage, row, col, tile) {
    const x = col * tile;
    const y = row * tile;
    const inset = tile * 0.02;
    const side = tile - inset * 2;
    if (isPassage) {
      // A passage is a square of water.
      context.beginPath();
      traceTile(row, col, tile);
      context.fillStyle = palette.passage;
      context.fill();
      if ((row + col) % 2 === 0) {
        context.fillStyle = palette.grid;
        const markerSize = 1.5 * deviceRatio;
        const offset = markerSize * 0.5;
        context.fillRect(
          x + tile * 0.5 - offset,
          y + tile * 0.5 - offset,
          markerSize,
          markerSize
        );
      }
      return;
    }
    // A wall is a charcoal block hatched with diagonal ink strokes.
    traceRoundedRect(x + inset, y + inset, side, side, tile * 0.05);
    context.fillStyle = palette.wall;
    context.fill();
    context.strokeStyle = palette.wallGrid;
    context.lineWidth = Math.max(1, tile * 0.02);
    context.stroke();
    context.beginPath();
    for (const step of [0.35, 0.7, 1.05, 1.4]) {
      // Each stroke runs along x + y = step * side inside the block.
      const reach = step * side;
      const start = Math.min(reach, side);
      const end = Math.max(reach - side, 0);
      context.moveTo(x + inset + start, y + inset + reach - start);
      context.lineTo(x + inset + end, y + inset + reach - end);
    }
    context.strokeStyle = palette.wallMark;
    context.lineWidth = Math.max(1, tile * 0.03);
    context.lineCap = "butt";
    context.stroke();
  }

  /** @param {Explorer} explorer @param {number} tile */
  function drawExplorer(explorer, tile) {
    const { x, y } = centerOf(explorer, tile);
    const scale = palette.markScale;
    const radius = tile * 0.3 * scale;
    const glow = context.createRadialGradient(
      x,
      y,
      0,
      x,
      y,
      tile * 0.72 * scale
    );
    glow.addColorStop(0, palette.explorer);
    glow.addColorStop(1, palette.transparent);
    context.globalAlpha = 0.3;
    context.fillStyle = glow;
    context.fillRect(x - tile, y - tile, tile * 2, tile * 2);
    context.globalAlpha = 1;

    // A white disc with a sky ring carries the Explorer flag.
    context.beginPath();
    context.arc(x, y, radius, 0, Math.PI * 2);
    context.fillStyle = palette.onFill;
    context.fill();
    context.lineWidth = Math.max(2, tile * 0.08 * scale);
    context.strokeStyle = palette.explorer;
    context.stroke();

    const poleX = x - radius * 0.28;
    context.beginPath();
    context.moveTo(poleX, y + radius * 0.52);
    context.lineTo(poleX, y - radius * 0.55);
    context.lineWidth = Math.max(1.5, tile * 0.04 * scale);
    context.lineCap = "round";
    context.strokeStyle = palette.night;
    context.stroke();
    context.beginPath();
    context.moveTo(poleX, y - radius * 0.55);
    context.lineTo(poleX + radius * 0.72, y - radius * 0.3);
    context.lineTo(poleX, y - radius * 0.04);
    context.closePath();
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
    context.fillStyle = palette.night;
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
        : palette.explorer
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
      context.moveTo(x - tile * 0.13 * scale, y - tile * 0.09 * scale);
      context.lineTo(x + tile * 0.13 * scale, y + tile * 0.17 * scale);
      context.moveTo(x + tile * 0.13 * scale, y - tile * 0.09 * scale);
      context.lineTo(x - tile * 0.13 * scale, y + tile * 0.17 * scale);
      context.stroke();
    } else if (gate.open) {
      context.moveTo(x, y + tile * 0.18 * scale);
      context.lineTo(x, y - tile * 0.12 * scale);
      context.moveTo(x - tile * 0.1 * scale, y - tile * 0.02 * scale);
      context.lineTo(x, y - tile * 0.13 * scale);
      context.lineTo(x + tile * 0.1 * scale, y - tile * 0.02 * scale);
      context.stroke();
    } else {
      context.arc(x, y - tile * 0.02 * scale, tile * 0.06 * scale, 0, Math.PI * 2);
      context.fillStyle = palette.onFill;
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
    context.strokeStyle = palette.explorer;
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

  /** @param {EchoBridge} bridge @param {number} tile */
  function drawEchoBridge(bridge, tile) {
    const from = centerOf(bridge.from, tile);
    const to = centerOf(bridge.to, tile);
    const midpoint = {
      x: (from.x + to.x) / 2,
      y: (from.y + to.y) / 2
    };
    const scale = palette.markScale;
    const color = bridge.open ? palette.explorer : palette.gate;

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
    context.stroke();
    context.setLineDash([]);
    context.lineWidth = Math.max(1.5, tile * 0.05 * scale);
    for (const endpoint of [from, to]) {
      context.beginPath();
      context.arc(endpoint.x, endpoint.y, tile * 0.12 * scale, 0, Math.PI * 2);
      context.fillStyle = palette.onFill;
      context.fill();
      context.stroke();
    }
    if (!bridge.open) {
      context.lineWidth = Math.max(2, tile * 0.06 * scale);
      context.beginPath();
      context.moveTo(midpoint.x - tile * 0.1, midpoint.y - tile * 0.1);
      context.lineTo(midpoint.x + tile * 0.1, midpoint.y + tile * 0.1);
      context.moveTo(midpoint.x + tile * 0.1, midpoint.y - tile * 0.1);
      context.lineTo(midpoint.x - tile * 0.1, midpoint.y + tile * 0.1);
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
    context.strokeStyle = door.open ? palette.explorer : palette.gate;
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
      context.stroke();
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
    const color = bell.spent ? palette.gate : palette.explorer;
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
    context.stroke();
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
    context.strokeStyle = palette.night;
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

    // Each mode keeps its own face too, so the mode never rests on shape alone.
    context.fillStyle = palette.night;
    context.strokeStyle = palette.night;
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

  return { render, resize };
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
    explorer: color("--color-explorer", FALLBACK_PALETTE.explorer),
    explorerRing: color("--color-board-explorer-ring", FALLBACK_PALETTE.explorerRing),
    fontBody: color("--font-body", FALLBACK_PALETTE.fontBody),
    fog: color("--color-fog", FALLBACK_PALETTE.fog),
    fogDot: color("--color-fog-dot", FALLBACK_PALETTE.fogDot),
    gate: color("--color-board-gate", FALLBACK_PALETTE.gate),
    grid: color("--color-grid", FALLBACK_PALETTE.grid),
    hatch: color("--color-hatch", FALLBACK_PALETTE.hatch),
    ink: color("--color-ink", FALLBACK_PALETTE.ink),
    land: color("--color-land", FALLBACK_PALETTE.land),
    light: color("--color-board-light", FALLBACK_PALETTE.light),
    markScale: Number.parseFloat(styles.getPropertyValue("--maze-mark-scale")) || 1,
    night: color("--color-night-deep", FALLBACK_PALETTE.night),
    onFill: color("--color-on-fill", FALLBACK_PALETTE.onFill),
    overlay: color("--color-overlay", FALLBACK_PALETTE.overlay),
    passage: color("--color-passage", FALLBACK_PALETTE.passage),
    pulse: color("--color-pulse", FALLBACK_PALETTE.pulse),
    transparent: "transparent",
    wall: color("--color-wall", FALLBACK_PALETTE.wall),
    wallGrid: color("--color-wall-grid", FALLBACK_PALETTE.wallGrid),
    wallMark: color("--color-wall-mark", FALLBACK_PALETTE.wallMark),
    warden: color("--color-board-warden", FALLBACK_PALETTE.warden)
  };
}

// Used when a CSS variable is missing, so the board never paints with an empty style.
// The values equal the light block of tokens.css.
const FALLBACK_PALETTE = {
  coastline: "oklch(18% 0.012 250)",
  danger: "oklch(18% 0.012 250)",
  echo: "oklch(52% 0.17 250)",
  explorer: "oklch(46% 0.17 250)",
  explorerRing: "oklch(18% 0.012 250)",
  fontBody: "Arial, sans-serif",
  fog: "oklch(99% 0.004 95)",
  fogDot: "oklch(18% 0.012 250 / 80%)",
  gate: "oklch(58% 0.24 340)",
  grid: "oklch(40% 0.02 60 / 45%)",
  hatch: "oklch(18% 0.012 250 / 30%)",
  ink: "oklch(18% 0.012 250)",
  land: "oklch(99% 0.004 95)",
  light: "oklch(58% 0.24 340)",
  night: "oklch(16% 0.012 65)",
  onFill: "oklch(100% 0 0)",
  overlay: "oklch(20% 0.015 60 / 60%)",
  passage: "oklch(95.5% 0.022 232)",
  pulse: "oklch(68.5% 0.169 237 / 30%)",
  wall: "oklch(30% 0.03 85)",
  wallGrid: "oklch(18% 0.012 250 / 85%)",
  wallMark: "oklch(50% 0.04 85 / 75%)",
  warden: "oklch(18% 0.012 250)"
};
