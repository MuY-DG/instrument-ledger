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
      "按批量与一般/特殊检验水平自动匹配样本字码、正常/加严/放宽抽样数及允收/拒收判定值，支持 CR/MAJ/MIN 多缺陷等级联合判定、OC 特性曲线与转移规则演练，服务 IQC 与 OQC 现场抽检。",
    category: "sampling",
    status: "ready",
    icon: ClipboardCheck,
    accent: "#10b981",
    version: "1.0",
    keepAlive: true,
    tags: ["GB/T 2828.1", "ANSI Z1.4", "IQC / OQC", "Ac / Re 判定", "OC 曲线"],
    highlights: [
      "覆盖 GB/T 2828.1-2012 与 ANSI Z1.4 正常/加严/放宽全套主表与箭头转移",
      "支持 CR / MAJ / MIN 多缺陷等级联合抽检与 100% 全检自动截断",
      "内置精确二项/泊松 OC 特性曲线、AOQL 风险评估与转移得分演练器",
      "一键复制摘要、导出 Excel 判定单与高清 PNG 判定卡，本地离线归档",
    ],
    load: () => import("./tools/aql-sampling"),
  },
  {
    id: "spc-cpk",
    name: "CPK / SPC 过程能力分析",
    shortName: "CPK 分析",
    subtitle: "实测尺寸正态分布、Cp / Cpk / Ppk 与控制图",
    description:
      "粘贴或导入 Excel / CSV 实测数据，按 AIAG SPC 与 GB/T 4091 自动计算 Cp / Cpk / Pp / Ppk / Ca / Cpm 指标、95% 置信区间、预期 PPM、Anderson-Darling 正态性检验及 X̄-R / X̄-S / I-MR 控制图与 Nelson 八大判异准则。",
    category: "analysis",
    status: "ready",
    icon: BarChart3,
    accent: "#6366f1",
    version: "1.0",
    keepAlive: true,
    tags: ["CPK / PPK", "X̄-R / I-MR 控制图", "Nelson 判异", "正态检验", "Excel 导入"],
    highlights: [
      "支持双边与单边（望小/望大）公差、公称±偏差换算及 95% 置信区间评估",
      "内置直方图正态密度拟合、正态概率 Q-Q 图与 Anderson-Darling 检验",
      "支持 X̄-R、X̄-S、I-MR 双联控制图与可定制 Nelson 8 大判异信号追踪",
      "支持 Excel 多列/子组矩阵导入，一键导出 3-Sheet Excel 与高清报告图",
    ],
    load: () => import("./tools/spc-cpk"),
  },
  {
    id: "iso-tolerance",
    name: "ISO 2768 & 公差配合速查",
    shortName: "公差速查",
    subtitle: "未注线性/角度/形位公差 (f/m/c/v · H/K/L) 与 ISO 286 孔轴配合",
    description:
      "输入公称尺寸即时查询 ISO 2768-1/2（GB/T 1804 & GB/T 1184）未注公差与 ISO 286-1/2（GB/T 1800）全 28 字母孔轴极限偏差、配合剖面图、IT01–IT18 反查及批量 FAI/IQC 实测判合单。",
    category: "tolerance",
    status: "ready",
    icon: Ruler,
    accent: "#f59e0b",
    version: "1.0",
    keepAlive: true,
    tags: ["ISO 2768-mK", "ISO 286 孔轴配合", "IT01-IT18", "实测判合", "FAI 检核单"],
    highlights: [
      "覆盖 ISO 2768-1/2 线性、倒圆倒角、角度短边弦偏与直线/平面/垂直/对称/圆跳动",
      "完整内置 ISO 286 0–3150 mm 全 28 基本偏差字母、Δ 修正规则与零线公差带剖面图",
      "支持孔轴实测配对试装校验、过盈温差热装估算与按图纸公差反查 IT 加工工艺",
      "支持多特征批量尺寸检核表、本地离线归档，一键导出格式化 Excel 与高清速查卡",
    ],
    load: () => import("./tools/iso-tolerance"),
  },
];

export function getWorkbenchToolById(id: string): WorkbenchToolDefinition | undefined {
  return WORKBENCH_TOOLS.find((tool) => tool.id === id);
}
