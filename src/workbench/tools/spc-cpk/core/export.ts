/**
 * Report exporters for CPK / SPC Process Capability Analysis:
 * 1. Shop-floor plain-text / Markdown summary (WeCom / DingTalk / 8D / PPAP)
 * 2. Formatted 3-sheet ExcelJS workbook (Summary + SPC Subgroups + Raw Data)
 * 3. Batch ExcelJS history ledger export
 * 4. High-DPI (2x Retina) Canvas PNG Capability Analysis Report Image (with real Histogram + Normal curves + SPC Chart)
 */
import type {
  SavedSpcRecord,
  SpcAnalysisResult,
  SpcMetadata,
} from "../types";
import { GRADE_META } from "./engine";
import { inferDisplayDecimals } from "./parser";
import { normalPdf } from "./statistics";

function fmtIdx(v: number | null, d = 3): string {
  if (v === null || !Number.isFinite(v)) return "—";
  return v.toFixed(d);
}

function fmtPpm(ppm: number): string {
  if (!Number.isFinite(ppm)) return "—";
  if (ppm < 0.05) return "< 0.1";
  if (ppm < 10) return ppm.toFixed(1);
  return Math.round(ppm).toLocaleString("zh-CN");
}

function formatSpecLine(result: SpcAnalysisResult, unit: string): string {
  const u = unit ? ` ${unit}` : "";
  const { toleranceType, lsl, usl, target } = result.spec;
  if (toleranceType === "bilateral") {
    return `双边公差 LSL=${lsl}${u} / USL=${usl}${u}${target !== null ? ` / 目标=${target}${u}` : ""}`;
  }
  if (toleranceType === "upper_only") {
    return `单边上限（望小）USL=${usl}${u}`;
  }
  return `单边下限（望大）LSL=${lsl}${u}`;
}

/**
 * Plain-text summary ready to paste into ERP, 8D report, WeCom, DingTalk, or email.
 */
export function buildSpcSummaryText(
  result: SpcAnalysisResult,
  meta: SpcMetadata
): string {
  const dec = inferDisplayDecimals(
    result.spec.usl !== null && result.spec.lsl !== null
      ? result.spec.usl - result.spec.lsl
      : result.range
  );
  const now = new Date();
  const stamp = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(
    2,
    "0"
  )}-${String(now.getDate()).padStart(2, "0")} ${String(
    now.getHours()
  ).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;

  const u = meta.unit ? ` ${meta.unit}` : "";
  const gradeInfo = GRADE_META[result.capability.grade];
  const verdict =
    result.capability.meetsTarget === null
      ? "待评估"
      : result.capability.meetsTarget
        ? `达标 (≥ ${result.spec.cpkThreshold.toFixed(2)})`
        : `未达标 (< ${result.spec.cpkThreshold.toFixed(2)})`;

  const lines: string[] = [
    `【${meta.stage} CPK / SPC 过程能力分析报告】`,
    `分析时间：${stamp}`,
  ];
  if (meta.partName.trim()) lines.push(`物料/产品：${meta.partName.trim()}`);
  if (meta.characteristic.trim())
    lines.push(`检验特性：${meta.characteristic.trim()}`);
  if (meta.lotNo.trim() || meta.machine.trim()) {
    lines.push(
      `批次/机台：${[meta.lotNo.trim(), meta.machine.trim()].filter(Boolean).join(" | ")}`
    );
  }
  if (meta.operator.trim()) lines.push(`测量/分析人：${meta.operator.trim()}`);

  lines.push(
    `规格要求：${formatSpecLine(result, meta.unit)} | 目标 Cpk ≥ ${result.spec.cpkThreshold.toFixed(2)}`,
    `样本构成：N = ${result.count} 件 | 子组 n = ${result.subgroupSize} × ${result.subgroups.length} 组 (${result.effectiveChartType === "imr" ? "I-MR" : result.effectiveChartType === "xbar_r" ? "X̄-R" : "X̄-S"})`,
    `----------------------------------------`,
    `• 能力评级：${result.capability.grade} 级 · ${gradeInfo.label} → ${verdict}`,
    `• 短期能力：Cp = ${fmtIdx(result.capability.cp)} | Cpk = ${fmtIdx(result.capability.cpk)} (Cpu=${fmtIdx(result.capability.cpu)}, Cpl=${fmtIdx(result.capability.cpl)})`,
    `• 长期表现：Pp = ${fmtIdx(result.capability.pp)} | Ppk = ${fmtIdx(result.capability.ppk)} | Cpm = ${fmtIdx(result.capability.cpm)}${result.capability.ca !== null ? ` | 偏移度 Ca = ${(result.capability.ca * 100).toFixed(1)}%` : ""}`,
    `• 分布参数：均值 x̄ = ${result.mean.toFixed(dec)}${u} | σ组内 = ${result.sigmaWithin.toFixed(dec + 1)} | σ整体 = ${result.sigmaOverall.toFixed(dec + 1)} | 范围 [${result.min.toFixed(dec)}, ${result.max.toFixed(dec)}]`,
    `• 不良率与良率：实测超差 ${result.observed.totalOosCount}/${result.count} (${result.observed.yieldPercent.toFixed(2)}%) | 组内预期 ${fmtPpm(result.expectedWithin.ppmTotal)} PPM | 整体预期 ${fmtPpm(result.expectedOverall.ppmTotal)} PPM`,
    `• SPC 稳定性：${result.isInControl ? "统计受控（0 处判异）" : `检出 ${result.violations.length} 处判异信号`} | 正态检验 A²*=${result.normality.adAdjusted.toFixed(3)}, p=${result.normality.pValue < 0.001 ? "<0.001" : result.normality.pValue.toFixed(3)} (${result.normality.isNormal ? "符合正态" : "偏离正态"})`,
    `----------------------------------------`
  );

  if (result.diagnostics.length > 0) {
    lines.push("工程诊断与建议：");
    for (const d of result.diagnostics.slice(0, 4)) {
      lines.push(`- ${d.title}`);
    }
  }
  if (meta.notes.trim()) {
    lines.push(`备注：${meta.notes.trim()}`);
  }

  return lines.join("\n");
}

/**
 * Generate a 3-sheet formatted Excel (.xlsx) Process Capability & SPC Report.
 */
export async function buildSpcExcelBlob(
  result: SpcAnalysisResult,
  meta: SpcMetadata
): Promise<Blob> {
  const mod = await import("exceljs");
  const ExcelJS =
    (mod as unknown as { default?: typeof import("exceljs") }).default ?? mod;
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "QI/QC 质量工具台 · CPK / SPC 过程能力分析";
  workbook.created = new Date();

  const dec = inferDisplayDecimals(
    result.spec.usl !== null && result.spec.lsl !== null
      ? result.spec.usl - result.spec.lsl
      : result.range
  );
  const numFmt = `0.${"0".repeat(Math.min(5, Math.max(2, dec)))}`;
  const idxFmt = "0.000";

  // ===================== Sheet 1: 过程能力分析汇总 =====================
  const s1 = workbook.addWorksheet("过程能力分析汇总");
  s1.getColumn(1).width = 22;
  s1.getColumn(2).width = 22;
  s1.getColumn(3).width = 22;
  s1.getColumn(4).width = 24;

  s1.mergeCells("A1:D1");
  const t1 = s1.getCell("A1");
  t1.value = "CPK / SPC 过程能力与控制图分析报告";
  t1.font = { name: "Microsoft YaHei", size: 15, bold: true, color: { argb: "FF0F172A" } };
  t1.alignment = { vertical: "middle", horizontal: "left" };
  s1.getRow(1).height = 30;

  s1.mergeCells("A2:D2");
  const sub1 = s1.getCell("A2");
  sub1.value = `导出时间：${new Date().toLocaleString("zh-CN")} · 阶段：${meta.stage} · ${result.effectiveChartType === "imr" ? "I-MR 单值移动极差图" : result.effectiveChartType === "xbar_r" ? "X̄-R 均值极差图" : "X̄-S 均值标准差图"}`;
  sub1.font = { name: "Microsoft YaHei", size: 9.5, color: { argb: "FF64748B" } };
  s1.getRow(2).height = 18;

  const styleSectionHeader = (rowNum: number, title: string) => {
    s1.mergeCells(`A${rowNum}:D${rowNum}`);
    const cell = s1.getCell(`A${rowNum}`);
    cell.value = title;
    cell.font = { name: "Microsoft YaHei", size: 10.5, bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF18181B" } };
    cell.alignment = { vertical: "middle", horizontal: "left" };
    s1.getRow(rowNum).height = 22;
  };

  const writeKvRows = (
    startRow: number,
    pairs: Array<[string, string | number, string, string | number]>
  ): number => {
    let r = startRow;
    for (const [k1, v1, k2, v2] of pairs) {
      const row = s1.getRow(r);
      const vals = [k1, v1, k2, v2];
      vals.forEach((val, idx) => {
        const c = row.getCell(idx + 1);
        c.value = val;
        const isKey = idx === 0 || idx === 2;
        c.font = {
          name: "Microsoft YaHei",
          size: 9.5,
          bold: !isKey,
          color: { argb: isKey ? "FF52525B" : "FF09090B" },
        };
        if (isKey) {
          c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF4F4F5" } };
        }
        c.alignment = { vertical: "middle", horizontal: isKey ? "left" : "right" };
        c.border = {
          top: { style: "thin", color: { argb: "FFE4E4E7" } },
          bottom: { style: "thin", color: { argb: "FFE4E4E7" } },
          left: { style: "thin", color: { argb: "FFE4E4E7" } },
          right: { style: "thin", color: { argb: "FFE4E4E7" } },
        };
      });
      row.height = 20;
      r += 1;
    }
    return r;
  };

  let cur = 4;
  styleSectionHeader(cur++, "一、基本与规格信息");
  cur = writeKvRows(cur, [
    ["产品/物料名称", meta.partName || "—", "检验特性 / 尺寸", meta.characteristic || "—"],
    ["批次 / 工单号", meta.lotNo || "—", "设备 / 模腔 / 产线", meta.machine || "—"],
    ["公差类型", result.spec.toleranceType === "bilateral" ? "双边公差" : result.spec.toleranceType === "upper_only" ? "单边上限（望小）" : "单边下限（望大）", "测量单位", meta.unit || "—"],
    ["下公差 LSL", result.spec.lsl ?? "—", "上公差 USL", result.spec.usl ?? "—"],
    ["目标值 Target", result.spec.target ?? "—", "目标 Cpk 门槛", result.spec.cpkThreshold],
    ["样本总数 N", result.count, "子组构成", `n=${result.subgroupSize} × ${result.subgroups.length} 组`],
  ]);

  cur += 1;
  styleSectionHeader(cur++, "二、过程能力与性能指标 (AIAG SPC)");
  cur = writeKvRows(cur, [
    ["Cp (潜在能力)", result.capability.cp !== null ? Number(result.capability.cp.toFixed(4)) : "—", "Pp (整体潜在)", result.capability.pp !== null ? Number(result.capability.pp.toFixed(4)) : "—"],
    ["Cpk (短期能力)", result.capability.cpk !== null ? Number(result.capability.cpk.toFixed(4)) : "—", "Ppk (长期表现)", result.capability.ppk !== null ? Number(result.capability.ppk.toFixed(4)) : "—"],
    ["Cpu / Cpl", `${fmtIdx(result.capability.cpu)} / ${fmtIdx(result.capability.cpl)}`, "Ppu / Ppl", `${fmtIdx(result.capability.ppu)} / ${fmtIdx(result.capability.ppl)}`],
    ["Cpk 95% 置信区间", result.capability.cpkCi ? `[${result.capability.cpkCi.lower.toFixed(3)}, ${result.capability.cpkCi.upper.toFixed(3)}]` : "—", "偏移度 Ca / Cpm", `${result.capability.ca !== null ? `${(result.capability.ca * 100).toFixed(1)}%` : "—"} / ${fmtIdx(result.capability.cpm)}`],
    ["综合等级", `${result.capability.grade} 级 · ${GRADE_META[result.capability.grade].label}`, "达标结论", result.capability.meetsTarget === null ? "—" : result.capability.meetsTarget ? "合格 (PASS)" : "不合格 (FAIL)"],
  ]);

  cur += 1;
  styleSectionHeader(cur++, "三、统计分布、良率与稳定性");
  cur = writeKvRows(cur, [
    ["样本均值 x̄", Number(result.mean.toFixed(dec + 1)), "中位数 / 极差", `${result.median.toFixed(dec)} / ${result.range.toFixed(dec)}`],
    ["组内标准差 σ_within", Number(result.sigmaWithin.toFixed(dec + 2)), "整体标准差 σ_overall", Number(result.sigmaOverall.toFixed(dec + 2))],
    ["组内 σ 估计法", result.sigmaWithinMethod, "偏度 / 峰度", `${result.skewness.toFixed(3)} / ${result.kurtosis.toFixed(3)}`],
    ["实测超差件数", `${result.observed.totalOosCount} 件 (下${result.observed.belowLslCount} / 上${result.observed.aboveUslCount})`, "实测良率", `${result.observed.yieldPercent.toFixed(2)}%`],
    ["组内预期不良 (PPM)", fmtPpm(result.expectedWithin.ppmTotal), "整体预期不良 (PPM)", fmtPpm(result.expectedOverall.ppmTotal)],
    ["正态性 A²* / p 值", `${result.normality.adAdjusted.toFixed(3)} / ${result.normality.pValue < 0.001 ? "<0.001" : result.normality.pValue.toFixed(4)}`, "SPC 稳定性", result.isInControl ? "受控 (0 处判异)" : `失控 (${result.violations.length} 处判异)`],
  ]);

  if (result.diagnostics.length > 0) {
    cur += 1;
    styleSectionHeader(cur++, "四、工程诊断与改善建议");
    for (const d of result.diagnostics) {
      s1.mergeCells(`A${cur}:D${cur}`);
      const c = s1.getCell(`A${cur}`);
      c.value = `[${d.title}] ${d.detail}`;
      c.font = { name: "Microsoft YaHei", size: 9.5, color: { argb: "FF18181B" } };
      c.alignment = { vertical: "middle", horizontal: "left", wrapText: true };
      s1.getRow(cur).height = 30;
      cur += 1;
    }
  }

  // ===================== Sheet 2: 子组统计与控制限 =====================
  const s2 = workbook.addWorksheet("子组统计与控制限", {
    views: [{ state: "frozen", ySplit: 2 }],
  });
  const secLabel =
    result.effectiveChartType === "imr"
      ? "移动极差 MR"
      : result.effectiveChartType === "xbar_r"
        ? "子组极差 R"
        : "子组标准差 S";

  s2.mergeCells("A1:I1");
  s2.getCell("A1").value = `${result.primaryChartTitle} (${result.primaryLimits.lcl.toFixed(dec)} ~ ${result.primaryLimits.ucl.toFixed(dec)}) | ${result.secondaryChartTitle} (${result.secondaryLimits.lcl.toFixed(dec)} ~ ${result.secondaryLimits.ucl.toFixed(dec)})`;
  s2.getCell("A1").font = { name: "Microsoft YaHei", size: 10.5, bold: true, color: { argb: "FF0F172A" } };
  s2.getRow(1).height = 24;

  const s2Headers = [
    "子组序号",
    "样本范围",
    result.effectiveChartType === "imr" ? "单值 X" : "子组均值 X̄",
    secLabel,
    "主图 LCL",
    "主图 CL",
    "主图 UCL",
    "子组极小 / 极大",
    "SPC 判异状态",
  ];
  const s2HeadRow = s2.getRow(2);
  s2Headers.forEach((h, idx) => {
    const c = s2HeadRow.getCell(idx + 1);
    c.value = h;
    c.font = { name: "Microsoft YaHei", size: 9.5, bold: true, color: { argb: "FFFFFFFF" } };
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF18181B" } };
    c.alignment = { vertical: "middle", horizontal: "center" };
  });
  s2HeadRow.height = 22;
  [10, 14, 14, 14, 13, 13, 13, 22, 26].forEach((w, i) => {
    s2.getColumn(i + 1).width = w;
  });

  result.subgroups.forEach((g, idx) => {
    const row = s2.getRow(idx + 3);
    const hitRules = result.violations
      .filter((v) => v.pointIndices.includes(idx))
      .map((v) => `R${v.ruleId}(${v.chart === "primary" ? "主" : "副"})`);
    const uniqueRules = Array.from(new Set(hitRules));
    const secVal =
      result.effectiveChartType === "imr"
        ? g.movingRange
        : result.effectiveChartType === "xbar_r"
          ? g.range
          : g.stdDev;

    const vals = [
      g.index,
      g.startRow === g.endRow ? `#${g.startRow}` : `#${g.startRow}~#${g.endRow}`,
      g.mean,
      secVal !== null ? secVal : "—",
      result.primaryLimits.lcl,
      result.primaryLimits.cl,
      result.primaryLimits.ucl,
      `${g.min.toFixed(dec)} / ${g.max.toFixed(dec)}`,
      uniqueRules.length > 0 ? uniqueRules.join(", ") : "受控",
    ];
    vals.forEach((v, cIdx) => {
      const cell = row.getCell(cIdx + 1);
      cell.value = v;
      cell.font = {
        name: "Microsoft YaHei",
        size: 9.5,
        bold: cIdx === 8 && uniqueRules.length > 0,
        color: { argb: cIdx === 8 && uniqueRules.length > 0 ? "FFBE123C" : "FF18181B" },
      };
      if (typeof v === "number" && cIdx >= 2 && cIdx <= 6) {
        cell.numFmt = numFmt;
      }
      cell.alignment = { vertical: "middle", horizontal: "center" };
    });
    row.height = 19;
  });

  // ===================== Sheet 3: 原始实测数据明细 =====================
  const s3 = workbook.addWorksheet("原始实测数据明细", {
    views: [{ state: "frozen", ySplit: 1 }],
  });
  const s3Headers = ["序号", "所属子组", `实测值${meta.unit ? ` (${meta.unit})` : ""}`, "距目标偏差", "规格判定"];
  const s3HeadRow = s3.getRow(1);
  s3Headers.forEach((h, i) => {
    const c = s3HeadRow.getCell(i + 1);
    c.value = h;
    c.font = { name: "Microsoft YaHei", size: 9.5, bold: true, color: { argb: "FFFFFFFF" } };
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF18181B" } };
    c.alignment = { vertical: "middle", horizontal: "center" };
  });
  s3HeadRow.height = 22;
  [10, 12, 16, 16, 16].forEach((w, i) => {
    s3.getColumn(i + 1).width = w;
  });

  const refTarget =
    result.spec.target ??
    (result.spec.usl !== null && result.spec.lsl !== null
      ? (result.spec.usl + result.spec.lsl) / 2
      : null);

  result.values.forEach((v, i) => {
    const row = s3.getRow(i + 2);
    const subIdx = Math.floor(i / result.subgroupSize) + 1;
    const isLow =
      (result.spec.toleranceType === "bilateral" ||
        result.spec.toleranceType === "lower_only") &&
      result.spec.lsl !== null &&
      v < result.spec.lsl;
    const isHigh =
      (result.spec.toleranceType === "bilateral" ||
        result.spec.toleranceType === "upper_only") &&
      result.spec.usl !== null &&
      v > result.spec.usl;
    const status = isHigh ? "超上限 (>USL)" : isLow ? "超下限 (<LSL)" : "合格";

    const cells = [
      i + 1,
      subIdx <= result.subgroups.length ? `#${subIdx}` : "尾数未成组",
      v,
      refTarget !== null ? v - refTarget : "—",
      status,
    ];
    cells.forEach((val, cIdx) => {
      const c = row.getCell(cIdx + 1);
      c.value = val;
      c.font = {
        name: "Microsoft YaHei",
        size: 9.5,
        bold: cIdx === 4 && (isLow || isHigh),
        color: { argb: cIdx === 4 && (isLow || isHigh) ? "FFBE123C" : "FF18181B" },
      };
      if (typeof val === "number" && (cIdx === 2 || cIdx === 3)) {
        c.numFmt = cIdx === 2 ? numFmt : idxFmt;
      }
      c.alignment = { vertical: "middle", horizontal: "center" };
    });
    row.height = 19;
  });

  const buffer = await workbook.xlsx.writeBuffer();
  return new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

/**
 * Batch export saved CPK analysis history records into a consolidated Excel ledger.
 */
export async function buildSpcHistoryExcelBlob(
  records: SavedSpcRecord[]
): Promise<Blob> {
  const mod = await import("exceljs");
  const ExcelJS =
    (mod as unknown as { default?: typeof import("exceljs") }).default ?? mod;
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "QI/QC 质量工具台 · CPK / SPC 历史台账";
  workbook.created = new Date();

  const sheet = workbook.addWorksheet("CPK 过程能力记录汇总", {
    views: [{ state: "frozen", ySplit: 2 }],
  });

  sheet.mergeCells("A1:N1");
  sheet.getCell("A1").value = `CPK / SPC 过程能力分析历史汇总（共 ${records.length} 条记录）`;
  sheet.getCell("A1").font = { name: "Microsoft YaHei", size: 13, bold: true, color: { argb: "FF0F172A" } };
  sheet.getRow(1).height = 26;

  const headers = [
    "分析时间",
    "阶段",
    "物料/产品",
    "特性/尺寸",
    "批次/机台",
    "样本 N",
    "均值 x̄",
    "σ_within",
    "Cp",
    "Cpk",
    "Ppk",
    "评级",
    "实测超差",
    "SPC 判异 / 正态 p",
  ];
  const hRow = sheet.getRow(2);
  headers.forEach((h, i) => {
    const c = hRow.getCell(i + 1);
    c.value = h;
    c.font = { name: "Microsoft YaHei", size: 9.5, bold: true, color: { argb: "FFFFFFFF" } };
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF18181B" } };
    c.alignment = { vertical: "middle", horizontal: "center" };
  });
  hRow.height = 22;
  [18, 8, 20, 20, 18, 9, 12, 12, 9, 9, 9, 9, 10, 20].forEach((w, i) => {
    sheet.getColumn(i + 1).width = w;
  });

  records.forEach((rec, idx) => {
    const row = sheet.getRow(idx + 3);
    const vals = [
      rec.createdAt,
      rec.meta.stage,
      rec.meta.partName || "—",
      rec.meta.characteristic || "—",
      [rec.meta.lotNo, rec.meta.machine].filter(Boolean).join(" / ") || "—",
      rec.count,
      Number(rec.mean.toFixed(4)),
      Number(rec.sigmaWithin.toFixed(5)),
      rec.cp !== null ? Number(rec.cp.toFixed(3)) : "—",
      rec.cpk !== null ? Number(rec.cpk.toFixed(3)) : "—",
      rec.ppk !== null ? Number(rec.ppk.toFixed(3)) : "—",
      rec.grade,
      rec.oosCount,
      `${rec.violationCount === 0 ? "受控" : `${rec.violationCount}判异`} · p=${rec.normalityP < 0.001 ? "<0.001" : rec.normalityP.toFixed(3)}`,
    ];
    vals.forEach((v, cIdx) => {
      const cell = row.getCell(cIdx + 1);
      cell.value = v;
      cell.font = { name: "Microsoft YaHei", size: 9.5, color: { argb: "FF18181B" } };
      cell.alignment = { vertical: "middle", horizontal: cIdx >= 5 ? "center" : "left" };
    });
    row.height = 20;
  });

  const buffer = await workbook.xlsx.writeBuffer();
  return new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

/**
 * Render an executive 2x Retina PNG Capability Analysis Report Image using HTML5 Canvas,
 * complete with KPI metrics, Histogram + Normal Distribution curves, and SPC Control Chart.
 */
export async function renderSpcReportPngBlob(
  result: SpcAnalysisResult,
  meta: SpcMetadata
): Promise<Blob> {
  const scale = 2;
  const W = 1160;
  const H = 860;

  const canvas = document.createElement("canvas");
  canvas.width = W * scale;
  canvas.height = H * scale;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("无法创建 Canvas 绘图上下文");
  ctx.scale(scale, scale);

  const dec = inferDisplayDecimals(
    result.spec.usl !== null && result.spec.lsl !== null
      ? result.spec.usl - result.spec.lsl
      : result.range
  );
  const u = meta.unit ? ` ${meta.unit}` : "";

  // Porcelain background
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, W, H);

  // Top accent bar colored by capability grade
  const gradeTone = GRADE_META[result.capability.grade].tone;
  const accentMap = {
    emerald: "#059669",
    sky: "#0284c7",
    amber: "#d97706",
    orange: "#ea580c",
    rose: "#e11d48",
    zinc: "#52525b",
  };
  const accent = accentMap[gradeTone];
  ctx.fillStyle = accent;
  ctx.fillRect(0, 0, W, 6);

  // Header
  ctx.fillStyle = "#09090b";
  ctx.font = '700 23px "PingFang SC", "Microsoft YaHei", Inter, sans-serif';
  const titleMain = [
    `${meta.stage} 过程能力分析报告`,
    meta.partName.trim() ? `· ${meta.partName.trim()}` : "",
    meta.characteristic.trim() ? `(${meta.characteristic.trim()})` : "",
  ]
    .filter(Boolean)
    .join(" ");
  ctx.fillText(titleMain.slice(0, 56), 36, 48);

  ctx.fillStyle = "#71717a";
  ctx.font = '500 12px "JetBrains Mono", "PingFang SC", monospace';
  const subParts = [
    formatSpecLine(result, meta.unit),
    `N=${result.count} (n=${result.subgroupSize}×${result.subgroups.length}组)`,
    meta.lotNo ? `批号 ${meta.lotNo}` : "",
    meta.machine ? `机台 ${meta.machine}` : "",
    meta.operator ? `检验 ${meta.operator}` : "",
  ].filter(Boolean);
  ctx.fillText(subParts.join("  |  ").slice(0, 128), 36, 70);

  // Top-right Grade Badge
  const badgeText = `${result.capability.grade} 级 · Cpk ${fmtIdx(result.capability.cpk, 2)}`;
  ctx.font = '700 14px "JetBrains Mono", "PingFang SC", sans-serif';
  const badgeW = ctx.measureText(badgeText).width + 36;
  const badgeX = W - 36 - badgeW;
  ctx.fillStyle = `${accent}16`;
  ctx.strokeStyle = accent;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.roundRect(badgeX, 24, badgeW, 38, 10);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = accent;
  ctx.fillText(badgeText, badgeX + 18, 48);

  // KPI Strip (6 metric cards)
  const kpis: Array<{ label: string; value: string; sub: string; color?: string }> = [
    {
      label: "Cpk (短期能力)",
      value: fmtIdx(result.capability.cpk, 3),
      sub: result.capability.cpkCi
        ? `95% CI [${result.capability.cpkCi.lower.toFixed(2)}, ${result.capability.cpkCi.upper.toFixed(2)}]`
        : `目标 ≥ ${result.spec.cpkThreshold.toFixed(2)}`,
      color: accent,
    },
    {
      label: "Cp / 偏移 Ca",
      value: fmtIdx(result.capability.cp, 3),
      sub:
        result.capability.ca !== null
          ? `偏移 Ca ${(result.capability.ca * 100).toFixed(1)}%`
          : "单边公差不计 Cp",
    },
    {
      label: "Ppk (长期表现)",
      value: fmtIdx(result.capability.ppk, 3),
      sub: `Pp = ${fmtIdx(result.capability.pp, 3)} | Cpm = ${fmtIdx(result.capability.cpm, 2)}`,
    },
    {
      label: "均值 x̄ / 标准差",
      value: `${result.mean.toFixed(dec)}${u}`,
      sub: `σw=${result.sigmaWithin.toFixed(dec + 1)} · σo=${result.sigmaOverall.toFixed(dec + 1)}`,
    },
    {
      label: "组内预期不良",
      value: `${fmtPpm(result.expectedWithin.ppmTotal)} PPM`,
      sub: `实测超差 ${result.observed.totalOosCount}/${result.count} (${result.observed.yieldPercent.toFixed(1)}%)`,
      color: result.observed.totalOosCount > 0 ? "#e11d48" : "#059669",
    },
    {
      label: "稳定性 / 正态性",
      value: result.isInControl ? "SPC 受控" : `${result.violations.length} 处判异`,
      sub: `AD p = ${result.normality.pValue < 0.001 ? "<0.001" : result.normality.pValue.toFixed(3)} (${result.normality.isNormal ? "正态" : "偏态"})`,
      color: result.isInControl ? "#059669" : "#e11d48",
    },
  ];

  const kpiGap = 12;
  const kpiW = (W - 72 - kpiGap * 5) / 6;
  const kpiY = 88;
  const kpiH = 78;
  kpis.forEach((k, i) => {
    const x = 36 + i * (kpiW + kpiGap);
    ctx.fillStyle = "#fafafa";
    ctx.strokeStyle = "#e4e4e7";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(x, kpiY, kpiW, kpiH, 10);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = "#71717a";
    ctx.font = '500 11px "PingFang SC", "Microsoft YaHei", sans-serif';
    ctx.fillText(k.label, x + 12, kpiY + 20);

    ctx.fillStyle = k.color || "#09090b";
    ctx.font = '700 19px "JetBrains Mono", "PingFang SC", monospace';
    ctx.fillText(k.value, x + 12, kpiY + 46);

    ctx.fillStyle = "#71717a";
    ctx.font = '500 10px "JetBrains Mono", "PingFang SC", sans-serif';
    ctx.fillText(k.sub.slice(0, 24), x + 12, kpiY + 65);
  });

  // ===================== Chart 1 (Left): Capability Histogram + Normal Curves =====================
  const histBox = { x: 36, y: 184, w: 540, h: 310 };
  drawCardFrame(ctx, histBox.x, histBox.y, histBox.w, histBox.h, "过程能力分布直方图 & 正态拟合曲线");

  const hPad = { top: 44, right: 20, bottom: 42, left: 44 };
  const hpX = histBox.x + hPad.left;
  const hpY = histBox.y + hPad.top;
  const hpW = histBox.w - hPad.left - hPad.right;
  const hpH = histBox.h - hPad.top - hPad.bottom;

  // Compute X domain covering data + spec limits + ±3.5 sigma
  const xCandidates = [
    result.min,
    result.max,
    result.mean - 3.5 * Math.max(result.sigmaOverall, result.sigmaWithin),
    result.mean + 3.5 * Math.max(result.sigmaOverall, result.sigmaWithin),
  ];
  if (result.spec.lsl !== null) xCandidates.push(result.spec.lsl);
  if (result.spec.usl !== null) xCandidates.push(result.spec.usl);
  const rawXMin = Math.min(...xCandidates);
  const rawXMax = Math.max(...xCandidates);
  const xPadAmt = Math.max((rawXMax - rawXMin) * 0.08, 1e-6);
  const hxMin = rawXMin - xPadAmt;
  const hxMax = rawXMax + xPadAmt;

  const hToX = (v: number) => hpX + ((v - hxMin) / (hxMax - hxMin)) * hpW;

  // Determine Y max in density space
  const peakWithin =
    result.sigmaWithin > 0 ? normalPdf(result.mean, result.mean, result.sigmaWithin) : 0;
  const peakOverall =
    result.sigmaOverall > 0 ? normalPdf(result.mean, result.mean, result.sigmaOverall) : 0;
  const maxBinDensity = Math.max(...result.histogram.map((b) => b.density), 0);
  const hyMax = Math.max(maxBinDensity, peakWithin, peakOverall, 1e-6) * 1.15;
  const hToY = (d: number) => hpY + (1 - d / hyMax) * hpH;

  // Gridlines
  ctx.strokeStyle = "#f4f4f5";
  ctx.lineWidth = 1;
  for (let i = 0; i <= 4; i++) {
    const gy = hpY + (hpH * i) / 4;
    ctx.beginPath();
    ctx.moveTo(hpX, gy);
    ctx.lineTo(hpX + hpW, gy);
    ctx.stroke();
  }

  // Bars
  for (const bin of result.histogram) {
    const bx1 = hToX(bin.start);
    const bx2 = hToX(bin.end);
    const by = hToY(bin.density);
    const bh = hpY + hpH - by;
    ctx.fillStyle = bin.isOutOfSpec ? "rgba(244, 63, 94, 0.55)" : "rgba(99, 102, 241, 0.35)";
    ctx.strokeStyle = bin.isOutOfSpec ? "#e11d48" : "#6366f1";
    ctx.lineWidth = 1;
    ctx.fillRect(bx1 + 1, by, Math.max(2, bx2 - bx1 - 2), Math.max(0, bh));
    ctx.strokeRect(bx1 + 1, by, Math.max(2, bx2 - bx1 - 2), Math.max(0, bh));
  }

  // Overall normal curve (dashed amber)
  if (result.sigmaOverall > 0) {
    ctx.save();
    ctx.strokeStyle = "#f59e0b";
    ctx.lineWidth = 1.75;
    ctx.setLineDash([5, 4]);
    ctx.beginPath();
    for (let s = 0; s <= 120; s++) {
      const xv = hxMin + ((hxMax - hxMin) * s) / 120;
      const yv = hToY(normalPdf(xv, result.mean, result.sigmaOverall));
      if (s === 0) ctx.moveTo(hToX(xv), yv);
      else ctx.lineTo(hToX(xv), yv);
    }
    ctx.stroke();
    ctx.restore();
  }

  // Within normal curve (solid indigo)
  if (result.sigmaWithin > 0) {
    ctx.save();
    ctx.strokeStyle = "#4f46e5";
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    for (let s = 0; s <= 120; s++) {
      const xv = hxMin + ((hxMax - hxMin) * s) / 120;
      const yv = hToY(normalPdf(xv, result.mean, result.sigmaWithin));
      if (s === 0) ctx.moveTo(hToX(xv), yv);
      else ctx.lineTo(hToX(xv), yv);
    }
    ctx.stroke();
    ctx.restore();
  }

  // Spec & Mean vertical lines
  const drawVertLine = (val: number, label: string, color: string, dashed = false) => {
    const lx = hToX(val);
    if (lx < hpX - 4 || lx > hpX + hpW + 4) return;
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.6;
    if (dashed) ctx.setLineDash([4, 3]);
    ctx.beginPath();
    ctx.moveTo(lx, hpY);
    ctx.lineTo(lx, hpY + hpH);
    ctx.stroke();
    ctx.restore();

    ctx.fillStyle = color;
    ctx.font = '700 10px "JetBrains Mono", sans-serif';
    ctx.textAlign = "center";
    ctx.fillText(label, lx, hpY - 6);
    ctx.textAlign = "left";
  };

  if (
    (result.spec.toleranceType === "bilateral" ||
      result.spec.toleranceType === "lower_only") &&
    result.spec.lsl !== null
  ) {
    drawVertLine(result.spec.lsl, `LSL ${result.spec.lsl}`, "#e11d48", false);
  }
  if (
    (result.spec.toleranceType === "bilateral" ||
      result.spec.toleranceType === "upper_only") &&
    result.spec.usl !== null
  ) {
    drawVertLine(result.spec.usl, `USL ${result.spec.usl}`, "#e11d48", false);
  }
  drawVertLine(result.mean, `x̄`, "#4f46e5", true);

  // X axis ticks
  ctx.fillStyle = "#71717a";
  ctx.font = '500 10px "JetBrains Mono", monospace';
  ctx.textAlign = "center";
  for (let t = 0; t <= 4; t++) {
    const v = hxMin + ((hxMax - hxMin) * t) / 4;
    ctx.fillText(v.toFixed(dec), hToX(v), hpY + hpH + 16);
  }
  ctx.textAlign = "left";

  // Histogram legend
  ctx.font = '500 10px "PingFang SC", sans-serif';
  ctx.fillStyle = "#4f46e5";
  ctx.fillText("— 组内正态 (Cpk)", hpX, hpY + hpH + 34);
  ctx.fillStyle = "#d97706";
  ctx.fillText("--- 整体正态 (Ppk)", hpX + 115, hpY + hpH + 34);
  ctx.fillStyle = "#e11d48";
  ctx.fillText("■ 超差区间", hpX + 235, hpY + hpH + 34);

  // ===================== Chart 2 (Right): Primary SPC Control Chart =====================
  const spcBox = { x: 590, y: 184, w: 534, h: 310 };
  drawCardFrame(ctx, spcBox.x, spcBox.y, spcBox.w, spcBox.h, result.primaryChartTitle);

  const sPad = { top: 44, right: 64, bottom: 42, left: 52 };
  const spX = spcBox.x + sPad.left;
  const spY = spcBox.y + sPad.top;
  const spW = spcBox.w - sPad.left - sPad.right;
  const spH = spcBox.h - sPad.top - sPad.bottom;

  const pSeries = result.primarySeries;
  const pLim = result.primaryLimits;
  const syAll = [...pSeries, pLim.ucl, pLim.lcl, pLim.cl];
  const syMinRaw = Math.min(...syAll);
  const syMaxRaw = Math.max(...syAll);
  const sySpan = Math.max(syMaxRaw - syMinRaw, 1e-6);
  const syMin = syMinRaw - sySpan * 0.12;
  const syMax = syMaxRaw + sySpan * 0.12;
  const sToX = (i: number) =>
    pSeries.length <= 1 ? spX + spW / 2 : spX + (i / (pSeries.length - 1)) * spW;
  const sToY = (v: number) => spY + (1 - (v - syMin) / (syMax - syMin)) * spH;

  // Control limit lines
  const drawHLine = (val: number, tag: string, color: string, dashed: boolean) => {
    const y = sToY(val);
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.4;
    if (dashed) ctx.setLineDash([5, 4]);
    ctx.beginPath();
    ctx.moveTo(spX, y);
    ctx.lineTo(spX + spW, y);
    ctx.stroke();
    ctx.restore();
    ctx.fillStyle = color;
    ctx.font = '600 9.5px "JetBrains Mono", monospace';
    ctx.fillText(`${tag}`, spX + spW + 5, y + 3);
  };
  drawHLine(pLim.ucl, `UCL ${pLim.ucl.toFixed(dec)}`, "#e11d48", true);
  drawHLine(pLim.cl, `CL  ${pLim.cl.toFixed(dec)}`, "#059669", false);
  drawHLine(pLim.lcl, `LCL ${pLim.lcl.toFixed(dec)}`, "#e11d48", true);

  // Polyline
  ctx.strokeStyle = "#4f46e5";
  ctx.lineWidth = 1.8;
  ctx.beginPath();
  pSeries.forEach((v, i) => {
    const x = sToX(i);
    const y = sToY(v);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();

  // Dots
  pSeries.forEach((v, i) => {
    const x = sToX(i);
    const y = sToY(v);
    const isHit = result.primaryViolationPointSet.has(i);
    ctx.beginPath();
    ctx.arc(x, y, isHit ? 4.5 : 2.8, 0, Math.PI * 2);
    ctx.fillStyle = isHit ? "#e11d48" : "#4f46e5";
    ctx.fill();
    if (isHit) {
      ctx.strokeStyle = "rgba(225, 29, 72, 0.35)";
      ctx.lineWidth = 3;
      ctx.stroke();
    }
  });

  // Axis labels on SPC chart
  ctx.fillStyle = "#71717a";
  ctx.font = '500 10px "JetBrains Mono", monospace';
  ctx.fillText("#1", spX, spY + spH + 16);
  ctx.textAlign = "right";
  ctx.fillText(`#${pSeries.length}`, spX + spW, spY + spH + 16);
  ctx.textAlign = "left";
  ctx.fillText(
    `共 ${result.subgroups.length} 组 · ${result.isInControl ? "无异常信号" : `红点为 Nelson 判异点 (${result.violations.length} 处)`}`,
    spX,
    spY + spH + 34
  );

  // ===================== Bottom Strip: Summary Stats Table + Engineering Diagnosis =====================
  const diagBox = { x: 36, y: 512, w: W - 72, h: 296 };
  drawCardFrame(ctx, diagBox.x, diagBox.y, diagBox.w, diagBox.h, "统计参数明细与智能工程诊断结论");

  // Left sub-table: key stats
  const statPairs: Array<[string, string]> = [
    ["样本量 N / 子组", `${result.count} 件 / n=${result.subgroupSize} × ${result.subgroups.length} 组`],
    ["最小 / 中位 / 最大", `${result.min.toFixed(dec)} / ${result.median.toFixed(dec)} / ${result.max.toFixed(dec)}`],
    ["四分位 Q1 / Q3 / IQR", `${result.q1.toFixed(dec)} / ${result.q3.toFixed(dec)} / ${result.iqr.toFixed(dec)}`],
    ["偏度 / 峰度", `${result.skewness.toFixed(3)} / ${result.kurtosis.toFixed(3)}`],
    ["组内 σ 估计法", result.sigmaWithinMethod],
    ["Cpu / Cpl", `${fmtIdx(result.capability.cpu)} / ${fmtIdx(result.capability.cpl)}`],
    ["Ppu / Ppl", `${fmtIdx(result.capability.ppu)} / ${fmtIdx(result.capability.ppl)}`],
    ["组内预期良率 / PPM", `${result.expectedWithin.yieldPercent.toFixed(3)}% / ${fmtPpm(result.expectedWithin.ppmTotal)} PPM`],
    ["整体预期良率 / PPM", `${result.expectedOverall.yieldPercent.toFixed(3)}% / ${fmtPpm(result.expectedOverall.ppmTotal)} PPM`],
  ];

  const colLeftX = diagBox.x + 18;
  statPairs.forEach(([k, v], i) => {
    const ry = diagBox.y + 44 + i * 26;
    if (i % 2 === 0) {
      ctx.fillStyle = "#fafafa";
      ctx.fillRect(colLeftX - 4, ry - 14, 420, 22);
    }
    ctx.fillStyle = "#71717a";
    ctx.font = '500 11px "PingFang SC", "Microsoft YaHei", sans-serif';
    ctx.fillText(k, colLeftX + 4, ry);
    ctx.fillStyle = "#09090b";
    ctx.font = '600 11.5px "JetBrains Mono", "PingFang SC", sans-serif';
    ctx.fillText(v.slice(0, 34), colLeftX + 148, ry);
  });

  // Right column: Diagnostics list
  const diagX = diagBox.x + 464;
  const diagW = diagBox.w - 482;
  let dy = diagBox.y + 42;
  const toneColors = {
    success: { bg: "#ecfdf5", border: "#6ee7b7", text: "#047857" },
    info: { bg: "#eff6ff", border: "#93c5fd", text: "#1d4ed8" },
    warning: { bg: "#fffbeb", border: "#fcd34d", text: "#b45309" },
    danger: { bg: "#fff1f2", border: "#fda4af", text: "#be123c" },
  };
  for (const d of result.diagnostics.slice(0, 4)) {
    const t = toneColors[d.severity];
    ctx.fillStyle = t.bg;
    ctx.strokeStyle = t.border;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(diagX, dy - 12, diagW, 54, 8);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = t.text;
    ctx.font = '700 11.5px "PingFang SC", "Microsoft YaHei", sans-serif';
    ctx.fillText(d.title.slice(0, 52), diagX + 12, dy + 6);

    ctx.fillStyle = "#3f3f46";
    ctx.font = '400 10.5px "PingFang SC", "Microsoft YaHei", sans-serif';
    const d1 = d.detail.slice(0, 56);
    const d2 = d.detail.length > 56 ? d.detail.slice(56, 112) : "";
    ctx.fillText(d1, diagX + 12, dy + 23);
    if (d2) ctx.fillText(d2 + (d.detail.length > 112 ? "…" : ""), diagX + 12, dy + 37);

    dy += 62;
  }

  // Footer
  ctx.fillStyle = "#a1a1aa";
  ctx.font = '500 11px "JetBrains Mono", "PingFang SC", sans-serif';
  ctx.fillText(
    `生成时间 ${new Date().toLocaleString("zh-CN")} · QI/QC 质量工具台 · CPK / SPC 过程能力分析（AIAG SPC / GB/T 4091 本地离线计算）`,
    36,
    H - 18
  );

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("PNG 报告图片编码失败"));
    }, "image/png");
  });
}

function drawCardFrame(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  title: string
) {
  ctx.fillStyle = "#ffffff";
  ctx.strokeStyle = "#e4e4e7";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, 12);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = "#18181b";
  ctx.font = '700 12.5px "PingFang SC", "Microsoft YaHei", sans-serif';
  ctx.fillText(title, x + 16, y + 23);
}
