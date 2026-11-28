export type ToleranceType = "bilateral" | "upper_only" | "lower_only";

export type SpcChartMode = "auto" | "imr" | "xbar_r" | "xbar_s";

export type EffectiveChartType = "imr" | "xbar_r" | "xbar_s";

export type NelsonRuleId = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;

export type NelsonPresetId = "basic" | "weco" | "nelson_all";

export type CapabilityGrade = "A+" | "A" | "B" | "C" | "D" | "N/A";

export type SpcStage = "IQC" | "IPQC" | "FQC" | "OQC" | "PPAP" | "MSA";

export interface SpcMetadata {
  partName: string;
  characteristic: string;
  unit: string;
  lotNo: string;
  machine: string;
  stage: SpcStage;
  operator: string;
  notes: string;
}

export interface SpcSpecConfig {
  toleranceType: ToleranceType;
  usl: number | null;
  lsl: number | null;
  target: number | null;
  /** Target Cpk passing criterion (typically 1.33, or 1.67 for automotive CC/SC). */
  cpkThreshold: number;
}

export interface SpcAnalysisConfig {
  spec: SpcSpecConfig;
  subgroupSize: number;
  chartMode: SpcChartMode;
  enabledRules: NelsonRuleId[];
  /** Optional custom histogram bin count (null = auto Freedman-Diaconis / Sturges). */
  histogramBins?: number | null;
}

export interface SubgroupStats {
  index: number; // 1-based subgroup index
  values: number[];
  startRow: number; // 1-based original sample start index
  endRow: number; // 1-based original sample end index
  mean: number;
  range: number;
  stdDev: number;
  movingRange: number | null; // only populated for n=1 (index >= 2)
  min: number;
  max: number;
}

export interface ControlLimits {
  ucl: number;
  cl: number;
  lcl: number;
  sigma: number; // 1-sigma step of the plotted statistic
}

export interface NelsonViolation {
  ruleId: NelsonRuleId;
  chart: "primary" | "secondary";
  /** 0-based indices into the plotted series involved in this violation. */
  pointIndices: number[];
  /** 0-based index of the triggering point (typically the last point of the pattern). */
  triggerIndex: number;
  title: string;
  detail: string;
}

export interface HistogramBin {
  index: number;
  start: number;
  end: number;
  midpoint: number;
  count: number;
  density: number;
  percent: number;
  cumulativePercent: number;
  isOutOfSpec: boolean;
}

export interface NormalityResult {
  valid: boolean;
  andersonDarling: number;
  adAdjusted: number;
  pValue: number;
  isNormal: boolean; // pValue >= 0.05
  points: Array<{
    value: number;
    expectedZ: number;
    percentile: number;
    fittedValue: number;
  }>;
}

export interface ConfidenceInterval {
  lower: number;
  upper: number;
  level: number; // 0.95
}

export interface CapabilityMetrics {
  cp: number | null;
  cpu: number | null;
  cpl: number | null;
  cpk: number | null;
  cpkCi: ConfidenceInterval | null;
  pp: number | null;
  ppu: number | null;
  ppl: number | null;
  ppk: number | null;
  ppkCi: ConfidenceInterval | null;
  /** Signed centering offset ratio (mean - midpoint) / (half tolerance). */
  ca: number | null;
  /** Taguchi capability index relative to target T. */
  cpm: number | null;
  /** Process performance ratio CR = 1 / Cp (or null). */
  cr: number | null;
  /** Potential Cpk if process mean is perfectly centered at midpoint. */
  centeredPotentialCpk: number | null;
  grade: CapabilityGrade;
  meetsTarget: boolean | null;
}

export interface DefectRates {
  belowLsl: number; // probability 0..1
  aboveUsl: number; // probability 0..1
  total: number; // probability 0..1
  ppmBelowLsl: number;
  ppmAboveUsl: number;
  ppmTotal: number;
  yieldPercent: number;
  sigmaLevel: number | null; // Z_bench = Phi^-1(1 - total)
}

export interface ObservedDefectSummary {
  belowLslCount: number;
  aboveUslCount: number;
  totalOosCount: number;
  inSpecCount: number;
  ppmTotal: number;
  yieldPercent: number;
  oosIndices: number[]; // 0-based raw data indices
}

export interface DiagnosticItem {
  id: string;
  severity: "success" | "info" | "warning" | "danger";
  title: string;
  detail: string;
}

export interface SpcAnalysisResult {
  valid: boolean;
  errorMessage?: string;
  /** Raw numeric sample values in measurement order. */
  values: number[];
  count: number;
  spec: SpcSpecConfig;
  subgroupSize: number;
  effectiveChartType: EffectiveChartType;
  subgroups: SubgroupStats[];
  /** Number of trailing values excluded from complete subgroups (when n > 1 and count % n !== 0). */
  droppedTrailingCount: number;

  // Descriptive statistics
  mean: number;
  median: number;
  min: number;
  max: number;
  range: number;
  q1: number;
  q3: number;
  iqr: number;
  skewness: number;
  kurtosis: number; // excess kurtosis
  sigmaWithin: number;
  sigmaOverall: number;
  sigmaWithinMethod: string;

  // Indices & Defect Rates
  capability: CapabilityMetrics;
  observed: ObservedDefectSummary;
  expectedWithin: DefectRates;
  expectedOverall: DefectRates;

  // Control charts & Nelson rules
  primaryChartTitle: string;
  secondaryChartTitle: string;
  primaryLimits: ControlLimits;
  secondaryLimits: ControlLimits;
  primarySeries: number[];
  secondarySeries: Array<number | null>;
  violations: NelsonViolation[];
  primaryViolationPointSet: Set<number>;
  secondaryViolationPointSet: Set<number>;
  isInControl: boolean;

  // Distribution & Normality
  histogram: HistogramBin[];
  binWidth: number;
  normality: NormalityResult;

  // Actionable Engineering Diagnostics
  diagnostics: DiagnosticItem[];
}

export interface SpcPreset {
  id: string;
  name: string;
  stage: SpcStage;
  tag: string;
  description: string;
  meta: SpcMetadata;
  spec: SpcSpecConfig;
  subgroupSize: number;
  chartMode: SpcChartMode;
  values: number[];
}

export interface SavedSpcRecord {
  id: string;
  createdAt: string;
  meta: SpcMetadata;
  spec: SpcSpecConfig;
  subgroupSize: number;
  chartMode: SpcChartMode;
  enabledRules: NelsonRuleId[];
  values: number[];
  // Cached headline metrics for instant list display
  count: number;
  mean: number;
  sigmaWithin: number;
  sigmaOverall: number;
  cp: number | null;
  cpk: number | null;
  pp: number | null;
  ppk: number | null;
  grade: CapabilityGrade;
  oosCount: number;
  violationCount: number;
  normalityP: number;
}
