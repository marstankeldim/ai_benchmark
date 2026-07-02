/**
 * Arena-style rankings from pairwise judgments (à la LM Arena).
 *
 * Two complementary methods:
 *  - **Elo** — an online update rule; ratings drift as games arrive. Order-
 *    dependent, cheap, and intuitive.
 *  - **Bradley–Terry** — the maximum-likelihood model behind Elo. Order-
 *    independent and the more principled choice for a fixed batch of comparisons;
 *    we fit it with the standard MM (minorization–maximization) iteration and map
 *    the learned strengths onto the Elo scale for a familiar presentation.
 */

/** One pairwise comparison. `outcome`: 1 = A wins, 0 = B wins, 0.5 = draw. */
export interface Match {
  a: string;
  b: string;
  outcome: number;
}

export interface EloOptions {
  /** K-factor: how much a single game moves a rating. Default 32. */
  k?: number;
  /** Starting rating for a previously-unseen player. Default 1000. */
  initialRating?: number;
  /** Rating spread constant. Default 400 (a 400-point gap ⇒ ~10:1 odds). */
  scale?: number;
}

/** Expected score of A vs B under the logistic model. */
export function expectedScore(ratingA: number, ratingB: number, scale = 400): number {
  return 1 / (1 + 10 ** ((ratingB - ratingA) / scale));
}

/**
 * Sequential Elo over a list of matches. Returns final ratings keyed by player.
 * Processing order matters (that's Elo by design); for an order-independent
 * ranking use {@link bradleyTerry}.
 */
export function computeElo(matches: readonly Match[], options: EloOptions = {}): Map<string, number> {
  const { k = 32, initialRating = 1000, scale = 400 } = options;
  const ratings = new Map<string, number>();
  const get = (p: string): number => ratings.get(p) ?? initialRating;

  for (const m of matches) {
    const ra = get(m.a);
    const rb = get(m.b);
    const ea = expectedScore(ra, rb, scale);
    const eb = 1 - ea;
    ratings.set(m.a, ra + k * (m.outcome - ea));
    ratings.set(m.b, rb + k * (1 - m.outcome - eb));
  }
  return ratings;
}

export interface BradleyTerryOptions {
  /** Max MM iterations. Default 1000. */
  iterations?: number;
  /** Convergence tolerance on the max strength change. Default 1e-9. */
  tolerance?: number;
  /** Center the returned Elo ratings on this value. Default 1000. */
  anchor?: number;
  /** Elo scale constant for the strength→rating mapping. Default 400. */
  scale?: number;
}

export interface BradleyTerryResult {
  /** Latent strengths (positive, geometric-mean-normalized to 1). */
  strengths: Map<string, number>;
  /** Strengths mapped onto the Elo scale, centered on `anchor`. */
  ratings: Map<string, number>;
  iterations: number;
  converged: boolean;
}

/**
 * Fit Bradley–Terry strengths by MM iteration. Draws are counted as half a win
 * to each side. The update for player i is
 *
 *     p_i ← W_i / Σ_j n_ij / (p_i + p_j)
 *
 * where W_i is i's win total and n_ij the number of i-vs-j games.
 */
export function bradleyTerry(
  matches: readonly Match[],
  options: BradleyTerryOptions = {},
): BradleyTerryResult {
  const { iterations = 1000, tolerance = 1e-9, anchor = 1000, scale = 400 } = options;

  const players = [...new Set(matches.flatMap((m) => [m.a, m.b]))];
  const index = new Map(players.map((p, i) => [p, i]));
  const N = players.length;

  const wins = new Array<number>(N).fill(0);
  const games = Array.from({ length: N }, () => new Array<number>(N).fill(0));
  for (const m of matches) {
    const i = index.get(m.a)!;
    const j = index.get(m.b)!;
    wins[i]! += m.outcome;
    wins[j]! += 1 - m.outcome;
    games[i]![j]! += 1;
    games[j]![i]! += 1;
  }

  let p = new Array<number>(N).fill(1);
  let converged = false;
  let iter = 0;
  for (; iter < iterations; iter++) {
    const next = new Array<number>(N).fill(0);
    for (let i = 0; i < N; i++) {
      let denom = 0;
      for (let j = 0; j < N; j++) {
        if (i === j || games[i]![j]! === 0) continue;
        denom += games[i]![j]! / (p[i]! + p[j]!);
      }
      next[i] = denom > 0 ? (wins[i]! || 1e-12) / denom : p[i]!;
    }
    // Normalize to geometric mean 1 for identifiability.
    const logMean = next.reduce((s, x) => s + Math.log(x), 0) / N;
    const geoMean = Math.exp(logMean);
    for (let i = 0; i < N; i++) next[i]! /= geoMean;

    let maxDelta = 0;
    for (let i = 0; i < N; i++) maxDelta = Math.max(maxDelta, Math.abs(next[i]! - p[i]!));
    p = next;
    if (maxDelta < tolerance) {
      converged = true;
      iter++;
      break;
    }
  }

  const strengths = new Map<string, number>();
  const ratings = new Map<string, number>();
  for (let i = 0; i < N; i++) {
    strengths.set(players[i]!, p[i]!);
    // strength → Elo: rating = anchor + (scale / ln 10) · ln(strength)
    ratings.set(players[i]!, anchor + (scale / Math.log(10)) * Math.log(p[i]!));
  }

  return { strengths, ratings, iterations: iter, converged };
}
