/**
 * Exact AIAG SPC (2nd Edition) & ASTM E2587 Control Chart Constants
 * for subgroup sizes n = 2..25, plus Lanczos log-gamma for exact c4(n) for any n >= 2.
 */

export interface SpcSubgroupConstants {
  n: number;
  d2: number;
  d3: number;
  c4: number;
  A2: number;
  A3: number;
  D3: number;
  D4: number;
  B3: number;
  B4: number;
}

/** Exact d2(n) = E[R/sigma] for standard normal sample of size n (ASTM E2587 / Tippett). */
const D2_TABLE: Record<number, number> = {
  2: 1.128379167,
  3: 1.692568751,
  4: 2.058750746,
  5: 2.325928947,
  6: 2.534412721,
  7: 2.704356751,
  8: 2.847200612,
  9: 2.970026324,
  10: 3.077505462,
  11: 3.172872793,
  12: 3.258455264,
  13: 3.335980338,
  14: 3.406763156,
  15: 3.471826802,
  16: 3.531982297,
  17: 3.587883948,
  18: 3.640063786,
  19: 3.688963421,
  20: 3.734950157,
  21: 3.778336222,
  22: 3.819384961,
  23: 3.858322651,
  24: 3.895345979,
  25: 3.930628191,
};

/** Exact d3(n) = SD[R/sigma] for standard normal sample of size n (ASTM E2587 / Harter). */
const D3_TABLE: Record<number, number> = {
  2: 0.852502466,
  3: 0.888369666,
  4: 0.879807755,
  5: 0.864081941,
  6: 0.848040162,
  7: 0.833205363,
  8: 0.819831015,
  9: 0.807834003,
  10: 0.797051526,
  11: 0.787324256,
  12: 0.778507537,
  13: 0.770475459,
  14: 0.763120669,
  15: 0.756352082,
  16: 0.750092652,
  17: 0.744276468,
  18: 0.738847359,
  19: 0.733757411,
  20: 0.728965664,
  21: 0.724436995,
  22: 0.720141227,
  23: 0.716052427,
  24: 0.712148204,
  25: 0.708409152,
};

/** Lanczos approximation of ln(Gamma(z)) accurate to ~1e-13 for Re(z) > 0. */
export function logGamma(z: number): number {
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
  const zm1 = z - 1;
  let x = p[0];
  for (let i = 1; i < p.length; i++) {
    x += p[i] / (zm1 + i);
  }
  const t = zm1 + g + 0.5;
  return 0.5 * Math.log(2 * Math.PI) + (zm1 + 0.5) * Math.log(t) - t + Math.log(x);
}

/** Exact unbiasing constant c4(n) = sqrt(2/(n-1)) * Gamma(n/2) / Gamma((n-1)/2). */
export function computeC4(n: number): number {
  if (n <= 1) return 1;
  if (n > 200) {
    // High-order asymptotic expansion: 1 - 1/(4n) - 7/(32n^2) - 19/(128n^3)
    const inv = 1 / n;
    return 1 - 0.25 * inv - (7 / 32) * inv * inv - (19 / 128) * inv * inv * inv;
  }
  return Math.sqrt(2 / (n - 1)) * Math.exp(logGamma(n / 2) - logGamma((n - 1) / 2));
}

export function getSubgroupConstants(n: number): SpcSubgroupConstants {
  const clamped = Math.max(2, Math.min(25, Math.round(n)));
  const d2 = D2_TABLE[clamped];
  const d3 = D3_TABLE[clamped];
  const c4 = computeC4(clamped);

  const A2 = 3 / (d2 * Math.sqrt(clamped));
  const A3 = 3 / (c4 * Math.sqrt(clamped));
  const D3 = Math.max(0, 1 - (3 * d3) / d2);
  const D4 = 1 + (3 * d3) / d2;
  const c5Ratio = Math.sqrt(Math.max(0, 1 - c4 * c4)) / c4;
  const B3 = Math.max(0, 1 - 3 * c5Ratio);
  const B4 = 1 + 3 * c5Ratio;

  return { n: clamped, d2, d3, c4, A2, A3, D3, D4, B3, B4 };
}

/** Constants specifically for I-MR chart (moving range span w = 2). */
export const IMR_CONSTANTS = {
  d2: D2_TABLE[2], // 1.128379167
  E2: 3 / D2_TABLE[2], // 2.658680776
  D3: 0,
  D4: 1 + (3 * D3_TABLE[2]) / D2_TABLE[2], // 3.266530165
} as const;

export const MAX_SUBGROUP_SIZE = 25;
export const MIN_SUBGROUP_SIZE = 1;
