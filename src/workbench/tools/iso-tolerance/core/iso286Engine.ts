/**
 * ISO 286-1:2010 / ISO 286-2:2010 (GB/T 1800.1-2020 & GB/T 1800.2-2020)
 * Limits, Fits, Zone Solver, Notation Parser, Reverse IT Recommender & Thermal Shrink-Fit Engine.
 */
import type {
  FitNature,
  Iso286FeatureType,
  Iso286FitResult,
  Iso286HoleLetter,
  Iso286ItGrade,
  Iso286ShaftLetter,
  Iso286ZoneResult,
  ReverseItMatch,
} from "../types";
import {
  HOLE_J_ES_500,
  ISO286_HOLE_LETTERS,
  ISO286_IT_GRADES,
  ISO286_IT_TABLE,
  ISO286_MAIN_STEPS,
  ISO286_SHAFT_LETTERS,
  ISO286_SUB_STEPS_500,
  ISO286_SUB_STEPS_LARGE,
  IT_GRADE_PROCESS_HINTS,
  SHAFT_EI_MAIN,
  SHAFT_EI_SUB500,
  SHAFT_EI_SUB_LARGE,
  SHAFT_ES_MAIN,
  SHAFT_ES_SMALL10,
  SHAFT_ES_SUB500,
  SHAFT_J_EI_500,
  SHAFT_K_EI_4_TO_7,
  type DiameterStep,
} from "./iso286Tables";
import { PREFERRED_FITS } from "./presets";

function roundMicrons(v: number): number {
  const r = Math.round(v * 100) / 100;
  return r === 0 ? 0 : r;
}

function roundMm(v: number): number {
  const r = Number(v.toFixed(6));
  return r === 0 ? 0 : r;
}

export function findMainStep(nominalMm: number): DiameterStep | null {
  if (!Number.isFinite(nominalMm) || nominalMm <= 0 || nominalMm > 3150) return null;
  for (const step of ISO286_MAIN_STEPS) {
    if (nominalMm > step.min && nominalMm <= step.max) return step;
  }
  return null;
}

export function findSubStep500(nominalMm: number): DiameterStep | null {
  if (!Number.isFinite(nominalMm) || nominalMm <= 0 || nominalMm > 500) return null;
  for (const step of ISO286_SUB_STEPS_500) {
    if (nominalMm > step.min && nominalMm <= step.max) return step;
  }
  return null;
}

export function findSubStepLarge(nominalMm: number): DiameterStep | null {
  if (!Number.isFinite(nominalMm) || nominalMm <= 500 || nominalMm > 3150) return null;
  for (const step of ISO286_SUB_STEPS_LARGE) {
    if (nominalMm > step.min && nominalMm <= step.max) return step;
  }
  return null;
}

/**
 * Look up standard tolerance IT value in micrometers (µm).
 */
export function getItMicrons(nominalMm: number, grade: Iso286ItGrade): number | null {
  const step = findMainStep(nominalMm);
  if (!step) return null;
  return ISO286_IT_TABLE[grade][step.index];
}

function parseNumericGrade(grade: Iso286ItGrade): number {
  if (grade === "01") return -1;
  return Number(grade);
}

function getPreviousGrade(grade: Iso286ItGrade): Iso286ItGrade | null {
  const idx = ISO286_IT_GRADES.indexOf(grade);
  if (idx <= 0) return null;
  return ISO286_IT_GRADES[idx - 1];
}

/**
 * Compute ISO 286-1 Delta (Δ = IT_n - IT_{n-1}) in µm for holes K..ZC up to 500 mm.
 */
export function getHoleDeltaMicrons(
  mainStepIdx: number,
  grade: Iso286ItGrade
): number {
  if (mainStepIdx > 12) return 0; // Delta only applies for ≤ 500 mm
  const num = parseNumericGrade(grade);
  if (num < 3 || num > 8) return 0;
  const prev = getPreviousGrade(grade);
  if (!prev) return 0;
  const curIt = ISO286_IT_TABLE[grade][mainStepIdx];
  const prevIt = ISO286_IT_TABLE[prev][mainStepIdx];
  if (curIt === null || prevIt === null) return 0;
  return roundMicrons(curIt - prevIt);
}

/**
 * Lookup shaft fundamental deviation value (µm) and whether it defines `es` (upper) or `ei` (lower).
 */
function lookupShaftBaseDeviation(
  nominalMm: number,
  mainIdx: number,
  letter: Iso286ShaftLetter,
  grade: Iso286ItGrade
): { kind: "es" | "ei" | "sym"; value: number; subStepLabel: string } | { error: string } {
  const isLarge = mainIdx >= 13; // > 500 mm
  const gradeNum = parseNumericGrade(grade);

  if (letter === "h") {
    return { kind: "es", value: 0, subStepLabel: ISO286_MAIN_STEPS[mainIdx].label };
  }
  if (letter === "js") {
    return { kind: "sym", value: 0, subStepLabel: ISO286_MAIN_STEPS[mainIdx].label };
  }

  // Clearance shafts a, b, c (≤ 500 mm)
  if (letter === "a" || letter === "b" || letter === "c") {
    if (isLarge) {
      return { error: `ISO 286-1 中基本偏差代号 ${letter} 仅适用于 ≤ 500 mm 尺寸段。` };
    }
    const sub = findSubStep500(nominalMm)!;
    return { kind: "es", value: SHAFT_ES_SUB500[letter][sub.index], subStepLabel: sub.label };
  }

  // Intermediate small clearance shafts cd, ef, fg (≤ 10 mm)
  if (letter === "cd" || letter === "ef" || letter === "fg") {
    if (mainIdx > 2) {
      return { error: `ISO 286-1 中中间偏差代号 ${letter} 仅适用于 ≤ 10 mm 尺寸段。` };
    }
    return {
      kind: "es",
      value: SHAFT_ES_SMALL10[letter][mainIdx],
      subStepLabel: ISO286_MAIN_STEPS[mainIdx].label,
    };
  }

  // Clearance shafts d, e, f, g (0..3150 mm)
  if (letter === "d" || letter === "e" || letter === "f" || letter === "g") {
    return {
      kind: "es",
      value: SHAFT_ES_MAIN[letter][mainIdx],
      subStepLabel: ISO286_MAIN_STEPS[mainIdx].label,
    };
  }

  // Special shaft j (j5, j6, j7 up to 500 mm; j8 only ≤ 3 mm)
  if (letter === "j") {
    if (isLarge) {
      return { error: "ISO 286-1 中轴代号 j 仅适用于 ≤ 500 mm（>500 mm 请选用 js）。" };
    }
    if (grade !== "5" && grade !== "6" && grade !== "7" && grade !== "8") {
      return { error: "ISO 286-1 中轴代号 j 仅定义了 j5 / j6 / j7（以及 ≤3mm 的 j8），其他等级请选用 js。" };
    }
    const val = SHAFT_J_EI_500[grade][mainIdx];
    if (val === null) {
      return { error: "ISO 286-1 中 j8 仅适用于 ≤ 3 mm，>3 mm 请选用 js8。" };
    }
    return { kind: "ei", value: val, subStepLabel: ISO286_MAIN_STEPS[mainIdx].label };
  }

  // Shaft k: IT4..IT7 (≤ 500 mm) use table; all other grades / >500 mm have ei = 0
  if (letter === "k") {
    if (!isLarge && gradeNum >= 4 && gradeNum <= 7) {
      return {
        kind: "ei",
        value: SHAFT_K_EI_4_TO_7[mainIdx],
        subStepLabel: ISO286_MAIN_STEPS[mainIdx].label,
      };
    }
    return { kind: "ei", value: 0, subStepLabel: ISO286_MAIN_STEPS[mainIdx].label };
  }

  // Shafts m, n, p (0..3150 mm, main steps)
  if (letter === "m" || letter === "n" || letter === "p") {
    return {
      kind: "ei",
      value: SHAFT_EI_MAIN[letter][mainIdx],
      subStepLabel: ISO286_MAIN_STEPS[mainIdx].label,
    };
  }

  // Interference shafts r..zc
  if (isLarge) {
    if (letter === "r" || letter === "s" || letter === "t" || letter === "u") {
      const sub = findSubStepLarge(nominalMm)!;
      return {
        kind: "ei",
        value: SHAFT_EI_SUB_LARGE[letter][sub.index],
        subStepLabel: sub.label,
      };
    }
    return { error: `ISO 286-1 中基本偏差代号 ${letter} 仅适用于 ≤ 500 mm 尺寸段。` };
  }

  const sub = findSubStep500(nominalMm)!;
  const val = SHAFT_EI_SUB500[letter][sub.index];
  if (val === null) {
    const threshold = letter === "t" ? "24 mm" : letter === "v" ? "14 mm" : "18 mm";
    return {
      error: `ISO 286-1 中代号 ${letter} 仅适用于公称尺寸 > ${threshold} 的尺寸段。`,
    };
  }
  return { kind: "ei", value: val, subStepLabel: sub.label };
}

/**
 * Resolve a single ISO 286-1/2 Hole or Shaft tolerance zone (e.g. Ø25 H7 or Ø25 g6).
 */
export function resolveIso286Zone(params: {
  nominalMm: number;
  featureType: Iso286FeatureType;
  letter: string;
  grade: Iso286ItGrade;
}): Iso286ZoneResult {
  const { nominalMm, featureType, grade } = params;
  const normalizedLetter =
    featureType === "hole" ? params.letter.toUpperCase() : params.letter.toLowerCase();
  const designation = `${normalizedLetter}${grade}`;

  const fail = (error: string): Iso286ZoneResult => ({
    valid: false,
    error,
    featureType,
    nominalMm,
    letter: normalizedLetter,
    grade,
    designation,
    stepLabel: "—",
    subStepLabel: "—",
    itMicrons: 0,
    upperDevMicrons: 0,
    lowerDevMicrons: 0,
    upperDevMm: 0,
    lowerDevMm: 0,
    maxSizeMm: nominalMm,
    minSizeMm: nominalMm,
    midSizeMm: nominalMm,
    deltaAppliedMicrons: 0,
    advisory: null,
  });

  if (!Number.isFinite(nominalMm) || nominalMm <= 0 || nominalMm > 3150) {
    return fail("ISO 286-1 仅适用于公称尺寸 > 0 ～ 3150 mm。");
  }

  const mainStep = findMainStep(nominalMm);
  if (!mainStep) {
    return fail("无法匹配 ISO 286-1 公称尺寸分段。");
  }

  const itMicrons = ISO286_IT_TABLE[grade][mainStep.index];
  if (itMicrons === null) {
    return fail(`> 500 mm 尺寸段未定义 IT${grade} 等级，请选用 IT6 ～ IT18。`);
  }

  const lowerLetter = normalizedLetter.toLowerCase() as Iso286ShaftLetter;
  if (!ISO286_SHAFT_LETTERS.includes(lowerLetter)) {
    return fail(`未知的基本偏差代号 "${normalizedLetter}"。`);
  }

  const gradeNum = parseNumericGrade(grade);
  let advisory: string | null = null;
  if (nominalMm <= 1 && gradeNum >= 14) {
    advisory = `ISO 286-1 注：公称尺寸 ≤ 1 mm 时原则上不推荐使用 IT${grade} 等级。`;
  }

  // Case 1: SHAFT
  if (featureType === "shaft") {
    const base = lookupShaftBaseDeviation(nominalMm, mainStep.index, lowerLetter, grade);
    if ("error" in base) return fail(base.error);

    let es: number;
    let ei: number;
    if (base.kind === "sym") {
      es = roundMicrons(itMicrons / 2);
      ei = roundMicrons(-itMicrons / 2);
    } else if (base.kind === "es") {
      es = base.value;
      ei = roundMicrons(es - itMicrons);
    } else {
      ei = base.value;
      es = roundMicrons(ei + itMicrons);
    }

    return {
      valid: true,
      featureType: "shaft",
      nominalMm,
      letter: lowerLetter,
      grade,
      designation,
      stepLabel: `${mainStep.label} mm`,
      subStepLabel: `${base.subStepLabel} mm`,
      itMicrons,
      upperDevMicrons: es,
      lowerDevMicrons: ei,
      upperDevMm: roundMm(es / 1000),
      lowerDevMm: roundMm(ei / 1000),
      maxSizeMm: roundMm(nominalMm + es / 1000),
      minSizeMm: roundMm(nominalMm + ei / 1000),
      midSizeMm: roundMm(nominalMm + (es + ei) / 2000),
      deltaAppliedMicrons: 0,
      advisory,
    };
  }

  // Case 2: HOLE (A..ZC)
  const holeLetter = normalizedLetter as Iso286HoleLetter;
  const isLarge = mainStep.index >= 13;

  // Symmetric JS
  if (holeLetter === "JS") {
    const ES = roundMicrons(itMicrons / 2);
    const EI = roundMicrons(-itMicrons / 2);
    return {
      valid: true,
      featureType: "hole",
      nominalMm,
      letter: holeLetter,
      grade,
      designation,
      stepLabel: `${mainStep.label} mm`,
      subStepLabel: `${mainStep.label} mm`,
      itMicrons,
      upperDevMicrons: ES,
      lowerDevMicrons: EI,
      upperDevMm: roundMm(ES / 1000),
      lowerDevMm: roundMm(EI / 1000),
      maxSizeMm: roundMm(nominalMm + ES / 1000),
      minSizeMm: roundMm(nominalMm + EI / 1000),
      midSizeMm: roundMm(nominalMm),
      deltaAppliedMicrons: 0,
      advisory,
    };
  }

  // Special hole J (J6, J7, J8 for ≤ 500 mm)
  if (holeLetter === "J") {
    if (isLarge) {
      return fail("ISO 286-1 中孔代号 J 仅适用于 ≤ 500 mm（>500 mm 请选用 JS）。");
    }
    if (grade !== "6" && grade !== "7" && grade !== "8") {
      return fail("ISO 286-1 中孔代号 J 仅定义了 J6 / J7 / J8，其他等级请选用 JS。");
    }
    const ES = HOLE_J_ES_500[grade][mainStep.index];
    const EI = roundMicrons(ES - itMicrons);
    return {
      valid: true,
      featureType: "hole",
      nominalMm,
      letter: holeLetter,
      grade,
      designation,
      stepLabel: `${mainStep.label} mm`,
      subStepLabel: `${mainStep.label} mm`,
      itMicrons,
      upperDevMicrons: ES,
      lowerDevMicrons: EI,
      upperDevMm: roundMm(ES / 1000),
      lowerDevMm: roundMm(EI / 1000),
      maxSizeMm: roundMm(nominalMm + ES / 1000),
      minSizeMm: roundMm(nominalMm + EI / 1000),
      midSizeMm: roundMm(nominalMm + (ES + EI) / 2000),
      deltaAppliedMicrons: 0,
      advisory,
    };
  }

  // Clearance holes A..H: exact mirror of shafts a..h (EI = -es)
  const clearanceHoleLetters: readonly Iso286HoleLetter[] = [
    "A", "B", "C", "CD", "D", "E", "EF", "F", "FG", "G", "H",
  ];
  if (clearanceHoleLetters.includes(holeLetter)) {
    const shaftMirror = lookupShaftBaseDeviation(nominalMm, mainStep.index, lowerLetter, grade);
    if ("error" in shaftMirror) return fail(shaftMirror.error.replace(lowerLetter, holeLetter));
    const EI = roundMicrons(-shaftMirror.value);
    const ES = roundMicrons(EI + itMicrons);
    return {
      valid: true,
      featureType: "hole",
      nominalMm,
      letter: holeLetter,
      grade,
      designation,
      stepLabel: `${mainStep.label} mm`,
      subStepLabel: `${shaftMirror.subStepLabel} mm`,
      itMicrons,
      upperDevMicrons: ES,
      lowerDevMicrons: EI,
      upperDevMm: roundMm(ES / 1000),
      lowerDevMm: roundMm(EI / 1000),
      maxSizeMm: roundMm(nominalMm + ES / 1000),
      minSizeMm: roundMm(nominalMm + EI / 1000),
      midSizeMm: roundMm(nominalMm + (ES + EI) / 2000),
      deltaAppliedMicrons: 0,
      advisory,
    };
  }

  // Transition & Interference holes K, M, N, P..ZC (ISO 286-1 Table 5 rules + Delta)
  let ES = 0;
  let delta = 0;
  let subStepLabel = mainStep.label;

  if (holeLetter === "K") {
    if (isLarge || gradeNum > 8) {
      ES = 0;
    } else if (mainStep.index === 0) {
      // ISO 286-1 Table 5: for ≤ 3 mm, K (≤ IT8) has ES = 0 (no delta added since k has ei=0)
      ES = 0;
    } else {
      const kEi = SHAFT_K_EI_4_TO_7[mainStep.index];
      delta = getHoleDeltaMicrons(mainStep.index, grade);
      ES = roundMicrons(-kEi + delta);
    }
  } else if (holeLetter === "M") {
    const mEi = SHAFT_EI_MAIN.m[mainStep.index];
    if (!isLarge && gradeNum <= 8) {
      // ISO 286-1 Table 5 Footnote: M6 in >250..315 mm is specifically ES = -9 µm
      if (mainStep.index === 10 && grade === "6") {
        delta = 11;
        ES = -9;
      } else {
        delta = getHoleDeltaMicrons(mainStep.index, grade);
        ES = roundMicrons(-mEi + delta);
      }
    } else {
      ES = -mEi;
    }
  } else if (holeLetter === "N") {
    const nEi = SHAFT_EI_MAIN.n[mainStep.index];
    if (!isLarge && gradeNum <= 8) {
      if (mainStep.index === 0) {
        // ISO 286-1 Table 5: for ≤ 3 mm, N has ES = -4 (no delta)
        ES = -4;
      } else {
        delta = getHoleDeltaMicrons(mainStep.index, grade);
        ES = roundMicrons(-nEi + delta);
      }
    } else if (!isLarge && gradeNum > 8) {
      // ISO 286-1 Table 5: for grades > IT8, N has ES = 0 for D > 3 mm (and -4 for ≤ 3 mm)
      ES = mainStep.index === 0 ? -4 : 0;
    } else {
      ES = -nEi;
    }
  } else {
    // P..ZC: grades ≤ IT7 (and ≤ 500 mm) add Δ; grades > IT7 or > 500 mm use -ei_shaft
    const shaftMirror = lookupShaftBaseDeviation(nominalMm, mainStep.index, lowerLetter, grade);
    if ("error" in shaftMirror) return fail(shaftMirror.error.replace(lowerLetter, holeLetter));
    subStepLabel = shaftMirror.subStepLabel;
    if (!isLarge && gradeNum <= 7 && mainStep.index > 0) {
      delta = getHoleDeltaMicrons(mainStep.index, grade);
      ES = roundMicrons(-shaftMirror.value + delta);
    } else {
      ES = -shaftMirror.value;
    }
  }

  const EI = roundMicrons(ES - itMicrons);
  return {
    valid: true,
    featureType: "hole",
    nominalMm,
    letter: holeLetter,
    grade,
    designation,
    stepLabel: `${mainStep.label} mm`,
    subStepLabel: `${subStepLabel} mm`,
    itMicrons,
    upperDevMicrons: ES,
    lowerDevMicrons: EI,
    upperDevMm: roundMm(ES / 1000),
    lowerDevMm: roundMm(EI / 1000),
    maxSizeMm: roundMm(nominalMm + ES / 1000),
    minSizeMm: roundMm(nominalMm + EI / 1000),
    midSizeMm: roundMm(nominalMm + (ES + EI) / 2000),
    deltaAppliedMicrons: delta,
    advisory,
  };
}

/**
 * Evaluate a Hole + Shaft ISO 286 fit (e.g., Ø25 H7/g6 or Ø50 K7/h6).
 */
export function resolveIso286Fit(params: {
  nominalMm: number;
  holeLetter: Iso286HoleLetter;
  holeGrade: Iso286ItGrade;
  shaftLetter: Iso286ShaftLetter;
  shaftGrade: Iso286ItGrade;
}): Iso286FitResult {
  const { nominalMm, holeLetter, holeGrade, shaftLetter, shaftGrade } = params;
  const hole = resolveIso286Zone({
    nominalMm,
    featureType: "hole",
    letter: holeLetter,
    grade: holeGrade,
  });
  const shaft = resolveIso286Zone({
    nominalMm,
    featureType: "shaft",
    letter: shaftLetter,
    grade: shaftGrade,
  });

  const fitCode = `${hole.designation}/${shaft.designation}`;

  if (!hole.valid || !shaft.valid) {
    return {
      valid: false,
      error: hole.error || shaft.error || "配合参数无效",
      nominalMm,
      fitCode,
      hole,
      shaft,
      fitNature: "clearance",
      fitNatureLabel: "无效配合",
      maxClearanceMicrons: 0,
      minClearanceMicrons: 0,
      meanClearanceMicrons: 0,
      fitToleranceMicrons: 0,
      maxInterferenceMicrons: 0,
      minInterferenceMicrons: 0,
      clearanceRatioPercent: 0,
      shrinkFitThermal: null,
      applicationHint: null,
    };
  }

  // Signed clearance = D_hole - d_shaft
  const maxClearanceMicrons = roundMicrons(hole.upperDevMicrons - shaft.lowerDevMicrons);
  const minClearanceMicrons = roundMicrons(hole.lowerDevMicrons - shaft.upperDevMicrons);
  const meanClearanceMicrons = roundMicrons((maxClearanceMicrons + minClearanceMicrons) / 2);
  const fitToleranceMicrons = roundMicrons(hole.itMicrons + shaft.itMicrons);

  let fitNature: FitNature;
  let fitNatureLabel: string;
  if (minClearanceMicrons >= 0) {
    fitNature = "clearance";
    fitNatureLabel = "间隙配合 (Clearance)";
  } else if (maxClearanceMicrons <= 0) {
    fitNature = "interference";
    fitNatureLabel = "过盈配合 (Interference)";
  } else {
    fitNature = "transition";
    fitNatureLabel = "过渡配合 (Transition)";
  }

  const maxInterferenceMicrons = Math.max(0, roundMicrons(-minClearanceMicrons));
  const minInterferenceMicrons = Math.max(0, roundMicrons(-maxClearanceMicrons));

  const clearanceRatioPercent =
    fitNature === "clearance"
      ? 100
      : fitNature === "interference"
        ? 0
        : fitToleranceMicrons > 0
          ? Number(((maxClearanceMicrons / fitToleranceMicrons) * 100).toFixed(1))
          : 50;

  // Thermal shrink-fit estimate when interference exists: ΔD = α * D * ΔT
  // Steel α ≈ 11.5e-6 /°C, Aluminum α ≈ 23.0e-6 /°C
  let shrinkFitThermal: Iso286FitResult["shrinkFitThermal"] = null;
  if (maxInterferenceMicrons > 0 && nominalMm > 0) {
    const minNeededMm = (minInterferenceMicrons > 0 ? minInterferenceMicrons : maxInterferenceMicrons * 0.5) / 1000;
    const maxNeededMm = maxInterferenceMicrons / 1000;
    const steelAlpha = 11.5e-6;
    const aluAlpha = 23.0e-6;
    shrinkFitThermal = {
      steelMinDeltaC: Math.ceil(minNeededMm / (steelAlpha * nominalMm)),
      steelMaxDeltaC: Math.ceil(maxNeededMm / (steelAlpha * nominalMm)),
      aluminumMinDeltaC: Math.ceil(minNeededMm / (aluAlpha * nominalMm)),
      aluminumMaxDeltaC: Math.ceil(maxNeededMm / (aluAlpha * nominalMm)),
    };
  }

  const matchedPreferred = PREFERRED_FITS.find((p) => p.code === fitCode);

  return {
    valid: true,
    nominalMm,
    fitCode,
    hole,
    shaft,
    fitNature,
    fitNatureLabel,
    maxClearanceMicrons,
    minClearanceMicrons,
    meanClearanceMicrons,
    fitToleranceMicrons,
    maxInterferenceMicrons,
    minInterferenceMicrons,
    clearanceRatioPercent,
    shrinkFitThermal,
    applicationHint: matchedPreferred?.application ?? null,
  };
}

/**
 * Parse a user-typed engineering fit or zone string such as:
 * "Ø25 H7/g6", "50 H7/k6", "12.5 JS7/h6", "H7/p6", "Ø30 g6", "40H7"
 */
export interface ParsedNotation {
  nominalMm: number | null;
  hole?: { letter: Iso286HoleLetter; grade: Iso286ItGrade };
  shaft?: { letter: Iso286ShaftLetter; grade: Iso286ItGrade };
}

const VALID_GRADES_SET = new Set<string>(ISO286_IT_GRADES);
const VALID_HOLES_SET = new Set<string>(ISO286_HOLE_LETTERS);
const VALID_SHAFTS_SET = new Set<string>(ISO286_SHAFT_LETTERS);

export function parseIso286Notation(raw: string): ParsedNotation | null {
  const cleaned = raw.trim().replace(/[ØøΦφ]/g, "").replace(/\s+/g, " ");
  if (!cleaned) return null;

  // Match optional leading nominal number
  const numMatch = cleaned.match(/^(\d+(?:\.\d+)?)\s*(.*)$/);
  let nominalMm: number | null = null;
  let rest = cleaned;
  if (numMatch) {
    nominalMm = Number(numMatch[1]);
    rest = numMatch[2].trim();
  }

  if (!rest) {
    return nominalMm !== null && nominalMm > 0 ? { nominalMm } : null;
  }

  // Split by "/" for fit pair (e.g. "H7/g6")
  const parts = rest.split("/").map((p) => p.trim()).filter(Boolean);
  let hole: ParsedNotation["hole"];
  let shaft: ParsedNotation["shaft"];

  for (const token of parts) {
    const m = token.match(/^([A-Za-z]{1,2})(01|\d{1,2})$/);
    if (!m) continue;
    const [, letterRaw, gradeRaw] = m;
    if (!VALID_GRADES_SET.has(gradeRaw)) continue;
    const grade = gradeRaw as Iso286ItGrade;
    if (letterRaw === letterRaw.toUpperCase() && VALID_HOLES_SET.has(letterRaw)) {
      hole = { letter: letterRaw as Iso286HoleLetter, grade };
    } else if (letterRaw === letterRaw.toLowerCase() && VALID_SHAFTS_SET.has(letterRaw)) {
      shaft = { letter: letterRaw as Iso286ShaftLetter, grade };
    }
  }

  if (!hole && !shaft && nominalMm === null) return null;
  return { nominalMm, hole, shaft };
}

/**
 * Reverse-recommend matching IT grades given a nominal size and target total tolerance width (mm).
 */
export function recommendItGradesForTolerance(
  nominalMm: number,
  targetBandMm: number
): ReverseItMatch[] {
  const step = findMainStep(nominalMm);
  if (!step || !Number.isFinite(targetBandMm) || targetBandMm <= 0) return [];
  const targetUm = targetBandMm * 1000;

  const matches: ReverseItMatch[] = [];
  for (const grade of ISO286_IT_GRADES) {
    const itUm = ISO286_IT_TABLE[grade][step.index];
    if (itUm === null) continue;
    matches.push({
      grade,
      itMicrons: itUm,
      itMm: roundMm(itUm / 1000),
      halfMm: roundMm(itUm / 2000),
      ratioToTarget: Number((itUm / targetUm).toFixed(3)),
      isTighterOrEqual: itUm <= targetUm + 1e-6,
      processHint: IT_GRADE_PROCESS_HINTS[grade],
    });
  }

  // Sort by closeness to target tolerance band (log distance)
  return matches.sort(
    (a, b) =>
      Math.abs(Math.log(a.itMicrons / targetUm)) -
      Math.abs(Math.log(b.itMicrons / targetUm))
  );
}

/**
 * Format signed deviation in micrometers or millimeters cleanly (e.g. "+21", "0", "-7" or "+0.021").
 */
export function formatSignedMicrons(um: number): string {
  const clean = Math.abs(um) < 1e-6 ? 0 : roundMicrons(um);
  const str = Number.isInteger(clean) ? String(clean) : clean.toFixed(1);
  return clean > 0 ? `+${str}` : str;
}

export function formatSignedMm(mm: number, digits = 3): string {
  const clean = Math.abs(mm) < 1e-9 ? 0 : mm;
  const fixed = clean.toFixed(digits);
  if (clean > 0) return `+${fixed}`;
  if (clean === 0) return fixed;
  return fixed;
}

/**
 * Determine smart mm decimal precision (e.g. 4 digits when half-microns or sub-micron IT present).
 */
export function inferMmDecimals(microns: number): number {
  const frac = Math.abs(microns - Math.round(microns));
  return frac > 1e-4 ? 4 : 3;
}
