import React, { useEffect, useMemo, useRef, useState } from "react";
import { Edit3, Eye, FileText, Plus, Trash2 } from "lucide-react";
import { calTypeLabel, type InstrumentStatusInfo } from "@/lib/status";
import { getThresholdVisuals } from "@/lib/thresholdColors";
import { cn } from "@/lib/utils";
import { LocationThumb } from "@/components/LocationThumb";
import { StatusBadge } from "@/components/StatusBadge";
import type { CategoryTab, Instrument } from "@/types";

const ROW_HEIGHT = 66;
const OVERSCAN = 8;
const VIRTUALIZE_THRESHOLD = 50;

interface InstrumentRowProps {
  inst: Instrument;
  rowNumber: number;
  statusInfo: InstrumentStatusInfo;
  showCategoryBadge: boolean;
  isAdmin: boolean;
  isActive: boolean;
  onView: (inst: Instrument) => void;
  onEdit: (inst: Instrument) => void;
  onDelete: (inst: Instrument) => void;
  onOpenReport: (inst: Instrument) => void;
  onOpenPhoto: (inst: Instrument) => void;
}

const InstrumentRow: React.FC<InstrumentRowProps> = React.memo(
  ({
    inst,
    rowNumber,
    statusInfo,
    showCategoryBadge,
    isAdmin,
    isActive,
    onView,
    onEdit,
    onDelete,
    onOpenReport,
    onOpenPhoto,
  }) => {
    const tierVisuals =
      statusInfo.status === "warning" && statusInfo.matchedThreshold
        ? getThresholdVisuals(statusInfo.matchedThreshold.color)
        : null;

    const rowStyle: React.CSSProperties | undefined =
      statusInfo.status === "expired"
        ? { boxShadow: "inset 2.5px 0 0 0 rgb(244, 63, 94)" }
        : tierVisuals
          ? {
              ...tierVisuals.cssVars,
              boxShadow: tierVisuals.rowAccentShadow,
            }
          : undefined;

    return (
      <tr
        onClick={() => onView(inst)}
        style={rowStyle}
        className={cn(
          "group h-[66px] cursor-pointer transition-colors duration-150",
          isActive
            ? "bg-indigo-50/70 dark:bg-indigo-500/[0.08]"
            : "hover:bg-zinc-50/90 dark:hover:bg-white/[0.025]"
        )}
      >
        <td className="py-2.5 pl-6 pr-2 font-mono tabular-nums text-[11.5px] text-zinc-400 dark:text-zinc-600">
          {String(rowNumber).padStart(2, "0")}
        </td>

        {/* Name & Department */}
        <td className="py-2.5 px-3 overflow-hidden">
          <div className="flex items-center gap-1.5 min-w-0">
            <span
              className="font-medium text-zinc-900 dark:text-zinc-100 text-[13px] tracking-tight truncate"
              title={inst.name}
            >
              {inst.name}
            </span>
            {showCategoryBadge && (
              <span className="px-1.5 py-0.2 rounded border border-zinc-200/80 dark:border-white/[0.09] text-[10px] font-medium text-zinc-500 dark:text-zinc-400 shrink-0">
                {inst.category === "fixture" ? "检具" : "量具"}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 mt-1 text-[11px] text-zinc-500 dark:text-zinc-400 min-w-0">
            {inst.department && (
              <span className="px-1.5 py-0.2 rounded bg-zinc-100 dark:bg-white/[0.06] text-zinc-600 dark:text-zinc-300 shrink-0 max-w-[100px] truncate">
                {inst.department}
              </span>
            )}
            {inst.remark && (
              <span
                className="truncate text-zinc-400 dark:text-zinc-500"
                title={inst.remark}
              >
                {inst.remark}
              </span>
            )}
          </div>
        </td>

        {/* Serial No & Spec */}
        <td className="py-2.5 px-3 overflow-hidden">
          <div
            className="font-mono tabular-nums text-xs font-medium text-zinc-800 dark:text-zinc-200 truncate"
            title={inst.serialNo}
          >
            {inst.serialNo || "—"}
          </div>
          <div
            className="text-[11px] text-zinc-400 dark:text-zinc-500 mt-0.5 truncate"
            title={inst.modelSpec}
          >
            {inst.modelSpec || "—"}
          </div>
        </td>

        {/* Location + Photo Thumbnail */}
        <td className="py-2.5 px-3 overflow-hidden">
          <div className="flex items-center gap-2.5 min-w-0">
            <LocationThumb
              photoPath={inst.photoPath}
              alt={`${inst.name} 位置图`}
              onClick={() => onOpenPhoto(inst)}
            />
            <div className="min-w-0 flex-1">
              <div
                className="text-xs text-zinc-700 dark:text-zinc-200 truncate"
                title={inst.location}
              >
                {inst.location || (
                  <span className="text-zinc-300 dark:text-zinc-600">
                    未登记
                  </span>
                )}
              </div>
              {inst.calAgency && (
                <div
                  className="text-[10.5px] text-zinc-400 dark:text-zinc-500 truncate mt-0.5"
                  title={inst.calAgency}
                >
                  {inst.calAgency}
                </div>
              )}
            </div>
          </div>
        </td>

        {/* Last Cal Date + Method + Cycle */}
        <td className="py-2.5 px-3 whitespace-nowrap">
          <div className="font-mono tabular-nums text-xs text-zinc-700 dark:text-zinc-300">
            {inst.lastCalDate || "—"}
          </div>
          <div className="flex items-center gap-1.5 mt-1 text-[10.5px] text-zinc-500 dark:text-zinc-400">
            <span className="px-1.5 py-0.2 rounded bg-zinc-100 dark:bg-white/[0.06] text-zinc-600 dark:text-zinc-300 font-medium">
              {calTypeLabel(inst.calibrationType)}
            </span>
            {inst.calCycleMonths > 0 && !inst.exemptCalibration && (
              <span className="font-mono tabular-nums text-zinc-400 dark:text-zinc-500">
                {inst.calCycleMonths}月
              </span>
            )}
          </div>
        </td>

        {/* Next Cal Date */}
        <td className="py-2.5 px-3 font-mono tabular-nums text-xs whitespace-nowrap">
          {inst.exemptCalibration ? (
            <span className="text-zinc-400 dark:text-zinc-600">—</span>
          ) : (
            <span
              className={cn(
                "font-medium",
                statusInfo.status === "expired"
                  ? "text-rose-600 dark:text-rose-400"
                  : statusInfo.status === "warning" && tierVisuals
                    ? "text-[var(--tier-text)] dark:text-[var(--tier-text-dark)]"
                    : "text-zinc-800 dark:text-zinc-200"
              )}
            >
              {inst.nextCalDate || "—"}
            </span>
          )}
        </td>

        {/* Precision Status Badge */}
        <td className="py-2.5 px-3">
          <StatusBadge info={statusInfo} />
        </td>

        {/* Report Attachments */}
        <td className="py-2.5 px-3" onClick={(e) => e.stopPropagation()}>
          {inst.reportCount > 0 ? (
            <button
              type="button"
              onClick={() => onOpenReport(inst)}
              className="btn-tactile inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-zinc-100/90 hover:bg-zinc-200/80 dark:bg-white/[0.06] dark:hover:bg-white/[0.11] text-zinc-700 dark:text-zinc-200 border border-zinc-200/80 dark:border-white/[0.08] shadow-hairline text-[11.5px] font-medium max-w-[122px]"
              title={`点击预览最新报告：${inst.latestReportName || ""}`}
            >
              <FileText className="h-3.5 w-3.5 shrink-0 text-indigo-500 dark:text-indigo-400" />
              <span className="truncate font-mono tabular-nums">
                报告 · {inst.reportCount}
              </span>
            </button>
          ) : isAdmin ? (
            <button
              type="button"
              onClick={() => onOpenReport(inst)}
              className="btn-tactile inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-dashed border-zinc-300 dark:border-zinc-700 hover:border-zinc-400 dark:hover:border-zinc-500 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 text-[11.5px]"
            >
              <Plus className="h-3 w-3" />
              <span>上传</span>
            </button>
          ) : (
            <span className="text-[11.5px] text-zinc-300 dark:text-zinc-700">
              —
            </span>
          )}
        </td>

        {/* Row Actions */}
        <td
          className="py-2.5 pl-3 pr-6 text-right whitespace-nowrap"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="inline-flex items-center gap-0.5 opacity-65 group-hover:opacity-100 transition-opacity duration-150">
            <button
              type="button"
              onClick={() => onView(inst)}
              className="btn-tactile p-1.5 rounded-lg text-zinc-400 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-white/[0.08]"
              title="查看完整档案"
            >
              <Eye className="h-3.5 w-3.5" />
            </button>
            {isAdmin && (
              <>
                <button
                  type="button"
                  onClick={() => onEdit(inst)}
                  className="btn-tactile p-1.5 rounded-lg text-zinc-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-indigo-500/10"
                  title="编辑记录"
                >
                  <Edit3 className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => onDelete(inst)}
                  className="btn-tactile p-1.5 rounded-lg text-zinc-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-500/10"
                  title="删除记录"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </>
            )}
          </div>
        </td>
      </tr>
    );
  }
);

interface VirtualInstrumentTableProps {
  items: Instrument[];
  statusById: Map<number, InstrumentStatusInfo>;
  activeTab: CategoryTab;
  isAdmin: boolean;
  activeInstrumentId: number | null;
  resetScrollKey: string;
  onView: (inst: Instrument) => void;
  onEdit: (inst: Instrument) => void;
  onDelete: (inst: Instrument) => void;
  onOpenReport: (inst: Instrument) => void;
  onOpenPhoto: (inst: Instrument) => void;
}

const FALLBACK_STATUS: InstrumentStatusInfo = {
  status: "exempt",
  daysRemaining: null,
  label: "免校",
  detailText: "未设效期",
  isDueThisWeek: false,
  matchedThreshold: null,
};

export const VirtualInstrumentTable: React.FC<VirtualInstrumentTableProps> = ({
  items,
  statusById,
  activeTab,
  isAdmin,
  activeInstrumentId,
  resetScrollKey,
  onView,
  onEdit,
  onDelete,
  onOpenReport,
  onOpenPhoto,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(720);

  // Measure scroll viewport height
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () => {
      if (el.clientHeight > 0) setViewportHeight(el.clientHeight);
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Reset scroll to top cleanly when switching category or major filter
  useEffect(() => {
    const el = containerRef.current;
    if (el && el.scrollTop !== 0) {
      el.scrollTop = 0;
    }
    setScrollTop(0);
  }, [resetScrollKey]);

  const handleScroll = () => {
    if (rafRef.current !== null) return;
    rafRef.current = window.requestAnimationFrame(() => {
      rafRef.current = null;
      const el = containerRef.current;
      if (el) setScrollTop(el.scrollTop);
    });
  };

  useEffect(() => {
    return () => {
      if (rafRef.current !== null) {
        window.cancelAnimationFrame(rafRef.current);
      }
    };
  }, []);

  const total = items.length;
  const shouldVirtualize = total > VIRTUALIZE_THRESHOLD;

  const { startIdx, endIdx, topSpacer, bottomSpacer } = useMemo(() => {
    if (!shouldVirtualize) {
      return {
        startIdx: 0,
        endIdx: total,
        topSpacer: 0,
        bottomSpacer: 0,
      };
    }
    const headerOffset = 38;
    const effectiveTop = Math.max(0, scrollTop - headerOffset);
    const visibleCount = Math.ceil(viewportHeight / ROW_HEIGHT);
    const rawStart = Math.floor(effectiveTop / ROW_HEIGHT) - OVERSCAN;
    const start = Math.max(0, rawStart);
    const end = Math.min(total, start + visibleCount + OVERSCAN * 2);
    return {
      startIdx: start,
      endIdx: end,
      topSpacer: start * ROW_HEIGHT,
      bottomSpacer: Math.max(0, (total - end) * ROW_HEIGHT),
    };
  }, [shouldVirtualize, total, scrollTop, viewportHeight]);

  const visibleSlice = useMemo(
    () => items.slice(startIdx, endIdx),
    [items, startIdx, endIdx]
  );

  const showCategoryBadge = activeTab === "all";

  return (
    <div
      ref={containerRef}
      onScroll={handleScroll}
      className="flex-1 overflow-auto will-change-scroll"
    >
      <table className="w-full min-w-[1040px] table-fixed text-left border-collapse">
        <colgroup>
          <col className="w-12" />
          <col className="w-[22%]" />
          <col className="w-[16%]" />
          <col className="w-[18%]" />
          <col className="w-[126px]" />
          <col className="w-[108px]" />
          <col className="w-[122px]" />
          <col className="w-[132px]" />
          <col className="w-[108px]" />
        </colgroup>
        <thead className="sticky top-0 z-10 bg-white/95 dark:bg-[#09090b]/95 backdrop-blur-md">
          <tr className="border-b border-zinc-200/80 dark:border-white/[0.07] text-[11px] font-medium text-zinc-400 dark:text-zinc-500">
            <th className="py-2.5 pl-6 pr-2 font-mono">#</th>
            <th className="py-2.5 px-3">设备与使用部门</th>
            <th className="py-2.5 px-3">编号 / 型号规格</th>
            <th className="py-2.5 px-3">存放位置</th>
            <th className="py-2.5 px-3">上次校验 / 周期</th>
            <th className="py-2.5 px-3">下次校验</th>
            <th className="py-2.5 px-3">效期状态</th>
            <th className="py-2.5 px-3">校验报告</th>
            <th className="py-2.5 pl-3 pr-6 text-right">操作</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-100 dark:divide-white/[0.05] text-sm">
          {topSpacer > 0 && (
            <tr aria-hidden="true" className="border-0 pointer-events-none">
              <td colSpan={9} style={{ height: topSpacer, padding: 0, border: 0 }} />
            </tr>
          )}

          {visibleSlice.map((inst, offset) => {
            const idx = startIdx + offset;
            return (
              <InstrumentRow
                key={inst.id}
                inst={inst}
                rowNumber={idx + 1}
                statusInfo={statusById.get(inst.id) ?? FALLBACK_STATUS}
                showCategoryBadge={showCategoryBadge}
                isAdmin={isAdmin}
                isActive={activeInstrumentId === inst.id}
                onView={onView}
                onEdit={onEdit}
                onDelete={onDelete}
                onOpenReport={onOpenReport}
                onOpenPhoto={onOpenPhoto}
              />
            );
          })}

          {bottomSpacer > 0 && (
            <tr aria-hidden="true" className="border-0 pointer-events-none">
              <td
                colSpan={9}
                style={{ height: bottomSpacer, padding: 0, border: 0 }}
              />
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
};
