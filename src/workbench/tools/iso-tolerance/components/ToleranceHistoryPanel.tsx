import React, { useMemo, useState } from "react";
import {
  ArrowUpRight,
  ClipboardCopy,
  FileSpreadsheet,
  History,
  Search,
  Trash2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { SearchField } from "@/components/ui/FormControls";
import type { SavedToleranceRecord } from "../types";

interface ToleranceHistoryPanelProps {
  records: readonly SavedToleranceRecord[];
  onLoadRecord: (record: SavedToleranceRecord) => void;
  onCopyRecord: (record: SavedToleranceRecord) => void;
  onDeleteRecord: (id: string) => void;
  onClearHistory: () => void;
  onBatchExportExcel: () => void;
}

export const ToleranceHistoryPanel: React.FC<ToleranceHistoryPanelProps> = ({
  records,
  onLoadRecord,
  onCopyRecord,
  onDeleteRecord,
  onClearHistory,
  onBatchExportExcel,
}) => {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return records;
    return records.filter((rec) => {
      const hay = [
        rec.title,
        rec.meta.partName,
        rec.meta.drawingNo,
        rec.meta.lotNo,
        rec.meta.stage,
        rec.meta.drawingStandard,
        rec.createdAt,
      ]
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [records, query]);

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-zinc-200/90 dark:border-white/[0.09] bg-white dark:bg-[#111115] p-4 shadow-tactile flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <History className="h-4 w-4 text-amber-500" />
          <div>
            <h3 className="text-xs font-semibold text-zinc-900 dark:text-zinc-100">
              本地离线公差检核归档（共 {records.length} 条，上限 80 条）
            </h3>
            <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
              所有尺寸检核单与孔轴配对记录均保存在本机浏览器/客户端存储，支持随时恢复与批量导出台账
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <SearchField
            value={query}
            onChange={setQuery}
            placeholder="搜索零件、图号、批次..."
            icon={<Search className="h-3.5 w-3.5" />}
            className="w-52"
          />
          {records.length > 0 && (
            <>
              <button
                type="button"
                onClick={onBatchExportExcel}
                className="btn-tactile inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-900 dark:bg-white text-white dark:text-zinc-950 text-xs font-medium shadow-tactile-primary"
              >
                <FileSpreadsheet className="h-3.5 w-3.5" />
                <span>批量导出台账</span>
              </button>
              <button
                type="button"
                onClick={onClearHistory}
                className="btn-tactile inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-zinc-200 dark:border-white/[0.1] text-xs font-medium text-zinc-500 hover:text-rose-500 hover:border-rose-300"
              >
                <Trash2 className="h-3.5 w-3.5" />
                <span>清空</span>
              </button>
            </>
          )}
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-zinc-200 dark:border-white/[0.1] py-16 text-center space-y-1.5">
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            {records.length === 0 ? "暂无已归档的尺寸公差检核记录" : "未找到匹配的归档记录"}
          </p>
          <p className="text-[11px] text-zinc-400">
            在「批量尺寸检核单」中点击「归档本检验单」即可沉淀历史追溯记录。
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
          {filtered.map((rec) => (
            <div
              key={rec.id}
              className="rounded-2xl border border-zinc-200/90 dark:border-white/[0.09] bg-white dark:bg-[#111115] p-4 shadow-tactile flex flex-col justify-between gap-3"
            >
              <div className="space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-white/[0.07] font-mono text-[10px] font-semibold text-zinc-600 dark:text-zinc-300">
                        {rec.meta.stage}
                      </span>
                      <h4 className="text-xs font-semibold text-zinc-950 dark:text-white truncate">
                        {rec.meta.partName || rec.title}
                      </h4>
                    </div>
                    <p className="text-[11px] font-mono text-zinc-400 mt-0.5">
                      {rec.createdAt}
                      {rec.meta.drawingNo ? ` · 图号 ${rec.meta.drawingNo}` : ""}
                      {rec.meta.lotNo ? ` · 批次 ${rec.meta.lotNo}` : ""}
                    </p>
                  </div>

                  <span
                    className={cn(
                      "px-2 py-0.5 rounded-full font-mono text-[10.5px] font-bold shrink-0",
                      rec.overallVerdict === "FAIL"
                        ? "bg-rose-500/12 text-rose-700 dark:text-rose-300"
                        : rec.overallVerdict === "PASS"
                          ? "bg-emerald-500/12 text-emerald-700 dark:text-emerald-300"
                          : "bg-zinc-100 dark:bg-white/[0.07] text-zinc-500"
                    )}
                  >
                    {rec.overallVerdict}
                  </span>
                </div>

                <div className="flex flex-wrap items-center gap-2.5 text-[11px] font-mono tabular-nums text-zinc-600 dark:text-zinc-400">
                  <span>共 {rec.items.length} 项</span>
                  <span className="text-emerald-600 dark:text-emerald-400">OK {rec.okCount}</span>
                  <span className="text-amber-600 dark:text-amber-400">临界 {rec.warningCount}</span>
                  <span className="text-rose-600 dark:text-rose-400">NG {rec.ngCount}</span>
                  {rec.meta.drawingStandard && (
                    <span className="text-zinc-400">· {rec.meta.drawingStandard}</span>
                  )}
                </div>
              </div>

              <div className="pt-2.5 border-t border-zinc-100 dark:border-white/[0.06] flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => onLoadRecord(rec)}
                  className="inline-flex items-center gap-1 text-xs font-medium text-indigo-600 dark:text-indigo-400 hover:underline"
                >
                  <span>载入检验单</span>
                  <ArrowUpRight className="h-3.5 w-3.5" />
                </button>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => onCopyRecord(rec)}
                    title="复制摘要"
                    className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-white/[0.06]"
                  >
                    <ClipboardCopy className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => onDeleteRecord(rec.id)}
                    title="删除该条记录"
                    className="p-1.5 rounded-lg text-zinc-400 hover:text-rose-500 hover:bg-rose-500/10"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
