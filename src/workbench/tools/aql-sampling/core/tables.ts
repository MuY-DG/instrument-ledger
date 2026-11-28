import type {
  AqlStandardEdition,
  AqlValue,
  CodeLetter,
  InspectionLevel,
  InspectionSeverity,
  LotSizeRange,
  PrimaryCodeLetter,
  RawTableCell,
  StandardAqlValue,
} from "../types";

/**
 * Complete GB/T 2828.1-2012 (ISO 2859-1:1999) and ANSI/ASQ Z1.4-2008 (MIL-STD-105E)
 * single-sampling master tables.
 *
 * Standards notes:
 * - Table 1 (Sample Size Code Letters), Table 2-A (Normal), and Table 2-B (Tightened)
 *   are identical between GB/T 2828.1-2012 / ISO 2859-1:1999 and ANSI/ASQ Z1.4.
 * - Table 2-C (Reduced) differs in the 1999 ISO / 2012 GB revision:
 *   * GB/T 2828.1-2012 (ISO 2859-1:1999) eliminated the Ac/Re gap (Re = Ac + 1) and
 *     uses three arrow diagonals between 0/1 and 1/2 (corresponding to optional fractional
 *     plans 1/5, 1/3, 1/2), with Ac progression 0, 1, 2, 3, 5, 6, 8, 10, 13, 18.
 *   * ANSI/ASQ Z1.4-2008 (MIL-STD-105E) preserves the classic Ac/Re buffer gap
 *     (0/2, 1/3, 1/4, 2/5, 3/6, 5/8, 7/10, 10/13, 14/17, 21/24), where Ac < d < Re
 *     accepts the lot but mandates reverting to Normal inspection on the next lot.
 */

export const PRIMARY_CODE_LETTERS: readonly PrimaryCodeLetter[] = [
  "A",
  "B",
  "C",
  "D",
  "E",
  "F",
  "G",
  "H",
  "J",
  "K",
  "L",
  "M",
  "N",
  "P",
  "Q",
  "R",
] as const;

export const TIGHTENED_CODE_LETTERS: readonly CodeLetter[] = [
  ...PRIMARY_CODE_LETTERS,
  "S",
] as const;

export const INSPECTION_LEVELS: readonly InspectionLevel[] = [
  "S-1",
  "S-2",
  "S-3",
  "S-4",
  "I",
  "II",
  "III",
] as const;

export const GENERAL_LEVELS: readonly InspectionLevel[] = ["I", "II", "III"] as const;
export const SPECIAL_LEVELS: readonly InspectionLevel[] = ["S-1", "S-2", "S-3", "S-4"] as const;

export const INSPECTION_LEVEL_META: Record<
  InspectionLevel,
  { label: string; shortLabel: string; group: "general" | "special"; summary: string }
> = {
  I: {
    label: "一般检验水平 I",
    shortLabel: "G-I",
    group: "general",
    summary: "判别力较低，适用于历史质量稳定或检验成本偏高的常规抽检",
  },
  II: {
    label: "一般检验水平 II（默认）",
    shortLabel: "G-II",
    group: "general",
    summary: "标准默认首选水平，广泛应用于 IQC / OQC 日常外观与尺寸抽检",
  },
  III: {
    label: "一般检验水平 III",
    shortLabel: "G-III",
    group: "general",
    summary: "判别力更高、抽样量更大，适用于高风险关键件或客诉重点监控批",
  },
  "S-1": {
    label: "特殊检验水平 S-1",
    shortLabel: "S-1",
    group: "special",
    summary: "最小样本量，用于高成本破坏性试验（如盐雾、切片、跌落）",
  },
  "S-2": {
    label: "特殊检验水平 S-2",
    shortLabel: "S-2",
    group: "special",
    summary: "小样本量，用于破坏性或长耗时功能/可靠性验证",
  },
  "S-3": {
    label: "特殊检验水平 S-3",
    shortLabel: "S-3",
    group: "special",
    summary: "中等特殊样本量，用于复杂尺寸测量（如三坐标 CMM）与包装测试",
  },
  "S-4": {
    label: "特殊检验水平 S-4",
    shortLabel: "S-4",
    group: "special",
    summary: "特殊水平中判别力最高，用于关键性能抽测与高价值组件检验",
  },
};

export const STANDARD_AQL_VALUES: readonly StandardAqlValue[] = [
  0.01, 0.015, 0.025, 0.04, 0.065,
  0.1, 0.15, 0.25, 0.4, 0.65,
  1.0, 1.5, 2.5, 4.0, 6.5, 10,
  15, 25, 40, 65, 100, 150, 250, 400, 650, 1000,
] as const;

/** Percent-nonconforming AQL values (<= 10) used in 99% of IQC / OQC inspections. */
export const PERCENT_AQL_VALUES: readonly StandardAqlValue[] =
  STANDARD_AQL_VALUES.slice(0, 16);

/** Defects-per-100-units only AQL values (> 10). */
export const DEFECTS_PER_100_AQL_VALUES: readonly StandardAqlValue[] =
  STANDARD_AQL_VALUES.slice(16);

export const COMMON_IQC_AQL_VALUES: readonly AqlValue[] = [
  0, 0.065, 0.1, 0.15, 0.25, 0.4, 0.65, 1.0, 1.5, 2.5, 4.0, 6.5, 10,
] as const;

export function formatAqlValue(aql: AqlValue): string {
  if (aql === 0) return "0 (零缺陷)";
  if (aql === 0.01) return "0.010";
  if (aql === 0.04) return "0.040";
  if (aql === 0.1) return "0.10";
  if (aql === 0.4) return "0.40";
  if (aql === 1.0) return "1.0";
  if (aql === 4.0) return "4.0";
  return String(aql);
}

export function formatAqlShort(aql: AqlValue): string {
  if (aql === 0) return "0";
  return formatAqlValue(aql);
}

/**
 * Table 1 — Sample Size Code Letters (GB/T 2828.1-2012 / ISO 2859-1 / ANSI Z1.4)
 */
export const TABLE_1_LOT_RANGES: readonly LotSizeRange[] = [
  {
    id: "2-8",
    min: 2,
    max: 8,
    label: "2 ~ 8",
    codes: { "S-1": "A", "S-2": "A", "S-3": "A", "S-4": "A", I: "A", II: "A", III: "B" },
  },
  {
    id: "9-15",
    min: 9,
    max: 15,
    label: "9 ~ 15",
    codes: { "S-1": "A", "S-2": "A", "S-3": "A", "S-4": "A", I: "A", II: "B", III: "C" },
  },
  {
    id: "16-25",
    min: 16,
    max: 25,
    label: "16 ~ 25",
    codes: { "S-1": "A", "S-2": "A", "S-3": "B", "S-4": "B", I: "B", II: "C", III: "D" },
  },
  {
    id: "26-50",
    min: 26,
    max: 50,
    label: "26 ~ 50",
    codes: { "S-1": "A", "S-2": "B", "S-3": "B", "S-4": "C", I: "C", II: "D", III: "E" },
  },
  {
    id: "51-90",
    min: 51,
    max: 90,
    label: "51 ~ 90",
    codes: { "S-1": "B", "S-2": "B", "S-3": "C", "S-4": "C", I: "C", II: "E", III: "F" },
  },
  {
    id: "91-150",
    min: 91,
    max: 150,
    label: "91 ~ 150",
    codes: { "S-1": "B", "S-2": "B", "S-3": "C", "S-4": "D", I: "D", II: "F", III: "G" },
  },
  {
    id: "151-280",
    min: 151,
    max: 280,
    label: "151 ~ 280",
    codes: { "S-1": "B", "S-2": "C", "S-3": "D", "S-4": "E", I: "E", II: "G", III: "H" },
  },
  {
    id: "281-500",
    min: 281,
    max: 500,
    label: "281 ~ 500",
    codes: { "S-1": "B", "S-2": "C", "S-3": "D", "S-4": "E", I: "F", II: "H", III: "J" },
  },
  {
    id: "501-1200",
    min: 501,
    max: 1200,
    label: "501 ~ 1,200",
    codes: { "S-1": "C", "S-2": "C", "S-3": "E", "S-4": "F", I: "G", II: "J", III: "K" },
  },
  {
    id: "1201-3200",
    min: 1201,
    max: 3200,
    label: "1,201 ~ 3,200",
    codes: { "S-1": "C", "S-2": "D", "S-3": "E", "S-4": "G", I: "H", II: "K", III: "L" },
  },
  {
    id: "3201-10000",
    min: 3201,
    max: 10000,
    label: "3,201 ~ 10,000",
    codes: { "S-1": "C", "S-2": "D", "S-3": "F", "S-4": "G", I: "J", II: "L", III: "M" },
  },
  {
    id: "10001-35000",
    min: 10001,
    max: 35000,
    label: "10,001 ~ 35,000",
    codes: { "S-1": "C", "S-2": "D", "S-3": "F", "S-4": "H", I: "K", II: "M", III: "N" },
  },
  {
    id: "35001-150000",
    min: 35001,
    max: 150000,
    label: "35,001 ~ 150,000",
    codes: { "S-1": "D", "S-2": "E", "S-3": "G", "S-4": "J", I: "L", II: "N", III: "P" },
  },
  {
    id: "150001-500000",
    min: 150001,
    max: 500000,
    label: "150,001 ~ 500,000",
    codes: { "S-1": "D", "S-2": "E", "S-3": "G", "S-4": "J", I: "M", II: "P", III: "Q" },
  },
  {
    id: "500001+",
    min: 500001,
    max: null,
    label: "≥ 500,001",
    codes: { "S-1": "D", "S-2": "E", "S-3": "H", "S-4": "K", I: "N", II: "Q", III: "R" },
  },
] as const;

export const NORMAL_SAMPLE_SIZES: Record<PrimaryCodeLetter, number> = {
  A: 2,
  B: 3,
  C: 5,
  D: 8,
  E: 13,
  F: 20,
  G: 32,
  H: 50,
  J: 80,
  K: 125,
  L: 200,
  M: 315,
  N: 500,
  P: 800,
  Q: 1250,
  R: 2000,
};

export const TIGHTENED_SAMPLE_SIZES: Record<CodeLetter, number> = {
  ...NORMAL_SAMPLE_SIZES,
  S: 3150,
};

export const REDUCED_SAMPLE_SIZES: Record<PrimaryCodeLetter, number> = {
  A: 2,
  B: 2,
  C: 2,
  D: 3,
  E: 5,
  F: 8,
  G: 13,
  H: 20,
  J: 32,
  K: 50,
  L: 80,
  M: 125,
  N: 200,
  P: 315,
  Q: 500,
  R: 800,
};

export function getTableSampleSize(
  code: CodeLetter,
  severity: InspectionSeverity
): number {
  if (severity === "tightened") {
    return TIGHTENED_SAMPLE_SIZES[code];
  }
  const primary = (code === "S" ? "R" : code) as PrimaryCodeLetter;
  return severity === "reduced"
    ? REDUCED_SAMPLE_SIZES[primary]
    : NORMAL_SAMPLE_SIZES[primary];
}

const PLAN = (ac: number, re: number): RawTableCell => ({ kind: "plan", ac, re });
const DOWN: RawTableCell = { kind: "arrow", direction: "down" };
const UP: RawTableCell = { kind: "arrow", direction: "up" };

const NORMAL_DIAGONAL_PLANS: Record<number, RawTableCell> = {
  14: PLAN(0, 1),
  17: PLAN(1, 2),
  18: PLAN(2, 3),
  19: PLAN(3, 4),
  20: PLAN(5, 6),
  21: PLAN(7, 8),
  22: PLAN(10, 11),
  23: PLAN(14, 15),
  24: PLAN(21, 22),
  25: PLAN(30, 31),
  26: PLAN(44, 45),
};

const TIGHTENED_DIAGONAL_PLANS: Record<number, RawTableCell> = {
  15: PLAN(0, 1),
  18: PLAN(1, 2),
  19: PLAN(2, 3),
  20: PLAN(3, 4),
  21: PLAN(5, 6),
  22: PLAN(8, 9),
  23: PLAN(12, 13),
  24: PLAN(18, 19),
  25: PLAN(27, 28),
  26: PLAN(41, 42),
};

/** GB/T 2828.1-2012 / ISO 2859-1:1999 Table 2-C (gap-free Re = Ac + 1). */
const GBT_REDUCED_DIAGONAL_PLANS: Record<number, RawTableCell> = {
  14: PLAN(0, 1),
  18: PLAN(1, 2),
  19: PLAN(2, 3),
  20: PLAN(3, 4),
  21: PLAN(5, 6),
  22: PLAN(6, 7),
  23: PLAN(8, 9),
  24: PLAN(10, 11),
  25: PLAN(13, 14),
  26: PLAN(18, 19),
};

/** ANSI/ASQ Z1.4-2008 / MIL-STD-105E Table II-C (preserves reduced Ac/Re buffer gap). */
const ANSI_REDUCED_DIAGONAL_PLANS: Record<number, RawTableCell> = {
  14: PLAN(0, 1),
  17: PLAN(0, 2),
  18: PLAN(1, 3),
  19: PLAN(1, 4),
  20: PLAN(2, 5),
  21: PLAN(3, 6),
  22: PLAN(5, 8),
  23: PLAN(7, 10),
  24: PLAN(10, 13),
  25: PLAN(14, 17),
  26: PLAN(21, 24),
};

/**
 * Returns the exact raw master-table cell (either an Ac/Re plan or an up/down arrow)
 * for row index `r` and AQL column index `j` (0..25).
 */
export function getMasterTableCell(
  standard: AqlStandardEdition,
  severity: InspectionSeverity,
  rowIndex: number,
  aqlIndex: number
): RawTableCell {
  const d = rowIndex + aqlIndex;

  if (severity === "normal") {
    // Rows 0..15 (A..R)
    const maxD = rowIndex <= 4 ? 26 : 24;
    if (d < 14) return DOWN;
    if (d === 15) return rowIndex === 0 ? DOWN : UP;
    if (d === 16) return rowIndex === 15 ? UP : DOWN;
    if (d > maxD) return UP;
    return NORMAL_DIAGONAL_PLANS[d] ?? UP;
  }

  if (severity === "tightened") {
    // Rows 0..16 (A..S). Row S (rowIndex=16) exists specifically for AQL=0.025 (j=2, d=18 -> 1/2).
    if (rowIndex === 16) {
      if (aqlIndex === 2) return PLAN(1, 2);
      return UP;
    }
    const maxD = rowIndex <= 4 ? 26 : 24;
    if (d < 15) return DOWN;
    if (d === 16) return rowIndex === 0 ? DOWN : UP;
    if (d === 17) return DOWN; // At R (15), j=2 (0.025) points down to S (16) -> 1/2!
    if (d > maxD) return UP;
    return TIGHTENED_DIAGONAL_PLANS[d] ?? UP;
  }

  // Reduced inspection (Table 2-C / Table II-C), rows 0..15 (A..R).
  // Note: Code A has n=2 (identical to Normal A because sample size cannot shrink below 2).
  if (rowIndex === 0) {
    return getMasterTableCell(standard, "normal", 0, aqlIndex);
  }

  // Code B has n=2 (only 1 step smaller than Normal B n=3). For AQL <= 10 (j<=15) it follows
  // standard reduced progression cleanly; for defects/100 units (j>=16) where n=2 is already
  // at the floor, adjust upper ceiling consistently with Table 2-C.
  if (standard === "gbt2828") {
    const maxD = rowIndex <= 4 ? 26 : 24;
    if (d < 14) return DOWN;
    if (d === 15) return UP;
    if (d === 16) return rowIndex >= 14 ? UP : DOWN;
    if (d === 17) return rowIndex === 15 ? UP : DOWN;
    if (d > maxD) return UP;
    return GBT_REDUCED_DIAGONAL_PLANS[d] ?? UP;
  }

  // ANSI/ASQ Z1.4 Table II-C
  const maxD = rowIndex <= 4 ? 26 : 24;
  if (d < 14) return DOWN;
  if (d === 15) return UP;
  if (d === 16) return rowIndex === 15 ? UP : DOWN;
  if (d > maxD) return UP;
  return ANSI_REDUCED_DIAGONAL_PLANS[d] ?? UP;
}

export function getMasterTableRows(severity: InspectionSeverity): readonly CodeLetter[] {
  return severity === "tightened" ? TIGHTENED_CODE_LETTERS : PRIMARY_CODE_LETTERS;
}

export function getTableReferenceLabel(
  standard: AqlStandardEdition,
  severity: InspectionSeverity
): string {
  const stdPrefix =
    standard === "gbt2828" ? "GB/T 2828.1-2012 (ISO 2859-1)" : "ANSI/ASQ Z1.4 (MIL-STD-105E)";
  const tableCode =
    severity === "normal"
      ? standard === "gbt2828"
        ? "表2-A 正常检验"
        : "Table II-A Normal"
      : severity === "tightened"
        ? standard === "gbt2828"
          ? "表2-B 加严检验"
          : "Table II-B Tightened"
        : standard === "gbt2828"
          ? "表2-C 放宽检验"
          : "Table II-C Reduced";
  return `${stdPrefix} · ${tableCode}`;
}
