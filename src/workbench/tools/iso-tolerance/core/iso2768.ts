/**
 * Normative ISO 2768-1:1989 (GB/T 1804-2000) & ISO 2768-2:1989 (GB/T 1184-1996)
 * General Tolerances Engine: Linear, Chamfer/Radius, Angular, and Geometrical (GD&T).
 */
import type {
  Iso2768AngularEvaluation,
  Iso2768AngularRow,
  Iso2768GeomClass,
  Iso2768GeomEvaluation,
  Iso2768GeomRow,
  Iso2768LinearClass,
  Iso2768LinearEvaluation,
  Iso2768LinearRow,
  Iso2768RangeRow,
  MeasurementEvaluation,
} from "../types";

export const ISO2768_LINEAR_CLASSES: readonly Iso2768LinearClass[] = [
  "f",
  "m",
  "c",
  "v",
] as const;

export const ISO2768_GEOM_CLASSES: readonly Iso2768GeomClass[] = [
  "H",
  "K",
  "L",
] as const;

export const ISO2768_LINEAR_CLASS_META: Record<
  Iso2768LinearClass,
  { code: Iso2768LinearClass; name: string; en: string; process: string }
> = {
  f: {
    code: "f",
    name: "精密级",
    en: "Fine",
    process: "精密 CNC / 磨削 / 光学与精密仪控结构件",
  },
  m: {
    code: "m",
    name: "中等级",
    en: "Medium",
    process: "常规机加工 / 车铣加工 / 精密钣金（工业最常用）",
  },
  c: {
    code: "c",
    name: "粗糙级",
    en: "Coarse",
    process: "一般冲压 / 折弯钣金 / 压铸与注塑结构件",
  },
  v: {
    code: "v",
    name: "最粗级",
    en: "Very Coarse",
    process: "焊接钢构 / 砂型铸造 / 锻造毛坯与重型结构",
  },
};

export const ISO2768_GEOM_CLASS_META: Record<
  Iso2768GeomClass,
  { code: Iso2768GeomClass; name: string; desc: string }
> = {
  H: {
    code: "H",
    name: "精密形位",
    desc: "高精度基准面与精密装配结构（常配 f / m）",
  },
  K: {
    code: "K",
    name: "中等形位",
    desc: "常规机械加工与钣金默认形位要求（最常用 mK）",
  },
  L: {
    code: "L",
    name: "粗糙形位",
    desc: "焊接件、铸锻毛坯及非关键外观结构（常配 c / v）",
  },
};

/**
 * ISO 2768-1 Table 1 / GB/T 1804-2000 表1:
 * Permissible deviations for linear dimensions except broken edges (± mm).
 */
export const ISO2768_LINEAR_TABLE: readonly Iso2768LinearRow[] = [
  { id: "lin-0.5-3", label: "0.5 ～ 3", min: 0.5, minExclusive: false, max: 3, f: 0.05, m: 0.1, c: 0.2, v: null },
  { id: "lin-3-6", label: "> 3 ～ 6", min: 3, minExclusive: true, max: 6, f: 0.05, m: 0.1, c: 0.3, v: 0.5 },
  { id: "lin-6-30", label: "> 6 ～ 30", min: 6, minExclusive: true, max: 30, f: 0.1, m: 0.2, c: 0.5, v: 1.0 },
  { id: "lin-30-120", label: "> 30 ～ 120", min: 30, minExclusive: true, max: 120, f: 0.15, m: 0.3, c: 0.8, v: 1.5 },
  { id: "lin-120-400", label: "> 120 ～ 400", min: 120, minExclusive: true, max: 400, f: 0.2, m: 0.5, c: 1.2, v: 2.5 },
  { id: "lin-400-1000", label: "> 400 ～ 1000", min: 400, minExclusive: true, max: 1000, f: 0.3, m: 0.8, c: 2.0, v: 4.0 },
  { id: "lin-1000-2000", label: "> 1000 ～ 2000", min: 1000, minExclusive: true, max: 2000, f: 0.5, m: 1.2, c: 3.0, v: 6.0 },
  { id: "lin-2000-4000", label: "> 2000 ～ 4000", min: 2000, minExclusive: true, max: 4000, f: null, m: 2.0, c: 4.0, v: 8.0 },
];

/**
 * ISO 2768-1 Table 2 / GB/T 1804-2000 表2:
 * Permissible deviations for broken edges (external radius and chamfer heights, ± mm).
 */
export const ISO2768_CHAMFER_TABLE: readonly Iso2768LinearRow[] = [
  { id: "chf-0.5-3", label: "0.5 ～ 3", min: 0.5, minExclusive: false, max: 3, f: 0.2, m: 0.2, c: 0.4, v: 0.4 },
  { id: "chf-3-6", label: "> 3 ～ 6", min: 3, minExclusive: true, max: 6, f: 0.5, m: 0.5, c: 1.0, v: 1.0 },
  { id: "chf-6+", label: "> 6", min: 6, minExclusive: true, max: null, f: 1.0, m: 1.0, c: 2.0, v: 2.0 },
];

/**
 * ISO 2768-1 Table 3 / GB/T 1804-2000 表3:
 * Permissible deviations for angular dimensions (by length of shorter side in mm; values in arc-minutes).
 */
export const ISO2768_ANGULAR_TABLE: readonly Iso2768AngularRow[] = [
  { id: "ang-0-10", label: "≤ 10", min: 0, minExclusive: true, max: 10, f: 60, m: 60, c: 90, v: 180 },
  { id: "ang-10-50", label: "> 10 ～ 50", min: 10, minExclusive: true, max: 50, f: 30, m: 30, c: 60, v: 120 },
  { id: "ang-50-120", label: "> 50 ～ 120", min: 50, minExclusive: true, max: 120, f: 20, m: 20, c: 30, v: 60 },
  { id: "ang-120-400", label: "> 120 ～ 400", min: 120, minExclusive: true, max: 400, f: 10, m: 10, c: 15, v: 30 },
  { id: "ang-400+", label: "> 400", min: 400, minExclusive: true, max: null, f: 5, m: 5, c: 10, v: 20 },
];

/**
 * ISO 2768-2 Table 1 / GB/T 1184-1996 表B1:
 * General tolerances on straightness and flatness (mm).
 */
export const ISO2768_STRAIGHTNESS_TABLE: readonly Iso2768GeomRow[] = [
  { id: "str-0-10", label: "≤ 10", min: 0, minExclusive: true, max: 10, H: 0.02, K: 0.05, L: 0.1 },
  { id: "str-10-30", label: "> 10 ～ 30", min: 10, minExclusive: true, max: 30, H: 0.05, K: 0.1, L: 0.2 },
  { id: "str-30-100", label: "> 30 ～ 100", min: 30, minExclusive: true, max: 100, H: 0.1, K: 0.2, L: 0.4 },
  { id: "str-100-300", label: "> 100 ～ 300", min: 100, minExclusive: true, max: 300, H: 0.2, K: 0.4, L: 0.8 },
  { id: "str-300-1000", label: "> 300 ～ 1000", min: 300, minExclusive: true, max: 1000, H: 0.3, K: 0.6, L: 1.2 },
  { id: "str-1000-3000", label: "> 1000 ～ 3000", min: 1000, minExclusive: true, max: 3000, H: 0.4, K: 0.8, L: 1.6 },
];

/**
 * ISO 2768-2 Table 2 / GB/T 1184-1996 表B2:
 * General tolerances on perpendicularity (mm, by length of shorter side).
 */
export const ISO2768_PERPENDICULARITY_TABLE: readonly Iso2768GeomRow[] = [
  { id: "perp-0-100", label: "≤ 100", min: 0, minExclusive: true, max: 100, H: 0.2, K: 0.4, L: 0.6 },
  { id: "perp-100-300", label: "> 100 ～ 300", min: 100, minExclusive: true, max: 300, H: 0.3, K: 0.6, L: 1.0 },
  { id: "perp-300-1000", label: "> 300 ～ 1000", min: 300, minExclusive: true, max: 1000, H: 0.4, K: 0.8, L: 1.5 },
  { id: "perp-1000-3000", label: "> 1000 ～ 3000", min: 1000, minExclusive: true, max: 3000, H: 0.5, K: 1.0, L: 2.0 },
];

/**
 * ISO 2768-2 Table 3 / GB/T 1184-1996 表B3:
 * General tolerances on symmetry (mm, by length of longer feature).
 */
export const ISO2768_SYMMETRY_TABLE: readonly Iso2768GeomRow[] = [
  { id: "sym-0-100", label: "≤ 100", min: 0, minExclusive: true, max: 100, H: 0.5, K: 0.6, L: 0.6 },
  { id: "sym-100-300", label: "> 100 ～ 300", min: 100, minExclusive: true, max: 300, H: 0.5, K: 0.6, L: 1.0 },
  { id: "sym-300-1000", label: "> 300 ～ 1000", min: 300, minExclusive: true, max: 1000, H: 0.5, K: 0.8, L: 1.5 },
  { id: "sym-1000-3000", label: "> 1000 ～ 3000", min: 1000, minExclusive: true, max: 3000, H: 0.5, K: 1.0, L: 2.0 },
];

/**
 * ISO 2768-2 Table 4 / GB/T 1184-1996 表B4:
 * General tolerances on circular run-out (mm, independent of nominal size).
 */
export const ISO2768_RUNOUT_VALUES: Record<Iso2768GeomClass, number> = {
  H: 0.1,
  K: 0.2,
  L: 0.5,
};

function findRangeRow<T extends Iso2768RangeRow>(
  rows: readonly T[],
  value: number
): T | null {
  if (!Number.isFinite(value) || value <= 0) return null;
  for (const row of rows) {
    const lowOk = row.minExclusive ? value > row.min : value >= row.min;
    const highOk = row.max === null ? true : value <= row.max;
    if (lowOk && highOk) return row;
  }
  return null;
}

export function formatArcMinutesToDms(arcMin: number): string {
  const deg = Math.floor(arcMin / 60);
  const min = arcMin % 60;
  if (deg > 0 && min > 0) return `±${deg}°${min}'`;
  if (deg > 0) return `±${deg}°`;
  return `±0°${min}'`;
}

function roundSafe(v: number, digits = 6): number {
  const r = Number(v.toFixed(digits));
  return r === 0 ? 0 : r;
}

/**
 * Evaluate ISO 2768-1 linear or chamfer/radius general tolerance.
 */
export function lookupIso2768Linear(
  nominal: number,
  linearClass: Iso2768LinearClass,
  kind: "linear" | "chamfer" = "linear"
): Iso2768LinearEvaluation {
  const table = kind === "chamfer" ? ISO2768_CHAMFER_TABLE : ISO2768_LINEAR_TABLE;
  const row = findRangeRow(table, nominal);

  if (!row) {
    const warning =
      !Number.isFinite(nominal) || nominal <= 0
        ? "请输入大于 0 的公称尺寸 (mm)。"
        : nominal < 0.5
          ? "ISO 2768-1 规定：小于 0.5 mm 的线性/倒角尺寸必须在图纸尺寸旁直接标注极限偏差，不适用一般公差表。"
          : "ISO 2768-1 表 1 仅覆盖至 4000 mm，超出范围请按图纸单独标注公差。";

    return {
      kind,
      nominal,
      linearClass,
      rangeLabel: nominal < 0.5 ? "< 0.5 mm" : "> 4000 mm",
      rangeId: null,
      toleranceMm: null,
      upperLimitMm: null,
      lowerLimitMm: null,
      bandWidthMm: null,
      warning,
      allClasses: { f: null, m: null, c: null, v: null },
    };
  }

  const tol = row[linearClass];
  let warning: string | null = null;
  if (tol === null) {
    if (linearClass === "v" && nominal <= 3) {
      warning =
        "ISO 2768-1 表 1 中 0.5～3 mm 尺寸段未规定 v（最粗）级公差，请直接标注或改用 c 级。";
    } else if (linearClass === "f" && nominal > 2000) {
      warning =
        "ISO 2768-1 表 1 中 >2000～4000 mm 尺寸段未规定 f（精密）级公差，请直接标注或改用 m 级。";
    }
  }

  return {
    kind,
    nominal,
    linearClass,
    rangeLabel: `${row.label} mm`,
    rangeId: row.id,
    toleranceMm: tol,
    upperLimitMm: tol !== null ? roundSafe(nominal + tol) : null,
    lowerLimitMm: tol !== null ? roundSafe(nominal - tol) : null,
    bandWidthMm: tol !== null ? roundSafe(tol * 2) : null,
    warning,
    allClasses: { f: row.f, m: row.m, c: row.c, v: row.v },
  };
}

/**
 * Evaluate ISO 2768-1 Table 3 angular general tolerance (governed by shorter side length).
 */
export function lookupIso2768Angular(
  nominalDeg: number,
  shortSideMm: number,
  linearClass: Iso2768LinearClass
): Iso2768AngularEvaluation {
  const safeSide = Number.isFinite(shortSideMm) && shortSideMm > 0 ? shortSideMm : 10;
  const row = findRangeRow(ISO2768_ANGULAR_TABLE, safeSide) ?? ISO2768_ANGULAR_TABLE[0];
  const arcMin = row[linearClass];
  const tolDeg = roundSafe(arcMin / 60, 5);
  const rad = (tolDeg * Math.PI) / 180;
  const chordDeviationMm = roundSafe(safeSide * Math.tan(rad), 4);

  return {
    kind: "angular",
    nominalDeg,
    shortSideMm: safeSide,
    linearClass,
    rangeLabel: `短边 ${row.label} mm`,
    rangeId: row.id,
    toleranceArcMin: arcMin,
    toleranceDeg: tolDeg,
    toleranceDms: formatArcMinutesToDms(arcMin),
    upperLimitDeg: roundSafe(nominalDeg + tolDeg, 5),
    lowerLimitDeg: roundSafe(nominalDeg - tolDeg, 5),
    chordDeviationMm,
    allClasses: {
      f: { arcMin: row.f, deg: roundSafe(row.f / 60, 5), dms: formatArcMinutesToDms(row.f) },
      m: { arcMin: row.m, deg: roundSafe(row.m / 60, 5), dms: formatArcMinutesToDms(row.m) },
      c: { arcMin: row.c, deg: roundSafe(row.c / 60, 5), dms: formatArcMinutesToDms(row.c) },
      v: { arcMin: row.v, deg: roundSafe(row.v / 60, 5), dms: formatArcMinutesToDms(row.v) },
    },
  };
}

/**
 * Evaluate ISO 2768-2 / GB/T 1184-1996 general geometrical tolerances (H / K / L).
 */
export function lookupIso2768Geom(
  nominalMm: number,
  geomClass: Iso2768GeomClass,
  pairedLinearClass?: Iso2768LinearClass
): Iso2768GeomEvaluation {
  const strRow = findRangeRow(ISO2768_STRAIGHTNESS_TABLE, nominalMm);
  const perpRow = findRangeRow(ISO2768_PERPENDICULARITY_TABLE, nominalMm);
  const symRow = findRangeRow(ISO2768_SYMMETRY_TABLE, nominalMm);
  const runoutVal = ISO2768_RUNOUT_VALUES[geomClass];

  const warning =
    !Number.isFinite(nominalMm) || nominalMm <= 0
      ? "请输入大于 0 的要素公称长度 (mm)。"
      : nominalMm > 3000
        ? "ISO 2768-2 直线度/平面度/垂直度/对称度表仅覆盖至 3000 mm，超出请单独标注。"
        : null;

  let derivedCircularityMaxMm: number | null = null;
  let derivedParallelismMaxMm: number | null = null;
  if (pairedLinearClass && nominalMm >= 0.5 && nominalMm <= 4000) {
    const lin = lookupIso2768Linear(nominalMm, pairedLinearClass, "linear");
    if (lin.bandWidthMm !== null) {
      // ISO 2768-2 §5.1.2: Circularity = diameter tolerance band, capped at circular run-out
      derivedCircularityMaxMm = roundSafe(Math.min(lin.bandWidthMm, runoutVal), 4);
      // ISO 2768-2 §5.2.1: Parallelism = max(size tolerance band, straightness/flatness)
      const strVal = strRow ? strRow[geomClass] : null;
      derivedParallelismMaxMm =
        strVal !== null ? roundSafe(Math.max(lin.bandWidthMm, strVal), 4) : lin.bandWidthMm;
    }
  }

  return {
    nominalMm,
    geomClass,
    straightnessFlatness: {
      rangeLabel: strRow ? `${strRow.label} mm` : "> 3000 mm",
      valueMm: strRow ? strRow[geomClass] : null,
      allClasses: strRow
        ? { H: strRow.H, K: strRow.K, L: strRow.L }
        : { H: null, K: null, L: null },
    },
    perpendicularity: {
      rangeLabel: perpRow ? `${perpRow.label} mm` : "> 3000 mm",
      valueMm: perpRow ? perpRow[geomClass] : null,
      allClasses: perpRow
        ? { H: perpRow.H, K: perpRow.K, L: perpRow.L }
        : { H: null, K: null, L: null },
    },
    symmetry: {
      rangeLabel: symRow ? `${symRow.label} mm` : "> 3000 mm",
      valueMm: symRow ? symRow[geomClass] : null,
      allClasses: symRow
        ? { H: symRow.H, K: symRow.K, L: symRow.L }
        : { H: null, K: null, L: null },
    },
    runout: {
      valueMm: runoutVal,
      allClasses: { ...ISO2768_RUNOUT_VALUES },
    },
    derivedCircularityMaxMm,
    derivedParallelismMaxMm,
    warning,
  };
}

/**
 * Evaluate a single actual measurement against bilateral or unilateral [lowerLimit, upperLimit].
 * Flags "warning" (临界预警) when inside spec but >= 80% toward either boundary.
 */
export function evaluateMeasurement(params: {
  measured: number | null;
  nominal: number;
  lowerLimit: number;
  upperLimit: number;
  unilateral?: boolean;
  unit?: string;
}): MeasurementEvaluation {
  const { measured, nominal, lowerLimit, upperLimit, unilateral = false, unit = "mm" } = params;
  if (measured === null || !Number.isFinite(measured)) {
    return {
      verdict: "pending",
      measured: null,
      nominal,
      upperLimit,
      lowerLimit,
      deviationFromNominal: null,
      marginToNearestLimit: null,
      bandUsagePercent: null,
      normalizedPosition: null,
      summaryText: "待输入实测值",
    };
  }

  const eps = 1e-9;
  const band = upperLimit - lowerLimit;
  const deviationFromNominal = roundSafe(measured - nominal, 6);

  if (unilateral) {
    // GD&T style: [0, upperLimit]
    const margin = roundSafe(upperLimit - measured, 6);
    const usage = upperLimit > 0 ? roundSafe((measured / upperLimit) * 100, 1) : 0;
    const norm = upperLimit > 0 ? (measured / upperLimit) * 2 - 1 : 0;
    if (measured < -eps || measured > upperLimit + eps) {
      return {
        verdict: "ng",
        measured,
        nominal,
        upperLimit,
        lowerLimit,
        deviationFromNominal,
        marginToNearestLimit: margin,
        bandUsagePercent: usage,
        normalizedPosition: norm,
        summaryText: `超差 ${Math.abs(margin).toFixed(4)} ${unit}（上限 ${upperLimit} ${unit}）`,
      };
    }
    const isWarning = usage >= 80;
    return {
      verdict: isWarning ? "warning" : "ok",
      measured,
      nominal,
      upperLimit,
      lowerLimit,
      deviationFromNominal,
      marginToNearestLimit: margin,
      bandUsagePercent: usage,
      normalizedPosition: norm,
      summaryText: isWarning
        ? `临界合格（已占 ${usage.toFixed(0)}%，距上限余量 ${margin.toFixed(4)} ${unit}）`
        : `合格（余量 ${margin.toFixed(4)} ${unit}）`,
    };
  }

  const mid = (upperLimit + lowerLimit) / 2;
  const halfBand = band / 2;
  const distToUpper = upperLimit - measured;
  const distToLower = measured - lowerLimit;
  const margin = roundSafe(Math.min(distToUpper, distToLower), 6);
  const norm = halfBand > 0 ? (measured - mid) / halfBand : 0;
  const usage = halfBand > 0 ? roundSafe(Math.abs(norm) * 100, 1) : 0;

  if (measured > upperLimit + eps) {
    return {
      verdict: "ng",
      measured,
      nominal,
      upperLimit,
      lowerLimit,
      deviationFromNominal,
      marginToNearestLimit: roundSafe(distToUpper, 6),
      bandUsagePercent: usage,
      normalizedPosition: norm,
      summaryText: `超上差 +${(measured - upperLimit).toFixed(4)} ${unit}`,
    };
  }
  if (measured < lowerLimit - eps) {
    return {
      verdict: "ng",
      measured,
      nominal,
      upperLimit,
      lowerLimit,
      deviationFromNominal,
      marginToNearestLimit: roundSafe(distToLower, 6),
      bandUsagePercent: usage,
      normalizedPosition: norm,
      summaryText: `超下差 -${(lowerLimit - measured).toFixed(4)} ${unit}`,
    };
  }

  const isWarning = usage >= 80;
  const nearLabel = distToUpper <= distToLower ? "距上限" : "距下限";
  return {
    verdict: isWarning ? "warning" : "ok",
    measured,
    nominal,
    upperLimit,
    lowerLimit,
    deviationFromNominal,
    marginToNearestLimit: margin,
    bandUsagePercent: usage,
    normalizedPosition: norm,
    summaryText: isWarning
      ? `临界合格（${nearLabel}余量 ${margin.toFixed(4)} ${unit}，占比 ${usage.toFixed(0)}%）`
      : `合格（${nearLabel}余量 ${margin.toFixed(4)} ${unit}）`,
  };
}
