/**
 * Exporters for ISO 2768 & ISO 286 Tolerance & Fit Quick Reference:
 * 1. Shop-floor plain-text summaries (ISO 2768 / ISO 286 Fit / Batch Checksheet)
 * 2. Formatted ExcelJS workbooks (.xlsx) for single checksheet & batch history archive
 * 3. High-DPI (2x Retina) Canvas PNG Reference Card (Fit Zone Profile / Checksheet Verdict Card)
 */
import type {
  ChecksheetMetadata,
  Iso2768GeomClass,
  Iso2768GeomEvaluation,
  Iso2768LinearClass,
  Iso2768LinearEvaluation,
  Iso286FitResult,
  MeasurementEvaluation,
  ResolvedChecksheetRow,
  SavedToleranceRecord,
} from "../types";
import {
  formatSignedMicrons,
  formatSignedMm,
  inferMmDecimals,
} from "./iso286Engine";
import { resolveChecksheetItem, summarizeChecksheet } from "./inspector";

function formatTimestamp(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(
    2,
    "0"
  )}-${String(now.getDate()).padStart(2, "0")} ${String(
    now.getHours()
  ).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
}

/**
 * Plain-text summary for ISO 2768 lookup.
 */
export function buildIso2768SummaryText(params: {
  linearClass: Iso2768LinearClass;
  geomClass: Iso2768GeomClass;
  linearEval: Iso2768LinearEvaluation;
  geomEval: Iso2768GeomEvaluation;
  measurement?: MeasurementEvaluation | null;
}): string {
  const { linearClass, geomClass, linearEval, geomEval, measurement } = params;
  const lines = [
    `【ISO 2768-${linearClass}${geomClass} 未注公差速查】`,
    `对应国标：GB/T 1804-${linearClass} & GB/T 1184-${geomClass}`,
    `查询时间：${formatTimestamp()}`,
    `----------------------------------------`,
    `• 公称尺寸：${linearEval.nominal} mm（分段 ${linearEval.rangeLabel}）`,
    linearEval.toleranceMm !== null
      ? `• 未注${linearEval.kind === "chamfer" ? "倒角/倒圆" : "线性"}公差：±${linearEval.toleranceMm} mm → 合格范围 [${linearEval.lowerLimitMm?.toFixed(3)}, ${linearEval.upperLimitMm?.toFixed(3)}] mm`
      : `• 未注线性公差：该尺寸段无定义（需图纸单独标注）`,
  ];

  if (measurement && measurement.measured !== null) {
    lines.push(
      `• 实测判定：${measurement.measured} mm → ${measurement.verdict === "ng" ? "NG 超差" : measurement.verdict === "warning" ? "临界合格" : "OK 合格"}（${measurement.summaryText}）`
    );
  }

  lines.push(
    `• 未注形位公差 (${geomClass} 级，按长度 ${geomEval.nominalMm} mm)：`,
    `  直线度/平面度 ≤ ${geomEval.straightnessFlatness.valueMm ?? "—"} mm | 垂直度 ≤ ${geomEval.perpendicularity.valueMm ?? "—"} mm | 对称度 ≤ ${geomEval.symmetry.valueMm ?? "—"} mm | 圆跳动 ≤ ${geomEval.runout.valueMm} mm`
  );
  return lines.join("\n");
}

/**
 * Plain-text summary for ISO 286 Hole/Shaft Fit calculation.
 */
export function buildFitSummaryText(params: {
  fit: Iso286FitResult;
  measuredHole?: number | null;
  measuredShaft?: number | null;
}): string {
  const { fit, measuredHole, measuredShaft } = params;
  const hd = inferMmDecimals(fit.hole.itMicrons);
  const sd = inferMmDecimals(fit.shaft.itMicrons);
  const lines = [
    `【ISO 286 / GB/T 1800 孔轴配合速查】`,
    `配合代号：Ø${fit.nominalMm} ${fit.fitCode}（${fit.fitNatureLabel}）`,
    `尺寸分段：${fit.hole.stepLabel} | 查询时间：${formatTimestamp()}`,
    `----------------------------------------`,
    `• 孔 ${fit.hole.designation}：ES = ${formatSignedMicrons(fit.hole.upperDevMicrons)} µm (${formatSignedMm(fit.hole.upperDevMm, hd)} mm) / EI = ${formatSignedMicrons(fit.hole.lowerDevMicrons)} µm (${formatSignedMm(fit.hole.lowerDevMm, hd)} mm)`,
    `  孔极限尺寸：${fit.hole.minSizeMm.toFixed(hd)} ～ ${fit.hole.maxSizeMm.toFixed(hd)} mm（公差带 IT${fit.hole.grade} = ${fit.hole.itMicrons} µm）`,
    `• 轴 ${fit.shaft.designation}：es = ${formatSignedMicrons(fit.shaft.upperDevMicrons)} µm (${formatSignedMm(fit.shaft.upperDevMm, sd)} mm) / ei = ${formatSignedMicrons(fit.shaft.lowerDevMicrons)} µm (${formatSignedMm(fit.shaft.lowerDevMm, sd)} mm)`,
    `  轴极限尺寸：${fit.shaft.minSizeMm.toFixed(sd)} ～ ${fit.shaft.maxSizeMm.toFixed(sd)} mm（公差带 IT${fit.shaft.grade} = ${fit.shaft.itMicrons} µm）`,
    `• 配合极限（Tf = ${fit.fitToleranceMicrons} µm）：`,
  ];

  if (fit.fitNature === "clearance") {
    lines.push(
      `  最小间隙 Xmin = +${fit.minClearanceMicrons} µm | 最大间隙 Xmax = +${fit.maxClearanceMicrons} µm | 平均间隙 = +${fit.meanClearanceMicrons} µm`
    );
  } else if (fit.fitNature === "interference") {
    lines.push(
      `  最小过盈 Ymin = -${fit.minInterferenceMicrons} µm | 最大过盈 Ymax = -${fit.maxInterferenceMicrons} µm | 平均过盈 = ${fit.meanClearanceMicrons} µm`
    );
  } else {
    lines.push(
      `  最大间隙 Xmax = +${fit.maxClearanceMicrons} µm | 最大过盈 Ymax = -${fit.maxInterferenceMicrons} µm | 间隙占比 ${fit.clearanceRatioPercent}%`
    );
  }

  if (measuredHole != null && measuredShaft != null) {
    const actualDiffUm = Number(((measuredHole - measuredShaft) * 1000).toFixed(1));
    lines.push(
      `• 实测配对：孔 ${measuredHole} mm / 轴 ${measuredShaft} mm → 实际${actualDiffUm >= 0 ? "间隙" : "过盈"} ${formatSignedMicrons(actualDiffUm)} µm`
    );
  }
  if (fit.applicationHint) {
    lines.push(`• 典型应用：${fit.applicationHint}`);
  }
  return lines.join("\n");
}

/**
 * Plain-text summary for Batch Dimensional Checksheet.
 */
export function buildChecksheetSummaryText(
  rows: readonly ResolvedChecksheetRow[],
  meta: ChecksheetMetadata
): string {
  const sum = summarizeChecksheet(rows);
  const verdictText =
    sum.overallVerdict === "FAIL"
      ? `不合格 (FAIL · ${sum.ngCount} 项超差)`
      : sum.overallVerdict === "PASS"
        ? `合格 (PASS · ${sum.okCount + sum.warningCount}/${sum.total})`
        : "待检验 (PENDING)";

  const lines: string[] = [
    `【${meta.stage} 尺寸公差检核报告】`,
    `检验时间：${formatTimestamp()} | 执行标准：${meta.drawingStandard || "ISO 2768 / ISO 286"}`,
  ];
  if (meta.partName.trim()) lines.push(`零件名称：${meta.partName.trim()}`);
  if (meta.drawingNo.trim() || meta.lotNo.trim()) {
    lines.push(
      `图号 / 批次：${[meta.drawingNo.trim(), meta.lotNo.trim()].filter(Boolean).join(" | ")}`
    );
  }
  if (meta.inspector.trim()) lines.push(`检验员：${meta.inspector.trim()}`);
  lines.push(
    `综合结论：${verdictText}${sum.warningCount > 0 ? `（含 ${sum.warningCount} 项临界预警）` : ""}`,
    `----------------------------------------`
  );

  for (const row of rows) {
    const tag =
      row.evaluation.verdict === "ok"
        ? "OK"
        : row.evaluation.verdict === "warning"
          ? "WARN"
          : row.evaluation.verdict === "ng"
            ? "NG"
            : "待测";
    const limits =
      row.lowerLimit !== null && row.upperLimit !== null
        ? row.unilateral
          ? `≤ ${row.upperLimit}`
          : `[${row.lowerLimit}, ${row.upperLimit}]`
        : "无效";
    const measStr =
      row.item.measured !== null ? `${row.item.measured}${row.item.unit}` : "—";
    lines.push(
      `#${row.item.balloonNo || "-"} ${row.item.featureName} | ${row.standardSpecLabel} | 范围 ${limits} | 实测 ${measStr} → [${tag}]`
    );
  }
  if (meta.notes.trim()) {
    lines.push(`----------------------------------------`, `备注：${meta.notes.trim()}`);
  }
  return lines.join("\n");
}

/**
 * Generate a formatted multi-sheet ExcelJS workbook (.xlsx) for a Dimensional Checksheet.
 */
export async function buildChecksheetExcelBlob(
  rows: readonly ResolvedChecksheetRow[],
  meta: ChecksheetMetadata,
  activeFit?: Iso286FitResult | null
): Promise<Blob> {
  const mod = await import("exceljs");
  const ExcelJS =
    (mod as unknown as { default?: typeof import("exceljs") }).default ?? mod;
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "QI/QC 质量工具台 · ISO 2768 & 公差配合速查";
  workbook.created = new Date();

  const sum = summarizeChecksheet(rows);
  const s1 = workbook.addWorksheet("尺寸公差检核单", {
    views: [{ state: "frozen", ySplit: 6 }],
  });

  s1.columns = [
    { width: 8 },
    { width: 24 },
    { width: 24 },
    { width: 12 },
    { width: 12 },
    { width: 12 },
    { width: 13 },
    { width: 13 },
    { width: 13 },
    { width: 13 },
    { width: 12 },
    { width: 20 },
  ];

  s1.mergeCells("A1:L1");
  const title = s1.getCell("A1");
  title.value = `${meta.stage} 尺寸公差检核报告（ISO 2768 / ISO 286）`;
  title.font = { name: "Microsoft YaHei", size: 15, bold: true, color: { argb: "FF0F172A" } };
  title.alignment = { vertical: "middle", horizontal: "left" };
  s1.getRow(1).height = 30;

  s1.mergeCells("A2:L2");
  const sub = s1.getCell("A2");
  sub.value = `导出时间：${formatTimestamp()} · 零件：${meta.partName || "—"} · 图号：${meta.drawingNo || "—"} · 批次：${meta.lotNo || "—"} · 执行标准：${meta.drawingStandard || "ISO 2768-mK"}`;
  sub.font = { name: "Microsoft YaHei", size: 9.5, color: { argb: "FF64748B" } };
  s1.getRow(2).height = 18;

  // Summary strip row 4
  const summaryCells: Array<[string, string | number]> = [
    ["A4", "检验总项数"],
    ["B4", sum.total],
    ["C4", "合格 (OK)"],
    ["D4", sum.okCount],
    ["E4", "临界预警"],
    ["F4", sum.warningCount],
    ["G4", "超差 (NG)"],
    ["H4", sum.ngCount],
    ["I4", "合格率"],
    ["J4", sum.passRatePercent !== null ? `${sum.passRatePercent}%` : "—"],
    ["K4", "综合结论"],
    ["L4", sum.overallVerdict],
  ];
  for (const [ref, val] of summaryCells) {
    const c = s1.getCell(ref);
    c.value = val;
    const isLabel = ["A4", "C4", "E4", "G4", "I4", "K4"].includes(ref);
    c.font = {
      name: "Microsoft YaHei",
      size: 9.5,
      bold: !isLabel,
      color: {
        argb:
          ref === "L4"
            ? sum.overallVerdict === "FAIL"
              ? "FFBE123C"
              : sum.overallVerdict === "PASS"
                ? "FF047857"
                : "FF52525B"
            : isLabel
              ? "FF52525B"
              : "FF09090B",
      },
    };
    c.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: {
        argb:
          ref === "L4"
            ? sum.overallVerdict === "FAIL"
              ? "FFFFE4E6"
              : sum.overallVerdict === "PASS"
                ? "FFD1FAE5"
                : "FFF4F4F5"
            : isLabel
              ? "FFF4F4F5"
              : "FFFFFFFF",
      },
    };
    c.alignment = { vertical: "middle", horizontal: isLabel ? "left" : "center" };
    c.border = {
      top: { style: "thin", color: { argb: "FFE4E4E7" } },
      bottom: { style: "thin", color: { argb: "FFE4E4E7" } },
      left: { style: "thin", color: { argb: "FFE4E4E7" } },
      right: { style: "thin", color: { argb: "FFE4E4E7" } },
    };
  }
  s1.getRow(4).height = 22;

  // Table header row 6
  const headers = [
    "气泡号",
    "尺寸 / 特征名称",
    "公差标准依据",
    "公称值",
    "上偏差",
    "下偏差",
    "下限 (LSL)",
    "上限 (USL)",
    "实测值",
    "实测偏差",
    "判定结果",
    "余量与备注",
  ];
  const headerRow = s1.getRow(6);
  headers.forEach((h, i) => {
    const c = headerRow.getCell(i + 1);
    c.value = h;
    c.font = { name: "Microsoft YaHei", size: 9.5, bold: true, color: { argb: "FFFFFFFF" } };
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF18181B" } };
    c.alignment = { vertical: "middle", horizontal: "center" };
  });
  headerRow.height = 24;

  rows.forEach((row, idx) => {
    const r = s1.getRow(7 + idx);
    const v = row.evaluation.verdict;
    const verdictLabel =
      v === "ok" ? "OK 合格" : v === "warning" ? "临界预警" : v === "ng" ? "NG 超差" : "待测";

    const vals = [
      row.item.balloonNo || String(idx + 1),
      row.item.featureName,
      row.standardSpecLabel,
      row.item.nominal,
      row.upperDev ?? "—",
      row.lowerDev ?? "—",
      row.lowerLimit ?? "—",
      row.upperLimit ?? "—",
      row.item.measured ?? "—",
      row.evaluation.deviationFromNominal ?? "—",
      verdictLabel,
      [row.evaluation.summaryText, row.item.notes].filter(Boolean).join(" · "),
    ];

    vals.forEach((val, ci) => {
      const cell = r.getCell(ci + 1);
      cell.value = val;
      cell.font = {
        name: "Microsoft YaHei",
        size: 9.5,
        bold: ci === 10,
        color: {
          argb:
            ci === 10
              ? v === "ng"
                ? "FFBE123C"
                : v === "warning"
                  ? "FFB45309"
                  : v === "ok"
                    ? "FF047857"
                    : "FF71717A"
              : "FF18181B",
        },
      };
      if (ci === 10) {
        cell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: {
            argb:
              v === "ng"
                ? "FFFFE4E6"
                : v === "warning"
                  ? "FFFEF3C7"
                  : v === "ok"
                    ? "FFD1FAE5"
                    : "FFF4F4F5",
          },
        };
      }
      cell.alignment = {
        vertical: "middle",
        horizontal: ci === 1 || ci === 2 || ci === 11 ? "left" : "center",
      };
      cell.border = {
        top: { style: "thin", color: { argb: "FFE4E4E7" } },
        bottom: { style: "thin", color: { argb: "FFE4E4E7" } },
        left: { style: "thin", color: { argb: "FFE4E4E7" } },
        right: { style: "thin", color: { argb: "FFE4E4E7" } },
      };
    });
    r.height = 21;
  });

  // Optional Sheet 2: Active ISO 286 Fit Summary
  if (activeFit && activeFit.valid) {
    const s2 = workbook.addWorksheet("孔轴配合分析 (ISO 286)");
    s2.columns = [{ width: 22 }, { width: 24 }, { width: 22 }, { width: 24 }];
    s2.mergeCells("A1:D1");
    const t2 = s2.getCell("A1");
    t2.value = `ISO 286 孔轴配合计算单：Ø${activeFit.nominalMm} ${activeFit.fitCode}`;
    t2.font = { name: "Microsoft YaHei", size: 14, bold: true, color: { argb: "FF0F172A" } };
    s2.getRow(1).height = 28;

    const pairs: Array<[string, string | number, string, string | number]> = [
      ["公称直径", `${activeFit.nominalMm} mm`, "配合性质", activeFit.fitNatureLabel],
      ["主尺寸分段", activeFit.hole.stepLabel, "配合公差 Tf", `${activeFit.fitToleranceMicrons} µm`],
      ["孔公差带", activeFit.hole.designation, "轴公差带", activeFit.shaft.designation],
      ["孔上偏差 ES", `${formatSignedMicrons(activeFit.hole.upperDevMicrons)} µm (${formatSignedMm(activeFit.hole.upperDevMm)} mm)`, "轴上偏差 es", `${formatSignedMicrons(activeFit.shaft.upperDevMicrons)} µm (${formatSignedMm(activeFit.shaft.upperDevMm)} mm)`],
      ["孔下偏差 EI", `${formatSignedMicrons(activeFit.hole.lowerDevMicrons)} µm (${formatSignedMm(activeFit.hole.lowerDevMm)} mm)`, "轴下偏差 ei", `${formatSignedMicrons(activeFit.shaft.lowerDevMicrons)} µm (${formatSignedMm(activeFit.shaft.lowerDevMm)} mm)`],
      ["孔最大极限 Dmax", `${activeFit.hole.maxSizeMm} mm`, "轴最大极限 dmax", `${activeFit.shaft.maxSizeMm} mm`],
      ["孔最小极限 Dmin", `${activeFit.hole.minSizeMm} mm`, "轴最小极限 dmin", `${activeFit.shaft.minSizeMm} mm`],
      ["最大间隙 Xmax", `${formatSignedMicrons(activeFit.maxClearanceMicrons)} µm`, "最小间隙/最大过盈", `${formatSignedMicrons(activeFit.minClearanceMicrons)} µm`],
      ["平均间隙/过盈", `${formatSignedMicrons(activeFit.meanClearanceMicrons)} µm`, "间隙占比", `${activeFit.clearanceRatioPercent}%`],
    ];

    pairs.forEach((rowVals, idx) => {
      const r = s2.getRow(3 + idx);
      rowVals.forEach((val, ci) => {
        const c = r.getCell(ci + 1);
        c.value = val;
        const isKey = ci === 0 || ci === 2;
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
      r.height = 21;
    });
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

/**
 * Batch export saved tolerance history records into one ledger workbook.
 */
export async function buildToleranceHistoryExcelBlob(
  records: readonly SavedToleranceRecord[]
): Promise<Blob> {
  const mod = await import("exceljs");
  const ExcelJS =
    (mod as unknown as { default?: typeof import("exceljs") }).default ?? mod;
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "QI/QC 质量工具台 · 公差检核归档";
  workbook.created = new Date();

  const sheet = workbook.addWorksheet("公差检核归档台账");
  sheet.columns = [
    { width: 18 },
    { width: 22 },
    { width: 10 },
    { width: 18 },
    { width: 16 },
    { width: 10 },
    { width: 10 },
    { width: 10 },
    { width: 12 },
    { width: 26 },
  ];

  const headers = [
    "归档时间",
    "记录标题 / 零件",
    "阶段",
    "图号",
    "批次号",
    "合格",
    "临界",
    "超差",
    "结论",
    "标准 / 备注",
  ];
  const hr = sheet.getRow(1);
  headers.forEach((h, i) => {
    const c = hr.getCell(i + 1);
    c.value = h;
    c.font = { name: "Microsoft YaHei", size: 9.5, bold: true, color: { argb: "FFFFFFFF" } };
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF18181B" } };
    c.alignment = { vertical: "middle", horizontal: "center" };
  });
  hr.height = 24;

  records.forEach((rec, i) => {
    const r = sheet.getRow(2 + i);
    const vals = [
      rec.createdAt,
      rec.meta.partName || rec.title,
      rec.meta.stage,
      rec.meta.drawingNo || "—",
      rec.meta.lotNo || "—",
      rec.okCount,
      rec.warningCount,
      rec.ngCount,
      rec.overallVerdict,
      [rec.meta.drawingStandard, rec.meta.notes].filter(Boolean).join(" · "),
    ];
    vals.forEach((val, ci) => {
      const c = r.getCell(ci + 1);
      c.value = val;
      c.font = { name: "Microsoft YaHei", size: 9.5, color: { argb: "FF18181B" } };
      c.alignment = { vertical: "middle", horizontal: ci === 1 || ci === 9 ? "left" : "center" };
      c.border = {
        top: { style: "thin", color: { argb: "FFE4E4E7" } },
        bottom: { style: "thin", color: { argb: "FFE4E4E7" } },
        left: { style: "thin", color: { argb: "FFE4E4E7" } },
        right: { style: "thin", color: { argb: "FFE4E4E7" } },
      };
    });
    r.height = 20;
  });

  // Sheet 2: Flattened line items across all archived records
  const s2 = workbook.addWorksheet("明细记录展开");
  s2.columns = [
    { width: 18 },
    { width: 20 },
    { width: 8 },
    { width: 22 },
    { width: 22 },
    { width: 11 },
    { width: 11 },
    { width: 11 },
    { width: 11 },
    { width: 11 },
  ];
  const h2 = ["归档时间", "零件名称", "气泡号", "特征", "标准依据", "公称", "下限", "上限", "实测", "结论"];
  const hr2 = s2.getRow(1);
  h2.forEach((h, i) => {
    const c = hr2.getCell(i + 1);
    c.value = h;
    c.font = { name: "Microsoft YaHei", size: 9.5, bold: true, color: { argb: "FFFFFFFF" } };
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF18181B" } };
    c.alignment = { vertical: "middle", horizontal: "center" };
  });
  hr2.height = 24;

  let rowCursor = 2;
  for (const rec of records) {
    for (const item of rec.items) {
      const resolved = resolveChecksheetItem(item);
      const r = s2.getRow(rowCursor++);
      [
        rec.createdAt,
        rec.meta.partName || rec.title,
        item.balloonNo,
        item.featureName,
        resolved.standardSpecLabel,
        item.nominal,
        resolved.lowerLimit ?? "—",
        resolved.upperLimit ?? "—",
        item.measured ?? "—",
        resolved.evaluation.verdict.toUpperCase(),
      ].forEach((val, ci) => {
        const c = r.getCell(ci + 1);
        c.value = val;
        c.font = { name: "Microsoft YaHei", size: 9, color: { argb: "FF18181B" } };
        c.alignment = { vertical: "middle", horizontal: ci === 1 || ci === 3 || ci === 4 ? "left" : "center" };
      });
      r.height = 19;
    }
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

/**
 * Render a crisp 2x Retina PNG reference card for an ISO 286 Fit or Batch Checksheet.
 */
export async function renderToleranceCardPngBlob(params: {
  mode: "fit" | "checksheet";
  fit?: Iso286FitResult;
  rows?: readonly ResolvedChecksheetRow[];
  meta?: ChecksheetMetadata;
}): Promise<Blob> {
  const width = 960;
  const height = params.mode === "fit" ? 560 : Math.max(520, 260 + (params.rows?.length ?? 0) * 34);
  const dpr = 2;
  const canvas = document.createElement("canvas");
  canvas.width = width * dpr;
  canvas.height = height * dpr;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D 上下文初始化失败");
  ctx.scale(dpr, dpr);

  // Clean ceramic white background
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);

  // Top amber accent rule
  ctx.fillStyle = "#f59e0b";
  ctx.fillRect(0, 0, width, 6);

  // Header
  ctx.fillStyle = "#09090b";
  ctx.font = "bold 22px -apple-system, BlinkMacSystemFont, 'PingFang SC', 'Microsoft YaHei', sans-serif";
  ctx.fillText(
    params.mode === "fit" && params.fit
      ? `ISO 286 孔轴配合速查卡 · Ø${params.fit.nominalMm} ${params.fit.fitCode}`
      : `${params.meta?.stage ?? "FAI"} 尺寸公差检核判定单`,
    36,
    52
  );

  ctx.fillStyle = "#71717a";
  ctx.font = "12px ui-monospace, SFMono-Regular, Menlo, monospace";
  ctx.fillText(
    `QI/QC 质量工具台 · 生成时间 ${formatTimestamp()} · ISO 2768 / ISO 286 (GB/T 1804 / GB/T 1800)`,
    36,
    76
  );

  if (params.mode === "fit" && params.fit && params.fit.valid) {
    const fit = params.fit;
    const badgeColor =
      fit.fitNature === "clearance"
        ? "#10b981"
        : fit.fitNature === "transition"
          ? "#f59e0b"
          : "#f43f5e";

    // Fit nature pill
    ctx.fillStyle = `${badgeColor}1f`;
    ctx.beginPath();
    ctx.roundRect(710, 28, 214, 34, 8);
    ctx.fill();
    ctx.fillStyle = badgeColor;
    ctx.font = "bold 13px -apple-system, BlinkMacSystemFont, 'PingFang SC', sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(fit.fitNatureLabel, 817, 50);
    ctx.textAlign = "left";

    // KPI Cards
    const cards = [
      {
        title: `孔 ${fit.hole.designation} (IT${fit.hole.grade} = ${fit.hole.itMicrons} µm)`,
        main: `${formatSignedMicrons(fit.hole.upperDevMicrons)} / ${formatSignedMicrons(fit.hole.lowerDevMicrons)} µm`,
        sub: `${fit.hole.minSizeMm.toFixed(3)} ～ ${fit.hole.maxSizeMm.toFixed(3)} mm`,
        color: "#4f46e5",
      },
      {
        title: `轴 ${fit.shaft.designation} (IT${fit.shaft.grade} = ${fit.shaft.itMicrons} µm)`,
        main: `${formatSignedMicrons(fit.shaft.upperDevMicrons)} / ${formatSignedMicrons(fit.shaft.lowerDevMicrons)} µm`,
        sub: `${fit.shaft.minSizeMm.toFixed(3)} ～ ${fit.shaft.maxSizeMm.toFixed(3)} mm`,
        color: "#d97706",
      },
      {
        title: `配合极限 (Tf = ${fit.fitToleranceMicrons} µm)`,
        main:
          fit.fitNature === "clearance"
            ? `+${fit.minClearanceMicrons} ～ +${fit.maxClearanceMicrons} µm`
            : fit.fitNature === "interference"
              ? `-${fit.minInterferenceMicrons} ～ -${fit.maxInterferenceMicrons} µm`
              : `+${fit.maxClearanceMicrons} / -${fit.maxInterferenceMicrons} µm`,
        sub:
          fit.fitNature === "clearance"
            ? `最小/最大间隙 · 均值 +${fit.meanClearanceMicrons} µm`
            : fit.fitNature === "interference"
              ? `最小/最大过盈 · 均值 ${fit.meanClearanceMicrons} µm`
              : `最大间隙 / 最大过盈 · 间隙比 ${fit.clearanceRatioPercent}%`,
        color: badgeColor,
      },
    ];

    cards.forEach((c, idx) => {
      const x = 36 + idx * 302;
      ctx.fillStyle = "#fafafa";
      ctx.strokeStyle = "#e4e4e7";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.roundRect(x, 102, 284, 98, 12);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = "#71717a";
      ctx.font = "600 12px -apple-system, BlinkMacSystemFont, 'PingFang SC', sans-serif";
      ctx.fillText(c.title, x + 16, 126);

      ctx.fillStyle = c.color;
      ctx.font = "bold 20px ui-monospace, SFMono-Regular, Menlo, monospace";
      ctx.fillText(c.main, x + 16, 158);

      ctx.fillStyle = "#52525b";
      ctx.font = "12px ui-monospace, SFMono-Regular, Menlo, monospace";
      ctx.fillText(c.sub, x + 16, 184);
    });

    // Zone profile diagram box
    const boxX = 36;
    const boxY = 222;
    const boxW = 888;
    const boxH = 276;
    ctx.fillStyle = "#fafafa";
    ctx.strokeStyle = "#e4e4e7";
    ctx.beginPath();
    ctx.roundRect(boxX, boxY, boxW, boxH, 12);
    ctx.fill();
    ctx.stroke();

    const minUm = Math.min(0, fit.hole.lowerDevMicrons, fit.shaft.lowerDevMicrons);
    const maxUm = Math.max(0, fit.hole.upperDevMicrons, fit.shaft.upperDevMicrons);
    const span = Math.max(10, maxUm - minUm);
    const padUm = span * 0.22;
    const lo = minUm - padUm;
    const hi = maxUm + padUm;
    const plotTop = boxY + 34;
    const plotH = boxH - 68;
    const toY = (um: number) => plotTop + ((hi - um) / (hi - lo)) * plotH;

    // Zero line
    const zeroY = toY(0);
    ctx.strokeStyle = "#18181b";
    ctx.lineWidth = 1.5;
    ctx.setLineDash([6, 4]);
    ctx.beginPath();
    ctx.moveTo(boxX + 60, zeroY);
    ctx.lineTo(boxX + boxW - 40, zeroY);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.fillStyle = "#18181b";
    ctx.font = "bold 11px ui-monospace, SFMono-Regular, Menlo, monospace";
    ctx.fillText("0 µm", boxX + 16, zeroY + 4);

    // Hole bar
    const hy1 = toY(fit.hole.upperDevMicrons);
    const hy2 = toY(fit.hole.lowerDevMicrons);
    ctx.fillStyle = "rgba(79, 70, 229, 0.16)";
    ctx.strokeStyle = "#4f46e5";
    ctx.lineWidth = 2;
    ctx.fillRect(boxX + 190, hy1, 180, Math.max(3, hy2 - hy1));
    ctx.strokeRect(boxX + 190, hy1, 180, Math.max(3, hy2 - hy1));

    ctx.fillStyle = "#312e81";
    ctx.font = "bold 15px ui-monospace, SFMono-Regular, Menlo, monospace";
    ctx.textAlign = "center";
    ctx.fillText(`孔 ${fit.hole.designation}`, boxX + 280, (hy1 + hy2) / 2 + 5);
    ctx.font = "11px ui-monospace, SFMono-Regular, Menlo, monospace";
    ctx.fillText(`ES ${formatSignedMicrons(fit.hole.upperDevMicrons)}`, boxX + 280, hy1 - 8);
    ctx.fillText(`EI ${formatSignedMicrons(fit.hole.lowerDevMicrons)}`, boxX + 280, hy2 + 15);

    // Shaft bar
    const sy1 = toY(fit.shaft.upperDevMicrons);
    const sy2 = toY(fit.shaft.lowerDevMicrons);
    ctx.fillStyle = "rgba(217, 119, 6, 0.18)";
    ctx.strokeStyle = "#d97706";
    ctx.lineWidth = 2;
    ctx.fillRect(boxX + 490, sy1, 180, Math.max(3, sy2 - sy1));
    ctx.strokeRect(boxX + 490, sy1, 180, Math.max(3, sy2 - sy1));

    ctx.fillStyle = "#78350f";
    ctx.font = "bold 15px ui-monospace, SFMono-Regular, Menlo, monospace";
    ctx.fillText(`轴 ${fit.shaft.designation}`, boxX + 580, (sy1 + sy2) / 2 + 5);
    ctx.font = "11px ui-monospace, SFMono-Regular, Menlo, monospace";
    ctx.fillText(`es ${formatSignedMicrons(fit.shaft.upperDevMicrons)}`, boxX + 580, sy1 - 8);
    ctx.fillText(`ei ${formatSignedMicrons(fit.shaft.lowerDevMicrons)}`, boxX + 580, sy2 + 15);
    ctx.textAlign = "left";

    if (fit.applicationHint) {
      ctx.fillStyle = "#52525b";
      ctx.font = "12px -apple-system, BlinkMacSystemFont, 'PingFang SC', sans-serif";
      ctx.fillText(`典型应用：${fit.applicationHint}`, 36, 530);
    }
  } else {
    const rows = params.rows ?? [];
    const meta = params.meta;
    const sum = summarizeChecksheet(rows);
    const verdictColor =
      sum.overallVerdict === "FAIL"
        ? "#e11d48"
        : sum.overallVerdict === "PASS"
          ? "#059669"
          : "#71717a";

    ctx.fillStyle = `${verdictColor}1c`;
    ctx.beginPath();
    ctx.roundRect(748, 28, 176, 36, 8);
    ctx.fill();
    ctx.fillStyle = verdictColor;
    ctx.font = "bold 14px ui-monospace, SFMono-Regular, Menlo, monospace";
    ctx.textAlign = "center";
    ctx.fillText(`结论：${sum.overallVerdict}`, 836, 51);
    ctx.textAlign = "left";

    ctx.fillStyle = "#3f3f46";
    ctx.font = "12px -apple-system, BlinkMacSystemFont, 'PingFang SC', sans-serif";
    ctx.fillText(
      `零件：${meta?.partName || "—"}   图号：${meta?.drawingNo || "—"}   批次：${meta?.lotNo || "—"}   合格 ${sum.okCount} / 临界 ${sum.warningCount} / 超差 ${sum.ngCount}`,
      36,
      106
    );

    // Table header
    const tableY = 128;
    ctx.fillStyle = "#18181b";
    ctx.beginPath();
    ctx.roundRect(36, tableY, 888, 30, 6);
    ctx.fill();

    const cols = [
      { label: "#", x: 48 },
      { label: "检验特征", x: 90 },
      { label: "公差依据", x: 320 },
      { label: "允许范围", x: 540 },
      { label: "实测值", x: 700 },
      { label: "判定", x: 820 },
    ];
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 11.5px -apple-system, BlinkMacSystemFont, 'PingFang SC', sans-serif";
    cols.forEach((c) => ctx.fillText(c.label, c.x, tableY + 19));

    rows.forEach((row, idx) => {
      const y = tableY + 34 + idx * 34;
      if (idx % 2 === 1) {
        ctx.fillStyle = "#fafafa";
        ctx.fillRect(36, y, 888, 32);
      }
      ctx.fillStyle = "#18181b";
      ctx.font = "11.5px ui-monospace, SFMono-Regular, Menlo, monospace";
      ctx.fillText(row.item.balloonNo || String(idx + 1), 48, y + 20);
      ctx.font = "12px -apple-system, BlinkMacSystemFont, 'PingFang SC', sans-serif";
      ctx.fillText(row.item.featureName.slice(0, 18), 90, y + 20);
      ctx.fillStyle = "#52525b";
      ctx.font = "11px ui-monospace, SFMono-Regular, Menlo, monospace";
      ctx.fillText(row.standardSpecLabel.slice(0, 26), 320, y + 20);

      const lim =
        row.lowerLimit !== null && row.upperLimit !== null
          ? row.unilateral
            ? `≤ ${row.upperLimit}`
            : `${row.lowerLimit} ~ ${row.upperLimit}`
          : "—";
      ctx.fillText(lim, 540, y + 20);
      ctx.fillStyle = "#09090b";
      ctx.fillText(
        row.item.measured !== null ? `${row.item.measured}${row.item.unit}` : "—",
        700,
        y + 20
      );

      const v = row.evaluation.verdict;
      ctx.fillStyle =
        v === "ng" ? "#e11d48" : v === "warning" ? "#d97706" : v === "ok" ? "#059669" : "#71717a";
      ctx.font = "bold 11.5px ui-monospace, SFMono-Regular, Menlo, monospace";
      ctx.fillText(
        v === "ng" ? "NG 超差" : v === "warning" ? "临界预警" : v === "ok" ? "OK 合格" : "待测",
        820,
        y + 20
      );
    });
  }

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("PNG 图片生成失败"));
    }, "image/png");
  });
}
