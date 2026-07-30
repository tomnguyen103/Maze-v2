import { normalizeEchoLens } from "../questions/echo-lens.js";
import { describeEchoLensVisual } from "../questions/echo-lens-presentation.js";

/**
 * @param {keyof HTMLElementTagNameMap} tagName
 * @param {string} className
 * @param {string} [text]
 */
function element(tagName, className, text = "") {
  const node = document.createElement(tagName);
  node.className = className;
  node.textContent = text;
  return node;
}

/** @param {unknown} value */
function record(value) {
  return /** @type {Record<string, unknown>} */ (value);
}

/** @param {HTMLElement} visual @param {Record<string, unknown>} model */
function renderNumberLine(visual, model) {
  const track = element("div", "echo-lens__number-line");
  const markers = /** @type {{ value: number, label: string }[]} */ (
    model.markers
  );
  const start = Number(model.start);
  const span = Number(model.end) - start;
  for (const marker of markers) {
    const item = element("span", "echo-lens__number-marker");
    item.style.setProperty(
      "--lens-position",
      `${((marker.value - start) / span) * 100}%`
    );
    item.append(
      element("strong", "", String(marker.value)),
      element("small", "", marker.label)
    );
    track.append(item);
  }
  visual.append(track);
}

/** @param {HTMLElement} visual @param {Record<string, unknown>} model */
function renderArray(visual, model) {
  const grid = element("div", "echo-lens__array");
  const rows = Number(model.rows);
  const columns = Number(model.columns);
  const filled = Number(model.filled);
  grid.style.setProperty("--lens-columns", String(columns));
  for (let index = 0; index < rows * columns; index += 1) {
    grid.append(
      element(
        "span",
        `echo-lens__array-cell${index < filled ? " is-filled" : ""}`
      )
    );
  }
  visual.append(grid);
}

/** @param {HTMLElement} visual @param {Record<string, unknown>} model */
function renderFractionBar(visual, model) {
  const bar = element("div", "echo-lens__fraction");
  const numerator = Number(model.numerator);
  const denominator = Number(model.denominator);
  bar.style.setProperty("--lens-columns", String(denominator));
  for (let index = 0; index < denominator; index += 1) {
    bar.append(
      element(
        "span",
        `echo-lens__fraction-part${index < numerator ? " is-filled" : ""}`
      )
    );
  }
  visual.append(bar);
}

/** @param {HTMLElement} visual @param {Record<string, unknown>} model */
function renderWordHighlight(visual, model) {
  visual.append(
    element("blockquote", "echo-lens__quoted-text", String(model.text))
  );
  const list = element("ul", "echo-lens__highlight-list");
  const highlights =
    /** @type {{ text: string, label: string }[]} */ (model.highlights);
  for (const highlight of highlights) {
    const item = document.createElement("li");
    const mark = document.createElement("mark");
    mark.textContent = highlight.text;
    item.append(mark, document.createTextNode(` — ${highlight.label}`));
    list.append(item);
  }
  visual.append(list);
}

/** @param {HTMLElement} visual @param {Record<string, unknown>} model */
function renderPattern(visual, model) {
  const pattern = element("div", "echo-lens__pattern");
  for (const term of /** @type {string[]} */ (model.terms)) {
    pattern.append(element("span", "", term));
  }
  pattern.append(
    element("span", "echo-lens__pattern-arrow", "→"),
    element("strong", "", String(model.next))
  );
  visual.append(pattern);
}

/** @param {HTMLElement} visual @param {Record<string, unknown>} model */
function renderDiagram(visual, model) {
  const nodes = /** @type {{ id: string, label: string }[]} */ (model.nodes);
  const edges =
    /** @type {{ from: string, to: string, label: string }[]} */ (model.edges);
  const labels = new Map(nodes.map((node) => [node.id, node.label]));
  const diagram = element("div", "echo-lens__diagram");
  for (const edge of edges) {
    diagram.append(
      element("span", "echo-lens__diagram-node", labels.get(edge.from)),
      element("span", "echo-lens__diagram-edge", edge.label),
      element("span", "echo-lens__diagram-node", labels.get(edge.to))
    );
  }
  visual.append(diagram);
}

/** @type {Record<string, (visual: HTMLElement, model: Record<string, unknown>) => void>} */
const RENDERERS = {
  "number-line": renderNumberLine,
  array: renderArray,
  "fraction-bar": renderFractionBar,
  "word-highlight": renderWordHighlight,
  pattern: renderPattern,
  diagram: renderDiagram
};

/** @param {HTMLElement} content @param {unknown} value */
export function renderEchoLensContent(content, value) {
  const lens = normalizeEchoLens(value);
  const kicker = element("span", "section-label", "Reviewed explanation");
  const title = element("h3", "echo-lens__title", lens.title);
  const reasoning = element("p", "echo-lens__reasoning", lens.reasoning);
  const steps = element("ol", "echo-lens__steps");
  for (const step of lens.steps) {
    steps.append(element("li", "", step));
  }
  const visual = element("figure", "echo-lens__visual");
  visual.dataset.lensKind = lens.kind;
  visual.setAttribute("role", "img");
  visual.setAttribute("aria-label", describeEchoLensVisual(lens));
  const visualBody = element("div", "echo-lens__visual-body");
  visualBody.setAttribute("aria-hidden", "true");
  RENDERERS[lens.kind](visualBody, record(lens.visual));
  visual.append(visualBody);
  content.replaceChildren(kicker, title, reasoning, steps, visual);
}
