const LENS_KINDS = new Set([
  "number-line",
  "array",
  "fraction-bar",
  "word-highlight",
  "pattern",
  "diagram"
]);
const UNSAFE_CHILD_CONTENT =
  /\b(?:alcohol|blood|drug|gun|hate|kill|murder|nude|racist|sex|suicide|weapon)\b/iu;
const PERSONAL_INFORMATION_PROMPTS =
  /\b(?:your address|your name|your password|your phone|where do you live)\b/iu;
const URL_CONTENT =
  /(?:^|[^\p{L}\p{N}])(?:[a-z][a-z0-9+.-]{1,31}:[^\s]|\/\/[a-z0-9]|(?:www\.)?[a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,63}(?:[/?#][^\s]*)?|(?:\d{1,3}\.){3}\d{1,3}(?::\d+)?(?:[/?#][^\s]*)?|\[[0-9a-f:]+\](?::\d+)?(?:[/?#][^\s]*)?)/iu;

/** @param {unknown} value @param {string} name @param {number} maxLength */
function requiredText(value, name, maxLength) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`Echo Lens ${name} must be text.`);
  }
  const text = value.trim();
  if (text.length > maxLength) {
    throw new Error(`Echo Lens ${name} is too long.`);
  }
  if (/<\/?[a-z]/iu.test(text) || URL_CONTENT.test(text)) {
    throw new Error(`Echo Lens ${name} contains unsupported content.`);
  }
  if (
    UNSAFE_CHILD_CONTENT.test(text) ||
    PERSONAL_INFORMATION_PROMPTS.test(text)
  ) {
    throw new Error(`Echo Lens ${name} did not pass kid-safe content checks.`);
  }
  return text;
}

/** @param {unknown} value @param {string[]} keys */
function hasOnlyKeys(value, keys) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const allowed = new Set(keys);
  return Object.keys(value).every((key) => allowed.has(key));
}

/** @param {unknown} value @param {string} name */
function boundedNumber(value, name) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < -10_000 || number > 10_000) {
    throw new Error(`Echo Lens ${name} is not valid.`);
  }
  return number;
}

/**
 * @param {unknown} value
 * @param {string} name
 * @param {number} minimum
 * @param {number} maximum
 */
function boundedInteger(value, name, minimum, maximum) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < minimum || number > maximum) {
    throw new Error(`Echo Lens ${name} is not valid.`);
  }
  return number;
}

/** @param {unknown} value */
function normalizeNumberLine(value) {
  if (!hasOnlyKeys(value, ["start", "end", "markers"])) {
    throw new Error("Echo Lens number line has unsupported fields.");
  }
  const visual = /** @type {Record<string, unknown>} */ (value);
  const start = boundedNumber(visual.start, "number line start");
  const end = boundedNumber(visual.end, "number line end");
  if (start >= end || !Array.isArray(visual.markers)) {
    throw new Error("Echo Lens number line range is not valid.");
  }
  if (visual.markers.length < 2 || visual.markers.length > 12) {
    throw new Error("Echo Lens number line markers are not valid.");
  }
  const markers = visual.markers.map((marker) => {
    if (!hasOnlyKeys(marker, ["value", "label"])) {
      throw new Error("Echo Lens number line marker is not valid.");
    }
    const record = /** @type {Record<string, unknown>} */ (marker);
    const markerValue = boundedNumber(record.value, "marker value");
    if (markerValue < start || markerValue > end) {
      throw new Error("Echo Lens marker must stay inside the number line.");
    }
    return {
      value: markerValue,
      label: requiredText(record.label, "marker label", 40)
    };
  });
  return { start, end, markers };
}

/** @param {unknown} value */
function normalizeArray(value) {
  if (!hasOnlyKeys(value, ["rows", "columns", "filled"])) {
    throw new Error("Echo Lens array has unsupported fields.");
  }
  const visual = /** @type {Record<string, unknown>} */ (value);
  const rows = boundedInteger(visual.rows, "array rows", 1, 12);
  const columns = boundedInteger(visual.columns, "array columns", 1, 12);
  const filled = boundedInteger(
    visual.filled,
    "array filled count",
    0,
    rows * columns
  );
  return { rows, columns, filled };
}

/** @param {unknown} value */
function normalizeFractionBar(value) {
  if (!hasOnlyKeys(value, ["numerator", "denominator"])) {
    throw new Error("Echo Lens fraction bar has unsupported fields.");
  }
  const visual = /** @type {Record<string, unknown>} */ (value);
  const denominator = boundedInteger(
    visual.denominator,
    "fraction denominator",
    2,
    12
  );
  const numerator = boundedInteger(
    visual.numerator,
    "fraction numerator",
    0,
    denominator
  );
  return { numerator, denominator };
}

/** @param {unknown} value */
function normalizeWordHighlight(value) {
  if (!hasOnlyKeys(value, ["text", "highlights"])) {
    throw new Error("Echo Lens word highlight has unsupported fields.");
  }
  const visual = /** @type {Record<string, unknown>} */ (value);
  const text = requiredText(visual.text, "highlight text", 240);
  if (
    !Array.isArray(visual.highlights) ||
    visual.highlights.length < 1 ||
    visual.highlights.length > 6
  ) {
    throw new Error("Echo Lens word highlights are not valid.");
  }
  const highlights = visual.highlights.map((highlight) => {
    if (!hasOnlyKeys(highlight, ["text", "label"])) {
      throw new Error("Echo Lens word highlight is not valid.");
    }
    const record = /** @type {Record<string, unknown>} */ (highlight);
    const highlightedText = requiredText(
      record.text,
      "highlighted text",
      80
    );
    if (!text.toLocaleLowerCase().includes(highlightedText.toLocaleLowerCase())) {
      throw new Error("Echo Lens highlighted text must appear in its model.");
    }
    return {
      text: highlightedText,
      label: requiredText(record.label, "highlight label", 120)
    };
  });
  return { text, highlights };
}

/** @param {unknown} value */
function normalizePattern(value) {
  if (!hasOnlyKeys(value, ["terms", "next"])) {
    throw new Error("Echo Lens pattern has unsupported fields.");
  }
  const visual = /** @type {Record<string, unknown>} */ (value);
  if (
    !Array.isArray(visual.terms) ||
    visual.terms.length < 2 ||
    visual.terms.length > 8
  ) {
    throw new Error("Echo Lens pattern terms are not valid.");
  }
  return {
    terms: visual.terms.map((term) =>
      requiredText(term, "pattern term", 40)
    ),
    next: requiredText(visual.next, "pattern answer", 40)
  };
}

/** @param {unknown} value */
function normalizeDiagram(value) {
  if (!hasOnlyKeys(value, ["nodes", "edges"])) {
    throw new Error("Echo Lens diagram has unsupported fields.");
  }
  const visual = /** @type {Record<string, unknown>} */ (value);
  if (
    !Array.isArray(visual.nodes) ||
    visual.nodes.length < 2 ||
    visual.nodes.length > 8 ||
    !Array.isArray(visual.edges) ||
    visual.edges.length < 1 ||
    visual.edges.length > 12
  ) {
    throw new Error("Echo Lens diagram is not valid.");
  }
  const nodes = visual.nodes.map((node) => {
    if (!hasOnlyKeys(node, ["id", "label"])) {
      throw new Error("Echo Lens diagram node is not valid.");
    }
    const record = /** @type {Record<string, unknown>} */ (node);
    const id = requiredText(record.id, "diagram node id", 24);
    if (!/^[a-z0-9][a-z0-9-]*$/iu.test(id)) {
      throw new Error("Echo Lens diagram node id is not valid.");
    }
    return {
      id,
      label: requiredText(record.label, "diagram node label", 80)
    };
  });
  const nodeIds = new Set(nodes.map((node) => node.id));
  if (nodeIds.size !== nodes.length) {
    throw new Error("Echo Lens diagram node ids must be unique.");
  }
  const edges = visual.edges.map((edge) => {
    if (!hasOnlyKeys(edge, ["from", "to", "label"])) {
      throw new Error("Echo Lens diagram edge is not valid.");
    }
    const record = /** @type {Record<string, unknown>} */ (edge);
    const from = requiredText(record.from, "diagram edge start", 24);
    const to = requiredText(record.to, "diagram edge end", 24);
    if (!nodeIds.has(from) || !nodeIds.has(to)) {
      throw new Error("Echo Lens diagram edge must join reviewed nodes.");
    }
    return {
      from,
      to,
      label: requiredText(record.label, "diagram edge label", 80)
    };
  });
  return { nodes, edges };
}

/**
 * @param {unknown} value
 * @returns {{
 *   version: 1,
 *   kind: string,
 *   title: string,
 *   reasoning: string,
 *   steps: string[],
 *   visual: Record<string, unknown>
 * }}
 */
export function normalizeEchoLens(value) {
  if (
    !hasOnlyKeys(value, [
      "version",
      "kind",
      "title",
      "reasoning",
      "steps",
      "visual"
    ])
  ) {
    throw new Error("Echo Lens has unsupported fields.");
  }
  const lens = /** @type {Record<string, unknown>} */ (value);
  if (
    lens.version !== 1 ||
    typeof lens.kind !== "string" ||
    !LENS_KINDS.has(lens.kind) ||
    !Array.isArray(lens.steps) ||
    lens.steps.length < 1 ||
    lens.steps.length > 6
  ) {
    throw new Error("Echo Lens contract is not valid.");
  }
  const steps = lens.steps.map((step) =>
    requiredText(step, "reasoning step", 160)
  );
  const visualNormalizers =
    /** @type {Record<string, (value: unknown) => Record<string, unknown>>} */ ({
      "number-line": normalizeNumberLine,
      array: normalizeArray,
      "fraction-bar": normalizeFractionBar,
      "word-highlight": normalizeWordHighlight,
      pattern: normalizePattern,
      diagram: normalizeDiagram
    });
  const visual = visualNormalizers[lens.kind](lens.visual);
  return {
    version: 1,
    kind: lens.kind,
    title: requiredText(lens.title, "title", 80),
    reasoning: requiredText(lens.reasoning, "reasoning", 400),
    steps,
    visual
  };
}
