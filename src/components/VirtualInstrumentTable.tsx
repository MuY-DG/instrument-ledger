import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { Edit3, Eye, FileText, Plus, Trash2 } from "lucide-react";
import { calTypeLabel, type InstrumentStatusInfo } from "@/lib/status";
import { getThresholdVisuals } from "@/lib/thresholdColors";
import { cn } from "@/lib/utils";
import { LocationThumb } from "@/components/LocationThumb";
import { StatusBadge } from "@/components/StatusBadge";
import { CopyButton } from "@/components/ui/InteractiveControls";
import type { CategoryTab, Instrument } from "@/types";

const ROW_HEIGHT = 66;
const HEADER_HEIGHT = 38;
const DEFAULT_VIRTUALIZE_THRESHOLD = 50;

// Directional overscan: allocate larger lookahead in scroll direction
// while keeping a full-viewport trailing buffer for sudden scroll reversals.
const OVERSCAN_LEAD = 22;
const OVERSCAN_TRAIL = 10;
// Only recompute React slice once leading/trailing buffer shrinks by at least STEP rows,
// avoiding unnecessary reconciliations on smooth frame-by-frame scrolling.
const REFILL_STEP = 4;

// Pixel-aligned CSS Grid matching the previous 9-column table-fixed proportions
// (fixed utility columns + 22:16:18 elastic columns, min total <= 1040px)
const TABLE_GRID_COLS =
  "grid-cols-[54px_minmax(150px,22fr)_minmax(112px,16fr)_minmax(124px,18fr)_126px_108px_122px_132px_108px]";

interface WindowRange {
  start: number;
  end: number;
}

function computeWindowRange(
  scrollTop: number,
  viewportHeight: number,
  total: number,
  direction: 1 | -1
): WindowRange {
  if (total <= 0) return { start: 0, end: 0 };
  const effectiveTop = Math.max(0, scrollTop - HEADER_HEIGHT);
  const visibleCount = Math.max(1, Math.ceil(viewportHeight / ROW_HEIGHT));
  const visibleStart = Math.floor(effectiveTop / ROW_HEIGHT);
  const visibleEnd = visibleStart + visibleCount;

  const topOverscan = direction === -1 ? OVERSCAN_LEAD : OVERSCAN_TRAIL;
  const bottomOverscan = direction === 1 ? OVERSCAN_LEAD : OVERSCAN_TRAIL;

  const start = Math.max(0, visibleStart - topOverscan);
  const end = Math.min(total, visibleEnd + bottomOverscan);
  return { start, end };
}

interface InstrumentRowProps {
  inst: Instrument;
  rowNumber: number;
  rowIndex: number;
  virtualized: boolean;
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
    rowIndex,
    virtualized,
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

    const handlePhotoClick = useCallback(() => {
      onOpenPhoto(inst);
    }, [onOpenPhoto, inst]);

    const rowStyle: React.CSSProperties = useMemo(() => {
      const base: React.CSSProperties = {
        height: ROW_HEIGHT,
        contain: "layout style paint",
      };

      if (virtualized) {
        base.position = "absolute";
        base.top = 0;
        base.left = 0;
        base.right = 0;
        base.transform = `translate3d(0, ${rowIndex * ROW_HEIGHT}px, 0)`;
      }

      if (statusInfo.status === "expired") {
        base.boxShadow = "inset 2.5px 0 0 0 rgb(244, 63, 94)";
      } else if (tierVisuals) {
        Object.assign(base, tierVisuals.cssVars);
        base.boxShadow = tierVisuals.rowAccentShadow;
      }

      return base;
    }, [virtualized, rowIndex, statusInfo.status, tierVisuals]);

    return (
      <div
        role="row"
        onClick={() => onView(inst)}
        style={rowStyle}
        className={cn(
          "group grid items-center border-b border-zinc-100 dark:border-white/[0.05] text-sm cursor-pointer transition-colors duration-150",
          TABLE_GRID_COLS,
          isActive
            ? "bg-indigo-50/70 dark:bg-indigo-500/[0.08]"
            : "hover:bg-zinc-50/90 dark:hover:bg-white/[0.025]"
        )}
      >
        {/* Sequence Number */}
        <div
          role="cell"
          className="py-2.5 pl-6 pr-2 font-mono tabular-nums text-[11.5px] text-zinc-400 dark:text-zinc-600 whitespace-nowrap"
        >
          {String(rowNumber).padStart(2, "0")}
        </div>

        {/* Name & Department */}
        <div role="cell" className="py-2.5 px-3 min-w-0 overflow-hidden">
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
        </div>

        {/* Serial No & Spec */}
        <div role="cell" className="py-2.5 px-3 min-w-0 overflow-hidden">
          <div className="flex items-center gap-1 min-w-0">
            <div
              className="font-mono tabular-nums text-xs font-medium text-zinc-800 dark:text-zinc-200 truncate"
              title={inst.serialNo}
            >
              {inst.serialNo || "—"}
            </div>
            {inst.serialNo && inst.serialNo !== "/" && inst.serialNo !== "-" && (
              <CopyButton
                text={inst.serialNo}
                ariaLabel={`复制编号 ${inst.serialNo}`}
                className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity shrink-0"
              />
            )}
          </div>
          <div
            className="text-[11px] text-zinc-400 dark:text-zinc-500 mt-0.5 truncate"
            title={inst.modelSpec}
          >
            {inst.modelSpec || "—"}
          </div>
        </div>

        {/* Location + Photo Thumbnail */}
        <div role="cell" className="py-2.5 px-3 min-w-0 overflow-hidden">
          <div className="flex items-center gap-2.5 min-w-0">
            <LocationThumb
              photoPath={inst.photoPath}
              alt={`${inst.name} 位置图`}
              onClick={handlePhotoClick}
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
        </div>

        {/* Last Cal Date + Method + Cycle */}
        <div role="cell" className="py-2.5 px-3 whitespace-nowrap">
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
        </div>

        {/* Next Cal Date */}
        <div
          role="cell"
          className="py-2.5 px-3 font-mono tabular-nums text-xs whitespace-nowrap"
        >
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
        </div>

        {/* Precision Status Badge */}
        <div role="cell" className="py-2.5 px-3">
          <StatusBadge info={statusInfo} />
        </div>

        {/* Report Attachments */}
        <div
          role="cell"
          className="py-2.5 px-3"
          onClick={(e) => e.stopPropagation()}
        >
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
        </div>

        {/* Row Actions */}
        <div
          role="cell"
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
        </div>
      </div>
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
  /** Starting 0-based index offset used for display row numbering across pages */
  rowOffset?: number;
  /** Enable virtualized rendering when item count exceeds virtualizeThreshold */
  virtualize?: boolean;
  virtualizeThreshold?: number;
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
  rowOffset = 0,
  virtualize = true,
  virtualizeThreshold = DEFAULT_VIRTUALIZE_THRESHOLD,
  onView,
  onEdit,
  onDelete,
  onOpenReport,
  onOpenPhoto,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const viewportHeightRef = useRef(720);
  const lastScrollTopRef = useRef(0);
  const scrollDirRef = useRef<1 | -1>(1);
  const ignoreScrollRef = useRef(false);

  const total = items.length;
  const totalRef = useRef(total);
  totalRef.current = total;
  const shouldVirtualize = virtualize && total > virtualizeThreshold;

  const [range, setRange] = useState<WindowRange>(() =>
    computeWindowRange(0, 720, total, 1)
  );
  const rangeRef = useRef(range);
  rangeRef.current = range;

  const syncWindowFromContainer = useCallback(
    (force = false) => {
      if (!shouldVirtualize) return;
      const el = containerRef.current;
      const scrollTop = el ? el.scrollTop : 0;
      const vh = viewportHeightRef.current;
      const next = computeWindowRange(scrollTop, vh, total, scrollDirRef.current);
      const cur = rangeRef.current;
      if (force || cur.start !== next.start || cur.end !== next.end) {
        rangeRef.current = next;
        setRange(next);
      }
    },
    [shouldVirtualize, total]
  );

  // Measure scroll viewport height via ResizeObserver
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () => {
      if (el.clientHeight > 0 && el.clientHeight !== viewportHeightRef.current) {
        viewportHeightRef.current = el.clientHeight;
        syncWindowFromContainer();
      }
    };
    if (el.clientHeight > 0) {
      viewportHeightRef.current = el.clientHeight;
      syncWindowFromContainer();
    }
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [syncWindowFromContainer]);

  // Reset scroll cleanly when switching category, page, sort, or major filter
  useLayoutEffect(() => {
    const el = containerRef.current;
    lastScrollTopRef.current = 0;
    scrollDirRef.current = 1;
    if (el && el.scrollTop !== 0) {
      ignoreScrollRef.current = true;
      el.scrollTop = 0;
      ignoreScrollRef.current = false;
    }
    if (shouldVirtualize) {
      const next = computeWindowRange(
        0,
        viewportHeightRef.current,
        totalRef.current,
        1
      );
      rangeRef.current = next;
      setRange(next);
    }
  }, [resetScrollKey, shouldVirtualize]);

  // Keep rendered window clamped when items shrink dynamically (e.g. search or delete)
  useEffect(() => {
    if (!shouldVirtualize) return;
    const el = containerRef.current;
    if (!el) return;
    const maxScroll = Math.max(
      0,
      HEADER_HEIGHT + total * ROW_HEIGHT - viewportHeightRef.current
    );
    if (el.scrollTop > maxScroll) {
      ignoreScrollRef.current = true;
      el.scrollTop = maxScroll;
      ignoreScrollRef.current = false;
      lastScrollTopRef.current = maxScroll;
    }
    syncWindowFromContainer();
  }, [shouldVirtualize, total, syncWindowFromContainer]);

  const handleScroll = useCallback(() => {
    if (!shouldVirtualize || ignoreScrollRef.current) return;
    const el = containerRef.current;
    if (!el) return;

    const scrollTop = el.scrollTop;
    const delta = scrollTop - lastScrollTopRef.current;
    if (delta === 0) return;

    const dir: 1 | -1 = delta > 0 ? 1 : -1;
    scrollDirRef.current = dir;
    lastScrollTopRef.current = scrollTop;

    const vh = viewportHeightRef.current;
    const effectiveTop = Math.max(0, scrollTop - HEADER_HEIGHT);
    const visibleCount = Math.max(1, Math.ceil(vh / ROW_HEIGHT));
    const visibleStart = Math.floor(effectiveTop / ROW_HEIGHT);
    const visibleEnd = visibleStart + visibleCount;

    const cur = rangeRef.current;
    const topMargin = visibleStart - cur.start;
    const bottomMargin = cur.end - visibleEnd;

    const minTopMargin =
      dir === -1 ? OVERSCAN_LEAD - REFILL_STEP : OVERSCAN_TRAIL - REFILL_STEP;
    const minBottomMargin =
      dir === 1 ? OVERSCAN_LEAD - REFILL_STEP : OVERSCAN_TRAIL - REFILL_STEP;

    const needsTopRefill = topMargin < minTopMargin && cur.start > 0;
    const needsBottomRefill = bottomMargin < minBottomMargin && cur.end < total;

    if (!needsTopRefill && !needsBottomRefill) {
      return;
    }

    const next = computeWindowRange(scrollTop, vh, total, dir);
    if (next.start === cur.start && next.end === cur.end) {
      return;
    }

    rangeRef.current = next;

    // On rapid scrollbar jumps that escape the rendered buffer completely,
    // commit synchronously so rows paint in the immediate frame without blank flash.
    const escapedBuffer = visibleStart < cur.start || visibleEnd > cur.end;
    if (escapedBuffer) {
      flushSync(() => {
        setRange(next);
      });
    } else {
      setRange(next);
    }
  }, [shouldVirtualize, total]);

  const startIdx = shouldVirtualize ? Math.min(range.start, total) : 0;
  const endIdx = shouldVirtualize ? Math.min(range.end, total) : total;

  const visibleSlice = useMemo(
    () => items.slice(startIdx, endIdx),
    [items, startIdx, endIdx]
  );

  const showCategoryBadge = activeTab === "all";
  const totalHeight = total * ROW_HEIGHT;

  return (
    <div
      ref={containerRef}
      onScroll={shouldVirtualize ? handleScroll : undefined}
      className="flex-1 overflow-auto overscroll-y-contain"
    >
      <div role="table" aria-rowcount={total} className="w-full min-w-[1040px] text-left">
        {/* Solid opaque sticky header — eliminates per-frame WKWebView backdrop-filter readback */}
        <div
          role="rowgroup"
          className="sticky top-0 z-10 bg-white dark:bg-[#09090b]"
        >
          <div
            role="row"
            className={cn(
              "grid items-center border-b border-zinc-200/80 dark:border-white/[0.07] text-[11px] font-medium text-zinc-400 dark:text-zinc-500 select-none",
              TABLE_GRID_COLS
            )}
          >
            <div role="columnheader" className="py-2.5 pl-6 pr-2 font-mono">
              #
            </div>
            <div role="columnheader" className="py-2.5 px-3">
              设备与使用部门
            </div>
            <div role="columnheader" className="py-2.5 px-3">
              编号 / 型号规格
            </div>
            <div role="columnheader" className="py-2.5 px-3">
              存放位置
            </div>
            <div role="columnheader" className="py-2.5 px-3">
              上次校验 / 周期
            </div>
            <div role="columnheader" className="py-2.5 px-3">
              下次校验
            </div>
            <div role="columnheader" className="py-2.5 px-3">
              效期状态
            </div>
            <div role="columnheader" className="py-2.5 px-3">
              校验报告
            </div>
            <div role="columnheader" className="py-2.5 pl-3 pr-6 text-right">
              操作
            </div>
          </div>
        </div>

        {/* Body: GPU translate3d positioning in virtual mode, zero-overhead native flow in paged mode */}
        <div
          role="rowgroup"
          className={shouldVirtualize ? "relative" : undefined}
          style={shouldVirtualize ? { height: totalHeight } : undefined}
        >
          {visibleSlice.map((inst, offset) => {
            const idx = startIdx + offset;
            return (
              <InstrumentRow
                key={inst.id}
                inst={inst}
                rowIndex={idx}
                rowNumber={rowOffset + idx + 1}
                virtualized={shouldVirtualize}
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
        </div>
      </div>
    </div>
  );
};
