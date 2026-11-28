import type {
  AqlStandardEdition,
  InspectionLevel,
  InspectionMeta,
  InspectionSeverity,
  LotInspectionSummary,
  SavedInspectionRecord,
  VerdictStatus,
} from "../types";
import { formatAqlValue, getTableReferenceLabel } from "./tables";

const SEVERITY_LABEL: Record<InspectionSeverity, string> = {
  normal: "正常检验",
  tightened: "加严检验",
  reduced: "放宽检验",
};

const VERDICT_LABEL: Record<VerdictStatus, string> = {
  accept: "允收 (ACCEPT)",
  accept_revert_normal: "允收本批 · 下批恢复正常检验",
  reject: "拒收 (REJECT)",
};

export function getSeverityLabel(severity: InspectionSeverity): string {
  return SEVERITY_LABEL[severity];
}

export function getVerdictLabel(verdict: VerdictStatus): string {
  return VERDICT_LABEL[verdict];
}

/**
 * Build a crisp, shop-floor-ready inspection summary string (plain text / Markdown compatible)
 * for pasting into ERP, WeCom, DingTalk, email, or IQC/OQC logs.
 */
export function buildInspectionSummaryText(params: {
  standard: AqlStandardEdition;
  lotSize: number | null;
  level: InspectionLevel;
  severity: InspectionSeverity;
  meta: InspectionMeta;
  summary: LotInspectionSummary;
}): string {
  const { standard, lotSize, level, severity, meta, summary } = params;
  const now = new Date();
  const stamp = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(
    now.getDate()
  ).padStart(2, "0")} ${String(now.getHours()).padStart(2, "0")}:${String(
    now.getMinutes()
  ).padStart(2, "0")}`;

  const lines: string[] = [
    `【${meta.stage} AQL 抽样检验判定摘要】`,
    `标准依据：${getTableReferenceLabel(standard, severity)}`,
    `检验时间：${stamp}`,
  ];

  if (meta.partName.trim()) lines.push(`物料/产品：${meta.partName.trim()}`);
  if (meta.lotNo.trim()) lines.push(`批次/单号：${meta.lotNo.trim()}`);
  if (meta.supplier.trim()) lines.push(`供方/产线：${meta.supplier.trim()}`);
  if (meta.inspector.trim()) lines.push(`检验员：${meta.inspector.trim()}`);

  lines.push(
    `批量 (N)：${lotSize !== null ? lotSize.toLocaleString("zh-CN") : "按字码直查"} | 检验水平：${level} | 严格度：${SEVERITY_LABEL[severity]}`,
    `建议本批抽样总数：${summary.recommendedTotalSample} 件`,
    `----------------------------------------`
  );

  for (const ev of summary.evaluations) {
    const arrowNote = ev.plan.arrowFollowed
      ? ` (${ev.plan.originalCode}${ev.plan.arrowFollowed === "down" ? "↓" : "↑"}${ev.plan.effectiveCode})`
      : "";
    const fullNote = ev.plan.isFullInspection ? " [100%全检]" : "";
    lines.push(
      `• ${ev.config.label} | AQL ${formatAqlValue(ev.config.aql)} | 字码 ${ev.plan.effectiveCode}${arrowNote} | 抽样 n=${ev.plan.sampleSize}${fullNote} | Ac=${ev.plan.ac} / Re=${ev.plan.re} | 实测不良=${ev.config.defectsFound} → ${VERDICT_LABEL[ev.verdict]}`
    );
  }

  lines.push(
    `----------------------------------------`,
    `综合判定结论：${VERDICT_LABEL[summary.overallVerdict]}`
  );

  if (meta.notes.trim()) {
    lines.push(`备注说明：${meta.notes.trim()}`);
  }

  return lines.join("\n");
}

/**
 * Generate a formatted .xlsx workbook Blob for a single inspection or batch of saved records.
 */
export async function buildAqlExcelBlob(
  records: SavedInspectionRecord[]
): Promise<Blob> {
  const mod = await import("exceljs");
  const ExcelJS =
    (mod as unknown as { default?: typeof import("exceljs") }).default ?? mod;
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "QI/QC 质量工具台 · AQL 抽样方案计算器";
  workbook.created = new Date();

  const sheet = workbook.addWorksheet("AQL 抽样检验记录", {
    views: [{ state: "frozen", ySplit: 3 }],
  });

  // Title banner
  sheet.mergeCells("A1:N1");
  const titleCell = sheet.getCell("A1");
  titleCell.value = "AQL 抽样检验判定记录表 (GB/T 2828.1 / ANSI Z1.4)";
  titleCell.font = { name: "Microsoft YaHei", size: 14, bold: true, color: { argb: "FF0F172A" } };
  titleCell.alignment = { vertical: "middle", horizontal: "left" };
  sheet.getRow(1).height = 28;

  sheet.mergeCells("A2:N2");
  const subCell = sheet.getCell("A2");
  subCell.value = `导出时间：${new Date().toLocaleString("zh-CN")} · 共 ${records.length} 批记录`;
  subCell.font = { name: "Microsoft YaHei", size: 9.5, color: { argb: "FF64748B" } };
  subCell.alignment = { vertical: "middle", horizontal: "left" };
  sheet.getRow(2).height = 18;

  const headers = [
    "检验时间",
    "环节",
    "物料/产品名称",
    "批次/单号",
    "供方/产线",
    "标准依据",
    "批量 (N)",
    "检验水平",
    "严格度",
    "缺陷类别",
    "AQL",
    "字码 / 抽样 n",
    "Ac / Re",
    "实测不良 / 判定",
  ];

  const headerRow = sheet.getRow(3);
  headers.forEach((h, idx) => {
    const cell = headerRow.getCell(idx + 1);
    cell.value = h;
    cell.font = { name: "Microsoft YaHei", size: 10, bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF18181B" } };
    cell.alignment = { vertical: "middle", horizontal: "center" };
    cell.border = {
      top: { style: "thin", color: { argb: "FF3F3F46" } },
      bottom: { style: "thin", color: { argb: "FF3F3F46" } },
      left: { style: "thin", color: { argb: "FF3F3F46" } },
      right: { style: "thin", color: { argb: "FF3F3F46" } },
    };
  });
  headerRow.height = 24;

  const colWidths = [18, 8, 22, 16, 18, 16, 11, 10, 10, 14, 10, 14, 11, 22];
  colWidths.forEach((w, i) => {
    sheet.getColumn(i + 1).width = w;
  });

  let rowIdx = 4;
  for (const rec of records) {
    const stdShort = rec.standard === "gbt2828" ? "GB/T 2828.1" : "ANSI Z1.4";
    for (const cls of rec.classes) {
      const row = sheet.getRow(rowIdx);
      const values = [
        rec.createdAt,
        rec.meta.stage,
        rec.meta.partName || "-",
        rec.meta.lotNo || "-",
        rec.meta.supplier || "-",
        stdShort,
        rec.lotSize,
        rec.level,
        SEVERITY_LABEL[rec.severity],
        cls.label,
        formatAqlValue(cls.aql),
        `${cls.effectiveCode} / n=${cls.sampleSize}`,
        `${cls.ac} / ${cls.re}`,
        `${cls.defectsFound} · ${VERDICT_LABEL[cls.verdict]}`,
      ];

      values.forEach((v, cIdx) => {
        const cell = row.getCell(cIdx + 1);
        cell.value = v;
        cell.font = { name: "Microsoft YaHei", size: 9.5, color: { argb: "FF18181B" } };
        cell.alignment = {
          vertical: "middle",
          horizontal: cIdx >= 6 ? "center" : "left",
        };
        cell.border = {
          top: { style: "thin", color: { argb: "FFE4E4E7" } },
          bottom: { style: "thin", color: { argb: "FFE4E4E7" } },
          left: { style: "thin", color: { argb: "FFE4E4E7" } },
          right: { style: "thin", color: { argb: "FFE4E4E7" } },
        };
        if (cIdx === 13) {
          const isReject = cls.verdict === "reject";
          const isRevert = cls.verdict === "accept_revert_normal";
          cell.font = {
            name: "Microsoft YaHei",
            size: 9.5,
            bold: true,
            color: {
              argb: isReject ? "FFBE123C" : isRevert ? "FFB45309" : "FF047857",
            },
          };
          cell.fill = {
            type: "pattern",
            pattern: "solid",
            fgColor: {
              argb: isReject ? "FFFFF1F2" : isRevert ? "FFFFFBEB" : "FFECFDF5",
            },
          };
        }
      });
      row.height = 21;
      rowIdx += 1;
    }
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

/**
 * Render a clean, print-sharp high-DPI PNG inspection card using HTML5 Canvas.
 */
export async function renderInspectionCardPngBlob(params: {
  standard: AqlStandardEdition;
  lotSize: number | null;
  level: InspectionLevel;
  severity: InspectionSeverity;
  meta: InspectionMeta;
  summary: LotInspectionSummary;
}): Promise<Blob> {
  const { standard, lotSize, level, severity, meta, summary } = params;
  const scale = 2;
  const width = 920;
  const rowCount = summary.evaluations.length;
  const hasNotes = Boolean(meta.notes.trim());
  const height = 310 + rowCount * 56 + (hasNotes ? 58 : 0);

  const canvas = document.createElement("canvas");
  canvas.width = width * scale;
  canvas.height = height * scale;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("无法创建 Canvas 绘图上下文");

  ctx.scale(scale, scale);

  // Clean porcelain background
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);

  // Top accent bar
  const verdictAccent =
    summary.overallVerdict === "reject"
      ? "#e11d48"
      : summary.overallVerdict === "accept_revert_normal"
        ? "#d97706"
        : "#059669";
  ctx.fillStyle = verdictAccent;
  ctx.fillRect(0, 0, width, 6);

  // Header
  ctx.fillStyle = "#09090b";
  ctx.font = '700 22px "PingFang SC", "Microsoft YaHei", Inter, sans-serif';
  ctx.fillText(`${meta.stage} AQL 抽样检验判定卡`, 36, 52);

  ctx.fillStyle = "#71717a";
  ctx.font = '500 12px "JetBrains Mono", Menlo, monospace';
  ctx.fillText(getTableReferenceLabel(standard, severity), 36, 74);

  // Verdict pill on top right
  const verdictText = VERDICT_LABEL[summary.overallVerdict];
  ctx.font = '700 14px "PingFang SC", "Microsoft YaHei", sans-serif';
  const pillTextW = ctx.measureText(verdictText).width;
  const pillW = pillTextW + 34;
  const pillX = width - 36 - pillW;
  const pillY = 30;
  ctx.fillStyle =
    summary.overallVerdict === "reject"
      ? "#fff1f2"
      : summary.overallVerdict === "accept_revert_normal"
        ? "#fffbeb"
        : "#ecfdf5";
  ctx.strokeStyle = verdictAccent;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.roundRect(pillX, pillY, pillW, 38, 10);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = verdictAccent;
  ctx.fillText(verdictText, pillX + 17, pillY + 24);

  // Meta info strip
  ctx.fillStyle = "#fafafa";
  ctx.strokeStyle = "#e4e4e7";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect(36, 94, width - 72, 74, 12);
  ctx.fill();
  ctx.stroke();

  const metaItems = [
    ["批量 (N)", lotSize !== null ? lotSize.toLocaleString("zh-CN") : "字码直查"],
    ["检验水平", level],
    ["严格度", SEVERITY_LABEL[severity]],
    ["建议抽样总数", `${summary.recommendedTotalSample} 件`],
    ["物料 / 批次", [meta.partName, meta.lotNo].filter(Boolean).join(" · ") || "—"],
    ["供方 / 检验员", [meta.supplier, meta.inspector].filter(Boolean).join(" · ") || "—"],
  ];

  const colW = (width - 72) / 3;
  metaItems.forEach(([k, v], i) => {
    const col = i % 3;
    const row = Math.floor(i / 3);
    const x = 52 + col * colW;
    const y = 114 + row * 32;
    ctx.fillStyle = "#71717a";
    ctx.font = '500 11px "PingFang SC", "Microsoft YaHei", sans-serif';
    ctx.fillText(k, x, y);
    ctx.fillStyle = "#09090b";
    ctx.font = '600 13px "JetBrains Mono", "PingFang SC", sans-serif';
    const truncated = v.length > 22 ? `${v.slice(0, 21)}…` : v;
    ctx.fillText(truncated, x + 78, y);
  });

  // Table header
  const tableTop = 190;
  ctx.fillStyle = "#18181b";
  ctx.beginPath();
  ctx.roundRect(36, tableTop, width - 72, 34, 8);
  ctx.fill();

  const cols = [
    { label: "缺陷等级", x: 52 },
    { label: "AQL", x: 205 },
    { label: "字码", x: 300 },
    { label: "抽样数 n", x: 390 },
    { label: "Ac / Re", x: 510 },
    { label: "实测不良", x: 635 },
    { label: "单项结论", x: 745 },
  ];
  ctx.fillStyle = "#ffffff";
  ctx.font = '600 12px "PingFang SC", "Microsoft YaHei", sans-serif';
  cols.forEach((c) => ctx.fillText(c.label, c.x, tableTop + 21));

  // Rows
  summary.evaluations.forEach((ev, idx) => {
    const y = tableTop + 34 + idx * 56;
    ctx.fillStyle = idx % 2 === 0 ? "#ffffff" : "#fafafa";
    ctx.fillRect(36, y, width - 72, 56);
    ctx.strokeStyle = "#e4e4e7";
    ctx.beginPath();
    ctx.moveTo(36, y + 56);
    ctx.lineTo(width - 36, y + 56);
    ctx.stroke();

    ctx.fillStyle = "#09090b";
    ctx.font = '600 13px "PingFang SC", "Microsoft YaHei", sans-serif';
    ctx.fillText(ev.config.label, 52, y + 33);

    ctx.font = '600 13px "JetBrains Mono", monospace';
    ctx.fillText(formatAqlValue(ev.config.aql), 205, y + 33);

    const codeLabel = ev.plan.arrowFollowed
      ? `${ev.plan.originalCode}${ev.plan.arrowFollowed === "down" ? "↓" : "↑"}${ev.plan.effectiveCode}`
      : ev.plan.effectiveCode;
    ctx.fillText(codeLabel, 300, y + 33);

    const nLabel = ev.plan.isFullInspection
      ? `${ev.plan.sampleSize} (全检)`
      : `${ev.plan.sampleSize}`;
    ctx.fillText(nLabel, 390, y + 33);

    ctx.fillStyle = "#059669";
    ctx.fillText(`Ac ${ev.plan.ac}`, 510, y + 33);
    ctx.fillStyle = "#e11d48";
    ctx.fillText(`/ Re ${ev.plan.re}`, 552, y + 33);

    ctx.fillStyle = "#09090b";
    ctx.fillText(`${ev.config.defectsFound}`, 655, y + 33);

    const rowColor =
      ev.verdict === "reject"
        ? "#e11d48"
        : ev.verdict === "accept_revert_normal"
          ? "#d97706"
          : "#059669";
    ctx.fillStyle = rowColor;
    ctx.font = '700 12.5px "PingFang SC", "Microsoft YaHei", sans-serif';
    ctx.fillText(
      ev.verdict === "reject"
        ? "拒收 REJECT"
        : ev.verdict === "accept_revert_normal"
          ? "允收·恢复正常"
          : "允收 ACCEPT",
      745,
      y + 33
    );
  });

  // Notes if present
  if (hasNotes) {
    const notesY = tableTop + 34 + rowCount * 56 + 16;
    ctx.fillStyle = "#52525b";
    ctx.font = '500 12px "PingFang SC", "Microsoft YaHei", sans-serif';
    ctx.fillText(`备注：${meta.notes.trim().slice(0, 88)}`, 36, notesY + 18);
  }

  // Footer
  ctx.fillStyle = "#a1a1aa";
  ctx.font = '500 11px "JetBrains Mono", "PingFang SC", sans-serif';
  const nowStr = new Date().toLocaleString("zh-CN");
  ctx.fillText(
    `生成时间 ${nowStr} · QI/QC 质量工具台 · 本地离线计算`,
    36,
    height - 20
  );

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("PNG 图片编码失败"));
    }, "image/png");
  });
}
