/** Metric identifiers understood across the platform. */
export type MetricName =
  | "accuracy"
  | "exactMatch"
  | "f1"
  | "pass@1"
  | "pass@k"
  | "passRate"
  | "compilationSuccess"
  | "semanticSimilarity"
  | "hallucinationRate"
  | "confidence"
  | "toolCallAccuracy"
  | "jsonValidity"
  | "retrievalAccuracy"
  | "reasoningQuality"
  | "tokenEfficiency"
  | "meanLatencyMs"
  | "p95LatencyMs"
  | "totalCostUsd"
  | "costPerCorrect"
  // eslint-disable-next-line @typescript-eslint/ban-types
  | (string & {});

/** A confidence interval around a point estimate. */
export interface Interval {
  low: number;
  high: number;
  /** Confidence level, e.g. 0.95. */
  level: number;
  method?: "bootstrap" | "wilson" | "normal" | "t";
}

/** A metric value with sample size and optional uncertainty. */
export interface MetricValue {
  value: number;
  /** Number of observations behind this value. */
  n: number;
  interval?: Interval;
  /** Standard error, when computed. */
  stderr?: number;
}

/** Summary statistics over a numeric sample. */
export interface DistributionSummary {
  n: number;
  mean: number;
  std: number;
  min: number;
  max: number;
  median: number;
  p25: number;
  p75: number;
  p95: number;
}

/** The outcome of comparing two models on one metric. */
export interface SignificanceTest {
  /** Difference (a − b) in the metric. */
  delta: number;
  pValue: number;
  /** Standardized effect size (Cohen's d for means, Cohen's h for proportions). */
  effectSize: number;
  significant: boolean;
  /** CI around the delta. */
  interval?: Interval;
  method: "paired-bootstrap" | "permutation" | "mcnemar" | "welch-t";
}
