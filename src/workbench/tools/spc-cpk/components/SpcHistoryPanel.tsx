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
import type { SavedSpcRecord } from "../types";
import { GRADE_META } from "../core/engine";

interface SpcHistoryPanelProps {
  records: SavedSpcRecord[];
  onLoadRecord: (record: SavedSpcRecord) => void;
  onCopyRecord: (record: SavedSpcRecord) => void;
  onDeleteRecord: (id: string) => void;
  onClearAll: () => void;
  onExportAllExcel: () => void;
}

export const SpcHistoryPanel: React.FC<SpcHistoryPanelProps> = ({
  records,
  onLoadRecord,
  onCopyRecord,
  onDeleteRecord,
  onClearAll,
  onExportAllExcel,
}) => {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return records;
    return records.filter((rec) => {
      const hay = [
        rec.meta.partName,
        rec.meta.characteristic,
        rec.meta.lotNo,
        rec.meta.machine,
        rec.meta.operator,
        rec.meta.stage,
        rec.createdAt,
        rec.grade,
      ]
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [records, query]);

  return (
    <div className="space-y-3.5">
      <div className="flex flex-wrap items-center justify-between gap-2.5">
        <SearchField
          value={query}
          onChange={setQuery}
          placeholder="搜索产品、尺寸特性、批号、机台、评级..."
          icon={<Search className="h-3.5 w-3.5" />}
          className="w-full sm:w-72"
        />

        {records.length > 0 && (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onExportAllExcel}
              className="btn-tactile inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-900 dark:bg-white text-white dark:text-zinc-950 text-xs font-medium shadow-tactile-primary"
            >
              <FileSpreadsheet className="h-3.5 w-3.5" />
              <span>批量导出 Excel ({records.length})</span>
            </button>
            <button
              type="button"
              onClick={onClearAll}
              className="btn-tactile inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-zinc-200 dark:border-white/[0.1] text-xs font-medium text-zinc-500 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
            >
              <Trash2 className="h-3.5 w-3.5" />
              <span>清空</span>
            </button>
          </div>
        )}
      </div>

      {records.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-zinc-200/95 dark:border-white/[0.1] bg-zinc-50/60 dark:bg-white/[0.015] py-16 px-6 text-center space-y-2">
          <div className="h-10 w-10 rounded-xl bg-zinc-100 dark:bg-white/[0.06] text-zinc-400 flex items-center justify-center mx-auto">
            <History className="h-5 w-5" />
          </div>
          <h3 className="text-xs font-semibold text-zinc-800 dark:text-zinc-200">
            暂无本地 CPK 分析归档记录
          </h3>
          <p className="text-[11.5px] text-zinc-500 dark:text-zinc-400 max-w-sm mx-auto">
            完成数据粘贴或 Excel 导入并确认分析结果后，点击左侧「保存到分析记录」即可本地归档，随时复查或一键汇总导出 Excel。
          </p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="py-12 text-center text-xs text-zinc-400">
          未找到匹配的分析记录
        </div>
      ) : (
        <div className="space-y-2.5">
          {filtered.map((rec) => {
            const tone = GRADE_META[rec.grade].tone;
            const pillCls =
              tone === "emerald"
                ? "bg-emerald-500/12 text-emerald-700 dark:text-emerald-300"
                : tone === "sky"
                  ? "bg-sky-500/12 text-sky-700 dark:text-sky-300"
                  : tone === "amber"
                    ? "bg-amber-500/14 text-amber-700 dark:text-amber-300"
                    : tone === "orange"
                      ? "bg-orange-500/14 text-orange-700 dark:text-orange-300"
                      : tone === "rose"
                        ? "bg-rose-500/12 text-rose-700 dark:text-rose-300"
                        : "bg-zinc-200/70 dark:bg-white/[0.08] text-zinc-600 dark:text-zinc-300";

            return (
              <div
                key={rec.id}
                className="rounded-xl border border-zinc-200/90 dark:border-white/[0.08] bg-white dark:bg-[#111115] p-3.5 shadow-tactile flex flex-col lg:flex-row lg:items-center justify-between gap-3"
              >
                <div className="space-y-1.5 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-white/[0.07] font-mono text-[10px] font-semibold text-zinc-700 dark:text-zinc-200">
                      {rec.meta.stage}
                    </span>
                    <span className="text-xs font-semibold text-zinc-900 dark:text-zinc-100 truncate">
                      {rec.meta.partName || "未命名产品"}
                      {rec.meta.characteristic ? ` · ${rec.meta.characteristic}` : ""}
                    </span>
                    {rec.meta.lotNo && (
                      <span className="font-mono text-[11px] text-zinc-400">
                        #{rec.meta.lotNo}
                      </span>
                    )}
                    <span
                      className={cn(
                        "inline-flex items-center gap-1 px-1.5 py-0.5 rounded font-mono text-[10.5px] font-bold",
                        pillCls
                      )}
                    >
                      {rec.grade} 级 · Cpk{" "}
                      {rec.cpk !== null ? rec.cpk.toFixed(2) : "—"}
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-zinc-500 dark:text-zinc-400 font-mono tabular-nums">
                    <span>{rec.createdAt}</span>
                    <span>N={rec.count} (n={rec.subgroupSize})</span>
                    <span>Cp={rec.cp !== null ? rec.cp.toFixed(2) : "—"}</span>
                    <span>Ppk={rec.ppk !== null ? rec.ppk.toFixed(2) : "—"}</span>
                    <span>x̄={rec.mean.toFixed(4)}</span>
                    <span
                      className={
                        rec.oosCount > 0
                          ? "text-rose-600 dark:text-rose-400 font-semibold"
                          : "text-emerald-600 dark:text-emerald-400"
                      }
                    >
                      超差 {rec.oosCount} 件
                    </span>
                    <span>
                      {rec.violationCount === 0
                        ? "SPC 受控"
                        : `${rec.violationCount} 处判异`}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={() => onLoadRecord(rec)}
                    className="btn-tactile inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-zinc-200 dark:border-white/[0.1] bg-zinc-50/70 dark:bg-white/[0.04] text-[11px] font-medium text-zinc-700 dark:text-zinc-200 hover:text-indigo-600 dark:hover:text-indigo-400"
                  >
                    <span>载入</span>
                    <ArrowUpRight className="h-3 w-3" />
                  </button>
                  <button
                    type="button"
                    onClick={() => onCopyRecord(rec)}
                    title="复制该条分析摘要"
                    className="btn-tactile p-1.5 rounded-lg border border-zinc-200 dark:border-white/[0.1] text-zinc-500 hover:text-zinc-900 dark:hover:text-white"
                  >
                    <ClipboardCopy className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => onDeleteRecord(rec.id)}
                    title="删除该条记录"
                    className="btn-tactile p-1.5 rounded-lg border border-zinc-200 dark:border-white/[0.1] text-zinc-400 hover:text-rose-600 dark:hover:text-rose-400 hover:border-rose-300 dark:hover:border-rose-500/35"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
