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
import {
  getTodayStr,
  summarizeExpiryAlerts,
  type ExpiryAlertSummary,
} from "@/lib/status";
import {
  getThresholdVisuals,
  sortThresholdsDesc,
} from "@/lib/thresholdColors";
import { StatusBadge } from "@/components/StatusBadge";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";
import { EASE_PRECISION, SPRING_SNAPPY, TAP_SCALE } from "@/lib/motion";
import { ModalShell, SlidingNumber } from "@/components/ui/MotionPrimitives";
import { PrecisionCheckbox, SearchField } from "@/components/ui/FormControls";
import type { AppSettings, ExpiryFilter, Instrument } from "@/types";

type TierSelection = "all" | "expired" | string; // string = threshold.id

interface ExpiryAlertModalProps {
  open: boolean;
  instruments: Instrument[];
  settings: AppSettings;
  precomputedSummary?: ExpiryAlertSummary;
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
  precomputedSummary,
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

  const summary = useMemo(() => {
    if (precomputedSummary) return precomputedSummary;
    if (!open) {
      return {
        expired: [],
        tiers: [],
        allAlertItems: [],
        totalAlertCount: 0,
        highestSeverityColor: null,
      };
    }
    return summarizeExpiryAlerts(instruments, settings.warningThresholds);
  }, [precomputedSummary, open, instruments, settings.warningThresholds]);

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

  const { t } = useI18n();
  const jumpButtonLabel =
    selectedTier === "expired"
      ? t("筛选超期", "Filter Expired")
      : activeThresholdObj
        ? t(`筛选 ≤${activeThresholdObj.days}天`, `Filter ≤${activeThresholdObj.days}d`)
        : descThresholds.length > 0
          ? t(`筛选 ≤${descThresholds[0].days}天`, `Filter ≤${descThresholds[0].days}d`)
          : t("列表查看", "View in List");

  const accentColor = summary.highestSeverityColor || "#10b981";
  const accentVisuals = getThresholdVisuals(accentColor);

  return (
    <ModalShell
      open={open}
      onClose={onClose}
      panelClassName="w-full max-w-4xl max-h-[85vh] flex flex-col"
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
                  className="h-9 w-9 rounded-xl border flex items-center justify-center shrink-0 bg-[var(--tier-bg)] dark:bg-[var(--tier-bg-dark)] border-[var(--tier-border)] dark:border-[var(--tier-border-dark)] text-[var(--tier-text)] dark:text-[var(--tier-text-dark)] shadow-hairline"
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
                      {t("到期预警", "Expiry Alerts")}
                    </h2>
                    <span className="text-[11px] font-mono text-zinc-400 dark:text-zinc-500">
                      {getTodayStr()}
                    </span>
                  </div>
                  <p className="text-[11.5px] text-zinc-500 dark:text-zinc-400 truncate mt-0.5">
                    {summary.totalAlertCount > 0
                      ? t(
                          `共 ${summary.totalAlertCount} 台 · 超期 ${summary.expired.length} / 预警 ${summary.totalAlertCount - summary.expired.length}`,
                          `${summary.totalAlertCount} alerts · ${summary.expired.length} expired / ${summary.totalAlertCount - summary.expired.length} due soon`
                        )
                      : t("全部设备效期正常", "All equipment calibration dates are valid")}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={onClose}
                className="btn-tactile p-1.5 rounded-lg text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-200/60 dark:hover:bg-white/[0.08] shrink-0"
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
                  <motion.button
                    type="button"
                    whileTap={TAP_SCALE}
                    transition={SPRING_SNAPPY}
                    onClick={() => setSelectedTier("all")}
                    className={cn(
                      "relative min-w-[104px] px-3 py-2.5 rounded-xl border text-left transition-colors shrink-0",
                      selectedTier === "all"
                        ? "border-transparent bg-zinc-900 dark:bg-white text-white dark:text-zinc-950 shadow-tactile-primary"
                        : "border-zinc-200/95 dark:border-white/[0.08] bg-white dark:bg-white/[0.03] shadow-tactile hover:border-zinc-300 dark:hover:border-white/[0.15]"
                    )}
                  >
                    {selectedTier === "all" && (
                      <motion.span
                        layoutId="alert-tier-active-ring"
                        transition={SPRING_SNAPPY}
                        className="pointer-events-none absolute -inset-px rounded-xl border-2 border-zinc-900 dark:border-white"
                      />
                    )}
                    <div
                      className={cn(
                        "relative z-10 text-[11px] font-medium",
                        selectedTier === "all"
                          ? "text-zinc-300 dark:text-zinc-600"
                          : "text-zinc-500 dark:text-zinc-400"
                      )}
                    >
                      {t("全部预警", "All Alerts")}
                    </div>
                    <div className="relative z-10 mt-1 text-lg font-semibold font-mono leading-none">
                      <SlidingNumber value={summary.totalAlertCount} />
                    </div>
                  </motion.button>

                  {/* Expired Card */}
                  <motion.button
                    type="button"
                    whileTap={TAP_SCALE}
                    transition={SPRING_SNAPPY}
                    onClick={() => setSelectedTier("expired")}
                    className={cn(
                      "relative min-w-[112px] px-3 py-2.5 rounded-xl border text-left transition-colors shrink-0",
                      selectedTier === "expired"
                        ? "border-transparent bg-rose-500/[0.12] dark:bg-rose-500/[0.18] shadow-tactile"
                        : "border-zinc-200/95 dark:border-white/[0.08] bg-white dark:bg-white/[0.03] shadow-tactile hover:border-rose-300 dark:hover:border-rose-500/35"
                    )}
                  >
                    {selectedTier === "expired" && (
                      <motion.span
                        layoutId="alert-tier-active-ring"
                        transition={SPRING_SNAPPY}
                        className="pointer-events-none absolute -inset-px rounded-xl border-2 border-rose-500"
                      />
                    )}
                    <div className="relative z-10 flex items-center gap-1.5 text-[11px] font-medium text-rose-600 dark:text-rose-400">
                      <span className="h-2 w-2 rounded-full bg-rose-500 shrink-0" />
                      <span>已超期</span>
                    </div>
                    <div className="relative z-10 mt-1 flex items-baseline gap-1">
                      <SlidingNumber
                        value={summary.expired.length}
                        className="text-lg font-semibold font-mono leading-none text-zinc-950 dark:text-white"
                      />
                      <span className="text-[10.5px] text-zinc-400">台</span>
                    </div>
                  </motion.button>

                  {/* Dynamic Configured Threshold Tier Cards (Most urgent -> Widest) */}
                  {summary.tiers.map((group) => {
                    const visuals = getThresholdVisuals(group.threshold.color);
                    const active = selectedTier === group.threshold.id;
                    return (
                      <motion.button
                        key={group.threshold.id}
                        type="button"
                        whileTap={TAP_SCALE}
                        transition={SPRING_SNAPPY}
                        onClick={() => setSelectedTier(group.threshold.id)}
                        style={visuals.cssVars}
                        className={cn(
                          "relative min-w-[120px] px-3 py-2.5 rounded-xl border text-left transition-colors shrink-0 shadow-tactile",
                          active
                            ? "border-transparent bg-[var(--tier-bg)] dark:bg-[var(--tier-bg-dark)]"
                            : "border-zinc-200/95 dark:border-white/[0.08] bg-white dark:bg-white/[0.03] hover:bg-[var(--tier-bg)] dark:hover:bg-[var(--tier-bg-dark)]"
                        )}
                      >
                        {active && (
                          <motion.span
                            layoutId="alert-tier-active-ring"
                            transition={SPRING_SNAPPY}
                            style={{ borderColor: visuals.hex }}
                            className="pointer-events-none absolute -inset-px rounded-xl border-2"
                          />
                        )}
                        <div className="relative z-10 flex items-center gap-1.5 text-[11px] font-medium text-[var(--tier-text)] dark:text-[var(--tier-text-dark)]">
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
                        <div className="relative z-10 mt-1 flex items-baseline justify-between gap-2">
                          <div className="flex items-baseline gap-1">
                            <SlidingNumber
                              value={group.items.length}
                              className="text-lg font-semibold font-mono leading-none text-zinc-950 dark:text-white"
                            />
                            <span className="text-[10.5px] text-zinc-400">台</span>
                          </div>
                          <span className="text-[10px] font-mono text-zinc-400 dark:text-zinc-500">
                            ≤{group.threshold.days}d
                          </span>
                        </div>
                      </motion.button>
                    );
                  })}
                </div>

                {/* Quick Search within Alerts */}
                {summary.totalAlertCount > 5 && (
                  <SearchField
                    value={searchText}
                    onChange={setSearchText}
                    placeholder="搜索名称、编号、部门..."
                    icon={<Search className="h-3.5 w-3.5" />}
                    className="max-w-xs"
                  />
                )}
              </div>

              {/* Alert Instrument List */}
              <div className="flex-1 overflow-y-auto px-6 py-3">
                <AnimatePresence mode="wait">
                  <motion.div
                    key={selectedTier}
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -4 }}
                    transition={{ duration: 0.16, ease: EASE_PRECISION }}
                  >
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
                              className="btn-tactile p-1.5 rounded-lg text-zinc-400 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-white/[0.08]"
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
                  </motion.div>
                </AnimatePresence>
              </div>

              {/* Footer */}
              <div className="px-6 py-3.5 border-t border-zinc-200/80 dark:border-white/[0.08] bg-zinc-50/70 dark:bg-white/[0.02] flex flex-wrap items-center justify-between gap-3 shrink-0">
                <PrecisionCheckbox
                  checked={mutedToday}
                  onChange={onToggleMuteToday}
                  label={
                    <span className="text-xs text-zinc-600 dark:text-zinc-400">
                      {t("今日不再提醒", "Don't remind again today")}
                    </span>
                  }
                />

                <div className="flex items-center gap-2">
                  {summary.totalAlertCount > 0 && (
                    <motion.button
                      type="button"
                      whileTap={TAP_SCALE}
                      transition={SPRING_SNAPPY}
                      onClick={handleJumpToList}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-zinc-200/95 dark:border-white/[0.1] bg-white dark:bg-white/[0.04] hover:bg-zinc-50 dark:hover:bg-white/[0.08] shadow-tactile text-xs font-medium text-zinc-700 dark:text-zinc-200 transition-colors"
                    >
                      <Filter className="h-3.5 w-3.5 text-zinc-400" />
                      <span>{jumpButtonLabel}</span>
                    </motion.button>
                  )}
                  <motion.button
                    type="button"
                    whileTap={TAP_SCALE}
                    transition={SPRING_SNAPPY}
                    onClick={onClose}
                    className="px-4 py-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 dark:bg-white dark:hover:bg-zinc-200 text-white dark:text-zinc-950 text-xs font-semibold shadow-tactile-primary transition-colors"
                  >
                    {t("确定", "OK")}
                  </motion.button>
                </div>
              </div>
            </div>
    </ModalShell>
  );
};
