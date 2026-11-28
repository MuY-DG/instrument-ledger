import type { OcAnalytics, OcPoint, SamplingPlanResult } from "../types";

/**
 * Lanczos approximation for ln(Gamma(z)) — exact to ~15 digits for all z > 0.
 * Allows exact log-binomial probabilities up to n = 3150+ without factorial overflow.
 */
function logGamma(z: number): number {
  const g = 7;
  const p = [
    0.99999999999980993,
    676.5203681218851,
    -1259.1392167224028,
    771.32342877765313,
    -176.61502916214059,
    12.507343278686905,
    -0.13857109526572012,
    9.9843695780195716e-6,
    1.5056327351493116e-7,
  ];
  if (z < 0.5) {
    return Math.log(Math.PI / Math.sin(Math.PI * z)) - logGamma(1 - z);
  }
  const zm = z - 1;
  let x = p[0];
  for (let i = 1; i < g + 2; i++) {
    x += p[i] / (zm + i);
  }
  const t = zm + g + 0.5;
  return (
    0.5 * Math.log(2 * Math.PI) +
    (zm + 0.5) * Math.log(t) -
    t +
    Math.log(x)
  );
}

function logChoose(n: number, k: number): number {
  if (k < 0 || k > n) return -Infinity;
  if (k === 0 || k === n) return 0;
  return logGamma(n + 1) - logGamma(k + 1) - logGamma(n - k + 1);
}

/**
 * Exact Binomial CDF: P(X <= ac | n, p) for 0 <= p <= 1.
 */
export function binomialCdf(n: number, ac: number, p: number): number {
  if (ac >= n) return 1;
  if (ac < 0) return 0;
  if (p <= 0) return 1;
  if (p >= 1) return 0;

  const logP = Math.log(p);
  const logQ = Math.log(1 - p);
  let sum = 0;
  for (let k = 0; k <= ac; k++) {
    const logTerm = logChoose(n, k) + k * logP + (n - k) * logQ;
    sum += Math.exp(logTerm);
  }
  return Math.max(0, Math.min(1, sum));
}

/**
 * Exact Poisson CDF: P(X <= ac | lambda = n * p) for lambda >= 0.
 */
export function poissonCdf(ac: number, lambda: number): number {
  if (ac < 0) return 0;
  if (lambda <= 0) return 1;

  let sum = 0;
  const logLambda = Math.log(lambda);
  for (let k = 0; k <= ac; k++) {
    const logTerm = k * logLambda - lambda - logGamma(k + 1);
    sum += Math.exp(logTerm);
  }
  return Math.max(0, Math.min(1, sum));
}

/**
 * Acceptance probability Pa(pPercent) for a given sampling plan.
 * Uses exact Binomial for percent nonconforming (AQL <= 10) and Poisson for defects/100 units (AQL > 10).
 * Note: for ANSI Z1.4 reduced plans with a gap (Re > Ac + 1), acceptance occurs for d <= Re - 1.
 */
export function computeAcceptanceProbability(
  plan: SamplingPlanResult,
  pPercent: number
): number {
  // Under ANSI Z1.4 reduced inspection, lots with d < Re are accepted (current lot passes,
  // though d > Ac triggers revert to normal). Using effectiveAcceptLimit = plan.re - 1 reflects
  // true lot acceptance probability per ISO 2859-1 / ANSI Z1.4 OC definitions.
  const effectiveAcceptLimit = Math.max(plan.ac, plan.re - 1);
  const n = Math.max(1, plan.sampleSize);
  const p = Math.max(0, pPercent / 100);

  if (plan.isDefectsPerHundred) {
    return poissonCdf(effectiveAcceptLimit, n * p);
  }
  return binomialCdf(n, effectiveAcceptLimit, Math.min(1, p));
}

/**
 * Monotonic bisection to find defect rate pPercent where Pa(p) = targetPa.
 */
function solvePForTargetPa(
  plan: SamplingPlanResult,
  targetPa: number
): number {
  const maxBound = plan.isDefectsPerHundred
    ? Math.max(50, plan.aql * 12)
    : 100;
  let lo = 0;
  let hi = maxBound;

  // Ensure hi has Pa <= targetPa
  if (computeAcceptanceProbability(plan, hi) > targetPa) {
    return hi;
  }

  for (let i = 0; i < 48; i++) {
    const mid = (lo + hi) / 2;
    const pa = computeAcceptanceProbability(plan, mid);
    if (pa > targetPa) {
      lo = mid;
    } else {
      hi = mid;
    }
  }
  return (lo + hi) / 2;
}

/**
 * Compute full OC curve analytics (Pa at AQL, Producer Risk, IQL, LQ10/RQL, AOQ & AOQL).
 */
export function computeOcAnalytics(
  plan: SamplingPlanResult,
  overrideXMax?: number
): OcAnalytics {
  const model: "binomial" | "poisson" = plan.isDefectsPerHundred
    ? "poisson"
    : "binomial";

  const aqlVal = plan.aql > 0 ? plan.aql : 0.1;
  const paAtAql = computeAcceptanceProbability(plan, aqlVal);
  const producerRisk = Math.max(0, 1 - paAtAql);
  const iqlPercent = solvePForTargetPa(plan, 0.5);
  const lq10Percent = solvePForTargetPa(plan, 0.1);
  const lq02Percent = solvePForTargetPa(plan, 0.02);

  const finiteLotFactor =
    plan.lotSize !== null && plan.lotSize > plan.sampleSize
      ? (plan.lotSize - plan.sampleSize) / plan.lotSize
      : 1;

  const autoMax = Math.max(
    aqlVal * 4,
    lq10Percent * 1.35,
    lq02Percent * 1.05,
    0.5
  );
  const xMaxPercent =
    overrideXMax ??
    (plan.isDefectsPerHundred ? autoMax : Math.min(100, autoMax));

  const steps = 84;
  const points: OcPoint[] = [];
  let aoqlPercent = 0;
  let aoqlAtPercent = 0;

  for (let i = 0; i <= steps; i++) {
    const pPercent = (xMaxPercent * i) / steps;
    const pa = computeAcceptanceProbability(plan, pPercent);
    const aoqPercent = pPercent * pa * finiteLotFactor;
    if (aoqPercent > aoqlPercent) {
      aoqlPercent = aoqPercent;
      aoqlAtPercent = pPercent;
    }
    points.push({ pPercent, pa, aoqPercent });
  }

  return {
    model,
    paAtAql,
    producerRisk,
    iqlPercent,
    lq10Percent,
    aoqlPercent,
    aoqlAtPercent,
    points,
    xMaxPercent,
  };
}
