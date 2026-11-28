/**
 * Normative ISO 286-1:2010 / GB/T 1800.1-2020 Standard Tolerance & Fundamental Deviation Tables.
 *
 * Covers:
 * - Nominal sizes > 0 up to 3150 mm (21 main diameter steps; 25 + 16 fine sub-steps)
 * - Standard tolerance grades IT01 through IT18 (all values in micrometers, µm)
 * - All 28 fundamental deviation letters for shafts (a..zc) and holes (A..ZC)
 * - Exact ISO 286-1 Table 2–5 values including j5/j6/j7/j8, J6/J7/J8, k/K, m/M, n/N, p..zc, P..ZC
 */
import type {
  Iso286HoleLetter,
  Iso286ItGrade,
  Iso286ShaftLetter,
} from "../types";

export interface DiameterStep {
  index: number;
  min: number; // exclusive (except index 0 includes >0 up to 3)
  max: number; // inclusive
  label: string;
}

export const ISO286_IT_GRADES: readonly Iso286ItGrade[] = [
  "01",
  "0",
  "1",
  "2",
  "3",
  "4",
  "5",
  "6",
  "7",
  "8",
  "9",
  "10",
  "11",
  "12",
  "13",
  "14",
  "15",
  "16",
  "17",
  "18",
] as const;

export const ISO286_COMMON_IT_GRADES: readonly Iso286ItGrade[] = [
  "5",
  "6",
  "7",
  "8",
  "9",
  "10",
  "11",
  "12",
  "13",
] as const;

export const ISO286_SHAFT_LETTERS: readonly Iso286ShaftLetter[] = [
  "a", "b", "c", "cd", "d", "e", "ef", "f", "fg", "g", "h",
  "js", "j", "k", "m", "n",
  "p", "r", "s", "t", "u", "v", "x", "y", "z", "za", "zb", "zc",
] as const;

export const ISO286_HOLE_LETTERS: readonly Iso286HoleLetter[] = [
  "A", "B", "C", "CD", "D", "E", "EF", "F", "FG", "G", "H",
  "JS", "J", "K", "M", "N",
  "P", "R", "S", "T", "U", "V", "X", "Y", "Z", "ZA", "ZB", "ZC",
] as const;

/**
 * 21 Main Nominal Size Steps (13 steps for ≤ 500 mm + 8 steps for > 500..3150 mm).
 */
export const ISO286_MAIN_STEPS: readonly DiameterStep[] = [
  { index: 0, min: 0, max: 3, label: "≤ 3" },
  { index: 1, min: 3, max: 6, label: "> 3 ～ 6" },
  { index: 2, min: 6, max: 10, label: "> 6 ～ 10" },
  { index: 3, min: 10, max: 18, label: "> 10 ～ 18" },
  { index: 4, min: 18, max: 30, label: "> 18 ～ 30" },
  { index: 5, min: 30, max: 50, label: "> 30 ～ 50" },
  { index: 6, min: 50, max: 80, label: "> 50 ～ 80" },
  { index: 7, min: 80, max: 120, label: "> 80 ～ 120" },
  { index: 8, min: 120, max: 180, label: "> 120 ～ 180" },
  { index: 9, min: 180, max: 250, label: "> 180 ～ 250" },
  { index: 10, min: 250, max: 315, label: "> 250 ～ 315" },
  { index: 11, min: 315, max: 400, label: "> 315 ～ 400" },
  { index: 12, min: 400, max: 500, label: "> 400 ～ 500" },
  { index: 13, min: 500, max: 630, label: "> 500 ～ 630" },
  { index: 14, min: 630, max: 800, label: "> 630 ～ 800" },
  { index: 15, min: 800, max: 1000, label: "> 800 ～ 1000" },
  { index: 16, min: 1000, max: 1250, label: "> 1000 ～ 1250" },
  { index: 17, min: 1250, max: 1600, label: "> 1250 ～ 1600" },
  { index: 18, min: 1600, max: 2000, label: "> 1600 ～ 2000" },
  { index: 19, min: 2000, max: 2500, label: "> 2000 ～ 2500" },
  { index: 20, min: 2500, max: 3150, label: "> 2500 ～ 3150" },
];

/**
 * 25 Fine Sub-steps for ≤ 500 mm (used by steep fundamental deviation curves a, b, c, r..zc).
 */
export const ISO286_SUB_STEPS_500: readonly DiameterStep[] = [
  { index: 0, min: 0, max: 3, label: "≤ 3" },
  { index: 1, min: 3, max: 6, label: "> 3 ～ 6" },
  { index: 2, min: 6, max: 10, label: "> 6 ～ 10" },
  { index: 3, min: 10, max: 14, label: "> 10 ～ 14" },
  { index: 4, min: 14, max: 18, label: "> 14 ～ 18" },
  { index: 5, min: 18, max: 24, label: "> 18 ～ 24" },
  { index: 6, min: 24, max: 30, label: "> 24 ～ 30" },
  { index: 7, min: 30, max: 40, label: "> 30 ～ 40" },
  { index: 8, min: 40, max: 50, label: "> 40 ～ 50" },
  { index: 9, min: 50, max: 65, label: "> 50 ～ 65" },
  { index: 10, min: 65, max: 80, label: "> 65 ～ 80" },
  { index: 11, min: 80, max: 100, label: "> 80 ～ 100" },
  { index: 12, min: 100, max: 120, label: "> 100 ～ 120" },
  { index: 13, min: 120, max: 140, label: "> 120 ～ 140" },
  { index: 14, min: 140, max: 160, label: "> 140 ～ 160" },
  { index: 15, min: 160, max: 180, label: "> 160 ～ 180" },
  { index: 16, min: 180, max: 200, label: "> 180 ～ 200" },
  { index: 17, min: 200, max: 225, label: "> 200 ～ 225" },
  { index: 18, min: 225, max: 250, label: "> 225 ～ 250" },
  { index: 19, min: 250, max: 280, label: "> 250 ～ 280" },
  { index: 20, min: 280, max: 315, label: "> 280 ～ 315" },
  { index: 21, min: 315, max: 355, label: "> 315 ～ 355" },
  { index: 22, min: 355, max: 400, label: "> 355 ～ 400" },
  { index: 23, min: 400, max: 450, label: "> 400 ～ 450" },
  { index: 24, min: 450, max: 500, label: "> 450 ～ 500" },
];

/**
 * 16 Fine Sub-steps for > 500..3150 mm (used by r, s, t, u).
 */
export const ISO286_SUB_STEPS_LARGE: readonly DiameterStep[] = [
  { index: 0, min: 500, max: 560, label: "> 500 ～ 560" },
  { index: 1, min: 560, max: 630, label: "> 560 ～ 630" },
  { index: 2, min: 630, max: 710, label: "> 630 ～ 710" },
  { index: 3, min: 710, max: 800, label: "> 710 ～ 800" },
  { index: 4, min: 800, max: 900, label: "> 800 ～ 900" },
  { index: 5, min: 900, max: 1000, label: "> 900 ～ 1000" },
  { index: 6, min: 1000, max: 1120, label: "> 1000 ～ 1120" },
  { index: 7, min: 1120, max: 1250, label: "> 1120 ～ 1250" },
  { index: 8, min: 1250, max: 1400, label: "> 1250 ～ 1400" },
  { index: 9, min: 1400, max: 1600, label: "> 1400 ～ 1600" },
  { index: 10, min: 1600, max: 1800, label: "> 1600 ～ 1800" },
  { index: 11, min: 1800, max: 2000, label: "> 1800 ～ 2000" },
  { index: 12, min: 2000, max: 2240, label: "> 2000 ～ 2240" },
  { index: 13, min: 2240, max: 2500, label: "> 2240 ～ 2500" },
  { index: 14, min: 2500, max: 2800, label: "> 2500 ～ 2800" },
  { index: 15, min: 2800, max: 3150, label: "> 2800 ～ 3150" },
];

/**
 * ISO 286-1:2010 Table 1 — Standard Tolerance Values IT01..IT18 in micrometers (µm).
 * Indexed by main step (0..20). Null where ISO 286-1 does not define the grade (>500 mm IT01..IT5).
 */
export const ISO286_IT_TABLE: Record<Iso286ItGrade, readonly (number | null)[]> = {
  "01": [0.3, 0.4, 0.4, 0.5, 0.6, 0.6, 0.8, 1, 1.2, 2, 2.5, 3, 4, null, null, null, null, null, null, null, null],
  "0":  [0.5, 0.6, 0.6, 0.8, 1, 1, 1.2, 1.5, 2, 3, 4, 5, 6, null, null, null, null, null, null, null, null],
  "1":  [0.8, 1, 1, 1.2, 1.5, 1.5, 2, 2.5, 3.5, 4.5, 6, 7, 8, null, null, null, null, null, null, null, null],
  "2":  [1.2, 1.5, 1.5, 2, 2.5, 2.5, 3, 4, 5, 7, 8, 9, 10, null, null, null, null, null, null, null, null],
  "3":  [2, 2.5, 2.5, 3, 4, 4, 5, 6, 8, 10, 12, 13, 15, null, null, null, null, null, null, null, null],
  "4":  [3, 4, 4, 5, 6, 7, 8, 10, 12, 14, 16, 18, 20, null, null, null, null, null, null, null, null],
  "5":  [4, 5, 6, 8, 9, 11, 13, 15, 18, 20, 23, 25, 27, null, null, null, null, null, null, null, null],
  "6":  [6, 8, 9, 11, 13, 16, 19, 22, 25, 29, 32, 36, 40, 44, 50, 56, 66, 78, 92, 110, 135],
  "7":  [10, 12, 15, 18, 21, 25, 30, 35, 40, 46, 52, 57, 63, 70, 80, 90, 105, 125, 150, 175, 210],
  "8":  [14, 18, 22, 27, 33, 39, 46, 54, 63, 72, 81, 89, 97, 110, 125, 140, 165, 195, 230, 280, 330],
  "9":  [25, 30, 36, 43, 52, 62, 74, 87, 100, 115, 130, 140, 155, 175, 200, 230, 260, 310, 370, 440, 540],
  "10": [40, 48, 58, 70, 84, 100, 120, 140, 160, 185, 210, 230, 250, 280, 320, 360, 420, 500, 600, 700, 860],
  "11": [60, 75, 90, 110, 130, 160, 190, 220, 250, 290, 320, 360, 400, 440, 500, 560, 660, 780, 920, 1100, 1350],
  "12": [100, 120, 150, 180, 210, 250, 300, 350, 400, 460, 520, 570, 630, 700, 800, 900, 1050, 1250, 1500, 1750, 2100],
  "13": [140, 180, 220, 270, 330, 390, 460, 540, 630, 720, 810, 890, 970, 1100, 1250, 1400, 1650, 1950, 2300, 2800, 3300],
  "14": [250, 300, 360, 430, 520, 620, 740, 870, 1000, 1150, 1300, 1400, 1550, 1750, 2000, 2300, 2600, 3100, 3700, 4400, 5400],
  "15": [400, 480, 580, 700, 840, 1000, 1200, 1400, 1600, 1850, 2100, 2300, 2500, 2800, 3200, 3600, 4200, 5000, 6000, 7000, 8600],
  "16": [600, 750, 900, 1100, 1300, 1600, 1900, 2200, 2500, 2900, 3200, 3600, 4000, 4400, 5000, 5600, 6600, 7800, 9200, 11000, 13500],
  "17": [1000, 1200, 1500, 1800, 2100, 2500, 3000, 3500, 4000, 4600, 5200, 5700, 6300, 7000, 8000, 9000, 10500, 12500, 15000, 17500, 21000],
  "18": [1400, 1800, 2200, 2700, 3300, 3900, 4600, 5400, 6300, 7200, 8100, 8900, 9700, 11000, 12500, 14000, 16500, 19500, 23000, 28000, 33000],
};

/**
 * Typical manufacturing process capability hints per IT grade (ISO / GB/T engineering reference).
 */
export const IT_GRADE_PROCESS_HINTS: Record<Iso286ItGrade, string> = {
  "01": "高精度基准量块、计量实验室原器",
  "0": "精密基准量块、光学精密计量具",
  "1": "高精密量规、精密光学仪控元件",
  "2": "高精度检具、精密滚动轴承滚珠",
  "3": "精密量规、高精度仪控主轴研磨",
  "4": "超精研磨、精密量规、精密轴承配合",
  "5": "精密外圆/内圆磨削、精密坐标镗、精密轴承配合",
  "6": "精磨、精细车/精细镗、高精度孔轴配合 (g6/k6/m6)",
  "7": "铰孔、拉孔、精车、精镗、常规高精度基孔 (H7)",
  "8": "半精车、精铣、钻扩铰、一般机械中等配合 (H8/f7)",
  "9": "普通车削、铣削、精密压铸、一般配合 (H9/d9)",
  "10": "粗镗、铣削、冲压、精密铸造与一般非关键配合",
  "11": "粗车、钻孔、冲压钣金、极松动配合 (H11/c11)",
  "12": "钣金折弯、冷冲压、精密压铸与注塑未注尺寸",
  "13": "压力铸造、热挤压、常规冲压与钣金件",
  "14": "模锻、常规注塑、金属型铸造",
  "15": "冲裁、自由锻造、砂型铸造",
  "16": "砂型铸造毛坯、热轧型材、焊接件",
  "17": "大型毛坯、重型焊接与粗略下料尺寸",
  "18": "超大型粗加工或结构外廓毛坯尺寸",
};

/* ============================================================================
 * ISO 286-1:2010 Table 2 & Table 3 — Shaft Fundamental Deviations (µm)
 * ========================================================================== */

/**
 * Shaft upper deviations `es` (negative, µm) indexed by the 25 sub-steps (≤ 500 mm)
 * for steep clearance curves a, b, c.
 */
export const SHAFT_ES_SUB500: Record<"a" | "b" | "c", readonly number[]> = {
  a: [-270, -270, -280, -290, -290, -300, -300, -310, -320, -340, -360, -380, -410, -460, -520, -580, -660, -740, -820, -920, -1050, -1200, -1350, -1500, -1650],
  b: [-140, -140, -150, -150, -150, -160, -160, -170, -180, -190, -200, -220, -240, -260, -280, -310, -340, -380, -420, -480, -540, -600, -680, -760, -840],
  c: [-60, -70, -80, -95, -95, -110, -110, -120, -130, -140, -150, -170, -180, -200, -210, -230, -240, -260, -280, -300, -330, -360, -400, -440, -480],
};

/**
 * Intermediate small-size clearance shafts cd, ef, fg (defined ONLY for D ≤ 10 mm, main steps 0..2).
 */
export const SHAFT_ES_SMALL10: Record<"cd" | "ef" | "fg", readonly number[]> = {
  cd: [-34, -46, -56],
  ef: [-10, -14, -18],
  fg: [-4, -6, -8],
};

/**
 * Shaft upper deviations `es` (negative, µm) indexed by all 21 main steps (0..3150 mm)
 * for d, e, f, g.
 */
export const SHAFT_ES_MAIN: Record<"d" | "e" | "f" | "g", readonly number[]> = {
  d: [-20, -30, -40, -50, -65, -80, -100, -120, -145, -170, -190, -210, -230, -260, -290, -320, -350, -390, -430, -480, -520],
  e: [-14, -20, -25, -32, -40, -50, -60, -72, -85, -100, -110, -125, -135, -145, -160, -170, -195, -220, -240, -260, -290],
  f: [-6, -10, -13, -16, -20, -25, -30, -36, -43, -50, -56, -62, -68, -76, -80, -86, -98, -110, -120, -130, -145],
  g: [-2, -4, -5, -6, -7, -9, -10, -12, -14, -15, -17, -18, -20, -22, -24, -26, -28, -30, -32, -34, -38],
};

/**
 * Shaft `j` lower deviations `ei` (µm, ≤ 500 mm, main steps 0..12).
 * Per ISO 286-1 Table 2: defined for j5, j6, j7 (and j8 only for ≤ 3 mm).
 */
export const SHAFT_J_EI_500: Record<"5" | "6" | "7" | "8", readonly (number | null)[]> = {
  "5": [-2, -2, -2, -3, -4, -5, -7, -9, -11, -13, -16, -18, -20],
  "6": [-2, -2, -2, -3, -4, -5, -7, -9, -11, -13, -16, -18, -20],
  "7": [-4, -4, -5, -6, -8, -10, -12, -15, -18, -21, -26, -28, -31],
  "8": [-6, null, null, null, null, null, null, null, null, null, null, null, null],
};

/**
 * Hole `J` upper deviations `ES` (µm, ≤ 500 mm, main steps 0..12).
 * Per ISO 286-1 Table 4/5: defined ONLY for J6, J7, J8.
 */
export const HOLE_J_ES_500: Record<"6" | "7" | "8", readonly number[]> = {
  "6": [2, 5, 5, 6, 8, 10, 13, 16, 18, 22, 25, 29, 33],
  "7": [4, 6, 8, 10, 12, 14, 18, 22, 26, 30, 36, 39, 43],
  "8": [6, 10, 12, 15, 20, 24, 28, 34, 41, 47, 55, 60, 65],
};

/**
 * Shaft `k` lower deviation `ei` (µm) for grades IT4..IT7 (≤ 500 mm, main steps 0..12).
 * For grades ≤ IT3, ≥ IT8, or sizes > 500 mm: `ei = 0`.
 */
export const SHAFT_K_EI_4_TO_7: readonly number[] = [
  0, 1, 1, 1, 2, 2, 2, 3, 3, 4, 4, 4, 5,
];

/**
 * Shaft `m`, `n`, `p` lower deviations `ei` (µm) indexed by all 21 main steps (0..3150 mm).
 */
export const SHAFT_EI_MAIN: Record<"m" | "n" | "p", readonly number[]> = {
  m: [2, 4, 6, 7, 8, 9, 11, 13, 15, 17, 20, 21, 23, 26, 30, 34, 40, 48, 58, 68, 76],
  n: [4, 8, 10, 12, 15, 17, 20, 23, 27, 31, 34, 37, 40, 44, 50, 56, 66, 78, 92, 110, 135],
  p: [6, 12, 15, 18, 22, 26, 32, 37, 43, 50, 56, 62, 68, 78, 88, 100, 120, 140, 170, 195, 240],
};

/**
 * Shaft `r`..`zc` lower deviations `ei` (µm) indexed by the 25 fine sub-steps (≤ 500 mm).
 * Null entries indicate sub-steps where ISO 286-1 does not define the letter (t ≤ 24, v ≤ 14, y ≤ 18).
 */
export const SHAFT_EI_SUB500: Record<
  "r" | "s" | "t" | "u" | "v" | "x" | "y" | "z" | "za" | "zb" | "zc",
  readonly (number | null)[]
> = {
  r:  [10, 15, 19, 23, 23, 28, 28, 34, 34, 41, 43, 51, 54, 63, 65, 68, 77, 80, 84, 94, 98, 108, 114, 126, 132],
  s:  [14, 19, 23, 28, 28, 35, 35, 43, 43, 53, 59, 71, 79, 92, 100, 108, 122, 130, 140, 158, 170, 190, 208, 232, 252],
  t:  [null, null, null, null, null, null, 41, 48, 54, 66, 75, 91, 104, 122, 134, 146, 166, 180, 196, 218, 240, 268, 294, 330, 360],
  u:  [18, 23, 28, 33, 33, 41, 48, 60, 70, 87, 102, 124, 144, 170, 190, 210, 236, 258, 284, 315, 350, 390, 435, 490, 540],
  v:  [null, null, null, null, 39, 47, 55, 68, 81, 102, 120, 146, 172, 202, 228, 252, 284, 310, 340, 385, 425, 475, 530, 595, 660],
  x:  [20, 28, 34, 40, 45, 54, 64, 80, 97, 122, 146, 178, 210, 248, 280, 310, 350, 385, 425, 475, 525, 590, 660, 740, 820],
  y:  [null, null, null, null, null, 63, 75, 94, 114, 144, 174, 214, 254, 300, 340, 380, 425, 470, 520, 580, 650, 730, 820, 920, 1000],
  z:  [26, 35, 42, 50, 60, 73, 88, 112, 136, 172, 210, 258, 310, 365, 415, 465, 520, 575, 640, 710, 790, 900, 1000, 1100, 1250],
  za: [32, 42, 52, 64, 77, 98, 118, 148, 180, 226, 274, 335, 400, 470, 535, 600, 670, 740, 820, 920, 1000, 1150, 1300, 1450, 1600],
  zb: [40, 50, 67, 90, 108, 136, 160, 200, 242, 300, 360, 445, 525, 620, 700, 780, 880, 960, 1050, 1200, 1300, 1500, 1650, 1850, 2100],
  zc: [60, 80, 97, 130, 150, 188, 218, 274, 325, 405, 480, 585, 690, 800, 900, 1000, 1150, 1250, 1350, 1550, 1700, 1900, 2100, 2400, 2600],
};

/**
 * Shaft `r, s, t, u` lower deviations `ei` (µm) indexed by the 16 sub-steps (> 500..3150 mm).
 */
export const SHAFT_EI_SUB_LARGE: Record<"r" | "s" | "t" | "u", readonly number[]> = {
  r: [150, 155, 175, 185, 210, 220, 250, 260, 300, 330, 370, 400, 440, 460, 550, 580],
  s: [280, 310, 340, 380, 430, 470, 520, 580, 640, 720, 820, 920, 1000, 1100, 1250, 1400],
  t: [400, 440, 500, 550, 620, 680, 760, 840, 960, 1050, 1200, 1350, 1500, 1650, 1850, 2100],
  u: [600, 660, 740, 840, 940, 1050, 1150, 1300, 1450, 1600, 1850, 2000, 2300, 2500, 2900, 3200],
};
