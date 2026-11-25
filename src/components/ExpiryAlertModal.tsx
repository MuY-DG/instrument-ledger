import React, { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  BellRing,
  CheckCircle2,
  Eye,
  Filter,
  Search,
  X,
} from "lucide-react";
import { getTodayStr, summarizeExpiryAlerts } from "@/lib/status";
import {
  getThresholdVisuals,
  sortThresholdsDesc,
} from "@/lib/thresholdColors";
import { StatusBadge } from "@/components/StatusBadge";
import { cn } from "@/lib/utils";
import type { AppSettings, ExpiryFilter, Instrument } from "@/types";

type TierSelection = "all" | "expired" | string; // string = threshold.id

interface ExpiryAlertModalProps {
  open: boolean;
  instruments: Instrument[];
  settings: AppSettings;
  mutedToday: boolean;
  onToggleMuteToday: (muted: boolean) => void;
  onClose: () => void;
  onSelectInstrument: (inst: Instrument) => void;
  onApplyFilterInList: (filter: ExpiryFilter) => void;
}

export const ExpiryAlertModal: React.FC<ExpiryAlertModalProps> = ({
  open,
  instruments,
  settings,
  mutedToday,
  onToggleMuteToday,
  onClose,
  onSelectInstrument,
  onApplyFilterInList,
}) => {
  const [selectedTier, setSelectedTier] = useState<TierSelection>("all");
  const [searchText, setSearchText] = useState("");

  useEffect(() => {
    if (!open) return;
    setSelectedTier("all");
    setSearchText("");
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const summary = useMemo(
    () => summarizeExpiryAlerts(instruments, settings.warningThresholds),
    [instruments, settings.warningThresholds]
  );

  const descThresholds = useMemo(
    () => sortThresholdsDesc(settings.warningThresholds),
    [settings.warningThresholds]
  );

  const displayedItems = useMemo(() => {
    let base = summary.allAlertItems;
    if (selectedTier === "expired") {
      base = summary.expired;
    } else if (selectedTier !== "all") {
      const group = summary.tiers.find((t) => t.threshold.id === selectedTier);
      base = group ? group.items : [];
    }

    const q = searchText.trim().toLowerCase();
    if (!q) return base;
    return base.filter(({ instrument }) =>
      [
        instrument.name,
        instrument.serialNo,
        instrument.department,
        instrument.location,
        instrument.modelSpec,
      ]
        .join(" ")
        .toLowerCase()
        .includes(q)
    );
  }, [summary, selectedTier, searchText]);

  const activeThresholdObj = useMemo(
    () =>
      summary.tiers.find((t) => t.threshold.id === selectedTier)?.threshold ??
      null,
    [summary.tiers, selectedTier]
  );

  const handleJumpToList = () => {
    if (selectedTier === "expired") {
      onApplyFilterInList("expired");
    } else if (activeThresholdObj) {
      onApplyFilterInList(activeThresholdObj.days);
    } else if (
      summary.expired.length > 0 &&
      summary.tiers.every((t) => t.items.length === 0)
    ) {
      onApplyFilterInList("expired");
    } else if (descThresholds.length > 0) {
      onApplyFilterInList(descThresholds[0].days);
    } else {
      onApplyFilterInList("all");
    }
    onClose();
  };

  const jumpButtonLabel =
    selectedTier === "expired"
      ? "筛选超期"
      : activeThresholdObj
        ? `筛选 ≤${activeThresholdObj.days}天`
        : descThresholds.length > 0
          ? `筛选 ≤${descThresholds[0].days}天`
          : "列表查看";

  const accentColor = summary.highestSeverityColor || "#10b981";
  const accentVisuals = getThresholdVisuals(accentColor);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          className="fixed inset-0 z-50 bg-zinc-950/50 dark:bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 no-print"
          onClick={onClose}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: 8 }}
            transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
            className="w-full max-w-4xl max-h-[85vh] bg-white dark:bg-[#111114] rounded-2xl shadow-popover border border-zinc-200/90 dark:border-white/[0.1] flex flex-col overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Top Severity Accent Hairline */}
            <div
              className="h-[2.5px] w-full shrink-0"
              style={{
                background:
                  summary.totalAlertCount > 0
                    ? `linear-gradient(90deg, ${accentColor}, ${descThresholds[0]?.color || accentColor})`
                    : "linear-gradient(90deg, #10b981, #34d399)",
              }}
            />

            {/* Header */}
            <div className="px-6 py-4 border-b border-zinc-200/80 dark:border-white/[0.08] bg-zinc-50/70 dark:bg-white/[0.02] flex items-center justify-between gap-3 shrink-0">
              <div className="flex items-center gap-3 min-w-0">
                <div
                  style={accentVisuals.cssVars}
                  className="h-9 w-9 rounded-xl border flex items-center justify-center shrink-0 bg-[var(--tier-bg)] dark:bg-[var(--tier-bg-dark)] border-[var(--tier-border)] dark:border-[var(--tier-border-dark)] text-[var(--tier-text)] dark:text-[var(--tier-text-dark)]"
                >
                  {summary.totalAlertCount > 0 ? (
                    <BellRing className="h-4 w-4" />
                  ) : (
                    <CheckCircle2 className="h-4 w-4" />
                  )}
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h2 className="text-sm font-semibold text-zinc-950 dark:text-white tracking-tight">
                      到期预警
                    </h2>
                    <span className="text-[11px] font-mono text-zinc-400 dark:text-zinc-500">
                      {getTodayStr()}
                    </span>
                  </div>
                  <p className="text-[11.5px] text-zinc-500 dark:text-zinc-400 truncate mt-0.5">
                    {summary.totalAlertCount > 0
                      ? `共 ${summary.totalAlertCount} 台 · 超期 ${summary.expired.length} / 预警 ${summary.totalAlertCount - summary.expired.length}`
                      : "全部设备效期正常"}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={onClose}
                className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-200/60 dark:hover:bg-white/[0.08] transition shrink-0"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Body */}
            <div className="flex-1 flex flex-col min-h-0">
              {/* Severity Tier Summary Cards */}
              <div className="px-6 py-4 border-b border-zinc-200/75 dark:border-white/[0.07] bg-zinc-50/40 dark:bg-white/[0.01] space-y-3 shrink-0">
                <div className="flex items-stretch gap-2 overflow-x-auto pb-0.5">
                  {/* All Alerts Card */}
                  <button
                    type="button"
                    onClick={() => setSelectedTier("all")}
                    className={cn(
                      "min-w-[104px] px-3 py-2.5 rounded-xl border text-left transition shrink-0",
                      selectedTier === "all"
                        ? "border-zinc-900 dark:border-white bg-zinc-900 dark:bg-white text-white dark:text-zinc-950 shadow-hairline"
                        : "border-zinc-200/90 dark:border-white/[0.08] bg-white dark:bg-white/[0.03] hover:border-zinc-300 dark:hover:border-white/[0.15]"
                    )}
                  >
                    <div
                      className={cn(
                        "text-[11px] font-medium",
                        selectedTier === "all"
                          ? "text-zinc-300 dark:text-zinc-600"
                          : "text-zinc-500 dark:text-zinc-400"
                      )}
                    >
                      全部预警
                    </div>
                    <div className="mt-1 text-lg font-semibold font-mono tabular-nums leading-none">
                      {summary.totalAlertCount}
                    </div>
                  </button>

                  {/* Expired Card */}
                  <button
                    type="button"
                    onClick={() => setSelectedTier("expired")}
                    className={cn(
                      "min-w-[112px] px-3 py-2.5 rounded-xl border text-left transition shrink-0",
                      selectedTier === "expired"
                        ? "border-rose-500 bg-rose-500/[0.12] dark:bg-rose-500/[0.18] ring-1 ring-rose-500/40"
                        : "border-zinc-200/90 dark:border-white/[0.08] bg-white dark:bg-white/[0.03] hover:border-rose-300 dark:hover:border-rose-500/35"
                    )}
                  >
                    <div className="flex items-center gap-1.5 text-[11px] font-medium text-rose-600 dark:text-rose-400">
                      <span className="h-2 w-2 rounded-full bg-rose-500 shrink-0" />
                      <span>已超期</span>
                    </div>
                    <div className="mt-1 flex items-baseline gap-1">
                      <span className="text-lg font-semibold font-mono tabular-nums leading-none text-zinc-950 dark:text-white">
                        {summary.expired.length}
                      </span>
                      <span className="text-[10.5px] text-zinc-400">台</span>
                    </div>
                  </button>

                  {/* Dynamic Configured Threshold Tier Cards (Most urgent -> Widest) */}
                  {summary.tiers.map((group) => {
                    const visuals = getThresholdVisuals(group.threshold.color);
                    const active = selectedTier === group.threshold.id;
                    return (
                      <button
                        key={group.threshold.id}
                        type="button"
                        onClick={() => setSelectedTier(group.threshold.id)}
                        style={{
                          ...visuals.cssVars,
                          borderColor: active ? visuals.hex : undefined,
                        }}
                        className={cn(
                          "min-w-[120px] px-3 py-2.5 rounded-xl border text-left transition shrink-0",
                          active
                            ? "bg-[var(--tier-bg)] dark:bg-[var(--tier-bg-dark)] shadow-hairline"
                            : "border-zinc-200/90 dark:border-white/[0.08] bg-white dark:bg-white/[0.03] hover:bg-[var(--tier-bg)] dark:hover:bg-[var(--tier-bg-dark)]"
                        )}
                      >
                        <div className="flex items-center gap-1.5 text-[11px] font-medium text-[var(--tier-text)] dark:text-[var(--tier-text-dark)]">
                          <span
                            className="h-2 w-2 rounded-full shrink-0"
                            style={{
                              backgroundColor: visuals.hex,
                              boxShadow: visuals.glow,
                            }}
                          />
                          <span className="truncate max-w-[96px]">
                            {group.threshold.label}
                          </span>
                        </div>
                        <div className="mt-1 flex items-baseline justify-between gap-2">
                          <div className="flex items-baseline gap-1">
                            <span className="text-lg font-semibold font-mono tabular-nums leading-none text-zinc-950 dark:text-white">
                              {group.items.length}
                            </span>
                            <span className="text-[10.5px] text-zinc-400">台</span>
                          </div>
                          <span className="text-[10px] font-mono text-zinc-400 dark:text-zinc-500">
                            ≤{group.threshold.days}d
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>

                {/* Quick Search within Alerts */}
                {summary.totalAlertCount > 5 && (
                  <div className="relative max-w-xs">
                    <Search className="h-3.5 w-3.5 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      type="text"
                      value={searchText}
                      onChange={(e) => setSearchText(e.target.value)}
                      placeholder="搜索名称、编号、部门..."
                      className="w-full pl-8 pr-7 py-1.5 text-xs rounded-lg border border-zinc-200/90 dark:border-white/[0.09] bg-white dark:bg-white/[0.03] text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:outline-none focus:border-zinc-400 dark:focus:border-white/25 transition"
                    />
                    {searchText && (
                      <button
                        type="button"
                        onClick={() => setSearchText("")}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    )}
                  </div>
                )}
              </div>

              {/* Alert Instrument List */}
              <div className="flex-1 overflow-y-auto px-6 py-3">
                {summary.totalAlertCount === 0 ? (
                  <div className="py-12 text-center space-y-2.5">
                    <div className="h-12 w-12 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mx-auto">
                      <CheckCircle2 className="h-6 w-6" />
                    </div>
                    <h3 className="text-sm font-semibold text-zinc-900 dark:text-white">
                      暂无预警设备
                    </h3>
                  </div>
                ) : displayedItems.length === 0 ? (
                  <div className="py-12 text-center text-xs text-zinc-400">
                    该预警分类下暂无匹配设备
                  </div>
                ) : (
                  <div className="divide-y divide-zinc-100 dark:divide-white/[0.05]">
                    {displayedItems.map(({ instrument, statusInfo }) => {
                      const accent =
                        statusInfo.status === "expired"
                          ? "#f43f5e"
                          : statusInfo.matchedThreshold?.color || "#f59e0b";
                      const visuals = getThresholdVisuals(accent);

                      return (
                        <div
                          key={instrument.id}
                          onClick={() => {
                            onClose();
                            onSelectInstrument(instrument);
                          }}
                          style={{
                            ...visuals.cssVars,
                            boxShadow: `inset 3px 0 0 0 ${accent}`,
                          }}
                          className="group py-3 pl-4 pr-2 flex items-center justify-between gap-4 hover:bg-zinc-50/90 dark:hover:bg-white/[0.025] rounded-r-lg cursor-pointer transition-colors"
                        >
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-[13px] font-medium text-zinc-900 dark:text-zinc-100 truncate">
                                {instrument.name}
                              </span>
                              <span className="px-1.5 py-0.2 rounded border border-zinc-200/80 dark:border-white/[0.08] text-[10px] text-zinc-500 dark:text-zinc-400">
                                {instrument.category === "fixture" ? "检具" : "量具"}
                              </span>
                              {instrument.serialNo && (
                                <span className="font-mono text-[11px] text-zinc-500 dark:text-zinc-400">
                                  {instrument.serialNo}
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-2 mt-1 text-[11px] text-zinc-400 dark:text-zinc-500 flex-wrap">
                              {instrument.department && (
                                <span className="px-1.5 py-0.2 rounded bg-zinc-100 dark:bg-white/[0.06] text-zinc-600 dark:text-zinc-300">
                                  {instrument.department}
                                </span>
                              )}
                              {instrument.location && (
                                <span className="truncate max-w-[200px]">
                                  {instrument.location}
                                </span>
                              )}
                              {instrument.modelSpec && (
                                <span className="truncate max-w-[160px]">
                                  · {instrument.modelSpec}
                                </span>
                              )}
                            </div>
                          </div>

                          <div className="flex items-center gap-4 shrink-0">
                            <div className="text-right hidden sm:block">
                              <div className="text-[10.5px] text-zinc-400 dark:text-zinc-500">
                                下次校验
                              </div>
                              <div
                                className={cn(
                                  "font-mono tabular-nums text-xs font-medium",
                                  statusInfo.status === "expired"
                                    ? "text-rose-600 dark:text-rose-400"
                                    : "text-[var(--tier-text)] dark:text-[var(--tier-text-dark)]"
                                )}
                              >
                                {instrument.nextCalDate || "—"}
                              </div>
                            </div>

                            <div className="min-w-[96px] flex justify-end">
                              <StatusBadge info={statusInfo} />
                            </div>

                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                onClose();
                                onSelectInstrument(instrument);
                              }}
                              className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-white/[0.08] transition"
                              title="查看设备档案"
                            >
                              <Eye className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Footer */}
              <div className="px-6 py-3.5 border-t border-zinc-200/80 dark:border-white/[0.08] bg-zinc-50/70 dark:bg-white/[0.02] flex flex-wrap items-center justify-between gap-3 shrink-0">
                <label className="inline-flex items-center gap-2 cursor-pointer select-none text-xs text-zinc-600 dark:text-zinc-400">
                  <input
                    type="checkbox"
                    checked={mutedToday}
                    onChange={(e) => onToggleMuteToday(e.target.checked)}
                    className="rounded border-zinc-300 dark:border-zinc-700 text-zinc-900 focus:ring-indigo-500"
                  />
                  <span>今日不再提醒</span>
                </label>

                <div className="flex items-center gap-2">
                  {summary.totalAlertCount > 0 && (
                    <button
                      type="button"
                      onClick={handleJumpToList}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-zinc-200/90 dark:border-white/[0.1] bg-white dark:bg-white/[0.04] hover:bg-zinc-50 dark:hover:bg-white/[0.08] text-xs font-medium text-zinc-700 dark:text-zinc-200 transition"
                    >
                      <Filter className="h-3.5 w-3.5 text-zinc-400" />
                      <span>{jumpButtonLabel}</span>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={onClose}
                    className="px-4 py-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 dark:bg-white dark:hover:bg-zinc-200 text-white dark:text-zinc-950 text-xs font-semibold shadow-hairline transition"
                  >
                    确定
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
