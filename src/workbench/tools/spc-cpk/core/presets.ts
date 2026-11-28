/**
 * Realistic, deterministic QI/QC engineering scenario presets demonstrating
 * every major SPC & CPK phenomenon (high capability, centering shift, tool wear trend,
 * bimodal non-normal cavity mix, unilateral USL flatness, unilateral LSL pull force).
 */
import type { SpcPreset } from "../types";

/** Deterministic Mulberry32 PRNG for 100% reproducible engineering demo datasets. */
function createRng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function generateNormalSeries(
  seed: number,
  count: number,
  mean: number,
  sigma: number,
  decimals: number
): number[] {
  const rand = createRng(seed);
  const out: number[] = [];
  const factor = 10 ** decimals;
  for (let i = 0; i < count; i += 2) {
    const u1 = Math.max(1e-12, rand());
    const u2 = rand();
    const mag = Math.sqrt(-2 * Math.log(u1));
    const z0 = mag * Math.cos(2 * Math.PI * u2);
    const z1 = mag * Math.sin(2 * Math.PI * u2);
    out.push(Math.round((mean + z0 * sigma) * factor) / factor);
    if (out.length < count) {
      out.push(Math.round((mean + z1 * sigma) * factor) / factor);
    }
  }
  return out;
}

// 1. High-capability CNC shaft outer diameter: Ø20.00 ± 0.05 mm, 25 subgroups x 5 = 125 pcs
const CNC_SHAFT_VALUES = generateNormalSeries(202601, 125, 20.001, 0.0095, 4);

// 2. Injection molding housing wall thickness: 2.00 ± 0.10 mm, 20 subgroups x 5 = 100 pcs
// Tight sigma (Cp ~ 1.65) but shifted +0.044 mm toward USL (Cpk ~ 0.92) -> clear centering fix!
const MOLD_SHIFT_VALUES = generateNormalSeries(202602, 100, 2.044, 0.0195, 4);

// 3. CNC tool wear drift (I-MR, n=1): 50.00 ± 0.08 mm, 32 consecutive pcs drifting upward
const TOOL_WEAR_VALUES = (() => {
  const noise = generateNormalSeries(202603, 32, 0, 0.007, 4);
  return noise.map((e, i) => {
    // Stable for first 12 parts, then steady tool wear drift triggering Nelson R2, R3, R1
    const drift = i < 12 ? 0 : (i - 11) * 0.0038;
    return Number((49.992 + drift + e).toFixed(4));
  });
})();

// 4. Dual-cavity mixed parts (Non-normal bimodal): 10.00 ± 0.15 mm, 60 pcs alternating Cavity A / B
const BIMODAL_MIX_VALUES = (() => {
  const cavA = generateNormalSeries(202604, 30, 9.935, 0.015, 4);
  const cavB = generateNormalSeries(202605, 30, 10.068, 0.015, 4);
  const mixed: number[] = [];
  for (let i = 0; i < 30; i++) {
    mixed.push(cavA[i], cavB[i]);
  }
  return mixed;
})();

// 5. Unilateral upper spec (Flatness <= 0.050 mm), 40 pcs right-ish bounded positive values
const FLATNESS_VALUES = (() => {
  const base = generateNormalSeries(202606, 40, 0.022, 0.0062, 4);
  return base.map((v) => Math.max(0.004, Number(v.toFixed(4))));
})();

// 6. Unilateral lower spec (Wire terminal pull force >= 80 N), 36 pcs
const PULL_FORCE_VALUES = generateNormalSeries(202607, 36, 104.5, 5.2, 2);

export const SPC_SCENE_PRESETS: readonly SpcPreset[] = [
  {
    id: "cnc-shaft-stable",
    name: "CNC 精密轴径 (稳健 A+)",
    stage: "PPAP",
    tag: "25×5 · X̄-R",
    description:
      "Ø20.00 ± 0.05 mm 精密轴径 125 件量产数据（25 组 × 5 件），过程受控且居中，Cpk ≥ 1.67",
    meta: {
      partName: "电机主轴 M-204",
      characteristic: "外径 Ø20.00 ± 0.05",
      unit: "mm",
      lotNo: "PPAP-2026-041",
      machine: "CNC-03 走心机",
      stage: "PPAP",
      operator: "李工",
      notes: "首批量产 PPAP 初始过程能力研究，连续抽取 25 组每组 5 件。",
    },
    spec: {
      toleranceType: "bilateral",
      usl: 20.05,
      lsl: 19.95,
      target: 20.0,
      cpkThreshold: 1.67,
    },
    subgroupSize: 5,
    chartMode: "xbar_r",
    values: CNC_SHAFT_VALUES,
  },
  {
    id: "mold-wall-shifted",
    name: "注塑壁厚 (偏移待调中)",
    stage: "IPQC",
    tag: "20×5 · Cp高Cpk低",
    description:
      "2.00 ± 0.10 mm 壳体壁厚，固有波动很小 (Cp ≈ 1.7) 但均值偏向上限，调整中心即可大幅拉升 Cpk",
    meta: {
      partName: "ABS 上壳体 H-108",
      characteristic: "侧壁厚 2.00 ± 0.10",
      unit: "mm",
      lotNo: "IPQC-20261128-B",
      machine: "海天 160T-#2",
      stage: "IPQC",
      operator: "王工",
      notes: "保压偏高导致壁厚整体偏厚，建议微调保压压力使均值回中。",
    },
    spec: {
      toleranceType: "bilateral",
      usl: 2.1,
      lsl: 1.9,
      target: 2.0,
      cpkThreshold: 1.33,
    },
    subgroupSize: 5,
    chartMode: "xbar_r",
    values: MOLD_SHIFT_VALUES,
  },
  {
    id: "tool-wear-drift",
    name: "刀具磨损漂移 (SPC失控)",
    stage: "IPQC",
    tag: "I-MR · R1/R2/R3",
    description:
      "50.00 ± 0.08 mm 精镗孔径连续 32 件单值追踪，中后期刀具磨损触发 Nelson R3 趋势与 R1 超限报警",
    meta: {
      partName: "减速箱壳体 G-88",
      characteristic: "轴承孔径 Ø50.00 ± 0.08",
      unit: "mm",
      lotNo: "WO-1128-09",
      machine: "卧加 HMC-05",
      stage: "IPQC",
      operator: "张工",
      notes: "精镗刀连续切削后尺寸单向爬升，用于演示 I-MR 与 Nelson 趋势预警。",
    },
    spec: {
      toleranceType: "bilateral",
      usl: 50.08,
      lsl: 49.92,
      target: 50.0,
      cpkThreshold: 1.33,
    },
    subgroupSize: 1,
    chartMode: "imr",
    values: TOOL_WEAR_VALUES,
  },
  {
    id: "dual-cavity-bimodal",
    name: "双模腔混料 (非正态双峰)",
    stage: "IQC",
    tag: "A² 警示 · R4/R8",
    description:
      "10.00 ± 0.15 mm 模腔 A/B 混装来料，Anderson-Darling 正态检验 p < 0.001 且触发双峰分层告警",
    meta: {
      partName: "连接器护套 C-12",
      characteristic: "卡扣间距 10.00 ± 0.15",
      unit: "mm",
      lotNo: "IQC-SUP-772",
      machine: "供方 1出2 模",
      stage: "IQC",
      operator: "陈工",
      notes: "两模腔尺寸中心不一致且混装，需分腔单独做 CPK 评估。",
    },
    spec: {
      toleranceType: "bilateral",
      usl: 10.15,
      lsl: 9.85,
      target: 10.0,
      cpkThreshold: 1.33,
    },
    subgroupSize: 1,
    chartMode: "imr",
    values: BIMODAL_MIX_VALUES,
  },
  {
    id: "flatness-upper-only",
    name: "平面度单边上限 (望小)",
    stage: "FQC",
    tag: "仅 USL · Cpu",
    description:
      "散热底板平面度 ≤ 0.050 mm（仅上公差，望小特性），评估单边 Cpk = Cpu 与超差 PPM",
    meta: {
      partName: "液冷散热底板 L-55",
      characteristic: "底面平面度 ≤ 0.050",
      unit: "mm",
      lotNo: "FQC-20261128",
      machine: "三坐标 CMM-01",
      stage: "FQC",
      operator: "赵工",
      notes: "形位公差望小特性，仅设 USL = 0.050 mm。",
    },
    spec: {
      toleranceType: "upper_only",
      usl: 0.05,
      lsl: null,
      target: 0,
      cpkThreshold: 1.33,
    },
    subgroupSize: 1,
    chartMode: "imr",
    values: FLATNESS_VALUES,
  },
  {
    id: "pull-force-lower-only",
    name: "端子拉拔力下限 (望大)",
    stage: "OQC",
    tag: "仅 LSL · Cpl",
    description:
      "压接端子拉拔力 ≥ 80 N（破坏性抽检单边下公差，望大特性），评估单边 Cpk = Cpl",
    meta: {
      partName: "高压线束端子 HV-16",
      characteristic: "压接拉拔力 ≥ 80 N",
      unit: "N",
      lotNo: "OQC-1128-3A",
      machine: "压接机 CR-04",
      stage: "OQC",
      operator: "周工",
      notes: "拉力测试仪实测数据，仅要求不低于下限 80 N。",
    },
    spec: {
      toleranceType: "lower_only",
      usl: null,
      lsl: 80,
      target: null,
      cpkThreshold: 1.33,
    },
    subgroupSize: 1,
    chartMode: "imr",
    values: PULL_FORCE_VALUES,
  },
];
