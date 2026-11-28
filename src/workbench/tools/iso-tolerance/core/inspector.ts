/**
 * Batch Dimensional Checksheet Resolver & Pass/Fail Evaluator.
 * Resolves mixed ISO 2768-1/2, ISO 286 Hole/Shaft, and Custom ± tolerance rows into unified inspection verdicts.
 */
import type {
  ChecksheetItem,
  ResolvedChecksheetRow,
} from "../types";
import {
  evaluateMeasurement,
  lookupIso2768Angular,
  lookupIso2768Geom,
  lookupIso2768Linear,
} from "./iso2768";
import {
  formatSignedMicrons,
  resolveIso286Zone,
} from "./iso286Engine";

const GDT_LABELS: Record<
  NonNullable<ChecksheetItem["gdtKind"]>,
  string
> = {
  straightness_flatness: "直线/平面度",
  perpendicularity: "垂直度",
  symmetry: "对称度",
  runout: "圆跳动",
};

export function resolveChecksheetItem(item: ChecksheetItem): ResolvedChecksheetRow {
  const emptyEval = evaluateMeasurement({
    measured: null,
    nominal: item.nominal,
    lowerLimit: item.nominal,
    upperLimit: item.nominal,
    unit: item.unit,
  });

  if (item.mode === "iso2768_linear" || item.mode === "iso2768_chamfer") {
    const cls = item.iso2768LinearClass ?? "m";
    const kind = item.mode === "iso2768_chamfer" ? "chamfer" : "linear";
    const res = lookupIso2768Linear(item.nominal, cls, kind);
    const prefix = kind === "chamfer" ? "倒角/R" : "线性";
    const specLabel =
      res.toleranceMm !== null
        ? `ISO 2768-${cls} (${prefix} ±${res.toleranceMm})`
        : `ISO 2768-${cls} (${prefix} 无定义)`;
    if (res.toleranceMm === null || res.upperLimitMm === null || res.lowerLimitMm === null) {
      return {
        item,
        standardSpecLabel: specLabel,
        upperDev: null,
        lowerDev: null,
        upperLimit: null,
        lowerLimit: null,
        unilateral: false,
        evaluation: emptyEval,
        error: res.warning ?? "超出 ISO 2768-1 查表范围",
      };
    }
    return {
      item,
      standardSpecLabel: specLabel,
      upperDev: res.toleranceMm,
      lowerDev: -res.toleranceMm,
      upperLimit: res.upperLimitMm,
      lowerLimit: res.lowerLimitMm,
      unilateral: false,
      evaluation: evaluateMeasurement({
        measured: item.measured,
        nominal: item.nominal,
        lowerLimit: res.lowerLimitMm,
        upperLimit: res.upperLimitMm,
        unit: "mm",
      }),
      error: null,
    };
  }

  if (item.mode === "iso2768_angular") {
    const cls = item.iso2768LinearClass ?? "m";
    const shortSide = item.shortSideMm && item.shortSideMm > 0 ? item.shortSideMm : 20;
    const res = lookupIso2768Angular(item.nominal, shortSide, cls);
    return {
      item,
      standardSpecLabel: `ISO 2768-${cls} (L=${shortSide}mm, ${res.toleranceDms})`,
      upperDev: res.toleranceDeg,
      lowerDev: -res.toleranceDeg,
      upperLimit: res.upperLimitDeg,
      lowerLimit: res.lowerLimitDeg,
      unilateral: false,
      evaluation: evaluateMeasurement({
        measured: item.measured,
        nominal: item.nominal,
        lowerLimit: res.lowerLimitDeg,
        upperLimit: res.upperLimitDeg,
        unit: "°",
      }),
      error: null,
    };
  }

  if (item.mode === "iso2768_gdt") {
    const cls = item.iso2768GeomClass ?? "K";
    const gdtKind = item.gdtKind ?? "straightness_flatness";
    const res = lookupIso2768Geom(item.nominal, cls);
    let val: number | null = null;
    if (gdtKind === "straightness_flatness") val = res.straightnessFlatness.valueMm;
    else if (gdtKind === "perpendicularity") val = res.perpendicularity.valueMm;
    else if (gdtKind === "symmetry") val = res.symmetry.valueMm;
    else val = res.runout.valueMm;

    const specLabel = `ISO 2768-${cls} (${GDT_LABELS[gdtKind]}${val !== null ? ` ≤${val}` : ""})`;
    if (val === null) {
      return {
        item,
        standardSpecLabel: specLabel,
        upperDev: null,
        lowerDev: null,
        upperLimit: null,
        lowerLimit: null,
        unilateral: true,
        evaluation: emptyEval,
        error: res.warning ?? "超出 ISO 2768-2 范围",
      };
    }
    return {
      item,
      standardSpecLabel: specLabel,
      upperDev: val,
      lowerDev: 0,
      upperLimit: val,
      lowerLimit: 0,
      unilateral: true,
      evaluation: evaluateMeasurement({
        measured: item.measured,
        nominal: 0,
        lowerLimit: 0,
        upperLimit: val,
        unilateral: true,
        unit: "mm",
      }),
      error: null,
    };
  }

  if (item.mode === "iso286_hole" || item.mode === "iso286_shaft") {
    const featureType = item.mode === "iso286_hole" ? "hole" : "shaft";
    const letter = item.iso286Letter ?? (featureType === "hole" ? "H" : "g");
    const grade = item.iso286Grade ?? (featureType === "hole" ? "7" : "6");
    const zone = resolveIso286Zone({
      nominalMm: item.nominal,
      featureType,
      letter,
      grade,
    });
    if (!zone.valid) {
      return {
        item,
        standardSpecLabel: `ISO 286 ${zone.designation}`,
        upperDev: null,
        lowerDev: null,
        upperLimit: null,
        lowerLimit: null,
        unilateral: false,
        evaluation: emptyEval,
        error: zone.error ?? "ISO 286 参数无效",
      };
    }
    return {
      item,
      standardSpecLabel: `${zone.designation} (${formatSignedMicrons(zone.upperDevMicrons)}/${formatSignedMicrons(zone.lowerDevMicrons)} µm)`,
      upperDev: zone.upperDevMm,
      lowerDev: zone.lowerDevMm,
      upperLimit: zone.maxSizeMm,
      lowerLimit: zone.minSizeMm,
      unilateral: false,
      evaluation: evaluateMeasurement({
        measured: item.measured,
        nominal: item.nominal,
        lowerLimit: zone.minSizeMm,
        upperLimit: zone.maxSizeMm,
        unit: "mm",
      }),
      error: null,
    };
  }

  // Custom bilateral / asymmetric tolerance
  const up = item.customUpperDevMm ?? 0.05;
  const lo = item.customLowerDevMm ?? -0.05;
  const upperLimit = Number((item.nominal + up).toFixed(6));
  const lowerLimit = Number((item.nominal + lo).toFixed(6));
  if (upperLimit <= lowerLimit) {
    return {
      item,
      standardSpecLabel: "自定义公差",
      upperDev: up,
      lowerDev: lo,
      upperLimit: null,
      lowerLimit: null,
      unilateral: false,
      evaluation: emptyEval,
      error: "上偏差必须大于下偏差",
    };
  }
  const sym = Math.abs(up + lo) < 1e-9;
  const specLabel = sym
    ? `图纸自注 ±${up}`
    : `图纸自注 ${up >= 0 ? `+${up}` : up} / ${lo >= 0 ? `+${lo}` : lo}`;
  return {
    item,
    standardSpecLabel: specLabel,
    upperDev: up,
    lowerDev: lo,
    upperLimit,
    lowerLimit,
    unilateral: false,
    evaluation: evaluateMeasurement({
      measured: item.measured,
      nominal: item.nominal,
      lowerLimit,
      upperLimit,
      unit: item.unit,
    }),
    error: null,
  };
}

export interface ChecksheetSummary {
  total: number;
  okCount: number;
  warningCount: number;
  ngCount: number;
  pendingCount: number;
  measuredCount: number;
  passRatePercent: number | null;
  overallVerdict: "PASS" | "FAIL" | "PENDING";
}

export function summarizeChecksheet(
  rows: readonly ResolvedChecksheetRow[]
): ChecksheetSummary {
  let okCount = 0;
  let warningCount = 0;
  let ngCount = 0;
  let pendingCount = 0;

  for (const row of rows) {
    const v = row.evaluation.verdict;
    if (v === "ok") okCount += 1;
    else if (v === "warning") warningCount += 1;
    else if (v === "ng") ngCount += 1;
    else pendingCount += 1;
  }

  const measuredCount = okCount + warningCount + ngCount;
  const passRatePercent =
    measuredCount > 0
      ? Number((((okCount + warningCount) / measuredCount) * 100).toFixed(1))
      : null;

  let overallVerdict: "PASS" | "FAIL" | "PENDING" = "PENDING";
  if (ngCount > 0) overallVerdict = "FAIL";
  else if (measuredCount > 0 && pendingCount === 0) overallVerdict = "PASS";
  else if (measuredCount > 0) overallVerdict = "PASS";

  return {
    total: rows.length,
    okCount,
    warningCount,
    ngCount,
    pendingCount,
    measuredCount,
    passRatePercent,
    overallVerdict,
  };
}
