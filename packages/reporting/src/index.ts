/**
 * @evalforge/reporting — turn a `RunSummary` into shareable artifacts.
 *
 * Formats: Markdown, HTML (print-ready → PDF), JSON (with a tidy flattened
 * metrics table), and CSV. Charts are self-contained inline SVG (radar + bars) —
 * no browser or chart library required. Reports always include overall/category
 * scores, per-benchmark breakdowns with confidence intervals, statistical
 * comparisons, strengths/weaknesses, and recommendations.
 */

export * from "./format.js";
export * from "./metric-labels.js";
export * from "./narrative.js";
export * from "./charts/svg.js";
export * from "./charts/radar.js";
export * from "./charts/bars.js";
export * from "./renderers/markdown.js";
export * from "./renderers/html.js";
export * from "./renderers/json.js";
export * from "./renderers/csv.js";
export * from "./render.js";
