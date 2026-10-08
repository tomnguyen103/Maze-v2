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
 * @param {HTMLCanvasElement} canvas
 */
export function createCanvasRenderer(canvas) {
  const context = getCanvasContext(canvas);

  let palette = readPalette();
  let deviceRatio = 1;

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
    context.fillStyle = palette.fog;
    context.fillRect(0, 0, canvas.width, canvas.height);
    drawFogGrid(size, tile, revealed);

    for (let row = 0; row < size; row += 1) {
      for (let col = 0; col < size; col += 1) {
        const key = `${row},${col}`;
        if (!revealed.has(key)) continue;
        drawKnownTile(run.labyrinth[row][col] === 1, row, col, tile);
        if (run.pulseVisible.includes(key) && !run.revealed.includes(key)) {
          const inset = tile * 0.035;
          traceRoundedRect(
            col * tile + inset,
            row * tile + inset,
            tile - inset * 2,
            tile - inset * 2,
            tile * 0.24
          );
          context.fillStyle = palette.pulse;
          context.fill();
        }
      }
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
      context.fillStyle = palette.signal;
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
    const radius = tile * 0.24;
    if (isPassage) {
      // A passage is a soft island tile in the Region hue.
      const inset = tile * 0.035;
      traceRoundedRect(x + inset, y + inset, tile - inset * 2, tile - inset * 2, radius);
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
    // A wall is a raised block: a base shadow, the body, then a lit top edge.
    const inset = tile * 0.06;
    const width = tile - inset * 2;
    const lift = tile * 0.07;
    traceRoundedRect(x + inset, y + inset + lift, width, width - lift, radius);
    context.fillStyle = palette.wallGrid;
    context.fill();
    traceRoundedRect(x + inset, y + inset, width, width - lift, radius);
    context.fillStyle = palette.wall;
    context.fill();
    traceRoundedRect(
      x + inset + tile * 0.12,
      y + inset + tile * 0.08,
      width - tile * 0.24,
      tile * 0.12,
      tile * 0.06
    );
    context.fillStyle = palette.wallMark;
    context.fill();
  }

  /** @param {number} size @param {number} tile @param {Set<string>} revealed */
  function drawFogGrid(size, tile, revealed) {
    // Unseen ground is plain paper with a faint grid. One stroke blends each
    // shared edge once, so the translucent grid rasterizes the same every time.
    context.beginPath();
    for (let row = 0; row < size; row += 1) {
      for (let col = 0; col < size; col += 1) {
        if (!revealed.has(`${row},${col}`)) {
          context.rect(col * tile, row * tile, tile, tile);
        }
      }
    }
    context.strokeStyle = palette.fogGrid;
    context.lineWidth = Math.max(0.75, tile * 0.012);
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
    glow.addColorStop(0, palette.signalGlow);
    glow.addColorStop(1, palette.transparent);
    context.fillStyle = glow;
    context.fillRect(x - tile, y - tile, tile * 2, tile * 2);

    // A white disc with a sky ring carries the Explorer flag.
    context.beginPath();
    context.arc(x, y, radius, 0, Math.PI * 2);
    context.fillStyle = palette.onFill;
    context.fill();
    context.lineWidth = Math.max(2, tile * 0.08 * scale);
    context.strokeStyle = palette.signal;
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
    context.fillStyle = palette.signal;
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
        : palette.signal
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
    context.strokeStyle = palette.signal;
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
    const color = bridge.open ? palette.signal : palette.gate;
    const length = Math.hypot(to.x - from.x, to.y - from.y) || 1;
    const sideX = (-(to.y - from.y) / length) * tile * 0.09 * scale;
    const sideY = ((to.x - from.x) / length) * tile * 0.09 * scale;

    context.save();
    context.strokeStyle = color;
    context.lineCap = "round";
    // A rope bridge: two rails, with planks once the bridge is open.
    context.lineWidth = Math.max(1.5, tile * 0.035 * scale);
    context.setLineDash(
      bridge.open ? [] : [tile * 0.16 * scale, tile * 0.13 * scale]
    );
    context.beginPath();
    for (const side of [-1, 1]) {
      context.moveTo(from.x + sideX * side, from.y + sideY * side);
      context.lineTo(to.x + sideX * side, to.y + sideY * side);
    }
    context.stroke();
    context.setLineDash([]);
    if (bridge.open) {
      const planks = Math.max(2, Math.round(length / (tile * 0.3)));
      context.lineWidth = Math.max(1.5, tile * 0.05 * scale);
      context.beginPath();
      for (let index = 1; index < planks; index += 1) {
        const px = from.x + ((to.x - from.x) * index) / planks;
        const py = from.y + ((to.y - from.y) * index) / planks;
        context.moveTo(px - sideX, py - sideY);
        context.lineTo(px + sideX, py + sideY);
      }
      context.stroke();
    }
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
    context.strokeStyle = door.open ? palette.signal : palette.gate;
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
    const color = bell.spent ? palette.gate : palette.signal;
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
    const top = y - tile * 0.02 * scale;
    const bottom = y + tile * 0.27 * scale;
    // A Warden is a rounded creature with a scalloped hem.
    context.beginPath();
    context.arc(x, top, radius, Math.PI, 0);
    context.lineTo(x + radius, bottom);
    const scallop = (radius * 2) / 3;
    for (let index = 0; index < 3; index += 1) {
      const right = x + radius - scallop * index;
      context.lineTo(right - scallop / 2, bottom - tile * 0.07 * scale);
      context.lineTo(right - scallop, bottom);
    }
    context.closePath();
    context.fillStyle = palette.warden;
    context.fill();
    context.strokeStyle = palette.night;
    context.lineWidth = Math.max(1, tile * 0.025 * scale);
    context.lineJoin = "round";
    context.stroke();

    // Each mode has its own face, so the mode never rests on hue alone.
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
  // Read from body so the Region tile hue on body reaches the canvas.
  const styles = getComputedStyle(document.body ?? document.documentElement);
  /** @param {string} name */
  const color = (name) => styles.getPropertyValue(name).trim();
  return {
    echo: color("--color-echo"),
    fontBody: color("--font-body"),
    fog: color("--color-fog"),
    fogGrid: color("--color-fog-grid"),
    gate: color("--color-gate"),
    grid: color("--color-grid"),
    ink: color("--color-ink"),
    markScale: Number.parseFloat(color("--maze-mark-scale")) || 1,
    night: color("--color-night-deep"),
    onFill: color("--color-on-fill"),
    overlay: color("--color-overlay"),
    passage: color("--color-passage"),
    pulse: color("--color-pulse"),
    signal: color("--color-explorer"),
    signalGlow: color("--color-explorer-glow"),
    transparent: "transparent",
    wall: color("--color-wall"),
    wallGrid: color("--color-wall-grid"),
    wallMark: color("--color-wall-mark"),
    warden: color("--color-warden")
  };
}
