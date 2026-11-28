/**
 * Domain types for ISO 2768 & ISO 286 Limits, Fits & Tolerance Quick Reference Workbench.
 * Covers ISO 2768-1/2 (GB/T 1804 & GB/T 1184) and ISO 286-1/2 (GB/T 1800.1/2 & GB/T 1801).
 */

/* ===================== ISO 2768-1 & ISO 2768-2 ===================== */

export type Iso2768LinearClass = "f" | "m" | "c" | "v";
export type Iso2768GeomClass = "H" | "K" | "L";

export type Iso2768FeatureKind =
  | "linear"
  | "chamfer"
  | "angular"
  | "straightness_flatness"
  | "perpendicularity"
  | "symmetry"
  | "runout";

export type StandardSystemLabel = "iso" | "gb";

export interface Iso2768RangeRow {
  id: string;
  label: string;
  minExclusive: boolean;
  min: number;
  max: number | null; // null = unbounded upper
}

export interface Iso2768LinearRow extends Iso2768RangeRow {
  f: number | null;
  m: number | null;
  c: number | null;
  v: number | null;
}

export interface Iso2768AngularRow extends Iso2768RangeRow {
  /** Tolerance in arc-minutes (±') */
  f: number;
  m: number;
  c: number;
  v: number;
}

export interface Iso2768GeomRow extends Iso2768RangeRow {
  H: number;
  K: number;
  L: number;
}

export interface Iso2768LinearEvaluation {
  kind: "linear" | "chamfer";
  nominal: number;
  linearClass: Iso2768LinearClass;
  rangeLabel: string;
  rangeId: string | null;
  toleranceMm: number | null; // ± mm
  upperLimitMm: number | null;
  lowerLimitMm: number | null;
  bandWidthMm: number | null;
  warning: string | null;
  allClasses: Record<Iso2768LinearClass, number | null>;
}

export interface Iso2768AngularEvaluation {
  kind: "angular";
  nominalDeg: number;
  shortSideMm: number;
  linearClass: Iso2768LinearClass;
  rangeLabel: string;
  rangeId: string | null;
  toleranceArcMin: number;
  toleranceDeg: number;
  toleranceDms: string;
  upperLimitDeg: number;
  lowerLimitDeg: number;
  /** Equivalent tangent chord deviation at end of shorter side: L * tan(Δθ) in mm */
  chordDeviationMm: number;
  allClasses: Record<Iso2768LinearClass, { arcMin: number; deg: number; dms: string }>;
}

export interface Iso2768GeomEvaluation {
  nominalMm: number;
  geomClass: Iso2768GeomClass;
  straightnessFlatness: {
    rangeLabel: string;
    valueMm: number | null;
    allClasses: Record<Iso2768GeomClass, number | null>;
  };
  perpendicularity: {
    rangeLabel: string;
    valueMm: number | null;
    allClasses: Record<Iso2768GeomClass, number | null>;
  };
  symmetry: {
    rangeLabel: string;
    valueMm: number | null;
    allClasses: Record<Iso2768GeomClass, number | null>;
  };
  runout: {
    valueMm: number;
    allClasses: Record<Iso2768GeomClass, number>;
  };
  /** ISO 2768-2 derived circularity cap: min(diameter linear tol * 2, circular runout) */
  derivedCircularityMaxMm: number | null;
  /** ISO 2768-2 derived parallelism cap: max(linear size tol * 2, flatness/straightness) */
  derivedParallelismMaxMm: number | null;
  warning: string | null;
}

/* ===================== ISO 286-1 & ISO 286-2 ===================== */

export type Iso286FeatureType = "hole" | "shaft";

export type Iso286ItGrade =
  | "01"
  | "0"
  | "1"
  | "2"
  | "3"
  | "4"
  | "5"
  | "6"
  | "7"
  | "8"
  | "9"
  | "10"
  | "11"
  | "12"
  | "13"
  | "14"
  | "15"
  | "16"
  | "17"
  | "18";

export type Iso286ShaftLetter =
  | "a"
  | "b"
  | "c"
  | "cd"
  | "d"
  | "e"
  | "ef"
  | "f"
  | "fg"
  | "g"
  | "h"
  | "js"
  | "j"
  | "k"
  | "m"
  | "n"
  | "p"
  | "r"
  | "s"
  | "t"
  | "u"
  | "v"
  | "x"
  | "y"
  | "z"
  | "za"
  | "zb"
  | "zc";

export type Iso286HoleLetter = Uppercase<Iso286ShaftLetter>;

export type FitBasisMode = "hole_basis" | "shaft_basis" | "custom";
export type FitNature = "clearance" | "transition" | "interference";

export interface Iso286ZoneResult {
  valid: boolean;
  error?: string;
  featureType: Iso286FeatureType;
  nominalMm: number;
  letter: string;
  grade: Iso286ItGrade;
  designation: string; // e.g. "H7" or "g6"
  stepLabel: string;
  subStepLabel: string;
  /** Tolerance band width IT in µm */
  itMicrons: number;
  /** Upper deviation (ES or es) in µm */
  upperDevMicrons: number;
  /** Lower deviation (EI or ei) in µm */
  lowerDevMicrons: number;
  /** Upper deviation in mm */
  upperDevMm: number;
  /** Lower deviation in mm */
  lowerDevMm: number;
  /** Maximum limit of size in mm */
  maxSizeMm: number;
  /** Minimum limit of size in mm */
  minSizeMm: number;
  /** Midpoint limit of size in mm */
  midSizeMm: number;
  /** Delta correction applied for hole K..ZC (0 if none) */
  deltaAppliedMicrons: number;
  /** Notes/advisories (e.g. IT14..IT18 for <=1mm) */
  advisory: string | null;
}

export interface Iso286FitResult {
  valid: boolean;
  error?: string;
  nominalMm: number;
  fitCode: string; // e.g. "H7/g6"
  hole: Iso286ZoneResult;
  shaft: Iso286ZoneResult;
  fitNature: FitNature;
  fitNatureLabel: string;
  /** Signed clearance values (µm): positive = clearance, negative = interference */
  maxClearanceMicrons: number; // ES - ei
  minClearanceMicrons: number; // EI - es
  meanClearanceMicrons: number;
  /** Fit tolerance Tf = IT_hole + IT_shaft (µm) */
  fitToleranceMicrons: number;
  /** Positive interference magnitudes (µm) when interference occurs */
  maxInterferenceMicrons: number; // max(0, -(EI - es))
  minInterferenceMicrons: number; // max(0, -(ES - ei))
  /** Geometric proportion of fit range that yields clearance (0..100%) */
  clearanceRatioPercent: number;
  /** Recommended shrink-fit temperature delta (°C) for steel/aluminum when interference > 0 */
  shrinkFitThermal: {
    steelMinDeltaC: number;
    steelMaxDeltaC: number;
    aluminumMinDeltaC: number;
    aluminumMaxDeltaC: number;
  } | null;
  /** Recommended typical application description if standard preferred fit */
  applicationHint: string | null;
}

export interface PreferredFitSpec {
  id: string;
  basis: "hole_basis" | "shaft_basis";
  holeLetter: Iso286HoleLetter;
  holeGrade: Iso286ItGrade;
  shaftLetter: Iso286ShaftLetter;
  shaftGrade: Iso286ItGrade;
  code: string;
  nature: FitNature;
  shortLabel: string;
  application: string;
  priority: "primary" | "secondary";
}

export interface ReverseItMatch {
  grade: Iso286ItGrade;
  itMicrons: number;
  itMm: number;
  halfMm: number;
  ratioToTarget: number;
  isTighterOrEqual: boolean;
  processHint: string;
}

/* ===================== Measurement Verdict & Batch Checksheet ===================== */

export type MeasurementVerdict = "ok" | "warning" | "ng" | "pending";

export interface MeasurementEvaluation {
  verdict: MeasurementVerdict;
  measured: number | null;
  nominal: number;
  upperLimit: number;
  lowerLimit: number;
  deviationFromNominal: number | null;
  /** Distance to closest tolerance boundary; positive = inside, negative = out of spec */
  marginToNearestLimit: number | null;
  /** 0% at center, 100% at either limit, >100% out of spec (for unilateral GD&T: measured / upperLimit * 100) */
  bandUsagePercent: number | null;
  /** Normalized position in [-1, 1] where -1 = LSL, 0 = mid, +1 = USL */
  normalizedPosition: number | null;
  summaryText: string;
}

export type ChecksheetItemMode =
  | "iso2768_linear"
  | "iso2768_chamfer"
  | "iso2768_angular"
  | "iso2768_gdt"
  | "iso286_hole"
  | "iso286_shaft"
  | "custom";

export interface ChecksheetItem {
  id: string;
  /** Drawing balloon / item number */
  balloonNo: string;
  featureName: string;
  mode: ChecksheetItemMode;
  nominal: number;
  /** Auxiliary shorter side length for angular tolerances */
  shortSideMm?: number;
  /** ISO 2768 linear class (f/m/c/v) */
  iso2768LinearClass?: Iso2768LinearClass;
  /** ISO 2768 geometric class (H/K/L) */
  iso2768GeomClass?: Iso2768GeomClass;
  /** Specific GD&T type when mode === 'iso2768_gdt' */
  gdtKind?: "straightness_flatness" | "perpendicularity" | "symmetry" | "runout";
  /** ISO 286 zone designation e.g. "H7" or "g6" */
  iso286Letter?: string;
  iso286Grade?: Iso286ItGrade;
  /** Custom upper/lower deviation in mm (e.g. +0.05 / -0.02) */
  customUpperDevMm?: number;
  customLowerDevMm?: number;
  /** Actual measured value (mm or deg) */
  measured: number | null;
  unit: "mm" | "°";
  notes?: string;
}

export interface ResolvedChecksheetRow {
  item: ChecksheetItem;
  standardSpecLabel: string;
  upperDev: number | null;
  lowerDev: number | null;
  upperLimit: number | null;
  lowerLimit: number | null;
  unilateral: boolean;
  evaluation: MeasurementEvaluation;
  error: string | null;
}

export interface ChecksheetMetadata {
  partName: string;
  drawingNo: string;
  lotNo: string;
  stage: "FAI" | "IQC" | "IPQC" | "OQC" | "ME";
  inspector: string;
  drawingStandard: string; // e.g. "ISO 2768-mK"
  notes: string;
}

export interface SavedToleranceRecord {
  id: string;
  createdAt: string;
  title: string;
  kind: "checksheet" | "fit" | "iso2768";
  meta: ChecksheetMetadata;
  items: ChecksheetItem[];
  okCount: number;
  warningCount: number;
  ngCount: number;
  pendingCount: number;
  overallVerdict: "PASS" | "FAIL" | "PENDING";
  /** Optional snapshot of active fit when saved from fit tab */
  fitSnapshot?: {
    nominalMm: number;
    holeLetter: Iso286HoleLetter;
    holeGrade: Iso286ItGrade;
    shaftLetter: Iso286ShaftLetter;
    shaftGrade: Iso286ItGrade;
    measuredHole: number | null;
    measuredShaft: number | null;
  };
}
