import React from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  CheckSquare,
  Edit3,
  FileSpreadsheet,
  Loader2,
  Printer,
  Trash2,
  X,
} from "lucide-react";
import { SlidingNumber } from "@/components/ui/MotionPrimitives";
import { MorphTooltip } from "@/components/ui/MorphTooltip";
import { SPRING_SNAPPY, TAP_SCALE, TAP_SCALE_ICON } from "@/lib/motion";

interface BatchActionBarProps {
  selectedCount: number;
  totalFilteredCount: number;
  allVisibleSelected: boolean;
  isAdmin: boolean;
  exporting?: boolean;
  deleting?: boolean;
  onSelectAllFiltered: () => void;
  onClearSelection: () => void;
  onBatchEdit: () => void;
  onBatchExport: () => void;
  onBatchPrint: () => void;
  onBatchDelete: () => void;
}

export const BatchActionBar: React.FC<BatchActionBarProps> = ({
  selectedCount,
  totalFilteredCount,
  allVisibleSelected,
  isAdmin,
  exporting = false,
  deleting = false,
  onSelectAllFiltered,
  onClearSelection,
  onBatchEdit,
  onBatchExport,
  onBatchPrint,
  onBatchDelete,
}) => {
  const showSelectAllBanner =
    allVisibleSelected && selectedCount < totalFilteredCount;

  return (
    <AnimatePresence>
      {selectedCount > 0 && (
        <motion.div
          key="batch-action-dock"
          initial={{ opacity: 0, y: 18, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 14, scale: 0.96 }}
          transition={SPRING_SNAPPY}
          role="toolbar"
          aria-label="已选设备批量操作栏"
          className="pointer-events-auto absolute bottom-14 left-1/2 -translate-x-1/2 z-30 max-w-[calc(100%-2rem)]"
        >
          <div className="relative flex items-center gap-1.5 pl-3 pr-1.5 py-1.5 rounded-2xl bg-zinc-900/[0.95] dark:bg-[#1a1a22]/[0.96] text-zinc-100 border border-white/[0.12] dark:border-white/[0.14] backdrop-blur-xl shadow-[0_18px_42px_-10px_rgba(9,9,11,0.45),0_2px_10px_-2px_rgba(9,9,11,0.22)] select-none">
            {/* Subtle top glass specular hairline */}
            <div
              aria-hidden="true"
              className="pointer-events-none absolute top-0 inset-x-4 h-px bg-gradient-to-r from-transparent via-white/25 to-transparent"
            />

            {/* Selected Count Summary */}
            <div className="flex items-center gap-2 pr-1 text-xs whitespace-nowrap">
              <span className="h-5 w-5 rounded-md bg-indigo-500/25 border border-indigo-400/35 text-indigo-300 flex items-center justify-center shrink-0">
                <CheckSquare className="h-3 w-3" />
              </span>
              <span className="text-zinc-300">
                已选{" "}
                <SlidingNumber
                  value={selectedCount}
                  className="font-mono font-semibold text-white mx-0.5"
                />{" "}
                项
              </span>

              {showSelectAllBanner && (
                <button
                  type="button"
                  onClick={onSelectAllFiltered}
                  className="ml-0.5 px-2 py-0.5 rounded-md bg-indigo-500/20 hover:bg-indigo-500/30 border border-indigo-400/30 text-[11px] font-medium text-indigo-200 hover:text-white transition-colors"
                >
                  全选全部 {totalFilteredCount} 项
                </button>
              )}
            </div>

            <div className="h-4 w-px bg-white/[0.12] mx-0.5 shrink-0" />

            {/* Batch Action Buttons */}
            <div className="flex items-center gap-1">
              {isAdmin && (
                <motion.button
                  type="button"
                  whileTap={TAP_SCALE}
                  transition={SPRING_SNAPPY}
                  onClick={onBatchEdit}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-white/[0.08] hover:bg-white/[0.15] border border-white/[0.08] text-xs font-medium text-white transition-colors whitespace-nowrap"
                >
                  <Edit3 className="h-3.5 w-3.5 text-indigo-300" />
                  <span>批量编辑</span>
                </motion.button>
              )}

              <motion.button
                type="button"
                disabled={exporting}
                whileTap={exporting ? undefined : TAP_SCALE}
                transition={SPRING_SNAPPY}
                onClick={onBatchExport}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl hover:bg-white/[0.1] text-xs font-medium text-zinc-200 hover:text-white disabled:opacity-50 transition-colors whitespace-nowrap"
                title={`将已选的 ${selectedCount} 台设备导出为 Excel`}
              >
                {exporting ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-emerald-400" />
                ) : (
                  <FileSpreadsheet className="h-3.5 w-3.5 text-emerald-400" />
                )}
                <span>{exporting ? "导出中..." : "导出 Excel"}</span>
              </motion.button>

              <motion.button
                type="button"
                whileTap={TAP_SCALE}
                transition={SPRING_SNAPPY}
                onClick={onBatchPrint}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl hover:bg-white/[0.1] text-xs font-medium text-zinc-200 hover:text-white transition-colors whitespace-nowrap"
                title={`打印已选的 ${selectedCount} 台设备`}
              >
                <Printer className="h-3.5 w-3.5 text-zinc-300" />
                <span>打印</span>
              </motion.button>

              {isAdmin && (
                <motion.button
                  type="button"
                  disabled={deleting}
                  whileTap={deleting ? undefined : TAP_SCALE}
                  transition={SPRING_SNAPPY}
                  onClick={onBatchDelete}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl hover:bg-rose-500/20 text-xs font-medium text-rose-300 hover:text-rose-200 disabled:opacity-50 transition-colors whitespace-nowrap"
                  title={`删除已选的 ${selectedCount} 台设备`}
                >
                  {deleting ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Trash2 className="h-3.5 w-3.5" />
                  )}
                  <span>删除</span>
                </motion.button>
              )}
            </div>

            <div className="h-4 w-px bg-white/[0.12] mx-0.5 shrink-0" />

            <MorphTooltip content="取消选择 (Esc)" placement="top">
              <motion.button
                type="button"
                whileTap={TAP_SCALE_ICON}
                transition={SPRING_SNAPPY}
                onClick={onClearSelection}
                aria-label="取消选择"
                className="h-7 w-7 rounded-xl text-zinc-400 hover:text-white hover:bg-white/[0.1] flex items-center justify-center transition-colors shrink-0"
              >
                <X className="h-3.5 w-3.5" />
              </motion.button>
            </MorphTooltip>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
