import React from "react";
import { FileSpreadsheet, Grid3X3, Table2, X } from "lucide-react";
import type {
  ImportedColumnOption,
  ImportedMatrixOption,
  ParsedSpreadsheetResult,
} from "../core/parser";

interface ImportPreviewModalProps {
  preview: ParsedSpreadsheetResult | null;
  onClose: () => void;
  onSelectColumn: (col: ImportedColumnOption) => void;
  onSelectMatrix: (matrix: ImportedMatrixOption) => void;
}

export const ImportPreviewModal: React.FC<ImportPreviewModalProps> = ({
  preview,
  onClose,
  onSelectColumn,
  onSelectMatrix,
}) => {
  if (!preview) return null;

  return (
    <div
      className="fixed inset-0 z-[160] bg-zinc-950/50 backdrop-blur-[2px] flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl rounded-2xl border border-zinc-200/95 dark:border-white/[0.12] bg-white dark:bg-[#131317] shadow-2xl overflow-hidden flex flex-col max-h-[82vh]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-3.5 border-b border-zinc-200/80 dark:border-white/[0.08] flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="h-8 w-8 rounded-lg bg-indigo-500/12 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0">
              <FileSpreadsheet className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <h3 className="text-xs font-semibold text-zinc-950 dark:text-white truncate">
                选择要分析的实测数据列 · {preview.fileName}
              </h3>
              <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                共识别 {preview.columns.length} 个有效数值列
                {preview.matrices.length > 0
                  ? `，检测到 ${preview.matrices.length} 个子组矩阵`
                  : ""}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-white/[0.08] transition-colors"
            aria-label="关闭导入选择"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-5 overflow-y-auto space-y-4">
          {/* Subgroup Matrix Quick Import */}
          {preview.matrices.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center gap-1.5 text-[11px] font-semibold text-indigo-600 dark:text-indigo-400">
                <Grid3X3 className="h-3.5 w-3.5" />
                <span>按行作为子组矩阵整体导入（推荐用于 X̄-R / X̄-S 多列测量表）</span>
              </div>
              <div className="space-y-2">
                {preview.matrices.map((m, idx) => (
                  <button
                    key={`${m.sheetName}-${idx}`}
                    type="button"
                    onClick={() => onSelectMatrix(m)}
                    className="w-full text-left rounded-xl border border-indigo-200/90 dark:border-indigo-500/30 bg-indigo-50/55 dark:bg-indigo-500/[0.08] hover:border-indigo-400 dark:hover:border-indigo-400/60 p-3 flex items-center justify-between gap-3 transition-colors"
                  >
                    <div>
                      <div className="text-xs font-semibold text-zinc-900 dark:text-white">
                        工作表「{m.sheetName}」· {m.rowCount} 组 × {m.subgroupSize} 列
                      </div>
                      <div className="text-[11px] font-mono text-zinc-500 dark:text-zinc-400 mt-0.5">
                        总计 {m.values.length} 个实测值 · 自动设置子组大小 n = {m.subgroupSize}
                      </div>
                    </div>
                    <span className="px-2.5 py-1 rounded-lg bg-indigo-600 text-white text-[11px] font-semibold shrink-0">
                      导入矩阵
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Individual Numeric Columns */}
          <div className="space-y-2">
            <div className="flex items-center gap-1.5 text-[11px] font-semibold text-zinc-600 dark:text-zinc-300">
              <Table2 className="h-3.5 w-3.5" />
              <span>按单个尺寸 / 特性列导入</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {preview.columns.map((col) => (
                <button
                  key={col.id}
                  type="button"
                  onClick={() => onSelectColumn(col)}
                  className="text-left rounded-xl border border-zinc-200/90 dark:border-white/[0.09] bg-zinc-50/60 dark:bg-white/[0.025] hover:border-indigo-400 dark:hover:border-indigo-400/50 hover:bg-indigo-50/40 dark:hover:bg-indigo-500/[0.06] p-3 transition-colors space-y-1"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-zinc-900 dark:text-zinc-100 truncate">
                      {col.header}
                    </span>
                    <span className="px-1.5 py-0.5 rounded bg-zinc-200/70 dark:bg-white/[0.08] font-mono text-[10px] text-zinc-600 dark:text-zinc-300 shrink-0">
                      N={col.values.length}
                    </span>
                  </div>
                  <div className="text-[10.5px] font-mono text-zinc-500 dark:text-zinc-400 flex items-center justify-between gap-2">
                    <span>表：{col.sheetName}</span>
                    <span>
                      x̄ {col.mean.toFixed(3)} · [{col.min.toFixed(3)}, {col.max.toFixed(3)}]
                    </span>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {preview.warnings.length > 0 && (
            <div className="text-xs text-amber-600 dark:text-amber-400">
              {preview.warnings.join("；")}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
