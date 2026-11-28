export type AqlStandardEdition = "gbt2828" | "ansi_z14";

export type InspectionLevel =
  | "S-1"
  | "S-2"
  | "S-3"
  | "S-4"
  | "I"
  | "II"
  | "III";

export type InspectionSeverity = "normal" | "tightened" | "reduced";

export type InspectionStage = "IQC" | "IPQC" | "OQC" | "FQC";

export type CodeLetter =
  | "A"
  | "B"
  | "C"
  | "D"
  | "E"
  | "F"
  | "G"
  | "H"
  | "J"
  | "K"
  | "L"
  | "M"
  | "N"
  | "P"
  | "Q"
  | "R"
  | "S";

export type PrimaryCodeLetter = Exclude<CodeLetter, "S">;

/** Standard AQL scale values (percent nonconforming for <=10, defects per 100 units for >10). */
export type StandardAqlValue =
  | 0.01
  | 0.015
  | 0.025
  | 0.04
  | 0.065
  | 0.1
  | 0.15
  | 0.25
  | 0.4
  | 0.65
  | 1.0
  | 1.5
  | 2.5
  | 4.0
  | 6.5
  | 10
  | 15
  | 25
  | 40
  | 65
  | 100
  | 150
  | 250
  | 400
  | 650
  | 1000;

/** Includes 0 (Zero-defect / Critical) in addition to the 26 standard AQL values. */
export type AqlValue = 0 | StandardAqlValue;

export type RawTableCell =
  | { kind: "plan"; ac: number; re: number }
  | { kind: "arrow"; direction: "down" | "up" };

export interface LotSizeRange {
  id: string;
  min: number;
  max: number | null; // null = infinity (500,001+)
  label: string;
  codes: Record<InspectionLevel, PrimaryCodeLetter>;
}

export interface SamplingPlanQuery {
  standard: AqlStandardEdition;
  /** Lot size N (optional when querying directly by code letter). */
  lotSize: number | null;
  level: InspectionLevel;
  severity: InspectionSeverity;
  aql: AqlValue;
  /** Optional direct code letter override (bypasses Table 1 lot-size lookup). */
  directCodeLetter?: PrimaryCodeLetter | null;
}

export interface SamplingPlanResult {
  standard: AqlStandardEdition;
  severity: InspectionSeverity;
  level: InspectionLevel;
  aql: AqlValue;
  /** Whether AQL is expressed as defects per 100 units (> 10). */
  isDefectsPerHundred: boolean;
  /** Whether AQL = 0 (zero-defect custom critical rule). */
  isZeroDefect: boolean;
  /** Input lot size N (null if direct code lookup without lot size). */
  lotSize: number | null;
  /** Matched Table 1 lot size range (null if N === 1 or direct code mode). */
  lotRange: LotSizeRange | null;
  /** Original code letter from Table 1 (or direct selection). */
  originalCode: PrimaryCodeLetter;
  /** Final code letter after arrow traversal (can be 'S' under tightened inspection). */
  effectiveCode: CodeLetter;
  /** Arrow direction followed, if any. */
  arrowFollowed: "down" | "up" | null;
  /** Steps moved along the AQL column via arrows. */
  arrowSteps: number;
  /** Sample size specified by the master table row. */
  tableSampleSize: number;
  /** Effective sample size after applying the 100% inspection cap (n <= N). */
  sampleSize: number;
  /** True when lotSize is provided and tableSampleSize >= lotSize (or lotSize === 1). */
  isFullInspection: boolean;
  /** Effective sampling ratio (0..1) when lotSize is known. */
  samplingRatio: number | null;
  /** Acceptance number Ac. */
  ac: number;
  /** Rejection number Re. */
  re: number;
  /** True when Re > Ac + 1 (ANSI/ASQ Z1.4 Table II-C reduced inspection buffer gap). */
  hasReducedGap: boolean;
  /** Human-readable standard reference (e.g. "GB/T 2828.1-2012 表2-A"). */
  tableReference: string;
}

export type VerdictStatus = "accept" | "accept_revert_normal" | "reject";

export interface DefectClassConfig {
  id: "critical" | "major" | "minor";
  label: string;
  shortLabel: string;
  enabled: boolean;
  aql: AqlValue;
  defectsFound: number;
}

export interface DefectClassEvaluation {
  config: DefectClassConfig;
  plan: SamplingPlanResult;
  verdict: VerdictStatus;
  margin: number; // ac - defectsFound (>=0 means within Ac)
}

export interface LotInspectionSummary {
  overallVerdict: VerdictStatus;
  recommendedTotalSample: number;
  hasMixedSampleSizes: boolean;
  evaluations: DefectClassEvaluation[];
}

export interface OcPoint {
  /** Defect rate in percent (0..100+ for defects per 100 units). */
  pPercent: number;
  /** Acceptance probability (0..1). */
  pa: number;
  /** Average outgoing quality in percent (rectifying inspection). */
  aoqPercent: number;
}

export interface OcAnalytics {
  model: "binomial" | "poisson";
  /** Acceptance probability at p = AQL (1 - alpha). */
  paAtAql: number;
  /** Producer's risk alpha at p = AQL. */
  producerRisk: number;
  /** Indifference quality level (p% where Pa = 50%). */
  iqlPercent: number;
  /** Limiting quality / RQL (p% where Pa = 10%, consumer risk beta = 10%). */
  lq10Percent: number;
  /** Average Outgoing Quality Limit (peak AOQ%). */
  aoqlPercent: number;
  /** Defect rate p% at which AOQL occurs. */
  aoqlAtPercent: number;
  /** Sampled curve points for plotting. */
  points: OcPoint[];
  /** Suggested X-axis max in percent. */
  xMaxPercent: number;
}

export interface InspectionMeta {
  partName: string;
  lotNo: string;
  supplier: string;
  stage: InspectionStage;
  inspector: string;
  notes: string;
}

export interface SavedInspectionRecord {
  id: string;
  createdAt: string;
  standard: AqlStandardEdition;
  lotSize: number;
  level: InspectionLevel;
  severity: InspectionSeverity;
  meta: InspectionMeta;
  classes: Array<{
    id: DefectClassConfig["id"];
    label: string;
    aql: AqlValue;
    effectiveCode: CodeLetter;
    sampleSize: number;
    ac: number;
    re: number;
    defectsFound: number;
    verdict: VerdictStatus;
  }>;
  recommendedTotalSample: number;
  overallVerdict: VerdictStatus;
}

export type SwitchingState = "normal" | "tightened" | "reduced" | "discontinued";

export interface SwitchingLotEvent {
  id: string;
  lotIndex: number;
  severityUsed: InspectionSeverity;
  outcome: "accept_strict" | "accept" | "accept_gap" | "reject";
  scoreBefore: number;
  scoreAfter: number;
  nextState: SwitchingState;
  reason: string;
}
