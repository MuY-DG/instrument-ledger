import {
  BarChart3,
  ClipboardCheck,
  Crosshair,
  Ruler,
} from "lucide-react";
import type { WorkbenchToolDefinition } from "./types";

/**
 * Declarative QI/QC Workbench Tool Registry.
 *
 * Adding a new QI/QC tool only requires:
 * 1. Implementing the self-contained module under `src/workbench/tools/<tool-id>/`
 * 2. Registering an entry here with a lazy `load: () => import(...)` loader.
 */
export const WORKBENCH_TOOLS: WorkbenchToolDefinition[] = [
  {
    id: "pdf-balloon",
    name: "Folio · PDF 气泡图标注",
    shortName: "PDF 气泡标注",
    subtitle: "工程图纸尺寸序号标注与矢量交付工作台",
    description:
      "面向首件检验 (FAI)、来料检验 (IQC) 与工程出图的多页 PDF 圆圈序号标注工具。内置完整离线中文字体映射与矢量引擎，支持可二次编辑 PDF 保存、超高分辨率分块图片导出与多图纸本机草稿自动恢复。",
    category: "drawing",
    status: "ready",
    icon: Crosshair,
    accent: "#4262fb",
    version: "2.0",
    keepAlive: true,
    tags: ["气泡图", "FAI 首件", "矢量 PDF", "离线中文字体", "分块高清导图"],
    highlights: [
      "自动递增序号、滚轮 / [ ] 缩放圆圈与字号等比联动",
      "支持固定交付 PDF 与可二次编辑 Stamp 批注 PDF",
      "最高 2.56 亿像素流式分块导出 PNG / JPEG / WebP",
      "多图纸 IndexedDB 本地草稿自动记忆，文件不上传",
    ],
    load: () => import("./tools/pdf-balloon"),
  },
  {
    id: "aql-sampling",
    name: "AQL 抽样方案计算器",
    shortName: "AQL 抽样",
    subtitle: "GB/T 2828.1 / ANSI Z1.4 检验水平与 Ac/Re 速查",
    description:
      "按批量与一般/特殊检验水平自动匹配样本字码、正常/加严/放宽抽样数及允收/拒收判定值，服务 IQC 与 OQC 现场抽检。",
    category: "sampling",
    status: "planned",
    icon: ClipboardCheck,
    accent: "#10b981",
    tags: ["GB/T 2828.1", "IQC / OQC", "Ac / Re 判定"],
    highlights: [
      "支持正常、加严、放宽三类转移规则",
      "一键生成检验抽样记录摘要",
    ],
  },
  {
    id: "spc-cpk",
    name: "CPK / SPC 过程能力分析",
    shortName: "CPK 分析",
    subtitle: "实测尺寸正态分布、Cp / Cpk / Ppk 与控制图",
    description:
      "粘贴或导入 Excel 实测数据，快速计算均值、标准差、CPK/PPK 指标及直方图，自动标记超差与过程偏移风险。",
    category: "analysis",
    status: "planned",
    icon: BarChart3,
    accent: "#6366f1",
    tags: ["CPK / PPK", "Xbar-R 控制图", "Excel 导入"],
    highlights: [
      "支持单边与双边公差带过程能力评估",
      "一键导出过程能力分析报告图片",
    ],
  },
  {
    id: "iso-tolerance",
    name: "ISO 2768 & 公差配合速查",
    shortName: "公差速查",
    subtitle: "未注线性/角度公差 (f/m/c/v) 与孔轴基公差带",
    description:
      "输入公称尺寸即时查询 ISO 2768-mK / fH、IT 等级与 H7/g6 等常见孔轴配合上下偏差，减少检验翻表误差。",
    category: "tolerance",
    status: "planned",
    icon: Ruler,
    accent: "#f59e0b",
    tags: ["ISO 2768", "孔轴配合", "上下偏差"],
    highlights: [
      "覆盖线性尺寸、倒圆倒角与形位公差等级",
      "支持快速换算实测值是否在公差带内",
    ],
  },
];

export function getWorkbenchToolById(id: string): WorkbenchToolDefinition | undefined {
  return WORKBENCH_TOOLS.find((tool) => tool.id === id);
}
