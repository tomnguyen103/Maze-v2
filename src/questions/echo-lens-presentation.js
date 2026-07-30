import { normalizeEchoLens } from "./echo-lens.js";

/** @param {unknown} value */
function record(value) {
  return value && typeof value === "object"
    ? /** @type {Record<string, unknown>} */ (value)
    : {};
}

/** @param {unknown} value */
export function describeEchoLensVisual(value) {
  const lens = normalizeEchoLens(value);
  const visual = record(lens.visual);

  if (lens.kind === "number-line") {
    const markers = /** @type {{ value: number, label: string }[]} */ (
      visual.markers
    );
    return `Number line from ${visual.start} to ${visual.end}. ${markers
      .map((marker) => `${marker.value}: ${marker.label}`)
      .join("; ")}.`;
  }
  if (lens.kind === "array") {
    return `${visual.rows} rows by ${visual.columns} columns; ${visual.filled} filled.`;
  }
  if (lens.kind === "fraction-bar") {
    return `${visual.numerator} of ${visual.denominator} equal parts are filled.`;
  }
  if (lens.kind === "word-highlight") {
    const highlights =
      /** @type {{ text: string, label: string }[]} */ (visual.highlights);
    return `${visual.text} ${highlights
      .map((highlight) => `${highlight.text}: ${highlight.label}`)
      .join("; ")}.`;
  }
  if (lens.kind === "pattern") {
    const terms = /** @type {string[]} */ (visual.terms);
    return `Pattern: ${terms.join(", ")}. Next: ${visual.next}.`;
  }
  const nodes =
    /** @type {{ id: string, label: string }[]} */ (visual.nodes);
  const edges =
    /** @type {{ from: string, to: string, label: string }[]} */ (
      visual.edges
    );
  const labels = new Map(nodes.map((node) => [node.id, node.label]));
  return edges
    .map(
      (edge) =>
        `${labels.get(edge.from) ?? edge.from} ${edge.label} ${labels.get(edge.to) ?? edge.to}.`
    )
    .join(" ");
}
