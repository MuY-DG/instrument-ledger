/**
 * Core Process Capability (Cp / Cpk / Pp / Ppk / Ca / Cpm) & SPC Control Chart Engine.
 * Compliant with AIAG SPC (2nd Edition), ISO 22514, and GB/T 4091.
 */
import type {
  CapabilityGrade,
  CapabilityMetrics,
  ConfidenceInterval,
  ControlLimits,
  DefectRates,
  DiagnosticItem,
  EffectiveChartType,
  HistogramBin,
  ObservedDefectSummary,
  SpcAnalysisConfig,
  SpcAnalysisResult,
  SpcSpecConfig,
  SubgroupStats,
} from "../types";
import {
  IMR_CONSTANTS,
  MAX_SUBGROUP_SIZE,
  MIN_SUBGROUP_SIZE,
  getSubgroupConstants,
} from "./constants";
import {
  computeNormalityTest,
  inverseNormalCdf,
  normalCdf,
  normalUpperTail,
  percentileSorted,
} from "./statistics";
import { detectNelsonViolations } from "./nelson";

export function classifyCapabilityGrade(cpk: number | null): CapabilityGrade {
  if (cpk === null || !Number.isFinite(cpk)) return "N/A";
  if (cpk >= 1.67) return "A+";
  if (cpk >= 1.33) return "A";
  if (cpk >= 1.0) return "B";
  if (cpk >= 0.67) return "C";
  return "D";
}

export const GRADE_META: Record<
  CapabilityGrade,
  { label: string; shortDesc: string; tone: "emerald" | "sky" | "amber" | "orange" | "rose" | "zinc" }
> = {
  "A+": {
    label: "特优 (Cpk ≥ 1.67)",
    shortDesc: "过程能力极其充足，接近 5σ~6σ 水平，可评估降频检验或成本优化",
    tone: "emerald",
  },
  A: {
    label: "充足 (1.33 ≤ Cpk < 1.67)",
    shortDesc: "满足 IATF 16949 / 精密制造量产标准，保持现行 SPC 监控即可",
    tone: "sky",
  },
  B: {
    label: "尚可 (1.00 ≤ Cpk < 1.33)",
    shortDesc: "过程能力处于临界区，存在超差风险，需加严监控并优化居中或降方差",
    tone: "amber",
  },
  C: {
    label: "不足 (0.67 ≤ Cpk < 1.00)",
    shortDesc: "过程能力不足，不良率偏高，需排查工艺参数并对出货加严筛选",
    tone: "orange",
  },
  D: {
    label: "严重不足 (Cpk < 0.67)",
    shortDesc: "过程无法满足规格要求，建议立即停线排查、100% 全检与工艺整改",
    tone: "rose",
  },
  "N/A": {
    label: "无法评估",
    shortDesc: "数据量不足、标准差为零或公差未完整配置",
    tone: "zinc",
  },
};

function computeSampleStdDev(arr: number[], mean: number): number {
  if (arr.length < 2) return 0;
  let ss = 0;
  for (let i = 0; i < arr.length; i++) {
    const d = arr[i] - mean;
    ss += d * d;
  }
  return Math.sqrt(ss / (arr.length - 1));
}

function computeConfidenceInterval(
  indexVal: number | null,
  n: number,
  df: number
): ConfidenceInterval | null {
  if (indexVal === null || !Number.isFinite(indexVal) || n < 3 || df < 1) {
    return null;
  }
  const z975 = 1.959963984540054;
  // Zhang-Stenback-Wardrop / Bissell approximation used by Minitab
  const se = Math.sqrt(1 / (9 * n) + (indexVal * indexVal) / (2 * df));
  return {
    lower: indexVal - z975 * se,
    upper: indexVal + z975 * se,
    level: 0.95,
  };
}

function computeDefectRates(
  mean: number,
  sigma: number,
  spec: SpcSpecConfig
): DefectRates {
  const hasLsl =
    (spec.toleranceType === "bilateral" || spec.toleranceType === "lower_only") &&
    spec.lsl !== null &&
    Number.isFinite(spec.lsl);
  const hasUsl =
    (spec.toleranceType === "bilateral" || spec.toleranceType === "upper_only") &&
    spec.usl !== null &&
    Number.isFinite(spec.usl);

  const belowLsl = hasLsl ? normalCdf(spec.lsl as number, mean, sigma) : 0;
  const aboveUsl = hasUsl ? normalUpperTail(spec.usl as number, mean, sigma) : 0;
  const total = Math.min(1, Math.max(0, belowLsl + aboveUsl));

  let sigmaLevel: number | null = null;
  if (total <= 0) {
    sigmaLevel = 6;
  } else if (total >= 1) {
    sigmaLevel = 0;
  } else {
    sigmaLevel = inverseNormalCdf(1 - total);
  }

  return {
    belowLsl,
    aboveUsl,
    total,
    ppmBelowLsl: belowLsl * 1_000_000,
    ppmAboveUsl: aboveUsl * 1_000_000,
    ppmTotal: total * 1_000_000,
    yieldPercent: (1 - total) * 100,
    sigmaLevel,
  };
}

function buildHistogram(
  values: number[],
  spec: SpcSpecConfig,
  iqr: number,
  requestedBins?: number | null
): { bins: HistogramBin[]; binWidth: number } {
  const n = values.length;
  if (n === 0) return { bins: [], binWidth: 0 };

  let minVal = values[0];
  let maxVal = values[0];
  for (let i = 1; i < n; i++) {
    if (values[i] < minVal) minVal = values[i];
    if (values[i] > maxVal) maxVal = values[i];
  }

  const span = maxVal - minVal;
  let binCount: number;
  if (requestedBins && requestedBins >= 4 && requestedBins <= 40) {
    binCount = Math.round(requestedBins);
  } else if (span > 0 && iqr > 0) {
    // Freedman-Diaconis rule clamped to [6, 20]
    const fdWidth = (2 * iqr) / Math.cbrt(n);
    const est = fdWidth > 0 ? Math.ceil(span / fdWidth) : Math.ceil(Math.sqrt(n));
    binCount = Math.max(6, Math.min(20, est));
  } else {
    // Sturges fallback
    binCount = Math.max(5, Math.min(16, Math.ceil(Math.log2(n) + 1)));
  }

  const effectiveSpan = span > 0 ? span : Math.max(Math.abs(minVal) * 0.02, 1);
  // Add tiny margin so max falls neatly in the last bin
  const pad = effectiveSpan * 0.005;
  const lo = minVal - pad;
  const hi = maxVal + pad;
  const binWidth = (hi - lo) / binCount;

  const counts = new Array<number>(binCount).fill(0);
  for (let i = 0; i < n; i++) {
    const idx = Math.min(binCount - 1, Math.max(0, Math.floor((values[i] - lo) / binWidth)));
    counts[idx] += 1;
  }

  const hasLsl =
    (spec.toleranceType === "bilateral" || spec.toleranceType === "lower_only") &&
    spec.lsl !== null &&
    Number.isFinite(spec.lsl);
  const hasUsl =
    (spec.toleranceType === "bilateral" || spec.toleranceType === "upper_only") &&
    spec.usl !== null &&
    Number.isFinite(spec.usl);

  let running = 0;
  const bins: HistogramBin[] = counts.map((count, index) => {
    const start = lo + index * binWidth;
    const end = start + binWidth;
    const midpoint = (start + end) / 2;
    running += count;
    const isOutOfSpec =
      (hasLsl && midpoint < (spec.lsl as number)) ||
      (hasUsl && midpoint > (spec.usl as number));
    return {
      index,
      start,
      end,
      midpoint,
      count,
      density: binWidth > 0 ? count / (n * binWidth) : 0,
      percent: (count / n) * 100,
      cumulativePercent: (running / n) * 100,
      isOutOfSpec,
    };
  });

  return { bins, binWidth };
}

function buildDiagnostics(result: {
  count: number;
  subgroupSize: number;
  subgroupCount: number;
  mean: number;
  sigmaWithin: number;
  sigmaOverall: number;
  spec: SpcSpecConfig;
  capability: CapabilityMetrics;
  observed: ObservedDefectSummary;
  expectedWithin: DefectRates;
  isInControl: boolean;
  violationCount: number;
  normalityP: number;
  normalityValid: boolean;
}): DiagnosticItem[] {
  const items: DiagnosticItem[] = [];
  const {
    count,
    subgroupSize,
    subgroupCount,
    mean,
    sigmaWithin,
    sigmaOverall,
    spec,
    capability,
    observed,
    isInControl,
    violationCount,
    normalityP,
    normalityValid,
  } = result;

  // 1. Stability (SPC Control)
  if (!isInControl) {
    items.push({
      id: "stability-ooc",
      severity: "danger",
      title: `过程未受控：检出 ${violationCount} 处 SPC 判异信号`,
      detail:
        "统计受控是评估 CPK 的前提。请切换至「SPC 控制图」排查红色标出的失控点，先消除特殊原因变异（如换刀、调机、混料），再重新评估短期过程能力。",
    });
  } else {
    items.push({
      id: "stability-ok",
      severity: "success",
      title: "过程统计受控（无启用判异信号）",
      detail: `全部 ${subgroupCount} 个${subgroupSize === 1 ? "单值点" : "子组"}均处于受控状态，当前 Cpk 评估具备良好的统计有效性。`,
    });
  }

  // 2. Centering opportunity (Cp high vs Cpk low)
  if (
    spec.toleranceType === "bilateral" &&
    spec.usl !== null &&
    spec.lsl !== null &&
    capability.cp !== null &&
    capability.cpk !== null &&
    capability.ca !== null
  ) {
    const absCa = Math.abs(capability.ca);
    const midpoint = (spec.usl + spec.lsl) / 2;
    const shift = mean - midpoint;
    if (absCa >= 0.15 && capability.cp - capability.cpk >= 0.15) {
      const dir = shift > 0 ? "偏向上公差 (USL)" : "偏向下公差 (LSL)";
      const correction = shift > 0 ? `-${Math.abs(shift).toFixed(4)}` : `+${Math.abs(shift).toFixed(4)}`;
      items.push({
        id: "centering-shift",
        severity: capability.cpk < spec.cpkThreshold ? "warning" : "info",
        title: `过程中心显著偏移（Ca = ${(capability.ca * 100).toFixed(1)}%，${dir}）`,
        detail: `固有离散潜力 Cp = ${capability.cp.toFixed(2)}，但偏移拉低了 Cpk 至 ${capability.cpk.toFixed(2)}。若仅将均值向公差中心微调 ${correction}，Cpk 理论上可立即提升至约 ${capability.cp.toFixed(2)}（无需降低设备方差）。`,
      });
    } else if (capability.cp < spec.cpkThreshold) {
      items.push({
        id: "spread-wide",
        severity: "danger",
        title: `过程固有离散过大（Cp = ${capability.cp.toFixed(2)} < ${spec.cpkThreshold.toFixed(2)}）`,
        detail:
          "即使将均值完全居中，6σ 散布宽度仍相对公差带偏宽。需从设备精度、夹具刚性、材料一致性或量具 MSA（GR&R）入手压缩普通原因变异。",
      });
    }
  } else if (capability.cpk !== null && capability.cpk < spec.cpkThreshold) {
    items.push({
      id: "unilateral-low",
      severity: "warning",
      title: `单边过程能力未达目标（Cpk = ${capability.cpk.toFixed(2)} < ${spec.cpkThreshold.toFixed(2)}）`,
      detail:
        spec.toleranceType === "upper_only"
          ? "建议降低过程均值并压缩波动幅度，增大均值至上公差 USL 的安全余量。"
          : "建议提高过程均值并压缩波动幅度，增大均值至下公差 LSL 的安全余量。",
    });
  }

  // 3. Within vs Overall drift (Cp vs Pp)
  if (sigmaWithin > 0 && sigmaOverall > 0) {
    const ratio = sigmaOverall / sigmaWithin;
    if (ratio > 1.25) {
      items.push({
        id: "between-subgroup-drift",
        severity: "warning",
        title: `组间漂移明显（整体 σ 约为组内 σ 的 ${ratio.toFixed(2)} 倍）`,
        detail: `短期组内能力 (${capability.cpk?.toFixed(2) ?? "—"}) 明显优于长期整体表现 (${capability.ppk?.toFixed(2) ?? "—"})，说明单次加工波动小但随时间/班次/批次存在漂移，建议检查刀具磨损补偿或换批首件校准。`,
      });
    }
  }

  // 4. Observed OOS
  if (observed.totalOosCount > 0) {
    items.push({
      id: "observed-oos",
      severity: "danger",
      title: `实测样本存在 ${observed.totalOosCount} 件超差（不良率 ${((observed.totalOosCount / count) * 100).toFixed(2)}%）`,
      detail: `其中低于 LSL ${observed.belowLslCount} 件、高于 USL ${observed.aboveUslCount} 件，建议对本批次执行隔离筛选并在「正态性与明细」表中核对具体超差序号。`,
    });
  }

  // 5. Normality check
  if (normalityValid && normalityP < 0.05) {
    items.push({
      id: "non-normal",
      severity: "warning",
      title: `正态性检验未通过（Anderson-Darling p = ${normalityP < 0.001 ? "< 0.001" : normalityP.toFixed(3)} < 0.05）`,
      detail:
        "样本分布显著偏离正态（可能存在偏态、混料、双模腔或截断筛选），基于正态分布计算的 PPM 与 Cpk 可能失真，请结合「正态概率图」排查混合源或改用非正态拟合。",
    });
  }

  // 6. Sample size advisory
  if (count < 30) {
    items.push({
      id: "sample-small",
      severity: "info",
      title: `当前样本量偏少（N = ${count}），置信区间较宽`,
      detail:
        "IATF 16949 建议短期过程能力研究至少采集 30 件数据，PPAP 初始过程研究建议采集 ≥ 100 件（如 25 组 × 4~5 件）以获得稳定的 Cpk/Ppk 估计。",
    });
  }

  return items;
}

function createInvalidResult(
  values: number[],
  config: SpcAnalysisConfig,
  errorMessage: string
): SpcAnalysisResult {
  const emptyLimits: ControlLimits = { ucl: 0, cl: 0, lcl: 0, sigma: 0 };
  const emptyDefect: DefectRates = {
    belowLsl: 0,
    aboveUsl: 0,
    total: 0,
    ppmBelowLsl: 0,
    ppmAboveUsl: 0,
    ppmTotal: 0,
    yieldPercent: 100,
    sigmaLevel: null,
  };
  return {
    valid: false,
    errorMessage,
    values,
    count: values.length,
    spec: config.spec,
    subgroupSize: config.subgroupSize,
    effectiveChartType: config.subgroupSize <= 1 ? "imr" : "xbar_r",
    subgroups: [],
    droppedTrailingCount: 0,
    mean: 0,
    median: 0,
    min: 0,
    max: 0,
    range: 0,
    q1: 0,
    q3: 0,
    iqr: 0,
    skewness: 0,
    kurtosis: 0,
    sigmaWithin: 0,
    sigmaOverall: 0,
    sigmaWithinMethod: "",
    capability: {
      cp: null,
      cpu: null,
      cpl: null,
      cpk: null,
      cpkCi: null,
      pp: null,
      ppu: null,
      ppl: null,
      ppk: null,
      ppkCi: null,
      ca: null,
      cpm: null,
      cr: null,
      centeredPotentialCpk: null,
      grade: "N/A",
      meetsTarget: null,
    },
    observed: {
      belowLslCount: 0,
      aboveUslCount: 0,
      totalOosCount: 0,
      inSpecCount: values.length,
      ppmTotal: 0,
      yieldPercent: 100,
      oosIndices: [],
    },
    expectedWithin: emptyDefect,
    expectedOverall: emptyDefect,
    primaryChartTitle: "I 单值控制图",
    secondaryChartTitle: "MR 移动极差图",
    primaryLimits: emptyLimits,
    secondaryLimits: emptyLimits,
    primarySeries: [],
    secondarySeries: [],
    violations: [],
    primaryViolationPointSet: new Set(),
    secondaryViolationPointSet: new Set(),
    isInControl: true,
    histogram: [],
    binWidth: 0,
    normality: {
      valid: false,
      andersonDarling: 0,
      adAdjusted: 0,
      pValue: 1,
      isNormal: true,
      points: [],
    },
    diagnostics: [],
  };
}

/**
 * Run complete CPK / PPK / SPC Control Chart / Normality / Nelson Rules analysis.
 */
export function runSpcAnalysis(
  rawValues: number[],
  config: SpcAnalysisConfig
): SpcAnalysisResult {
  const values = rawValues.filter((v) => Number.isFinite(v));
  const { spec } = config;

  // Validate specification limits
  if (spec.toleranceType === "bilateral") {
    if (
      spec.usl === null ||
      spec.lsl === null ||
      !Number.isFinite(spec.usl) ||
      !Number.isFinite(spec.lsl)
    ) {
      return createInvalidResult(values, config, "双边公差模式需要同时填写有效上公差 (USL) 与下公差 (LSL)。");
    }
    if (spec.usl <= spec.lsl) {
      return createInvalidResult(values, config, "上公差 (USL) 必须严格大于下公差 (LSL)。");
    }
  } else if (spec.toleranceType === "upper_only") {
    if (spec.usl === null || !Number.isFinite(spec.usl)) {
      return createInvalidResult(values, config, "单边上限（望小）模式需要填写有效上公差 (USL)。");
    }
  } else if (spec.toleranceType === "lower_only") {
    if (spec.lsl === null || !Number.isFinite(spec.lsl)) {
      return createInvalidResult(values, config, "单边下限（望大）模式需要填写有效下公差 (LSL)。");
    }
  }

  const n = values.length;
  if (n < 2) {
    return createInvalidResult(values, config, "至少需要录入 2 个有效实测数据方可计算过程能力与控制图。");
  }

  const subgroupSize = Math.max(
    MIN_SUBGROUP_SIZE,
    Math.min(MAX_SUBGROUP_SIZE, Math.floor(config.subgroupSize) || 1)
  );

  // Determine effective chart type
  let effectiveChartType: EffectiveChartType;
  if (subgroupSize === 1 || config.chartMode === "imr") {
    effectiveChartType = "imr";
  } else if (config.chartMode === "xbar_s") {
    effectiveChartType = "xbar_s";
  } else if (config.chartMode === "xbar_r") {
    effectiveChartType = "xbar_r";
  } else {
    // Auto: Xbar-R for 2 <= n <= 10, Xbar-S for n > 10 (AIAG standard)
    effectiveChartType = subgroupSize <= 10 ? "xbar_r" : "xbar_s";
  }

  // When forced to I-MR, treat subgroup size as 1 for chart structure
  const effectiveSubgroupSize = effectiveChartType === "imr" ? 1 : subgroupSize;
  const fullSubgroupCount = Math.floor(n / effectiveSubgroupSize);
  if (fullSubgroupCount < 2) {
    return createInvalidResult(
      values,
      config,
      `当前样本量 N=${n} 不足以按子组大小 n=${effectiveSubgroupSize} 构成至少 2 个完整子组，请减小子组大小或补充实测数据。`
    );
  }
  const droppedTrailingCount = n - fullSubgroupCount * effectiveSubgroupSize;

  // Descriptive statistics on ALL valid readings
  let sum = 0;
  for (let i = 0; i < n; i++) sum += values[i];
  const mean = sum / n;
  const sigmaOverall = computeSampleStdDev(values, mean);

  const sorted = [...values].sort((a, b) => a - b);
  const min = sorted[0];
  const max = sorted[n - 1];
  const range = max - min;
  const median = percentileSorted(sorted, 0.5);
  const q1 = percentileSorted(sorted, 0.25);
  const q3 = percentileSorted(sorted, 0.75);
  const iqr = q3 - q1;

  // Sample skewness & excess kurtosis
  let skewness = 0;
  let kurtosis = 0;
  if (sigmaOverall > 0 && n >= 3) {
    let m3 = 0;
    let m4 = 0;
    for (let i = 0; i < n; i++) {
      const z = (values[i] - mean) / sigmaOverall;
      const z2 = z * z;
      m3 += z2 * z;
      m4 += z2 * z2;
    }
    skewness = (n / ((n - 1) * (n - 2))) * m3;
    if (n >= 4) {
      kurtosis =
        ((n * (n + 1)) / ((n - 1) * (n - 2) * (n - 3))) * m4 -
        (3 * (n - 1) * (n - 1)) / ((n - 2) * (n - 3));
    }
  }

  // Build subgroups
  const subgroups: SubgroupStats[] = [];
  for (let g = 0; g < fullSubgroupCount; g++) {
    const start = g * effectiveSubgroupSize;
    const slice = values.slice(start, start + effectiveSubgroupSize);
    let sSum = 0;
    let sMin = slice[0];
    let sMax = slice[0];
    for (let j = 0; j < slice.length; j++) {
      const v = slice[j];
      sSum += v;
      if (v < sMin) sMin = v;
      if (v > sMax) sMax = v;
    }
    const sMean = sSum / slice.length;
    const sRange = sMax - sMin;
    const sStd = computeSampleStdDev(slice, sMean);
    const movingRange =
      effectiveChartType === "imr" && g > 0
        ? Math.abs(slice[0] - subgroups[g - 1].mean)
        : null;

    subgroups.push({
      index: g + 1,
      values: slice,
      startRow: start + 1,
      endRow: start + slice.length,
      mean: sMean,
      range: sRange,
      stdDev: sStd,
      movingRange,
      min: sMin,
      max: sMax,
    });
  }

  // Control chart limits & Within-subgroup Sigma estimation
  let sigmaWithin = 0;
  let sigmaWithinMethod = "";
  let withinDf = Math.max(1, n - 1);
  let primaryChartTitle = "";
  let secondaryChartTitle = "";
  let primaryLimits: ControlLimits;
  let secondaryLimits: ControlLimits;
  const primarySeries = subgroups.map((g) => g.mean);
  let secondarySeries: Array<number | null>;

  const xDoubleBar =
    subgroups.reduce((acc, g) => acc + g.mean, 0) / subgroups.length;

  if (effectiveChartType === "imr") {
    const mrs = subgroups
      .map((g) => g.movingRange)
      .filter((v): v is number => v !== null);
    const mrBar = mrs.length > 0 ? mrs.reduce((a, b) => a + b, 0) / mrs.length : 0;
    sigmaWithin = mrBar / IMR_CONSTANTS.d2;
    sigmaWithinMethod = `MR̄ / d₂(2) (d₂ = ${IMR_CONSTANTS.d2.toFixed(4)})`;
    // Effective df for MR(2) estimator ≈ 0.62 * (N - 1) (Cryer & Ryan)
    withinDf = Math.max(1, 0.62 * (n - 1));

    primaryChartTitle = "I 单值控制图 (Individual)";
    secondaryChartTitle = "MR 移动极差图 (Moving Range, span=2)";
    primaryLimits = {
      cl: xDoubleBar,
      ucl: xDoubleBar + IMR_CONSTANTS.E2 * mrBar,
      lcl: xDoubleBar - IMR_CONSTANTS.E2 * mrBar,
      sigma: sigmaWithin,
    };
    secondaryLimits = {
      cl: mrBar,
      ucl: IMR_CONSTANTS.D4 * mrBar,
      lcl: IMR_CONSTANTS.D3 * mrBar,
      sigma: mrBar > 0 ? (IMR_CONSTANTS.D4 * mrBar - mrBar) / 3 : 0,
    };
    secondarySeries = subgroups.map((g) => g.movingRange);
  } else {
    const c = getSubgroupConstants(effectiveSubgroupSize);
    if (effectiveChartType === "xbar_r") {
      const rBar = subgroups.reduce((acc, g) => acc + g.range, 0) / subgroups.length;
      sigmaWithin = rBar / c.d2;
      sigmaWithinMethod = `R̄ / d₂(${c.n}) (d₂ = ${c.d2.toFixed(4)})`;
      withinDf = Math.max(1, 0.9 * subgroups.length * (c.n - 1));

      primaryChartTitle = `X̄ 均值控制图 (子组 n = ${c.n})`;
      secondaryChartTitle = `R 极差控制图 (子组 n = ${c.n})`;
      primaryLimits = {
        cl: xDoubleBar,
        ucl: xDoubleBar + c.A2 * rBar,
        lcl: xDoubleBar - c.A2 * rBar,
        sigma: sigmaWithin / Math.sqrt(c.n),
      };
      secondaryLimits = {
        cl: rBar,
        ucl: c.D4 * rBar,
        lcl: c.D3 * rBar,
        sigma: (c.d3 / c.d2) * rBar,
      };
      secondarySeries = subgroups.map((g) => g.range);
    } else {
      const sBar = subgroups.reduce((acc, g) => acc + g.stdDev, 0) / subgroups.length;
      sigmaWithin = sBar / c.c4;
      sigmaWithinMethod = `S̄ / c₄(${c.n}) (c₄ = ${c.c4.toFixed(4)})`;
      withinDf = Math.max(1, subgroups.length * (c.n - 1));

      primaryChartTitle = `X̄ 均值控制图 (子组 n = ${c.n})`;
      secondaryChartTitle = `S 标准差控制图 (子组 n = ${c.n})`;
      primaryLimits = {
        cl: xDoubleBar,
        ucl: xDoubleBar + c.A3 * sBar,
        lcl: xDoubleBar - c.A3 * sBar,
        sigma: sigmaWithin / Math.sqrt(c.n),
      };
      secondaryLimits = {
        cl: sBar,
        ucl: c.B4 * sBar,
        lcl: c.B3 * sBar,
        sigma: sBar > 0 ? ((c.B4 - 1) * sBar) / 3 : 0,
      };
      secondarySeries = subgroups.map((g) => g.stdDev);
    }
  }

  // Capability & Performance indices
  const hasUsl =
    (spec.toleranceType === "bilateral" || spec.toleranceType === "upper_only") &&
    spec.usl !== null;
  const hasLsl =
    (spec.toleranceType === "bilateral" || spec.toleranceType === "lower_only") &&
    spec.lsl !== null;

  const tolWidth =
    spec.toleranceType === "bilateral" && spec.usl !== null && spec.lsl !== null
      ? spec.usl - spec.lsl
      : null;
  const midpoint =
    spec.toleranceType === "bilateral" && spec.usl !== null && spec.lsl !== null
      ? (spec.usl + spec.lsl) / 2
      : null;
  const targetVal = spec.target !== null && Number.isFinite(spec.target) ? spec.target : midpoint;

  const cp = tolWidth !== null && sigmaWithin > 0 ? tolWidth / (6 * sigmaWithin) : null;
  const cpu = hasUsl && sigmaWithin > 0 ? ((spec.usl as number) - mean) / (3 * sigmaWithin) : null;
  const cpl = hasLsl && sigmaWithin > 0 ? (mean - (spec.lsl as number)) / (3 * sigmaWithin) : null;
  const cpk =
    spec.toleranceType === "bilateral"
      ? cpu !== null && cpl !== null
        ? Math.min(cpu, cpl)
        : null
      : spec.toleranceType === "upper_only"
        ? cpu
        : cpl;

  const pp = tolWidth !== null && sigmaOverall > 0 ? tolWidth / (6 * sigmaOverall) : null;
  const ppu = hasUsl && sigmaOverall > 0 ? ((spec.usl as number) - mean) / (3 * sigmaOverall) : null;
  const ppl = hasLsl && sigmaOverall > 0 ? (mean - (spec.lsl as number)) / (3 * sigmaOverall) : null;
  const ppk =
    spec.toleranceType === "bilateral"
      ? ppu !== null && ppl !== null
        ? Math.min(ppu, ppl)
        : null
      : spec.toleranceType === "upper_only"
        ? ppu
        : ppl;

  const ca =
    tolWidth !== null && midpoint !== null && tolWidth > 0
      ? (mean - midpoint) / (tolWidth / 2)
      : null;

  let cpm: number | null = null;
  if (tolWidth !== null && targetVal !== null && sigmaOverall > 0) {
    const tau = Math.sqrt(sigmaOverall * sigmaOverall + (mean - targetVal) * (mean - targetVal));
    cpm = tau > 0 ? tolWidth / (6 * tau) : null;
  }

  const cr = cp !== null && cp > 0 ? 1 / cp : null;
  const cpkCi = computeConfidenceInterval(cpk, n, withinDf);
  const ppkCi = computeConfidenceInterval(ppk, n, n - 1);
  const grade = classifyCapabilityGrade(cpk);
  const meetsTarget = cpk !== null ? cpk >= spec.cpkThreshold : null;

  const capability: CapabilityMetrics = {
    cp,
    cpu,
    cpl,
    cpk,
    cpkCi,
    pp,
    ppu,
    ppl,
    ppk,
    ppkCi,
    ca,
    cpm,
    cr,
    centeredPotentialCpk: cp,
    grade,
    meetsTarget,
  };

  // Observed OOS
  let belowLslCount = 0;
  let aboveUslCount = 0;
  const oosIndices: number[] = [];
  for (let i = 0; i < n; i++) {
    const v = values[i];
    const isLow = hasLsl && v < (spec.lsl as number);
    const isHigh = hasUsl && v > (spec.usl as number);
    if (isLow) belowLslCount += 1;
    if (isHigh) aboveUslCount += 1;
    if (isLow || isHigh) oosIndices.push(i);
  }
  const totalOosCount = oosIndices.length;
  const observed: ObservedDefectSummary = {
    belowLslCount,
    aboveUslCount,
    totalOosCount,
    inSpecCount: n - totalOosCount,
    ppmTotal: (totalOosCount / n) * 1_000_000,
    yieldPercent: ((n - totalOosCount) / n) * 100,
    oosIndices,
  };

  // Expected within & overall defect rates
  const expectedWithin = computeDefectRates(mean, sigmaWithin, spec);
  const expectedOverall = computeDefectRates(mean, sigmaOverall, spec);

  // Nelson rules
  const violations = detectNelsonViolations({
    primarySeries,
    primaryLimits,
    secondarySeries,
    secondaryLimits,
    enabledRules: config.enabledRules,
  });

  const primaryViolationPointSet = new Set<number>();
  const secondaryViolationPointSet = new Set<number>();
  for (const v of violations) {
    const targetSet =
      v.chart === "primary" ? primaryViolationPointSet : secondaryViolationPointSet;
    for (const idx of v.pointIndices) targetSet.add(idx);
  }
  const isInControl = violations.length === 0;

  // Histogram & Normality
  const { bins: histogram, binWidth } = buildHistogram(
    values,
    spec,
    iqr,
    config.histogramBins
  );
  const normality = computeNormalityTest(values, mean, sigmaOverall);

  // Engineering diagnostics
  const diagnostics = buildDiagnostics({
    count: n,
    subgroupSize: effectiveSubgroupSize,
    subgroupCount: subgroups.length,
    mean,
    sigmaWithin,
    sigmaOverall,
    spec,
    capability,
    observed,
    expectedWithin,
    isInControl,
    violationCount: violations.length,
    normalityP: normality.pValue,
    normalityValid: normality.valid,
  });

  return {
    valid: true,
    values,
    count: n,
    spec,
    subgroupSize: effectiveSubgroupSize,
    effectiveChartType,
    subgroups,
    droppedTrailingCount,
    mean,
    median,
    min,
    max,
    range,
    q1,
    q3,
    iqr,
    skewness,
    kurtosis,
    sigmaWithin,
    sigmaOverall,
    sigmaWithinMethod,
    capability,
    observed,
    expectedWithin,
    expectedOverall,
    primaryChartTitle,
    secondaryChartTitle,
    primaryLimits,
    secondaryLimits,
    primarySeries,
    secondarySeries,
    violations,
    primaryViolationPointSet,
    secondaryViolationPointSet,
    isInControl,
    histogram,
    binWidth,
    normality,
    diagnostics,
  };
}
