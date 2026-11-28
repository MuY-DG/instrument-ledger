import type {
  AqlStandardEdition,
  AqlValue,
  CodeLetter,
  DefectClassConfig,
  DefectClassEvaluation,
  InspectionLevel,
  InspectionSeverity,
  LotInspectionSummary,
  LotSizeRange,
  PrimaryCodeLetter,
  SamplingPlanQuery,
  SamplingPlanResult,
  StandardAqlValue,
  VerdictStatus,
} from "../types";
import {
  PRIMARY_CODE_LETTERS,
  STANDARD_AQL_VALUES,
  TABLE_1_LOT_RANGES,
  getMasterTableCell,
  getMasterTableRows,
  getTableReferenceLabel,
  getTableSampleSize,
} from "./tables";

/**
 * Look up Table 1 lot-size range for a given integer lot size N >= 2.
 */
export function findLotSizeRange(lotSize: number): LotSizeRange | null {
  if (!Number.isFinite(lotSize) || lotSize < 2) return null;
  for (const range of TABLE_1_LOT_RANGES) {
    if (lotSize >= range.min && (range.max === null || lotSize <= range.max)) {
      return range;
    }
  }
  return TABLE_1_LOT_RANGES[TABLE_1_LOT_RANGES.length - 1];
}

export function getCodeLetterForLot(
  lotSize: number,
  level: InspectionLevel
): { code: PrimaryCodeLetter; range: LotSizeRange | null } {
  if (lotSize <= 1) {
    return { code: "A", range: null };
  }
  const range = findLotSizeRange(lotSize);
  if (!range) {
    return { code: "A", range: null };
  }
  return { code: range.codes[level], range };
}

export function getAqlColumnIndex(aql: StandardAqlValue): number {
  const idx = STANDARD_AQL_VALUES.indexOf(aql);
  if (idx === -1) {
    throw new Error(`Unsupported AQL value: ${aql}`);
  }
  return idx;
}

/**
 * Returns the next tighter AQL value (one column left), or null if already at 0.010.
 */
export function getOneStepTighterAql(aql: AqlValue): StandardAqlValue | null {
  if (aql === 0) return null;
  const idx = STANDARD_AQL_VALUES.indexOf(aql);
  if (idx <= 0) return null;
  return STANDARD_AQL_VALUES[idx - 1];
}

/**
 * Resolve a single sampling plan according to GB/T 2828.1-2012 / ISO 2859-1 or ANSI/ASQ Z1.4.
 */
export function resolveSamplingPlan(query: SamplingPlanQuery): SamplingPlanResult {
  const { standard, level, severity, aql } = query;
  const lotSize =
    query.lotSize !== null && Number.isFinite(query.lotSize) && query.lotSize >= 1
      ? Math.floor(query.lotSize)
      : null;

  let originalCode: PrimaryCodeLetter;
  let lotRange: LotSizeRange | null = null;

  if (query.directCodeLetter) {
    originalCode = query.directCodeLetter;
  } else if (lotSize !== null) {
    const matched = getCodeLetterForLot(lotSize, level);
    originalCode = matched.code;
    lotRange = matched.range;
  } else {
    originalCode = "K";
  }

  const tableReference = getTableReferenceLabel(standard, severity);

  // Special case: Lot size = 1 (single-piece lot -> 100% inspection)
  if (lotSize === 1 && !query.directCodeLetter) {
    return {
      standard,
      severity,
      level,
      aql,
      isDefectsPerHundred: aql > 10,
      isZeroDefect: aql === 0,
      lotSize: 1,
      lotRange: null,
      originalCode: "A",
      effectiveCode: "A",
      arrowFollowed: null,
      arrowSteps: 0,
      tableSampleSize: 1,
      sampleSize: 1,
      isFullInspection: true,
      samplingRatio: 1,
      ac: 0,
      re: 1,
      hasReducedGap: false,
      tableReference: `${tableReference} · 单件全检`,
    };
  }

  // Special case: AQL = 0 (Zero-defect critical rule: Ac=0, Re=1 using code's sample size)
  if (aql === 0) {
    const tableSampleSize = getTableSampleSize(originalCode, severity);
    const isFullInspection = lotSize !== null && tableSampleSize >= lotSize;
    const sampleSize = isFullInspection && lotSize !== null ? lotSize : tableSampleSize;
    return {
      standard,
      severity,
      level,
      aql: 0,
      isDefectsPerHundred: false,
      isZeroDefect: true,
      lotSize,
      lotRange,
      originalCode,
      effectiveCode: originalCode,
      arrowFollowed: null,
      arrowSteps: 0,
      tableSampleSize,
      sampleSize,
      isFullInspection,
      samplingRatio: lotSize !== null ? Math.min(1, sampleSize / lotSize) : null,
      ac: 0,
      re: 1,
      hasReducedGap: false,
      tableReference: `${tableReference} · 致命缺陷零接收`,
    };
  }

  const rows = getMasterTableRows(severity);
  const startRow = PRIMARY_CODE_LETTERS.indexOf(originalCode);
  const aqlIdx = getAqlColumnIndex(aql);

  let row = startRow;
  let arrowFollowed: "down" | "up" | null = null;
  let arrowSteps = 0;

  let cell = getMasterTableCell(standard, severity, row, aqlIdx);
  let safety = 0;

  while (cell.kind === "arrow" && safety < 24) {
    safety += 1;
    if (!arrowFollowed) {
      arrowFollowed = cell.direction;
    }
    const nextRow = cell.direction === "down" ? row + 1 : row - 1;
    if (nextRow < 0 || nextRow >= rows.length) {
      break;
    }
    row = nextRow;
    arrowSteps += 1;
    cell = getMasterTableCell(standard, severity, row, aqlIdx);
  }

  // Fallback guard (should never trigger with valid tables)
  const ac = cell.kind === "plan" ? cell.ac : 0;
  const re = cell.kind === "plan" ? cell.re : 1;
  const effectiveCode: CodeLetter = rows[row];
  const tableSampleSize = getTableSampleSize(effectiveCode, severity);
  const isFullInspection = lotSize !== null && tableSampleSize >= lotSize;
  const sampleSize = isFullInspection && lotSize !== null ? lotSize : tableSampleSize;

  return {
    standard,
    severity,
    level,
    aql,
    isDefectsPerHundred: aql > 10,
    isZeroDefect: false,
    lotSize,
    lotRange,
    originalCode,
    effectiveCode,
    arrowFollowed,
    arrowSteps,
    tableSampleSize,
    sampleSize,
    isFullInspection,
    samplingRatio: lotSize !== null ? Math.min(1, sampleSize / lotSize) : null,
    ac,
    re,
    hasReducedGap: re > ac + 1,
    tableReference,
  };
}

/**
 * Evaluate a single defect count against a resolved sampling plan.
 */
export function evaluateDefectCount(
  plan: SamplingPlanResult,
  defectsFound: number
): VerdictStatus {
  const d = Math.max(0, Math.floor(defectsFound));
  if (d <= plan.ac) return "accept";
  if (d >= plan.re) return "reject";
  // Falls strictly inside the ANSI Z1.4 Table II-C reduced gap (Ac < d < Re)
  return "accept_revert_normal";
}

/**
 * Resolve all three severities (Normal, Tightened, Reduced) simultaneously for side-by-side comparison.
 */
export function compareAllSeverities(params: {
  standard: AqlStandardEdition;
  lotSize: number | null;
  level: InspectionLevel;
  aql: AqlValue;
  directCodeLetter?: PrimaryCodeLetter | null;
}): Record<InspectionSeverity, SamplingPlanResult> {
  return {
    normal: resolveSamplingPlan({ ...params, severity: "normal" }),
    tightened: resolveSamplingPlan({ ...params, severity: "tightened" }),
    reduced: resolveSamplingPlan({ ...params, severity: "reduced" }),
  };
}

/**
 * Evaluate a multi-defect-class lot (Critical / Major / Minor) simultaneously.
 */
export function evaluateMultiClassLot(params: {
  standard: AqlStandardEdition;
  lotSize: number | null;
  level: InspectionLevel;
  severity: InspectionSeverity;
  directCodeLetter?: PrimaryCodeLetter | null;
  classes: DefectClassConfig[];
}): LotInspectionSummary {
  const enabledClasses = params.classes.filter((c) => c.enabled);
  const evaluations: DefectClassEvaluation[] = enabledClasses.map((cfg) => {
    const plan = resolveSamplingPlan({
      standard: params.standard,
      lotSize: params.lotSize,
      level: params.level,
      severity: params.severity,
      aql: cfg.aql,
      directCodeLetter: params.directCodeLetter,
    });
    const verdict = evaluateDefectCount(plan, cfg.defectsFound);
    return {
      config: cfg,
      plan,
      verdict,
      margin: plan.ac - Math.max(0, Math.floor(cfg.defectsFound)),
    };
  });

  // For Critical AQL=0 zero-defect class when combined with Major/Minor, align its display
  // sample size with the highest active sample size if not directly overridden.
  const maxSample = evaluations.reduce(
    (max, item) => Math.max(max, item.plan.sampleSize),
    0
  );
  const adjustedEvaluations = evaluations.map((ev) => {
    if (ev.plan.isZeroDefect && maxSample > ev.plan.sampleSize) {
      const lotSize = ev.plan.lotSize;
      const adjustedSample =
        lotSize !== null ? Math.min(lotSize, maxSample) : maxSample;
      return {
        ...ev,
        plan: {
          ...ev.plan,
          sampleSize: adjustedSample,
          isFullInspection: lotSize !== null && adjustedSample >= lotSize,
          samplingRatio: lotSize !== null ? Math.min(1, adjustedSample / lotSize) : null,
        },
      };
    }
    return ev;
  });

  const uniqueSampleSizes = new Set(
    adjustedEvaluations.map((e) => e.plan.sampleSize)
  );
  let overallVerdict: VerdictStatus = "accept";
  if (adjustedEvaluations.some((e) => e.verdict === "reject")) {
    overallVerdict = "reject";
  } else if (adjustedEvaluations.some((e) => e.verdict === "accept_revert_normal")) {
    overallVerdict = "accept_revert_normal";
  }

  return {
    overallVerdict,
    recommendedTotalSample: maxSample,
    hasMixedSampleSizes: uniqueSampleSizes.size > 1,
    evaluations: adjustedEvaluations,
  };
}
