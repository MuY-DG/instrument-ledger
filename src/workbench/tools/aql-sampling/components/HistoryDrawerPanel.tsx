import React, { useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowUpRight,
  CheckCircle2,
  ClipboardCopy,
  FileSpreadsheet,
  History,
  Search,
  Trash2,
  XCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { SearchField } from "@/components/ui/FormControls";
import type { SavedInspectionRecord } from "../types";
import { formatAqlShort } from "../core/tables";
import { getSeverityLabel } from "../core/export";

interface HistoryDrawerPanelProps {
  records: SavedInspectionRecord[];
  onLoadRecord: (record: SavedInspectionRecord) => void;
  onCopyRecord: (record: SavedInspectionRecord) => void;
  onDeleteRecord: (id: string) => void;
  onClearAll: () => void;
  onExportAllExcel: () => void;
}

export const HistoryDrawerPanel: React.FC<HistoryDrawerPanelProps> = ({
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
        rec.meta.lotNo,
        rec.meta.supplier,
        rec.meta.inspector,
        rec.meta.stage,
        rec.createdAt,
        String(rec.lotSize),
      ]
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [records, query]);

  return (
    <div className="space-y-3.5">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2.5">
        <SearchField
          value={query}
          onChange={setQuery}
          placeholder="搜索物料、批号、供应商、检验员..."
          icon={<Search className="h-3.5 w-3.5" />}
          className="w-full sm:w-72"
        />

        <div className="flex items-center gap-2">
          {records.length > 0 && (
            <>
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
            </>
          )}
        </div>
      </div>

      {/* Empty State */}
      {records.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-zinc-200/95 dark:border-white/[0.1] bg-zinc-50/60 dark:bg-white/[0.015] py-16 px-6 text-center space-y-2">
          <div className="h-10 w-10 rounded-xl bg-zinc-100 dark:bg-white/[0.06] text-zinc-400 flex items-center justify-center mx-auto">
            <History className="h-5 w-5" />
          </div>
          <h3 className="text-xs font-semibold text-zinc-800 dark:text-zinc-200">
            暂无本地抽检判定记录
          </h3>
          <p className="text-[11.5px] text-zinc-500 dark:text-zinc-400 max-w-sm mx-auto">
            在「方案计算与判定」页录入批量、实测不良数及批号信息后，点击「保存到检验记录」即可归档并支持一键批量导出 Excel 报表。
          </p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="py-12 text-center text-xs text-zinc-400">
          未找到匹配的检验记录
        </div>
      ) : (
        <div className="space-y-2.5">
          {filtered.map((rec) => {
            const VerdictIcon =
              rec.overallVerdict === "reject"
                ? XCircle
                : rec.overallVerdict === "accept_revert_normal"
                  ? AlertTriangle
                  : CheckCircle2;
            const verdictCls =
              rec.overallVerdict === "reject"
                ? "bg-rose-500/12 text-rose-700 dark:text-rose-300"
                : rec.overallVerdict === "accept_revert_normal"
                  ? "bg-amber-500/14 text-amber-700 dark:text-amber-300"
                  : "bg-emerald-500/12 text-emerald-700 dark:text-emerald-300";

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
                      {rec.meta.partName || "未命名物料"}
                    </span>
                    {rec.meta.lotNo && (
                      <span className="font-mono text-[11px] text-zinc-400">
                        #{rec.meta.lotNo}
                      </span>
                    )}
                    <span
                      className={cn(
                        "inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10.5px] font-semibold",
                        verdictCls
                      )}
                    >
                      <VerdictIcon className="h-3 w-3" />
                      {rec.overallVerdict === "reject"
                        ? "拒收"
                        : rec.overallVerdict === "accept_revert_normal"
                          ? "允收·转正常"
                          : "允收"}
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-zinc-500 dark:text-zinc-400 font-mono tabular-nums">
                    <span>{rec.createdAt}</span>
                    <span>N={rec.lotSize.toLocaleString("zh-CN")}</span>
                    <span>水平 {rec.level}</span>
                    <span>{getSeverityLabel(rec.severity)}</span>
                    <span>抽样 {rec.recommendedTotalSample} 件</span>
                    {rec.meta.supplier && (
                      <span className="font-sans">供方：{rec.meta.supplier}</span>
                    )}
                  </div>

                  <div className="flex flex-wrap gap-1.5 pt-0.5">
                    {rec.classes.map((cls) => (
                      <span
                        key={cls.id}
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-zinc-50 dark:bg-white/[0.04] border border-zinc-200/75 dark:border-white/[0.06] font-mono text-[10.5px] text-zinc-600 dark:text-zinc-300"
                      >
                        <span className="font-sans font-medium">{cls.label.split(" ")[0]}</span>
                        <span>AQL {formatAqlShort(cls.aql)}</span>
                        <span className="text-zinc-400">·</span>
                        <span>
                          {cls.effectiveCode}(n={cls.sampleSize})
                        </span>
                        <span className="text-zinc-400">·</span>
                        <span>
                          Ac{cls.ac}/Re{cls.re}
                        </span>
                        <span className="text-zinc-400">·</span>
                        <span
                          className={
                            cls.verdict === "reject"
                              ? "text-rose-600 dark:text-rose-400 font-bold"
                              : "text-emerald-600 dark:text-emerald-400 font-semibold"
                          }
                        >
                          实测 {cls.defectsFound}
                        </span>
                      </span>
                    ))}
                  </div>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={() => onLoadRecord(rec)}
                    className="btn-tactile inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-zinc-200 dark:border-white/[0.1] bg-zinc-50/70 dark:bg-white/[0.04] text-[11px] font-medium text-zinc-700 dark:text-zinc-200 hover:text-emerald-600 dark:hover:text-emerald-400"
                  >
                    <span>载入</span>
                    <ArrowUpRight className="h-3 w-3" />
                  </button>
                  <button
                    type="button"
                    onClick={() => onCopyRecord(rec)}
                    title="复制该条记录摘要"
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
