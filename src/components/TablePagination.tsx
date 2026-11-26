import React, { useMemo } from "react";
import { motion } from "motion/react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { PrecisionSelect, type SelectOption } from "@/components/ui/FormControls";
import { SlidingNumber } from "@/components/ui/MotionPrimitives";
import { SPRING_SNAPPY, TAP_SCALE_ICON } from "@/lib/motion";
import { cn } from "@/lib/utils";

export type PageSizeOption = 30 | 50 | 100 | 200 | "all";

export const DEFAULT_PAGE_SIZE: PageSizeOption = 50;

export const PAGE_SIZE_OPTIONS: ReadonlyArray<SelectOption<PageSizeOption>> = [
  { value: 30, label: "30 条/页" },
  { value: 50, label: "50 条/页" },
  { value: 100, label: "100 条/页" },
  { value: 200, label: "200 条/页" },
  { value: "all", label: "全部" },
];

export function parseStoredPageSize(raw: string): PageSizeOption {
  if (raw === "all") return "all";
  const num = Number(raw);
  if (num === 30 || num === 50 || num === 100 || num === 200) {
    return num;
  }
  return DEFAULT_PAGE_SIZE;
}

export type PageToken = number | "ellipsis-left" | "ellipsis-right";

export function buildPageTokens(
  currentPage: number,
  totalPages: number
): PageToken[] {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, i) => i + 1);
  }
  if (currentPage <= 4) {
    return [1, 2, 3, 4, 5, "ellipsis-right", totalPages];
  }
  if (currentPage >= totalPages - 3) {
    return [
      1,
      "ellipsis-left",
      totalPages - 4,
      totalPages - 3,
      totalPages - 2,
      totalPages - 1,
      totalPages,
    ];
  }
  return [
    1,
    "ellipsis-left",
    currentPage - 1,
    currentPage,
    currentPage + 1,
    "ellipsis-right",
    totalPages,
  ];
}

interface TablePaginationProps {
  currentPage: number;
  totalPages: number;
  totalItems: number;
  categoryTotal?: number;
  pageSize: PageSizeOption;
  onPageChange: (page: number) => void;
  onPageSizeChange: (nextSize: PageSizeOption) => void;
}

export const TablePagination: React.FC<TablePaginationProps> = ({
  currentPage,
  totalPages,
  totalItems,
  categoryTotal,
  pageSize,
  onPageChange,
  onPageSizeChange,
}) => {
  const isShowAll = pageSize === "all";
  const isFiltered =
    typeof categoryTotal === "number" && categoryTotal !== totalItems;
  const pageTokens = useMemo(
    () => (isShowAll ? [] : buildPageTokens(currentPage, totalPages)),
    [isShowAll, currentPage, totalPages]
  );

  return (
    <div className="flex items-center gap-2.5">
      {/* Compact total count readout capsule integrated alongside pagination */}
      <div
        className="h-7 px-2.5 rounded-lg bg-zinc-200/55 dark:bg-white/[0.05] border border-zinc-200/75 dark:border-white/[0.07] inline-flex items-center gap-1 text-[11px] text-zinc-500 dark:text-zinc-400 select-none"
        title={
          isFiltered
            ? `当前筛选共 ${totalItems} 条，本分类总计 ${categoryTotal} 条`
            : `共 ${totalItems} 条设备记录`
        }
      >
        <span>共</span>
        <SlidingNumber
          value={totalItems}
          className="font-mono font-semibold text-zinc-800 dark:text-zinc-100"
        />
        {isFiltered && (
          <span className="font-mono tabular-nums text-zinc-400 dark:text-zinc-500">
            / {categoryTotal}
          </span>
        )}
        <span>条</span>
      </div>

      {totalItems > 0 && !isShowAll && totalPages > 1 && (
        <nav
          aria-label="台账分页导航"
          className="inline-flex items-center gap-0.5"
        >
          <button
            type="button"
            disabled={currentPage <= 1}
            onClick={() => onPageChange(Math.max(1, currentPage - 1))}
            aria-label="上一页"
            title="上一页"
            className="btn-tactile h-7 w-7 rounded-lg inline-flex items-center justify-center text-zinc-500 dark:text-zinc-400 hover:text-zinc-950 dark:hover:text-white hover:bg-zinc-200/70 dark:hover:bg-white/[0.08] disabled:opacity-35 disabled:pointer-events-none transition-colors"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
          </button>

          {pageTokens.map((token) => {
            if (token === "ellipsis-left" || token === "ellipsis-right") {
              return (
                <span
                  key={token}
                  className="px-1 text-[11px] font-mono text-zinc-400 dark:text-zinc-600 select-none"
                >
                  ···
                </span>
              );
            }
            const active = token === currentPage;
            return (
              <motion.button
                key={token}
                type="button"
                whileTap={TAP_SCALE_ICON}
                transition={SPRING_SNAPPY}
                aria-current={active ? "page" : undefined}
                onClick={() => onPageChange(token)}
                className={cn(
                  "relative min-w-[26px] h-7 px-1.5 rounded-lg font-mono tabular-nums text-[11px] inline-flex items-center justify-center transition-colors",
                  active
                    ? "text-white dark:text-zinc-950 font-semibold"
                    : "text-zinc-600 dark:text-zinc-400 hover:text-zinc-950 dark:hover:text-white hover:bg-zinc-200/70 dark:hover:bg-white/[0.08]"
                )}
              >
                {active && (
                  <motion.span
                    layoutId="pagination-active-pill"
                    transition={SPRING_SNAPPY}
                    className="absolute inset-0 rounded-lg bg-zinc-900 dark:bg-white shadow-tactile-primary"
                  />
                )}
                <span className="relative z-10">{token}</span>
              </motion.button>
            );
          })}

          <button
            type="button"
            disabled={currentPage >= totalPages}
            onClick={() => onPageChange(Math.min(totalPages, currentPage + 1))}
            aria-label="下一页"
            title="下一页"
            className="btn-tactile h-7 w-7 rounded-lg inline-flex items-center justify-center text-zinc-500 dark:text-zinc-400 hover:text-zinc-950 dark:hover:text-white hover:bg-zinc-200/70 dark:hover:bg-white/[0.08] disabled:opacity-35 disabled:pointer-events-none transition-colors"
          >
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </nav>
      )}

      {totalItems > 0 && (
        <PrecisionSelect<PageSizeOption>
          value={pageSize}
          options={PAGE_SIZE_OPTIONS}
          onChange={onPageSizeChange}
          size="xs"
          align="right"
          className="h-7 px-2 py-0 text-[11px] font-mono min-w-[88px]"
          menuClassName="min-w-[112px]"
        />
      )}
    </div>
  );
};
