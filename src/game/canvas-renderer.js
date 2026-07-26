/**
 * @typedef {ReturnType<typeof import("./game-session.js").createRun>} GameRun
 * @typedef {{ row: number, col: number }} Position
 * @typedef {Position & { vitality: number, maxVitality: number }} Explorer
 * @typedef {Position & { collected: boolean }} Echo
 * @typedef {Position & { open: boolean, sealed?: boolean }} Gate
 * @typedef {Position & { id: number, mode: "patrol" | "hunt" | "intercept" }} Warden
 */

/**
 * @param {HTMLCanvasElement} canvas
 */
export function createCanvasRenderer(canvas) {
  const context = getCanvasContext(canvas);

  let palette = readPalette();

  function resize() {
    const bounds = canvas.getBoundingClientRect();
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
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

    context.clearRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = palette.fog;
    context.fillRect(0, 0, canvas.width, canvas.height);

    for (let row = 0; row < size; row += 1) {
      for (let col = 0; col < size; col += 1) {
        const key = `${row},${col}`;
        if (!revealed.has(key)) {
          drawFogTile(row, col, tile);
          continue;
        }
        drawKnownTile(run.labyrinth[row][col] === 1, row, col, tile);
        if (run.pulseVisible.includes(key) && !run.revealed.includes(key)) {
          context.fillStyle = palette.pulse;
          context.fillRect(col * tile, row * tile, tile, tile);
        }
      }
    }

    if (revealed.has(`${run.gate.row},${run.gate.col}`)) {
      drawGate(run.gate, tile);
    }
    for (const echo of run.echoes) {
      if (!echo.collected && revealed.has(`${echo.row},${echo.col}`)) {
        drawEcho(echo, tile);
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
      context.fillStyle = palette.paper;
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
      context.fillStyle = palette.paper;
      context.font = `500 ${Math.max(14, canvas.width * 0.022)}px ${palette.fontBody}`;
      context.fillText(
        run.challenge?.kind === "gate-warden"
          ? "Break the seal with your answer."
          : "Your knowledge clears the path.",
        canvas.width / 2,
        canvas.height / 2 + Math.max(28, canvas.width * 0.055)
      );
    }
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
    context.fillStyle = isPassage ? palette.passage : palette.wall;
    context.fillRect(x, y, tile + 0.5, tile + 0.5);
    context.strokeStyle = isPassage ? palette.grid : palette.wallGrid;
    context.lineWidth = Math.max(0.75, tile * 0.022);
    context.strokeRect(x, y, tile, tile);
    if (!isPassage) {
      context.strokeStyle = palette.wallMark;
      context.lineWidth = Math.max(1, tile * 0.035);
      context.beginPath();
      context.moveTo(x + tile * 0.18, y + tile * 0.72);
      context.lineTo(x + tile * 0.72, y + tile * 0.18);
      context.moveTo(x + tile * 0.28, y + tile * 0.82);
      context.lineTo(x + tile * 0.82, y + tile * 0.28);
      context.stroke();
    }
  }

  /** @param {number} row @param {number} col @param {number} tile */
  function drawFogTile(row, col, tile) {
    const x = col * tile;
    const y = row * tile;
    context.fillStyle = (row + col) % 3 === 0 ? palette.fogSoft : palette.fog;
    context.fillRect(x, y, tile + 0.5, tile + 0.5);
    context.strokeStyle = palette.fogGrid;
    context.lineWidth = Math.max(0.75, tile * 0.018);
    context.strokeRect(x, y, tile, tile);
    if ((row * 17 + col * 11) % 7 === 0) {
      context.fillStyle = palette.fogGrid;
      context.fillRect(x + tile * 0.48, y + tile * 0.48, Math.max(1, tile * 0.04), Math.max(1, tile * 0.04));
    }
  }

  /** @param {Explorer} explorer @param {number} tile */
  function drawExplorer(explorer, tile) {
    const { x, y } = centerOf(explorer, tile);
    const radius = tile * 0.28;
    const glow = context.createRadialGradient(x, y, 0, x, y, tile * 0.72);
    glow.addColorStop(0, palette.signalGlow);
    glow.addColorStop(1, palette.transparent);
    context.fillStyle = glow;
    context.fillRect(x - tile, y - tile, tile * 2, tile * 2);
    context.beginPath();
    context.arc(x, y, radius, 0, Math.PI * 2);
    context.fillStyle = palette.night;
    context.fill();
    context.lineWidth = Math.max(2, tile * 0.11);
    context.strokeStyle = palette.signal;
    context.stroke();
    context.beginPath();
    context.arc(x, y, tile * 0.07, 0, Math.PI * 2);
    context.fillStyle = palette.signalBright;
    context.fill();
  }

  /** @param {Echo} echo @param {number} tile */
  function drawEcho(echo, tile) {
    const { x, y } = centerOf(echo, tile);
    context.save();
    context.translate(x, y);
    context.rotate(Math.PI / 4);
    context.strokeStyle = palette.echo;
    context.lineWidth = Math.max(1.5, tile * 0.07);
    context.strokeRect(-tile * 0.19, -tile * 0.19, tile * 0.38, tile * 0.38);
    context.strokeRect(-tile * 0.1, -tile * 0.1, tile * 0.2, tile * 0.2);
    context.restore();
  }

  /** @param {Gate} gate @param {number} tile */
  function drawGate(gate, tile) {
    const { x, y } = centerOf(gate, tile);
    context.strokeStyle = gate.open
      ? gate.sealed
        ? palette.warden
        : palette.signal
      : palette.gate;
    context.lineWidth = Math.max(1.5, tile * 0.07);
    context.beginPath();
    context.arc(x, y, tile * 0.27, Math.PI, 0);
    context.lineTo(x + tile * 0.27, y + tile * 0.27);
    context.moveTo(x - tile * 0.27, y);
    context.lineTo(x - tile * 0.27, y + tile * 0.27);
    for (const offset of [-0.13, 0, 0.13]) {
      context.moveTo(x + tile * offset, y - tile * 0.23);
      context.lineTo(x + tile * offset, y + tile * 0.25);
    }
    context.stroke();
    if (gate.open && gate.sealed) {
      context.beginPath();
      context.moveTo(x - tile * 0.22, y - tile * 0.2);
      context.lineTo(x + tile * 0.22, y + tile * 0.22);
      context.moveTo(x + tile * 0.22, y - tile * 0.2);
      context.lineTo(x - tile * 0.22, y + tile * 0.22);
      context.stroke();
    } else if (gate.open) {
      context.beginPath();
      context.moveTo(x, y + tile * 0.2);
      context.lineTo(x, y - tile * 0.12);
      context.moveTo(x - tile * 0.12, y);
      context.lineTo(x, y - tile * 0.14);
      context.lineTo(x + tile * 0.12, y);
      context.stroke();
    } else {
      context.fillStyle = palette.gate;
      context.fillRect(
        x - tile * 0.08,
        y + tile * 0.02,
        tile * 0.16,
        tile * 0.16
      );
    }
  }

  /** @param {Warden} warden @param {number} tile */
  function drawWarden(warden, tile) {
    const { x, y } = centerOf(warden, tile);
    context.beginPath();
    context.moveTo(x, y - tile * 0.3);
    context.lineTo(x + tile * 0.29, y + tile * 0.26);
    context.lineTo(x - tile * 0.29, y + tile * 0.26);
    context.closePath();
    context.fillStyle = palette.warden;
    context.fill();
    context.fillStyle = palette.night;

    if (warden.mode === "hunt") {
      for (const offset of [-0.09, 0.09]) {
        context.beginPath();
        context.arc(
          x + tile * offset,
          y + tile * 0.04,
          tile * 0.045,
          0,
          Math.PI * 2
        );
        context.fill();
      }
      return;
    }

    if (warden.mode === "intercept") {
      context.fillRect(
        x - tile * 0.14,
        y - tile * 0.01,
        tile * 0.28,
        Math.max(2, tile * 0.07)
      );
      context.fillRect(
        x - tile * 0.06,
        y - tile * 0.11,
        Math.max(2, tile * 0.07),
        tile * 0.27
      );
      return;
    }

    context.beginPath();
    context.arc(x, y + tile * 0.03, tile * 0.055, 0, Math.PI * 2);
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
  const styles = getComputedStyle(document.documentElement);
  /** @param {string} name */
  const color = (name) => styles.getPropertyValue(name).trim();
  return {
    echo: color("--color-echo"),
    fontBody: color("--font-body"),
    fog: color("--color-fog"),
    fogGrid: color("--color-fog-grid"),
    fogSoft: color("--color-fog-soft"),
    gate: color("--color-gate"),
    grid: color("--color-grid"),
    ink: color("--color-ink"),
    night: color("--color-night-deep"),
    overlay: color("--color-overlay"),
    paper: color("--color-paper"),
    passage: color("--color-passage"),
    pulse: color("--color-pulse"),
    signal: color("--color-explorer"),
    signalBright: color("--color-explorer-bright"),
    signalGlow: color("--color-explorer-glow"),
    transparent: "transparent",
    wall: color("--color-wall"),
    wallGrid: color("--color-wall-grid"),
    wallMark: color("--color-wall-mark"),
    warden: color("--color-warden")
  };
}
