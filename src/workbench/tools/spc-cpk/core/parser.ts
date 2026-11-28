/**
 * Smart measurement parser for clipboard paste (Excel/Minitab/CMM/plain text)
 * and Excel (.xlsx) / CSV / TXT file import with automatic column & subgroup detection.
 */
import type ExcelJS from "exceljs";
import { MAX_SUBGROUP_SIZE } from "./constants";

export interface ParsedTextResult {
  values: number[];
  skippedTokens: number;
  lineCount: number;
  /** Non-null when >= 2 rows share a consistent multi-column numeric layout (2..25 cols). */
  detectedSubgroupSize: number | null;
}

export interface ImportedColumnOption {
  id: string;
  sheetName: string;
  colIndex: number; // 1-based
  header: string;
  values: number[];
  min: number;
  max: number;
  mean: number;
}

export interface ImportedMatrixOption {
  sheetName: string;
  rowCount: number;
  subgroupSize: number;
  values: number[];
}

export interface ParsedSpreadsheetResult {
  fileName: string;
  columns: ImportedColumnOption[];
  matrices: ImportedMatrixOption[];
  warnings: string[];
}

const NUMBER_PATTERN = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/;

function tryParseNumericToken(token: string): number | null {
  const cleaned = token
    .trim()
    .replace(/^["']+|["']+$/g, "")
    .replace(/,/g, "");
  if (!cleaned) return null;
  if (!NUMBER_PATTERN.test(cleaned)) return null;
  const num = Number(cleaned);
  return Number.isFinite(num) ? num : null;
}

/**
 * Parse raw pasted text containing numbers separated by newlines, tabs, spaces, commas, or semicolons.
 * Automatically ignores header lines or non-numeric labels (e.g., "Sample 1", "序号") while preserving order.
 */
export function parseRawMeasurements(text: string): ParsedTextResult {
  const rawLines = text.split(/\r?\n/);
  const values: number[] = [];
  let skippedTokens = 0;
  let numericRowCount = 0;
  const colCountFreq = new Map<number, number>();

  for (const rawLine of rawLines) {
    const trimmed = rawLine.trim();
    if (!trimmed) continue;

    // Split by tab, comma, Chinese comma, semicolon, Chinese semicolon, or whitespace
    const tokens = trimmed.split(/[\t,，;；\s]+/).filter(Boolean);
    if (tokens.length === 0) continue;

    const lineNums: number[] = [];
    let lineSkipped = 0;

    for (let i = 0; i < tokens.length; i++) {
      const tok = tokens[i];
      const num = tryParseNumericToken(tok);
      if (num !== null) {
        lineNums.push(num);
      } else {
        lineSkipped += 1;
      }
    }

    // If a line starts with an integer sequence index like "1\t20.01\t20.02\t..." AND every other column is numeric
    // we don't blindly drop it (user might genuinely paste integers); Excel importer handles sequence columns explicitly.
    if (lineNums.length > 0) {
      numericRowCount += 1;
      for (const n of lineNums) values.push(n);
      colCountFreq.set(lineNums.length, (colCountFreq.get(lineNums.length) ?? 0) + 1);
    }
    skippedTokens += lineSkipped;
  }

  // Detect consistent multi-column subgroup layout (e.g., 25 rows x 5 cols)
  let detectedSubgroupSize: number | null = null;
  if (numericRowCount >= 2) {
    let bestCols = 0;
    let bestFreq = 0;
    for (const [cols, freq] of colCountFreq.entries()) {
      if (cols >= 2 && cols <= MAX_SUBGROUP_SIZE && freq > bestFreq) {
        bestCols = cols;
        bestFreq = freq;
      }
    }
    // At least 80% of numeric rows match that exact column count
    if (bestCols >= 2 && bestFreq / numericRowCount >= 0.8) {
      detectedSubgroupSize = bestCols;
    }
  }

  return {
    values,
    skippedTokens,
    lineCount: numericRowCount,
    detectedSubgroupSize,
  };
}

/** Format an array of numbers nicely into rows grouped by subgroupSize (or 5 per line for n=1). */
export function formatValuesAsText(
  values: number[],
  subgroupSize: number,
  decimals?: number
): string {
  if (values.length === 0) return "";
  const cols = subgroupSize > 1 ? subgroupSize : 5;
  const lines: string[] = [];
  for (let i = 0; i < values.length; i += cols) {
    const chunk = values.slice(i, i + cols).map((v) =>
      typeof decimals === "number" ? v.toFixed(decimals) : formatCompactNumber(v)
    );
    lines.push(chunk.join(subgroupSize > 1 ? "\t" : "  "));
  }
  return lines.join("\n");
}

export function formatCompactNumber(v: number, maxDecimals = 5): string {
  if (!Number.isFinite(v)) return "—";
  const rounded = Number(v.toFixed(maxDecimals));
  return String(rounded);
}

/** Auto-pick readable decimal precision based on value spread/tolerance. */
export function inferDisplayDecimals(span: number): number {
  const abs = Math.abs(span);
  if (!Number.isFinite(abs) || abs === 0) return 3;
  if (abs >= 100) return 2;
  if (abs >= 10) return 2;
  if (abs >= 1) return 3;
  if (abs >= 0.05) return 4;
  return 5;
}

function unwrapExcelCellValue(val: ExcelJS.CellValue): unknown {
  if (val === null || val === undefined) return null;
  if (typeof val === "object") {
    if (val instanceof Date) return null;
    if ("result" in val) {
      return unwrapExcelCellValue((val as ExcelJS.CellFormulaValue).result ?? null);
    }
    if (
      "richText" in val &&
      Array.isArray((val as ExcelJS.CellRichTextValue).richText)
    ) {
      return (val as ExcelJS.CellRichTextValue).richText
        .map((r) => r.text)
        .join("");
    }
    if ("text" in val) {
      return (val as ExcelJS.CellHyperlinkValue).text ?? null;
    }
  }
  return val;
}

function cellToNumber(val: ExcelJS.CellValue): number | null {
  const raw = unwrapExcelCellValue(val);
  if (typeof raw === "number") {
    return Number.isFinite(raw) ? raw : null;
  }
  if (typeof raw === "string") {
    return tryParseNumericToken(raw);
  }
  return null;
}

function cellToLabel(val: ExcelJS.CellValue): string {
  const raw = unwrapExcelCellValue(val);
  if (raw === null || raw === undefined) return "";
  return String(raw).trim();
}

function isLikelySequenceColumn(values: number[], header: string): boolean {
  const h = header.toLowerCase();
  if (/^(序号|编号|组号|样品号|no\.?|#|seq|index|id|subgroup)$/.test(h)) {
    return true;
  }
  if (values.length < 4) return false;
  // Strictly 1, 2, 3, ..., N
  let sequential = true;
  for (let i = 0; i < values.length; i++) {
    if (values[i] !== i + 1) {
      sequential = false;
      break;
    }
  }
  return sequential;
}

function makeColumnOption(
  sheetName: string,
  colIndex: number,
  header: string,
  values: number[]
): ImportedColumnOption {
  let min = values[0];
  let max = values[0];
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    if (v < min) min = v;
    if (v > max) max = v;
    sum += v;
  }
  return {
    id: `${sheetName}::col-${colIndex}`,
    sheetName,
    colIndex,
    header: header || `第 ${colIndex} 列`,
    values,
    min,
    max,
    mean: sum / values.length,
  };
}

/**
 * Parse a CSV / TSV / TXT file into selectable numeric columns & optional subgroup matrix.
 */
function parseDelimitedTextToPreview(
  fileName: string,
  text: string
): ParsedSpreadsheetResult {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length === 0) {
    return {
      fileName,
      columns: [],
      matrices: [],
      warnings: ["文件内容为空"],
    };
  }

  // Detect delimiter: tab > semicolon > comma > whitespace
  const sample = lines[0];
  const sep = sample.includes("\t")
    ? "\t"
    : sample.includes(";")
      ? ";"
      : sample.includes(",")
        ? ","
        : /\s+/;

  const grid = lines.map((line) =>
    (typeof sep === "string" ? line.split(sep) : line.split(sep)).map((c) =>
      c.trim().replace(/^["']+|["']+$/g, "")
    )
  );
  const maxCols = Math.max(...grid.map((r) => r.length));

  // Detect if first row is header (has >= 1 non-numeric cell)
  const firstRowHasText = grid[0].some(
    (cell) => cell !== "" && tryParseNumericToken(cell) === null
  );
  const dataStart = firstRowHasText ? 1 : 0;

  const columns: ImportedColumnOption[] = [];
  for (let c = 0; c < maxCols; c++) {
    const header = firstRowHasText ? grid[0][c] || `列 ${c + 1}` : `列 ${c + 1}`;
    const vals: number[] = [];
    for (let r = dataStart; r < grid.length; r++) {
      const num = tryParseNumericToken(grid[r][c] ?? "");
      if (num !== null) vals.push(num);
    }
    if (vals.length >= 2) {
      columns.push(makeColumnOption("数据表", c + 1, header, vals));
    }
  }

  // Check if non-sequence columns form a subgroup matrix (2..25 cols of equal length)
  const matrices: ImportedMatrixOption[] = [];
  const measurementCols = columns.filter(
    (col) => !isLikelySequenceColumn(col.values, col.header)
  );
  if (measurementCols.length >= 2 && measurementCols.length <= MAX_SUBGROUP_SIZE) {
    const minLen = Math.min(...measurementCols.map((c) => c.values.length));
    if (minLen >= 2) {
      const flat: number[] = [];
      for (let r = 0; r < minLen; r++) {
        for (const col of measurementCols) {
          flat.push(col.values[r]);
        }
      }
      matrices.push({
        sheetName: "数据表",
        rowCount: minLen,
        subgroupSize: measurementCols.length,
        values: flat,
      });
    }
  }

  return {
    fileName,
    columns,
    matrices,
    warnings:
      columns.length === 0 ? ["未在文件中识别到包含 2 个以上数值的有效数据列"] : [],
  };
}

/**
 * Parse an uploaded Excel (.xlsx) or CSV / TXT file into selectable columns and matrices.
 */
export async function parseSpreadsheetFile(
  file: File
): Promise<ParsedSpreadsheetResult> {
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  if (ext === "csv" || ext === "tsv" || ext === "txt") {
    const text = await file.text();
    return parseDelimitedTextToPreview(file.name, text);
  }

  const buffer = await file.arrayBuffer();
  return parseExcelArrayBuffer(file.name, buffer);
}

/**
 * Pure ArrayBuffer Excel (.xlsx) parser (also directly testable in Node scripts).
 */
export async function parseExcelArrayBuffer(
  fileName: string,
  buffer: ArrayBuffer | Uint8Array
): Promise<ParsedSpreadsheetResult> {
  const mod = await import("exceljs");
  const ExcelJS =
    (mod as unknown as { default?: typeof import("exceljs") }).default ?? mod;
  const workbook = new ExcelJS.Workbook();
  const data =
    buffer instanceof Uint8Array
      ? buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength)
      : buffer;
  await workbook.xlsx.load(data as ArrayBuffer);

  const columns: ImportedColumnOption[] = [];
  const matrices: ImportedMatrixOption[] = [];
  const warnings: string[] = [];

  for (const sheet of workbook.worksheets) {
    if (sheet.rowCount < 2) continue;
    const maxCol = Math.min(sheet.columnCount || 30, 50);
    const maxRow = Math.min(sheet.rowCount, 10_000);
    const sheetCols: ImportedColumnOption[] = [];

    for (let c = 1; c <= maxCol; c++) {
      let header = "";
      const vals: number[] = [];

      for (let r = 1; r <= maxRow; r++) {
        const cellVal = sheet.getRow(r).getCell(c).value;
        const num = cellToNumber(cellVal);
        if (num !== null) {
          vals.push(num);
        } else if (vals.length === 0) {
          const lbl = cellToLabel(cellVal);
          if (lbl && lbl.length <= 48) {
            header = lbl;
          }
        }
      }

      if (vals.length >= 2) {
        sheetCols.push(makeColumnOption(sheet.name, c, header, vals));
      }
    }

    for (const col of sheetCols) {
      columns.push(col);
    }

    // Detect subgroup matrix inside this worksheet (e.g. X1..X5 columns)
    const measureCols = sheetCols.filter(
      (col) => !isLikelySequenceColumn(col.values, col.header)
    );
    if (measureCols.length >= 2 && measureCols.length <= MAX_SUBGROUP_SIZE) {
      const counts = measureCols.map((c) => c.values.length);
      const minLen = Math.min(...counts);
      const maxLen = Math.max(...counts);
      if (minLen >= 2 && maxLen - minLen <= 1) {
        const flat: number[] = [];
        for (let r = 0; r < minLen; r++) {
          for (const col of measureCols) {
            flat.push(col.values[r]);
          }
        }
        matrices.push({
          sheetName: sheet.name,
          rowCount: minLen,
          subgroupSize: measureCols.length,
          values: flat,
        });
      }
    }
  }

  if (columns.length === 0) {
    warnings.push("未能从工作簿中提取到至少 2 个数值的有效数据列");
  }

  return { fileName, columns, matrices, warnings };
}
