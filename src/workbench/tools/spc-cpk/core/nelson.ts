/**
 * Nelson 8 Run Rules (GB/T 4091 / AIAG SPC / Western Electric) detection engine.
 */
import type {
  ControlLimits,
  NelsonPresetId,
  NelsonRuleId,
  NelsonViolation,
} from "../types";

export interface NelsonRuleDefinition {
  id: NelsonRuleId;
  code: string;
  shortName: string;
  description: string;
  typicalCause: string;
}

export const NELSON_RULES: readonly NelsonRuleDefinition[] = [
  {
    id: 1,
    code: "R1",
    shortName: "超出 3σ 控制限",
    description: "任意 1 点落在 ±3σ 控制限以外（> UCL 或 < LCL）",
    typicalCause: "突发特殊原因：刀具崩刃、参数误调、测量异常或混料",
  },
  {
    id: 2,
    code: "R2",
    shortName: "连续 9 点同侧",
    description: "连续 9 点落在中心线 CL 同一侧",
    typicalCause: "过程均值发生持续偏移：材料批次更换、夹具松动或设定漂移",
  },
  {
    id: 3,
    code: "R3",
    shortName: "连续 6 点递增/递减",
    description: "连续 6 点呈持续上升或持续下降趋势",
    typicalCause: "渐变性漂移：刀具/模具磨损、温升热变形、疲劳或槽液衰减",
  },
  {
    id: 4,
    code: "R4",
    shortName: "连续 14 点交替上下",
    description: "连续 14 点相邻交替上升与下降（锯齿状）",
    typicalCause: "周期性交替因素：双工位/双模腔交替产出、过度人工干预调机",
  },
  {
    id: 5,
    code: "R5",
    shortName: "连续 3 点中 2 点超 2σ",
    description: "连续 3 点中有 2 点落在同侧 A 区（超过 ±2σ）",
    typicalCause: "均值小幅突变或方差增大的早期预警信号",
  },
  {
    id: 6,
    code: "R6",
    shortName: "连续 5 点中 4 点超 1σ",
    description: "连续 5 点中有 4 点落在同侧 B 区以外（超过 ±1σ）",
    typicalCause: "过程中心开始出现中度偏移，需提前介入校准",
  },
  {
    id: 7,
    code: "R7",
    shortName: "连续 15 点在 ±1σ 内",
    description: "连续 15 点全部落在中心线两侧 ±1σ（C 区）以内",
    typicalCause: "分层现象、控制限计算偏宽、量具分辨率不足或数据失真",
  },
  {
    id: 8,
    code: "R8",
    shortName: "连续 8 点在 ±1σ 之外",
    description: "连续 8 点落在中心线两侧且无一点在 ±1σ 以内",
    typicalCause: "混合分布（双峰）：多条产线、多模腔或两台设备混合取样",
  },
] as const;

export const NELSON_RULE_PRESETS: Record<
  NelsonPresetId,
  { label: string; rules: NelsonRuleId[] }
> = {
  basic: { label: "仅超控制限 (R1)", rules: [1] },
  weco: { label: "Western Electric (R1/2/5/6)", rules: [1, 2, 5, 6] },
  nelson_all: { label: "Nelson 完整 8 准则", rules: [1, 2, 3, 4, 5, 6, 7, 8] },
};

export function getNelsonRuleMeta(id: NelsonRuleId): NelsonRuleDefinition {
  return NELSON_RULES[id - 1];
}

/**
 * Evaluate enabled Nelson rules on the primary chart (Xbar or I)
 * and Rule 1 (control limit breach) on the secondary chart (R, S, or MR).
 */
export function detectNelsonViolations(params: {
  primarySeries: number[];
  primaryLimits: ControlLimits;
  secondarySeries: Array<number | null>;
  secondaryLimits: ControlLimits;
  enabledRules: NelsonRuleId[];
  subgroupOffset?: number; // 1-based display label offset (default 1)
}): NelsonViolation[] {
  const {
    primarySeries,
    primaryLimits,
    secondarySeries,
    secondaryLimits,
    enabledRules,
  } = params;
  const ruleSet = new Set<NelsonRuleId>(enabledRules);
  const violations: NelsonViolation[] = [];
  const n = primarySeries.length;
  const { cl, ucl, lcl, sigma } = primaryLimits;

  const eps = Math.max(Math.abs(sigma) * 1e-9, 1e-12);

  // Rule 1: Point beyond 3 sigma (UCL / LCL)
  if (ruleSet.has(1)) {
    for (let i = 0; i < n; i++) {
      const v = primarySeries[i];
      if (v > ucl + eps || v < lcl - eps) {
        violations.push({
          ruleId: 1,
          chart: "primary",
          pointIndices: [i],
          triggerIndex: i,
          title: "R1 · 超出 3σ 控制限",
          detail: `第 #${i + 1} 点 (${v.toFixed(4)}) 超出${v > ucl ? "上控制限 UCL" : "下控制限 LCL"}`,
        });
      }
    }
  }

  // Secondary chart Rule 1 (always checked when Rule 1 is enabled)
  if (ruleSet.has(1)) {
    const sEps = Math.max(Math.abs(secondaryLimits.cl) * 1e-9, 1e-12);
    for (let i = 0; i < secondarySeries.length; i++) {
      const v = secondarySeries[i];
      if (v === null) continue;
      if (
        v > secondaryLimits.ucl + sEps ||
        (secondaryLimits.lcl > 0 && v < secondaryLimits.lcl - sEps)
      ) {
        violations.push({
          ruleId: 1,
          chart: "secondary",
          pointIndices: [i],
          triggerIndex: i,
          title: "R1 · 变异图超控制限",
          detail: `第 #${i + 1} 点变异值 (${v.toFixed(4)}) 超出${v > secondaryLimits.ucl ? "上控制限 UCL" : "下控制限 LCL"}`,
        });
      }
    }
  }

  if (sigma <= 0 || n < 3) {
    return violations;
  }

  const zScores = primarySeries.map((v) => (v - cl) / sigma);

  // Helper to deduplicate overlapping contiguous runs so each run emits one clean violation
  // while still marking every involved point on the chart.
  // Rule 2: 9 consecutive points on the same side of CL
  if (ruleSet.has(2) && n >= 9) {
    let runStart = 0;
    let runSign = 0;
    for (let i = 0; i <= n; i++) {
      const sign = i < n ? (zScores[i] > 1e-9 ? 1 : zScores[i] < -1e-9 ? -1 : 0) : 0;
      if (sign !== 0 && sign === runSign) {
        continue;
      }
      const runLen = i - runStart;
      if (runSign !== 0 && runLen >= 9) {
        const idxs = Array.from({ length: runLen }, (_, k) => runStart + k);
        violations.push({
          ruleId: 2,
          chart: "primary",
          pointIndices: idxs,
          triggerIndex: i - 1,
          title: "R2 · 连续 9 点同侧偏移",
          detail: `第 #${runStart + 1}~#${i} 点连续 ${runLen} 点位于中心线${runSign > 0 ? "上方" : "下方"}`,
        });
      }
      runStart = i;
      runSign = sign;
    }
  }

  // Rule 3: 6 consecutive points steadily increasing or decreasing
  if (ruleSet.has(3) && n >= 6) {
    let dir = 0;
    let start = 0;
    for (let i = 1; i <= n; i++) {
      const diff = i < n ? primarySeries[i] - primarySeries[i - 1] : 0;
      const stepDir = diff > eps ? 1 : diff < -eps ? -1 : 0;
      if (stepDir !== 0 && stepDir === dir) {
        continue;
      }
      const runLen = i - start; // number of points in monotonic chain
      if (dir !== 0 && runLen >= 6) {
        const idxs = Array.from({ length: runLen }, (_, k) => start + k);
        violations.push({
          ruleId: 3,
          chart: "primary",
          pointIndices: idxs,
          triggerIndex: i - 1,
          title: "R3 · 连续 6 点趋势漂移",
          detail: `第 #${start + 1}~#${i} 点连续 ${runLen} 点持续${dir > 0 ? "上升" : "下降"}`,
        });
      }
      start = i - 1;
      dir = stepDir;
    }
  }

  // Rule 4: 14 consecutive points alternating up and down
  if (ruleSet.has(4) && n >= 14) {
    let start = 0;
    let prevDir = 0;
    for (let i = 1; i <= n; i++) {
      const diff = i < n ? primarySeries[i] - primarySeries[i - 1] : 0;
      const stepDir = diff > eps ? 1 : diff < -eps ? -1 : 0;
      const alternates = stepDir !== 0 && (prevDir === 0 || stepDir === -prevDir);
      if (alternates) {
        prevDir = stepDir;
        continue;
      }
      const runLen = i - start;
      if (runLen >= 14) {
        const idxs = Array.from({ length: runLen }, (_, k) => start + k);
        violations.push({
          ruleId: 4,
          chart: "primary",
          pointIndices: idxs,
          triggerIndex: i - 1,
          title: "R4 · 连续 14 点交替震荡",
          detail: `第 #${start + 1}~#${i} 点连续 ${runLen} 点交替上下波动`,
        });
      }
      start = i - 1;
      prevDir = stepDir;
    }
  }

  // Rule 5: 2 out of 3 consecutive points > 2 sigma on same side
  if (ruleSet.has(5) && n >= 3) {
    let lastEnd = -1;
    for (let i = 2; i < n; i++) {
      const win = [i - 2, i - 1, i];
      const pos = win.filter((idx) => zScores[idx] > 2 + 1e-9);
      const neg = win.filter((idx) => zScores[idx] < -2 - 1e-9);
      if ((pos.length >= 2 || neg.length >= 2) && i > lastEnd) {
        const side = pos.length >= 2 ? "上侧 +2σ" : "下侧 -2σ";
        const hit = pos.length >= 2 ? pos : neg;
        violations.push({
          ruleId: 5,
          chart: "primary",
          pointIndices: hit,
          triggerIndex: hit[hit.length - 1],
          title: "R5 · 3 点中 2 点超 2σ",
          detail: `第 #${win[0] + 1}~#${win[2] + 1} 窗口内有 ${hit.length} 点超过${side}`,
        });
        lastEnd = i;
      }
    }
  }

  // Rule 6: 4 out of 5 consecutive points > 1 sigma on same side
  if (ruleSet.has(6) && n >= 5) {
    let lastEnd = -1;
    for (let i = 4; i < n; i++) {
      const win = [i - 4, i - 3, i - 2, i - 1, i];
      const pos = win.filter((idx) => zScores[idx] > 1 + 1e-9);
      const neg = win.filter((idx) => zScores[idx] < -1 - 1e-9);
      if ((pos.length >= 4 || neg.length >= 4) && i > lastEnd) {
        const side = pos.length >= 4 ? "上侧 +1σ" : "下侧 -1σ";
        const hit = pos.length >= 4 ? pos : neg;
        violations.push({
          ruleId: 6,
          chart: "primary",
          pointIndices: hit,
          triggerIndex: hit[hit.length - 1],
          title: "R6 · 5 点中 4 点超 1σ",
          detail: `第 #${win[0] + 1}~#${win[4] + 1} 窗口内有 ${hit.length} 点超过${side}`,
        });
        lastEnd = i;
      }
    }
  }

  // Rule 7: 15 consecutive points within ±1 sigma
  if (ruleSet.has(7) && n >= 15) {
    let runStart = 0;
    let inZone = false;
    for (let i = 0; i <= n; i++) {
      const within = i < n && Math.abs(zScores[i]) < 1 - 1e-9;
      if (within) {
        if (!inZone) {
          runStart = i;
          inZone = true;
        }
        continue;
      }
      if (inZone) {
        const runLen = i - runStart;
        if (runLen >= 15) {
          const idxs = Array.from({ length: runLen }, (_, k) => runStart + k);
          violations.push({
            ruleId: 7,
            chart: "primary",
            pointIndices: idxs,
            triggerIndex: i - 1,
            title: "R7 · 连续 15 点位于 ±1σ 内",
            detail: `第 #${runStart + 1}~#${i} 点连续 ${runLen} 点集中在 C 区（分层或分辨率受限）`,
          });
        }
        inZone = false;
      }
    }
  }

  // Rule 8: 8 consecutive points outside ±1 sigma on both sides
  if (ruleSet.has(8) && n >= 8) {
    let runStart = 0;
    let outside = false;
    for (let i = 0; i <= n; i++) {
      const out = i < n && Math.abs(zScores[i]) > 1 + 1e-9;
      if (out) {
        if (!outside) {
          runStart = i;
          outside = true;
        }
        continue;
      }
      if (outside) {
        const runLen = i - runStart;
        if (runLen >= 8) {
          const idxs = Array.from({ length: runLen }, (_, k) => runStart + k);
          const hasPos = idxs.some((k) => zScores[k] > 0);
          const hasNeg = idxs.some((k) => zScores[k] < 0);
          if (hasPos && hasNeg) {
            violations.push({
              ruleId: 8,
              chart: "primary",
              pointIndices: idxs,
              triggerIndex: i - 1,
              title: "R8 · 连续 8 点避开 ±1σ（混合双峰）",
              detail: `第 #${runStart + 1}~#${i} 点连续 ${runLen} 点分布在中心线两侧 ±1σ 之外`,
            });
          }
        }
        outside = false;
      }
    }
  }

  return violations;
}
