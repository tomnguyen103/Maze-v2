/** Popup motions: paper decorations over the board. Each element removes itself when its animation ends. */

const EASING = "ease-out";

/** @param {HTMLElement} frame */
function layerOf(frame) {
  if (typeof Element.prototype.animate !== "function") {
    return frame;
  }
  let layer = frame.querySelector(":scope > .motion-layer");
  if (!layer) {
    layer = document.createElement("div");
    layer.className = "motion-layer";
    layer.setAttribute("aria-hidden", "true");
    frame.append(layer);
  }
  return layer;
}

/**
 * Makes one element, animates it, and removes it on finish or cancel.
 * @param {Element} parent
 * @param {string} className
 * @param {Keyframe[]} keyframes
 * @param {number} duration
 * @param {(element: HTMLElement) => void} [place]
 */
function play(parent, className, keyframes, duration, place) {
  if (typeof Element.prototype.animate !== "function") {
    return;
  }
  const element = document.createElement("div");
  element.className = className;
  element.setAttribute("aria-hidden", "true");
  place?.(element);
  parent.append(element);
  const remove = () => element.remove();
  element
    .animate(keyframes, { duration, easing: EASING, iterations: 1 })
    .finished.then(remove, remove);
}

/**
 * Places an element on the tile.
 * @param {{ row: number, col: number }} tile
 * @param {{ labyrinth: unknown[] }} run
 * @returns {(element: HTMLElement) => void}
 */
function atTile(tile, run) {
  const size = run.labyrinth.length;
  return (element) => {
    element.style.left = `${((tile.col + 0.5) / size) * 100}%`;
    element.style.top = `${((tile.row + 0.5) / size) * 100}%`;
  };
}

export default {
  /** One ring at the Explorer tile grows to the Pulse range (4 tiles) and fades. */
  flapRipple(/** @type {HTMLElement} */ frame, /** @type {any} */ run) {
    const scale = (4 * 2 + 1) / 2;
    play(
      layerOf(frame),
      "motion-ripple",
      [
        { transform: "translate(-50%, -50%) scale(0.2)", opacity: 0.8 },
        { transform: `translate(-50%, -50%) scale(${scale})`, opacity: 0 }
      ],
      300,
      (element) => {
        atTile(run.explorer, run)(element);
        element.style.width = element.style.height = `${(100 / run.labyrinth.length) * 2}%`;
      }
    );
  },

  /** A paper tab rises from the bottom edge of the Gate tile and fades. */
  gatePopUp(/** @type {HTMLElement} */ frame, /** @type {any} */ run) {
    play(
      layerOf(frame),
      "motion-gate-tab",
      [
        { transform: "translate(-50%, -100%) scaleY(0)", opacity: 1 },
        { transform: "translate(-50%, -100%) scaleY(1)", opacity: 1, offset: 0.7 },
        { transform: "translate(-50%, -100%) scaleY(1)", opacity: 0 }
      ],
      240,
      // The tab stands on the bottom edge of the Gate tile.
      atTile({ row: run.gate.row + 0.5, col: run.gate.col }, run)
    );
  },

  /** Twelve paper pieces leave the Gate tile on their own angles, turn, and fade. */
  paperConfetti(/** @type {HTMLElement} */ frame, /** @type {any} */ run) {
    const layer = layerOf(frame);
    for (let index = 0; index < 12; index += 1) {
      const angle = (index / 12) * Math.PI * 2;
      const dx = Math.cos(angle) * 60;
      const dy = Math.sin(angle) * 60;
      play(
        layer,
        `motion-confetti motion-confetti-${index % 3}`,
        [
          { transform: "translate(-50%, -50%) rotate(0deg)", opacity: 1 },
          // The pieces stay solid for most of the flight, then fade.
          { opacity: 1, offset: 0.6 },
          {
            transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) rotate(${index % 2 ? 270 : -270}deg)`,
            opacity: 0
          }
        ],
        300,
        atTile(run.gate, run)
      );
    }
  },

  /** The Sigil Ceremony panel lies back and folds up from its bottom edge. The top tips away, so a full-height sheet never grows past the viewport. */
  ceremonyPopUp(/** @type {HTMLElement} */ panel) {
    if (typeof panel.animate !== "function") {
      return;
    }
    panel.style.transformOrigin = "bottom";
    const reset = () => panel.style.removeProperty("transform-origin");
    panel
      .animate(
        [{ transform: "perspective(600px) rotateX(60deg)" }, { transform: "none" }],
        { duration: 300, easing: EASING, iterations: 1 }
      )
      .finished.then(reset, reset);
  }
};
