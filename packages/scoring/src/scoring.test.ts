import { describe, expect, it } from "vitest";
import { createRng } from "@evalforge/shared";
import { mean, median, quantile, std, summarize } from "./descriptive.js";
import { accuracy, exactMatchRate, f1FromText, passRate, tokenEfficiency } from "./metrics.js";
import { passAtK, passAtKCorpus, tally } from "./passk.js";
import { bootstrapCi, pairedBootstrapDeltaCi } from "./bootstrap.js";
import { cohenH, normalQuantile, wilsonInterval } from "./proportions.js";
import { cohenD, pairedCohenD } from "./effect.js";
import { compareScores, mcnemarTest, pairedPermutationTest, welchT } from "./significance.js";
import { bradleyTerry, computeElo, expectedScore } from "./elo.js";

describe("descriptive", () => {
  it("computes mean / median / std against known values", () => {
    expect(mean([1, 2, 3, 4])).toBe(2.5);
    expect(median([1, 2, 3, 4])).toBe(2.5);
    expect(median([1, 2, 3])).toBe(2);
    // Sample std of [2,4,4,4,5,5,7,9] is 2.138...
    expect(std([2, 4, 4, 4, 5, 5, 7, 9])).toBeCloseTo(2.13809, 4);
  });

  it("interpolates quantiles (R-7)", () => {
    expect(quantile([1, 2, 3, 4], 0.5)).toBe(2.5);
    expect(quantile([1, 2, 3, 4, 5], 0.25)).toBe(2);
  });

  it("summarizes without mutating input", () => {
    const xs = [5, 1, 3, 2, 4];
    const s = summarize(xs);
    expect(s.min).toBe(1);
    expect(s.max).toBe(5);
    expect(s.median).toBe(3);
    expect(xs[0]).toBe(5); // unchanged
  });
});

describe("point metrics", () => {
  it("accuracy and passRate", () => {
    expect(accuracy([1, 0, 1, 1])).toBe(0.75);
    expect(passRate([true, false, true, true])).toBe(0.75);
    expect(accuracy([])).toBe(0);
  });

  it("exact match with trimming", () => {
    expect(exactMatchRate([" a ", "b"], ["a", "c"])).toBe(0.5);
  });

  it("token F1 (SQuAD convention)", () => {
    // pred "the cat sat" vs gold "the cat" → P=2/3, R=2/2=1, F1=0.8
    const r = f1FromText("the cat sat", "the cat");
    expect(r.precision).toBeCloseTo(2 / 3, 6);
    expect(r.recall).toBe(1);
    expect(r.f1).toBeCloseTo(0.8, 6);
  });

  it("token efficiency", () => {
    expect(tokenEfficiency(true, 10)).toBe(0.1);
    expect(tokenEfficiency(false, 10)).toBe(0);
    expect(tokenEfficiency(true, 0)).toBe(0);
  });
});

describe("pass@k", () => {
  it("is 1 when it cannot fail", () => {
    expect(passAtK(5, 5, 1)).toBe(1);
    expect(passAtK(5, 4, 2)).toBe(1); // only 1 failure, any 2-subset hits a pass
  });

  it("matches the closed form", () => {
    // n=5, c=1, k=1 → pass@1 = 1/5
    expect(passAtK(5, 1, 1)).toBeCloseTo(0.2, 10);
    // n=4, c=2, k=2 → 1 − C(2,2)/C(4,2) = 1 − 1/6
    expect(passAtK(4, 2, 2)).toBeCloseTo(1 - 1 / 6, 10);
  });

  it("aggregates a corpus and skips tasks with n<k", () => {
    const tallies = [tally([true, false]), tally([false, false]), tally([true])];
    // k=2: last task (n=1) is skipped. pass@2 of task1 = 1, task2 = 0 → mean 0.5
    expect(passAtKCorpus(tallies, 2)).toBeCloseTo(0.5, 10);
  });
});

describe("bootstrap", () => {
  it("brackets the sample mean and is reproducible with a seed", () => {
    const xs = Array.from({ length: 200 }, (_, i) => (i % 2 === 0 ? 1 : 0));
    const ci1 = bootstrapCi(xs, { rng: createRng(42), iterations: 1000 });
    const ci2 = bootstrapCi(xs, { rng: createRng(42), iterations: 1000 });
    expect(ci1.low).toBe(ci2.low);
    expect(ci1.high).toBe(ci2.high);
    expect(ci1.low).toBeLessThan(0.5);
    expect(ci1.high).toBeGreaterThan(0.5);
  });

  it("paired delta CI is centered near the true difference", () => {
    const a = Array.from({ length: 100 }, () => 1);
    const b = Array.from({ length: 100 }, (_, i) => (i < 20 ? 0 : 1)); // b is 0.8
    const ci = pairedBootstrapDeltaCi(a, b, { rng: createRng(1), iterations: 1000 });
    expect(ci.low).toBeGreaterThan(0);
    expect(ci.high).toBeGreaterThanOrEqual(0.2);
  });
});

describe("proportions", () => {
  it("Wilson interval stays in [0,1] at the extremes", () => {
    const ci = wilsonInterval(10, 10, 0.95);
    expect(ci.low).toBeGreaterThan(0);
    expect(ci.high).toBeLessThanOrEqual(1);
    const zero = wilsonInterval(0, 10, 0.95);
    expect(zero.low).toBe(0);
    expect(zero.high).toBeGreaterThan(0);
  });

  it("Wilson matches a textbook value", () => {
    // 50/100 at 95% → roughly [0.404, 0.596]
    const ci = wilsonInterval(50, 100, 0.95);
    expect(ci.low).toBeCloseTo(0.4038, 3);
    expect(ci.high).toBeCloseTo(0.5962, 3);
  });

  it("normalQuantile inverts the standard normal", () => {
    expect(normalQuantile(0.975)).toBeCloseTo(1.959964, 4);
    expect(normalQuantile(0.5)).toBeCloseTo(0, 6);
  });

  it("Cohen's h is zero for equal proportions", () => {
    expect(cohenH(0.5, 0.5)).toBeCloseTo(0, 10);
    expect(cohenH(0.75, 0.5)).toBeGreaterThan(0);
  });
});

describe("effect sizes", () => {
  it("Cohen's d is positive for a shifted-up sample", () => {
    const a = [1, 2, 3, 4, 5];
    const b = a.map((x) => x - 1);
    // same variance, means differ by 1, pooled sd ≈ 1.58 → d ≈ 0.63
    expect(cohenD(a, b)).toBeCloseTo(1 / Math.sqrt(2.5), 6);
  });

  it("paired Cohen's d is 0 when differences are constant (no spread)", () => {
    const a = [1, 2, 3, 4, 5];
    const b = a.map((x) => x - 1); // every difference is exactly 1
    expect(pairedCohenD(a, b)).toBe(0);
  });
});

describe("significance", () => {
  it("paired permutation: identical scores ⇒ p=1", () => {
    const a = [1, 0, 1, 0, 1];
    const { pValue, delta } = pairedPermutationTest(a, a);
    expect(delta).toBe(0);
    expect(pValue).toBe(1);
  });

  it("paired permutation: a strictly dominates ⇒ small p", () => {
    const a = Array.from({ length: 15 }, () => 1);
    const b = Array.from({ length: 15 }, () => 0);
    const { pValue } = pairedPermutationTest(a, b);
    expect(pValue).toBeLessThan(0.001);
  });

  it("McNemar uses only discordant pairs", () => {
    // 8 pairs where a right/b wrong, 0 the other way → strongly significant
    const a = [1, 1, 1, 1, 1, 1, 1, 1, 1, 1];
    const b = [0, 0, 0, 0, 0, 0, 0, 0, 1, 1];
    const { pValue } = mcnemarTest(a, b);
    expect(pValue).toBeLessThan(0.05);
  });

  it("Welch t-test detects a mean shift", () => {
    const a = [10, 11, 9, 10, 12, 8, 10];
    const b = [20, 21, 19, 20, 22, 18, 20];
    const { pValue } = welchT(a, b);
    expect(pValue).toBeLessThan(0.001);
  });

  it("compareScores returns a full significance record", () => {
    const a = Array.from({ length: 30 }, (_, i) => (i < 24 ? 1 : 0)); // 0.8
    const b = Array.from({ length: 30 }, (_, i) => (i < 18 ? 1 : 0)); // 0.6
    const res = compareScores(a, b, { method: "paired-bootstrap", rng: createRng(7) });
    expect(res.delta).toBeCloseTo(0.2, 6);
    expect(res.interval).toBeDefined();
    expect(res.effectSize).toBeGreaterThan(0); // Cohen's h for proportions
    expect(res.method).toBe("paired-bootstrap");
  });
});

describe("elo / bradley-terry", () => {
  it("expected score is 0.5 for equal ratings", () => {
    expect(expectedScore(1000, 1000)).toBe(0.5);
    expect(expectedScore(1400, 1000)).toBeCloseTo(10 / 11, 6);
  });

  it("Elo rewards the consistent winner", () => {
    const matches = Array.from({ length: 20 }, () => ({ a: "strong", b: "weak", outcome: 1 }));
    const ratings = computeElo(matches);
    expect(ratings.get("strong")!).toBeGreaterThan(ratings.get("weak")!);
  });

  it("Bradley–Terry recovers a transitive ordering", () => {
    const matches: { a: string; b: string; outcome: number }[] = [];
    const push = (a: string, b: string, aWins: number, n: number) => {
      for (let i = 0; i < n; i++) matches.push({ a, b, outcome: i < aWins ? 1 : 0 });
    };
    push("A", "B", 8, 10);
    push("B", "C", 8, 10);
    push("A", "C", 9, 10);
    const { ratings, converged } = bradleyTerry(matches);
    expect(converged).toBe(true);
    expect(ratings.get("A")!).toBeGreaterThan(ratings.get("B")!);
    expect(ratings.get("B")!).toBeGreaterThan(ratings.get("C")!);
  });
});
