import ExcelJS from "exceljs";
import type {
  AppSettings,
  CalibrationType,
  Instrument,
  InstrumentInput,
  LedgerCategory,
} from "@/types";
import { calcNextCalDate, getInstrumentStatus, getTodayStr } from "@/lib/status";
import {
  getThresholdVisuals,
  sortThresholdsDesc,
} from "@/lib/thresholdColors";

function formatUtcDate(dt: Date): string {
  const y = dt.getUTCFullYear();
  const m = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const d = String(dt.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function unwrapCellValue(val: ExcelJS.CellValue): unknown {
  if (val === null || val === undefined) return "";
  if (typeof val === "object") {
    if (val instanceof Date) return val;
    if ("result" in val) {
      return unwrapCellValue((val as ExcelJS.CellFormulaValue).result ?? "");
    }
    if ("richText" in val && Array.isArray((val as ExcelJS.CellRichTextValue).richText)) {
      return (val as ExcelJS.CellRichTextValue).richText.map((r) => r.text).join("");
    }
    if ("text" in val) {
      return String((val as ExcelJS.CellHyperlinkValue).text ?? "");
    }
  }
  return val;
}

function cellToString(cell: ExcelJS.Cell): string {
  const raw = unwrapCellValue(cell.value);
  if (raw === null || raw === undefined) return "";
  if (raw instanceof Date) {
    return formatUtcDate(raw);
  }
  return String(raw).replace(/\u00a0/g, " ").trim();
}

function cellToDateString(cell: ExcelJS.Cell): string {
  const raw = unwrapCellValue(cell.value);
  if (raw === null || raw === undefined || raw === "") return "";
  if (raw instanceof Date) {
    return formatUtcDate(raw);
  }
  if (typeof raw === "number" && raw > 10000 && raw < 100000) {
    // Excel serial date fallback (1899-12-30 epoch)
    const utcMs = Date.UTC(1899, 11, 30) + Math.round(raw) * 86400 * 1000;
    return formatUtcDate(new Date(utcMs));
  }
  const s = String(raw).trim();
  if (s === "/" || s === "-") return "";
  // Normalize YYYY/M/D or YYYY.M.D to YYYY-MM-DD
  const m = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/.exec(s);
  if (m) {
    return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  }
  return s;
}

function parseCycleMonths(raw: string): number {
  const m = /(\d+)/.exec(raw);
  if (m) {
    const val = Number(m[1]);
    if (val > 0 && val <= 120) return val;
  }
  return 12;
}

export interface ParsedExcelSummary {
  rows: InstrumentInput[];
  gaugeCount: number;
  fixtureCount: number;
  warnings: string[];
}

interface ColumnMap {
  seq: number;
  dept: number;
  name: number;
  purchaseDate: number;
  serialNo: number;
  modelSpec: number;
  location: number; // -1 if absent (e.g., 检具 sheet)
  calInternal: number;
  calExternal: number;
  recordType: number;
  lastCalDate: number;
  cycle: number;
  nextCalDate: number;
  remark: number;
  supplier: number;
  contactPerson: number;
  contactPhone: number;
  calAgency: number;
}

function detectHeaderAndColumns(
  sheet: ExcelJS.Worksheet,
  isFixtureSheet: boolean
): { dataStartRow: number; cols: ColumnMap } | null {
  for (let r = 1; r <= Math.min(15, sheet.rowCount); r++) {
    const row = sheet.getRow(r);
    const texts: string[] = [];
    for (let c = 1; c <= 22; c++) {
      texts[c] = cellToString(row.getCell(c)).replace(/\s+/g, "");
    }

    const nameCol = texts.findIndex(
      (t) =>
        t &&
        (t.includes("仪器名称") ||
          t.includes("检具名称") ||
          t.includes("设备名称") ||
          t === "名称")
    );

    if (nameCol > 0) {
      const findCol = (keywords: string[], fallback: number): number => {
        for (let c = 1; c < texts.length; c++) {
          const t = texts[c];
          if (t && keywords.some((k) => t.includes(k))) return c;
        }
        return fallback;
      };

      const seq = findCol(["序号"], 1);
      const dept = findCol(["使用部门", "部门"], -1);
      const purchaseDate = findCol(["购买时间", "购入日期"], -1);
      const serialNo = findCol(["出厂编号", "管理编号", "仪器编号", "编号"], -1);
      const modelSpec = findCol(["型号规格", "规格型号", "型号"], -1);
      const location = findCol(["存放位置", "位置"], -1);
      const calTypeCol = findCol(["校验类型", "校准类型"], -1);
      const recordType = findCol(["记录类型"], -1);
      const lastCalDate = findCol(["上次检验", "上次校验", "校验日期", "校准日期"], -1);
      const cycle = findCol(["检定周期", "校验周期", "周期"], -1);
      const nextCalDate = findCol(["下次检验", "下次校验", "有效期"], -1);
      const remark = findCol(["备注"], -1);
      const supplier = findCol(["厂商", "供应商"], -1);
      const contactPerson = findCol(["联系人"], -1);
      const contactPhone = findCol(["联系电话", "电话"], -1);
      const calAgency = findCol(["检测机构", "校准机构"], -1);

      const headerNameText = texts[nameCol];

      // Determine subheader rows for JSSK-MPR-170 (where row 5 is header, rows 6-8 are legend/internal/external subheaders)
      let calInternal = calTypeCol;
      let calExternal = calTypeCol > 0 ? calTypeCol + 1 : -1;
      let dataStartRow = r + 1;

      for (let sub = r + 1; sub <= Math.min(r + 5, sheet.rowCount); sub++) {
        const subRow = sheet.getRow(sub);
        const subNameCell = subRow.getCell(nameCol);
        const subNameText = cellToString(subNameCell).replace(/\s+/g, "");
        // Once a real instrument/fixture name appears (not empty and not merged with header row), data has begun!
        if (subNameText && subNameText !== headerNameText) {
          break;
        }

        let isSubHeader = false;
        for (let c = 1; c <= 20; c++) {
          const v = cellToString(subRow.getCell(c));
          if (v.includes("内校") || v.includes("Internal")) {
            calInternal = c;
            isSubHeader = true;
          }
          if (v.includes("外校") || v.includes("External")) {
            calExternal = c;
            isSubHeader = true;
          }
          if (
            v.includes("表示合格") ||
            v.includes("需要校正") ||
            v.includes("已经延期") ||
            v.includes("临近")
          ) {
            isSubHeader = true;
          }
        }
        if (isSubHeader) {
          dataStartRow = sub + 1;
        }
      }

      return {
        dataStartRow,
        cols: {
          seq,
          dept,
          name: nameCol,
          purchaseDate,
          serialNo,
          modelSpec,
          location: isFixtureSheet && location < 0 ? -1 : location,
          calInternal,
          calExternal,
          recordType,
          lastCalDate,
          cycle,
          nextCalDate,
          remark,
          supplier,
          contactPerson,
          contactPhone,
          calAgency,
        },
      };
    }
  }
  return null;
}

export async function parseJsskExcel(
  arrayBuffer: ArrayBuffer
): Promise<ParsedExcelSummary> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(arrayBuffer);

  const rows: InstrumentInput[] = [];
  const warnings: string[] = [];
  let gaugeCount = 0;
  let fixtureCount = 0;

  for (const sheet of wb.worksheets) {
    const isFixture = sheet.name.includes("检具");
    const category: LedgerCategory = isFixture ? "fixture" : "gauge";
    const detected = detectHeaderAndColumns(sheet, isFixture);
    if (!detected) {
      warnings.push(`工作表「${sheet.name}」未识别到标准台账表头，已跳过`);
      continue;
    }

    const { dataStartRow, cols } = detected;

    for (let r = dataStartRow; r <= sheet.rowCount; r++) {
      const row = sheet.getRow(r);
      const colBText = cellToString(row.getCell(2));
      const colAText = cellToString(row.getCell(1));

      // Stop at signature footer
      if (
        colBText.includes("编制/日期") ||
        colBText.includes("prepare/Date") ||
        colAText.includes("编制/日期")
      ) {
        break;
      }

      const name = cols.name > 0 ? cellToString(row.getCell(cols.name)) : "";
      const serialNo =
        cols.serialNo > 0 ? cellToString(row.getCell(cols.serialNo)) : "";

      if (!name && !serialNo) continue;
      if (!name) continue;

      const seqStr = cols.seq > 0 ? cellToString(row.getCell(cols.seq)) : "";
      const seqNum = Number.parseInt(seqStr, 10);

      const department = cols.dept > 0 ? cellToString(row.getCell(cols.dept)) : "";
      const purchaseDate =
        cols.purchaseDate > 0
          ? cellToDateString(row.getCell(cols.purchaseDate))
          : "";
      const modelSpecRaw =
        cols.modelSpec > 0 ? cellToString(row.getCell(cols.modelSpec)) : "";
      const modelSpec = modelSpecRaw === "/" ? "" : modelSpecRaw;
      const location =
        cols.location > 0 ? cellToString(row.getCell(cols.location)) : "";

      const internalVal =
        cols.calInternal > 0 ? cellToString(row.getCell(cols.calInternal)) : "";
      const externalVal =
        cols.calExternal > 0 && cols.calExternal !== cols.calInternal
          ? cellToString(row.getCell(cols.calExternal))
          : "";

      let calibrationType: CalibrationType = isFixture ? "internal" : "external";
      if (
        internalVal &&
        (internalVal.includes("√") ||
          internalVal.includes("✓") ||
          internalVal.includes("内校") ||
          internalVal.toLowerCase() === "y")
      ) {
        calibrationType = "internal";
      } else if (
        externalVal &&
        (externalVal.includes("√") ||
          externalVal.includes("✓") ||
          externalVal.includes("外校") ||
          externalVal.toLowerCase() === "y")
      ) {
        calibrationType = "external";
      }

      const recordType =
        cols.recordType > 0
          ? cellToString(row.getCell(cols.recordType)) || "校准报告"
          : "校准报告";
      const lastCalDate =
        cols.lastCalDate > 0
          ? cellToDateString(row.getCell(cols.lastCalDate))
          : "";
      const cycleRaw =
        cols.cycle > 0 ? cellToString(row.getCell(cols.cycle)) : "12个月";
      const calCycleMonths = parseCycleMonths(cycleRaw);
      let nextCalDate =
        cols.nextCalDate > 0
          ? cellToDateString(row.getCell(cols.nextCalDate))
          : "";
      const remark = cols.remark > 0 ? cellToString(row.getCell(cols.remark)) : "";
      const supplierRaw =
        cols.supplier > 0 ? cellToString(row.getCell(cols.supplier)) : "";
      const supplier = supplierRaw === "/" ? "" : supplierRaw;
      const contactPerson =
        cols.contactPerson > 0
          ? cellToString(row.getCell(cols.contactPerson))
          : "";
      const contactPhone =
        cols.contactPhone > 0 ? cellToString(row.getCell(cols.contactPhone)) : "";
      const calAgency =
        cols.calAgency > 0 ? cellToString(row.getCell(cols.calAgency)) : "";

      const isExemptByRemark =
        remark.includes("无需校验") ||
        remark.includes("无法校验") ||
        remark.includes("免校");
      const exemptCalibration =
        isExemptByRemark || (!lastCalDate && !nextCalDate);

      if (!exemptCalibration && !nextCalDate && lastCalDate) {
        nextCalDate = calcNextCalDate(lastCalDate, calCycleMonths);
      }
      if (exemptCalibration && !lastCalDate && !nextCalDate) {
        nextCalDate = "";
      }

      rows.push({
        category,
        seqNo: Number.isFinite(seqNum) && seqNum > 0 ? seqNum : undefined,
        department,
        name,
        purchaseDate,
        serialNo,
        modelSpec,
        location,
        calibrationType: exemptCalibration ? "exempt" : calibrationType,
        recordType,
        lastCalDate,
        calCycleMonths,
        nextCalDate,
        exemptCalibration,
        remark,
        supplier,
        contactPerson,
        contactPhone,
        calAgency,
      });

      if (isFixture) fixtureCount += 1;
      else gaugeCount += 1;
    }
  }

  return { rows, gaugeCount, fixtureCount, warnings };
}

function applyThinBorder(cell: ExcelJS.Cell) {
  cell.border = {
    top: { style: "thin", color: { argb: "FFBFBFBF" } },
    left: { style: "thin", color: { argb: "FFBFBFBF" } },
    bottom: { style: "thin", color: { argb: "FFBFBFBF" } },
    right: { style: "thin", color: { argb: "FFBFBFBF" } },
  };
}

function buildSheet(
  wb: ExcelJS.Workbook,
  sheetName: string,
  items: Instrument[],
  isFixture: boolean,
  settings: AppSettings,
  logoImageId: number | null
) {
  const ws = wb.addWorksheet(sheetName, {
    pageSetup: {
      orientation: "landscape",
      paperSize: 9, // A4
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
    },
    views: [{ state: "frozen", ySplit: 8 }],
  });

  const colCount = isFixture ? 18 : 19;
  const lastColLetter = isFixture ? "R" : "S";

  // Set column widths
  const widths = isFixture
    ? [7, 11, 16, 12, 22, 16, 8, 8, 11, 13, 10, 13, 12, 22, 22, 10, 16, 22]
    : [7, 11, 20, 12, 20, 16, 18, 8, 8, 11, 13, 10, 13, 12, 20, 24, 10, 16, 24];

  widths.forEach((w, idx) => {
    ws.getColumn(idx + 1).width = w;
  });

  // Title block (Rows 1-4)
  ws.getRow(1).height = 26;
  ws.getRow(2).height = 10;
  ws.getRow(3).height = 20;
  ws.getRow(4).height = 22;

  ws.mergeCells(`A1:${lastColLetter}2`);
  const titleCell = ws.getCell("A1");
  titleCell.value = settings.docTitle || "监视与测量管理台账";
  titleCell.font = { name: "Microsoft YaHei", size: 18, bold: true, color: { argb: "FF0F172A" } };
  titleCell.alignment = { vertical: "middle", horizontal: "center" };

  ws.mergeCells(`A3:${lastColLetter}3`);
  const subCell = ws.getCell("A3");
  subCell.value =
    settings.docSubtitle ||
    "The management record and plan of monitoring and measuring equipment";
  subCell.font = { name: "Arial", size: 10, italic: true, color: { argb: "FF475569" } };
  subCell.alignment = { vertical: "middle", horizontal: "center" };

  if (logoImageId !== null) {
    ws.addImage(logoImageId, {
      tl: { col: 0.1, row: 0.1 },
      ext: { width: 120, height: 50 },
    });
  }

  // Row 4 metadata
  const todayColStart = isFixture ? "L" : "M";
  const todayValStart = isFixture ? "N" : "O";
  const docCodeStart = isFixture ? "P" : "Q";

  ws.mergeCells("A4:F4");
  ws.getCell("A4").value = settings.weeklyNotice || "";
  ws.getCell("A4").font = { name: "Microsoft YaHei", size: 9, color: { argb: "FFB45309" }, bold: true };
  ws.getCell("A4").alignment = { vertical: "middle", horizontal: "left" };

  ws.mergeCells(`${todayColStart}4:${isFixture ? "M" : "N"}4`);
  ws.getCell(`${todayColStart}4`).value = "今天 today：";
  ws.getCell(`${todayColStart}4`).font = { name: "Microsoft YaHei", size: 9, bold: true };
  ws.getCell(`${todayColStart}4`).alignment = { vertical: "middle", horizontal: "right" };

  ws.mergeCells(`${todayValStart}4:${isFixture ? "O" : "P"}4`);
  ws.getCell(`${todayValStart}4`).value = getTodayStr();
  ws.getCell(`${todayValStart}4`).font = { name: "Arial", size: 9, bold: true };
  ws.getCell(`${todayValStart}4`).alignment = { vertical: "middle", horizontal: "left" };

  ws.mergeCells(`${docCodeStart}4:${lastColLetter}4`);
  ws.getCell(`${docCodeStart}4`).value = `表格编号：${settings.docCode || "JSSK-MPR-170"}  版本：${settings.docVersion || "A"}`;
  ws.getCell(`${docCodeStart}4`).font = { name: "Microsoft YaHei", size: 9, bold: true };
  ws.getCell(`${docCodeStart}4`).alignment = { vertical: "middle", horizontal: "right" };

  // Header rows (5-8)
  for (let r = 5; r <= 8; r++) {
    ws.getRow(r).height = r === 5 ? 24 : 18;
  }

  const headerDefs: Array<{ col: number; text: string; mergeAll4?: boolean }> = isFixture
    ? [
        { col: 1, text: "序号\nNo.", mergeAll4: true },
        { col: 2, text: "使用部门\nDept.", mergeAll4: true },
        { col: 3, text: "检具名称\nName", mergeAll4: true },
        { col: 4, text: "购买时间\nPurchase Date", mergeAll4: true },
        { col: 5, text: "检具出厂编号/管理编号\nGauge", mergeAll4: true },
        { col: 6, text: "型号规格\nSpec", mergeAll4: true },
        { col: 9, text: "记录类型\nType of record", mergeAll4: true },
        { col: 10, text: "上次检验日期\nLast cal date", mergeAll4: true },
        { col: 11, text: "检定周期\nCycle", mergeAll4: true },
        { col: 12, text: "下次检验日期\nNext cal date", mergeAll4: true },
        { col: 14, text: "备 注\nRemark", mergeAll4: true },
        { col: 15, text: "厂商\nSupplier", mergeAll4: true },
        { col: 16, text: "联系人\nContact", mergeAll4: true },
        { col: 17, text: "联系电话\nPhone", mergeAll4: true },
        { col: 18, text: "检测机构\nAgency", mergeAll4: true },
      ]
    : [
        { col: 1, text: "序号\nNo.", mergeAll4: true },
        { col: 2, text: "使用部门\nDept.", mergeAll4: true },
        { col: 3, text: "仪器名称\nName", mergeAll4: true },
        { col: 4, text: "购买时间\nPurchase Date", mergeAll4: true },
        { col: 5, text: "设备出厂编号/管理编号\nGauge", mergeAll4: true },
        { col: 6, text: "型号规格\nSpec", mergeAll4: true },
        { col: 7, text: "存放位置\nLocation", mergeAll4: true },
        { col: 10, text: "记录类型\nType of record", mergeAll4: true },
        { col: 11, text: "上次检验日期\nLast cal date", mergeAll4: true },
        { col: 12, text: "检定周期\nCycle", mergeAll4: true },
        { col: 13, text: "下次检验日期\nNext cal date", mergeAll4: true },
        { col: 15, text: "备 注\nRemark", mergeAll4: true },
        { col: 16, text: "厂商\nSupplier", mergeAll4: true },
        { col: 17, text: "联系人\nContact", mergeAll4: true },
        { col: 18, text: "联系电话\nPhone", mergeAll4: true },
        { col: 19, text: "检测机构\nAgency", mergeAll4: true },
      ];

  const calStartCol = isFixture ? 7 : 8;
  const statusCol = isFixture ? 13 : 14;

  const styleHeaderCell = (cell: ExcelJS.Cell, fillArgb = "FFE2E8F0") => {
    cell.font = { name: "Microsoft YaHei", size: 9, bold: true, color: { argb: "FF0F172A" } };
    cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: fillArgb } };
    applyThinBorder(cell);
  };

  for (const h of headerDefs) {
    ws.mergeCells(5, h.col, 8, h.col);
    const cell = ws.getCell(5, h.col);
    cell.value = h.text;
    styleHeaderCell(cell);
  }

  // Calibration type merged sub-header
  ws.mergeCells(5, calStartCol, 6, calStartCol + 1);
  ws.getCell(5, calStartCol).value = "校验类型\nCalibration Type";
  styleHeaderCell(ws.getCell(5, calStartCol));

  ws.mergeCells(7, calStartCol, 8, calStartCol);
  ws.getCell(7, calStartCol).value = "内校\nInternal";
  styleHeaderCell(ws.getCell(7, calStartCol));

  ws.mergeCells(7, calStartCol + 1, 8, calStartCol + 1);
  ws.getCell(7, calStartCol + 1).value = "外校\nExternal";
  styleHeaderCell(ws.getCell(7, calStartCol + 1));

  // Status column header + 3-color legend (rows 5-8)
  ws.getCell(5, statusCol).value = "状 态\nStatus";
  styleHeaderCell(ws.getCell(5, statusCol));

  const legendGreen = ws.getCell(6, statusCol);
  legendGreen.value = "表示合格";
  styleHeaderCell(legendGreen, "FFDCFCE7");
  legendGreen.font = { name: "Microsoft YaHei", size: 8, bold: true, color: { argb: "FF166534" } };

  const descThresholds = sortThresholdsDesc(settings.warningThresholds);
  const legendYellow = ws.getCell(7, statusCol);
  legendYellow.value = `临近≤${descThresholds.map((t) => t.days).join("/")}天`;
  styleHeaderCell(legendYellow, "FFFEF3C7");
  legendYellow.font = { name: "Microsoft YaHei", size: 8, bold: true, color: { argb: "FF92400E" } };

  const legendRed = ws.getCell(8, statusCol);
  legendRed.value = "已经延期";
  styleHeaderCell(legendRed, "FFFEE2E2");
  legendRed.font = { name: "Microsoft YaHei", size: 8, bold: true, color: { argb: "FF991B1B" } };

  // Ensure borders on all header grid cells
  for (let r = 5; r <= 8; r++) {
    for (let c = 1; c <= colCount; c++) {
      applyThinBorder(ws.getCell(r, c));
    }
  }

  // Data rows
  items.forEach((item, idx) => {
    const rowIdx = 9 + idx;
    const statusInfo = getInstrumentStatus(item, settings.warningThresholds);
    const isInternal = item.calibrationType === "internal";
    const isExternal = item.calibrationType === "external";

    const values = isFixture
      ? [
          idx + 1,
          item.department,
          item.name,
          item.purchaseDate || "/",
          item.serialNo,
          item.modelSpec || "/",
          isInternal ? "√" : "",
          isExternal ? "外校" : "",
          item.recordType || "校准报告",
          item.lastCalDate,
          item.calCycleMonths > 0 ? `${item.calCycleMonths}个月` : "",
          item.nextCalDate,
          `${statusInfo.label}${statusInfo.daysRemaining !== null ? ` (${statusInfo.detailText})` : ""}`,
          item.remark,
          item.supplier || "/",
          item.contactPerson,
          item.contactPhone,
          item.calAgency,
        ]
      : [
          idx + 1,
          item.department,
          item.name,
          item.purchaseDate,
          item.serialNo,
          item.modelSpec,
          item.location,
          isInternal ? "内校" : "",
          isExternal ? "外校" : "",
          item.recordType || "校准报告",
          item.lastCalDate,
          item.calCycleMonths > 0 ? `${item.calCycleMonths}个月` : "",
          item.nextCalDate,
          `${statusInfo.label}${statusInfo.daysRemaining !== null ? ` (${statusInfo.detailText})` : ""}`,
          item.remark,
          item.supplier,
          item.contactPerson,
          item.contactPhone,
          item.calAgency,
        ];

    const row = ws.getRow(rowIdx);
    row.height = 20;
    values.forEach((v, ci) => {
      const cell = row.getCell(ci + 1);
      cell.value = v;
      cell.font = { name: "Microsoft YaHei", size: 9, color: { argb: "FF1E293B" } };
      cell.alignment = {
        vertical: "middle",
        horizontal: ci === 0 || ci >= calStartCol - 1 && ci <= statusCol - 1 ? "center" : "left",
        wrapText: true,
      };
      applyThinBorder(cell);
    });

    // Apply color highlight on status cell
    const sc = row.getCell(statusCol);
    if (statusInfo.status === "valid") {
      sc.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFDCFCE7" } };
      sc.font = { name: "Microsoft YaHei", size: 9, bold: true, color: { argb: "FF166534" } };
    } else if (statusInfo.status === "warning") {
      const visuals = statusInfo.matchedThreshold
        ? getThresholdVisuals(statusInfo.matchedThreshold.color)
        : null;
      sc.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: visuals?.excelFillArgb || "FFFEF3C7" },
      };
      sc.font = {
        name: "Microsoft YaHei",
        size: 9,
        bold: true,
        color: { argb: visuals?.excelTextArgb || "FF92400E" },
      };
    } else if (statusInfo.status === "expired") {
      sc.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFEE2E2" } };
      sc.font = { name: "Microsoft YaHei", size: 9, bold: true, color: { argb: "FF991B1B" } };
    } else {
      sc.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF1F5F9" } };
      sc.font = { name: "Microsoft YaHei", size: 9, color: { argb: "FF64748B" } };
    }
  });

  // Footer signature rows
  const footerStart = 9 + items.length + 1;
  ws.getRow(footerStart).height = 22;
  ws.getRow(footerStart + 1).height = 16;

  ws.getCell(footerStart, 2).value = "编制/日期：";
  ws.getCell(footerStart + 1, 2).value = "Prepare/Date:";
  ws.getCell(footerStart, 6).value = "审核/日期：";
  ws.getCell(footerStart + 1, 6).value = "Check/Date:";
  ws.getCell(footerStart, 11).value = "批准/日期：";
  ws.getCell(footerStart + 1, 11).value = "Approve/Date:";

  [2, 6, 11].forEach((c) => {
    ws.getCell(footerStart, c).font = { name: "Microsoft YaHei", size: 9, bold: true };
    ws.getCell(footerStart + 1, c).font = { name: "Arial", size: 8, color: { argb: "FF64748B" } };
  });
}

export async function exportJsskExcel(
  instruments: Instrument[],
  settings: AppSettings,
  logoPayload?: { mime: string; base64: string } | null
): Promise<Uint8Array> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "InstrumentLedger";
  wb.created = new Date();

  let logoImageId: number | null = null;
  if (logoPayload && logoPayload.base64) {
    const ext = logoPayload.mime.includes("png") ? "png" : "jpeg";
    logoImageId = wb.addImage({
      base64: `data:${logoPayload.mime};base64,${logoPayload.base64}`,
      extension: ext,
    });
  }

  const gauges = instruments.filter((i) => i.category === "gauge");
  const fixtures = instruments.filter((i) => i.category === "fixture");

  if (gauges.length > 0 || fixtures.length === 0) {
    buildSheet(wb, "量具", gauges, false, settings, logoImageId);
  }
  if (fixtures.length > 0 || gauges.length === 0) {
    buildSheet(wb, "检具", fixtures, true, settings, logoImageId);
  }

  const buffer = await wb.xlsx.writeBuffer();
  return new Uint8Array(buffer as ArrayBuffer);
}

export function uint8ArrayToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const sub = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...sub);
  }
  return btoa(binary);
}

export function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}
