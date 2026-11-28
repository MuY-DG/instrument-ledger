import React, { useEffect, useState } from "react";
import { motion } from "motion/react";
import {
  AlertOctagon,
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  GitBranch,
  RotateCcw,
  Sparkles,
  XCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { SPRING_SNAPPY, TAP_SCALE_SUBTLE } from "@/lib/motion";
import type {
  AqlStandardEdition,
  InspectionSeverity,
  SamplingPlanResult,
  SwitchingState,
} from "../types";
import {
  createInitialSwitchingTracker,
  getSwitchingRuleReference,
  recordSwitchingLot,
  type SwitchingTrackerState,
} from "../core/switching";
import { getOneStepTighterAql } from "../core/engine";
import { formatAqlValue } from "../core/tables";

interface SwitchingRulesPanelProps {
  standard: AqlStandardEdition;
  activeSeverity: InspectionSeverity;
  activePlan: SamplingPlanResult;
  onApplySeverity: (severity: InspectionSeverity) => void;
}

const STATE_META: Record<
  SwitchingState,
  { label: string; badge: string; ringCls: string; textCls: string }
> = {
  normal: {
    label: "正常检验 (Normal)",
    badge: "表 2-A",
    ringCls: "border-emerald-300 dark:border-emerald-500/40 bg-emerald-50/70 dark:bg-emerald-500/[0.08]",
    textCls: "text-emerald-700 dark:text-emerald-300",
  },
  tightened: {
    label: "加严检验 (Tightened)",
    badge: "表 2-B",
    ringCls: "border-rose-300 dark:border-rose-500/40 bg-rose-50/75 dark:bg-rose-500/[0.08]",
    textCls: "text-rose-700 dark:text-rose-300",
  },
  reduced: {
    label: "放宽检验 (Reduced)",
    badge: "表 2-C",
    ringCls: "border-sky-300 dark:border-sky-500/40 bg-sky-50/70 dark:bg-sky-500/[0.08]",
    textCls: "text-sky-700 dark:text-sky-300",
  },
  discontinued: {
    label: "暂停检验 (Discontinued)",
    badge: "9.4 停检",
    ringCls: "border-red-400 dark:border-red-500/50 bg-red-50/85 dark:bg-red-500/[0.12]",
    textCls: "text-red-700 dark:text-red-300",
  },
};

export const SwitchingRulesPanel: React.FC<SwitchingRulesPanelProps> = ({
  standard,
  activeSeverity,
  activePlan,
  onApplySeverity,
}) => {
  const [tracker, setTracker] = useState<SwitchingTrackerState>(() =>
    createInitialSwitchingTracker(standard, activeSeverity)
  );

  // Sync standard edition cleanly when user switches standard
  useEffect(() => {
    setTracker((prev) =>
      prev.standard === standard
        ? prev
        : createInitialSwitchingTracker(standard, activeSeverity)
    );
  }, [standard, activeSeverity]);

  const rules = getSwitchingRuleReference(standard);
  const tighterAql = getOneStepTighterAql(activePlan.aql);
  const meta = STATE_META[tracker.currentState];

  const isDiscontinued = tracker.currentState === "discontinued";
  const progressPct =
    tracker.currentState === "normal"
      ? standard === "gbt2828"
        ? Math.min(100, (tracker.switchingScore / 30) * 100)
        : Math.min(100, (tracker.consecutiveAccepted / 10) * 100)
      : tracker.currentState === "tightened"
        ? Math.min(100, (tracker.consecutiveAccepted / 5) * 100)
        : 100;

  return (
    <div className="space-y-4">
      {/* Interactive Simulator Card */}
      <div className="rounded-2xl border border-zinc-200/90 dark:border-white/[0.09] bg-white dark:bg-[#111115] shadow-tactile overflow-hidden">
        <div className="px-4 py-3 border-b border-zinc-200/75 dark:border-white/[0.06] bg-zinc-50/70 dark:bg-white/[0.02] flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <GitBranch className="h-4 w-4 text-emerald-500" />
            <h3 className="text-xs font-semibold text-zinc-900 dark:text-zinc-100">
              检验严格度转移规则交互演练器
            </h3>
            <span className="px-1.5 py-0.5 rounded bg-zinc-200/70 dark:bg-white/[0.07] font-mono text-[10px] text-zinc-500 dark:text-zinc-400">
              {standard === "gbt2828" ? "GB/T 2828.1 转移得分法" : "ANSI Z1.4 连续 10 批法"}
            </span>
          </div>
          <div className="flex items-center gap-2">
            {!isDiscontinued && tracker.currentState !== activeSeverity && (
              <motion.button
                type="button"
                whileTap={TAP_SCALE_SUBTLE}
                transition={SPRING_SNAPPY}
                onClick={() =>
                  onApplySeverity(tracker.currentState as InspectionSeverity)
                }
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-zinc-900 dark:bg-white text-white dark:text-zinc-950 text-[11px] font-medium shadow-tactile-primary"
              >
                <Sparkles className="h-3 w-3" />
                <span>应用该严格度至计算器</span>
              </motion.button>
            )}
            <button
              type="button"
              onClick={() =>
                setTracker(createInitialSwitchingTracker(standard, "normal"))
              }
              className="inline-flex items-center gap-1 px-2 py-1 rounded-lg border border-zinc-200/90 dark:border-white/[0.1] text-[11px] font-medium text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-white/[0.06] transition-colors"
            >
              <RotateCcw className="h-3 w-3" />
              <span>重置演练</span>
            </button>
          </div>
        </div>

        <div className="p-4 space-y-4">
          {/* Current State + Progress */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-3.5 items-stretch">
            <div
              className={cn(
                "lg:col-span-5 rounded-xl border p-3.5 flex flex-col justify-between gap-2",
                meta.ringCls
              )}
            >
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-medium text-zinc-600 dark:text-zinc-300">
                  演练当前严格度
                </span>
                <span className="px-1.5 py-0.5 rounded bg-white/75 dark:bg-black/25 font-mono text-[10px] font-semibold text-zinc-700 dark:text-zinc-200">
                  {meta.badge}
                </span>
              </div>
              <div className={cn("text-lg font-bold tracking-tight", meta.textCls)}>
                {meta.label}
              </div>
              <div className="text-[11px] text-zinc-600 dark:text-zinc-300">
                当前主聚焦方案：Ac = {activePlan.ac} / Re = {activePlan.re}
                {tighterAql ? ` · 严一档 AQL = ${formatAqlValue(tighterAql)}` : ""}
              </div>
            </div>

            <div className="lg:col-span-7 rounded-xl border border-zinc-200/90 dark:border-white/[0.08] bg-zinc-50/60 dark:bg-white/[0.02] p-3.5 flex flex-col justify-between gap-3">
              <div className="flex items-center justify-between text-xs">
                <span className="font-medium text-zinc-700 dark:text-zinc-200">
                  {tracker.currentState === "normal"
                    ? standard === "gbt2828"
                      ? "转入放宽检验 · 转移得分进度"
                      : "转入放宽检验 · 连续接收批次"
                    : tracker.currentState === "tightened"
                      ? "恢复正常检验 · 连续接收进度"
                      : tracker.currentState === "reduced"
                        ? "放宽检验运行中"
                        : "已触发暂停检验（须供方整改）"}
                </span>
                <span className="font-mono font-bold text-zinc-900 dark:text-white tabular-nums">
                  {tracker.currentState === "normal"
                    ? standard === "gbt2828"
                      ? `${tracker.switchingScore} / 30 分`
                      : `${tracker.consecutiveAccepted} / 10 批`
                    : tracker.currentState === "tightened"
                      ? `${tracker.consecutiveAccepted} / 5 批`
                      : tracker.currentState === "reduced"
                        ? `已连续接收 ${tracker.consecutiveAccepted} 批`
                        : `加严累计拒收 ${tracker.tightenedRejectCount} 批`}
                </span>
              </div>

              <div className="h-2 rounded-full bg-zinc-200/80 dark:bg-white/[0.08] overflow-hidden">
                <div
                  className={cn(
                    "h-full rounded-full transition-all duration-300",
                    tracker.currentState === "tightened"
                      ? "bg-rose-500"
                      : tracker.currentState === "reduced"
                        ? "bg-sky-500"
                        : tracker.currentState === "discontinued"
                          ? "bg-red-600"
                          : "bg-emerald-500"
                  )}
                  style={{ width: `${progressPct}%` }}
                />
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-zinc-500 dark:text-zinc-400">
                <span>
                  近 5 批正常窗口：
                  {tracker.recentNormalResults.length === 0
                    ? "暂无记录"
                    : tracker.recentNormalResults.map((r, i) => (
                        <span
                          key={i}
                          className={cn(
                            "inline-block ml-1 px-1.5 py-0.2 rounded font-mono text-[10px]",
                            r === "accept"
                              ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                              : "bg-rose-500/15 text-rose-700 dark:text-rose-300"
                          )}
                        >
                          {r === "accept" ? "收" : "拒"}
                        </span>
                      ))}
                </span>
                {tracker.currentState === "tightened" && (
                  <span className="font-mono text-rose-600 dark:text-rose-400">
                    加严累计拒收：{tracker.tightenedRejectCount} / 5
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Action Buttons to Record Simulated Lots */}
          <div className="flex flex-wrap items-center gap-2">
            {standard === "gbt2828" &&
              tracker.currentState === "normal" &&
              activePlan.ac >= 2 && (
                <motion.button
                  type="button"
                  whileTap={TAP_SCALE_SUBTLE}
                  disabled={isDiscontinued}
                  onClick={() =>
                    setTracker((s) =>
                      recordSwitchingLot(s, "accept_strict", activePlan.ac)
                    )
                  }
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium shadow-tactile disabled:opacity-40 transition-colors"
                >
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  <span>录一批允收（达严一档 AQL · 得分 +3）</span>
                </motion.button>
              )}

            <motion.button
              type="button"
              whileTap={TAP_SCALE_SUBTLE}
              disabled={isDiscontinued}
              onClick={() =>
                setTracker((s) => recordSwitchingLot(s, "accept", activePlan.ac))
              }
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-emerald-300/90 dark:border-emerald-500/35 bg-emerald-50/70 dark:bg-emerald-500/[0.1] text-emerald-800 dark:text-emerald-200 hover:bg-emerald-100/80 dark:hover:bg-emerald-500/20 text-xs font-medium disabled:opacity-40 transition-colors"
            >
              <CheckCircle2 className="h-3.5 w-3.5" />
              <span>
                {standard === "gbt2828" &&
                tracker.currentState === "normal" &&
                activePlan.ac <= 1
                  ? "录一批允收（得分 +2）"
                  : "录一批允收 (d ≤ Ac)"}
              </span>
            </motion.button>

            {standard === "ansi_z14" && tracker.currentState === "reduced" && (
              <motion.button
                type="button"
                whileTap={TAP_SCALE_SUBTLE}
                onClick={() =>
                  setTracker((s) =>
                    recordSwitchingLot(s, "accept_gap", activePlan.ac)
                  )
                }
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-amber-300/90 dark:border-amber-500/35 bg-amber-50/80 dark:bg-amber-500/[0.1] text-amber-800 dark:text-amber-200 text-xs font-medium transition-colors"
              >
                <AlertTriangle className="h-3.5 w-3.5" />
                <span>录一批落入缓冲区间 (Ac &lt; d &lt; Re)</span>
              </motion.button>
            )}

            <motion.button
              type="button"
              whileTap={TAP_SCALE_SUBTLE}
              disabled={isDiscontinued}
              onClick={() =>
                setTracker((s) => recordSwitchingLot(s, "reject", activePlan.ac))
              }
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-rose-300/90 dark:border-rose-500/35 bg-rose-50/80 dark:bg-rose-500/[0.1] text-rose-700 dark:text-rose-200 hover:bg-rose-100/80 dark:hover:bg-rose-500/20 text-xs font-medium disabled:opacity-40 transition-colors"
            >
              <XCircle className="h-3.5 w-3.5" />
              <span>录一批拒收 (d ≥ Re)</span>
            </motion.button>
          </div>

          {/* Audit Trail */}
          {tracker.events.length > 0 && (
            <div className="rounded-xl border border-zinc-200/80 dark:border-white/[0.07] divide-y divide-zinc-100 dark:divide-white/[0.05] max-h-52 overflow-y-auto">
              {tracker.events.map((ev) => (
                <div
                  key={ev.id}
                  className="px-3 py-2 text-[11.5px] flex flex-wrap items-center justify-between gap-2"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="font-mono text-[10.5px] text-zinc-400 shrink-0">
                      #{ev.lotIndex}
                    </span>
                    <span
                      className={cn(
                        "px-1.5 py-0.2 rounded font-medium text-[10px] shrink-0",
                        ev.outcome === "reject"
                          ? "bg-rose-500/14 text-rose-700 dark:text-rose-300"
                          : ev.outcome === "accept_gap"
                            ? "bg-amber-500/14 text-amber-700 dark:text-amber-300"
                            : "bg-emerald-500/14 text-emerald-700 dark:text-emerald-300"
                      )}
                    >
                      {ev.outcome === "reject"
                        ? "拒收"
                        : ev.outcome === "accept_gap"
                          ? "缓冲允收"
                          : ev.outcome === "accept_strict"
                            ? "严一档允收"
                            : "允收"}
                    </span>
                    <span className="text-zinc-700 dark:text-zinc-300 truncate">
                      {ev.reason}
                    </span>
                  </div>
                  <span className="font-mono text-[10.5px] text-zinc-400 shrink-0">
                    → {STATE_META[ev.nextState].label.split(" ")[0]}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Standard Clause Reference Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
        {rules.map((r) => (
          <div
            key={r.clause}
            className="rounded-xl border border-zinc-200/90 dark:border-white/[0.08] bg-white dark:bg-[#111115] p-3.5 shadow-tactile space-y-2"
          >
            <div className="flex items-center justify-between gap-2">
              <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-zinc-900 dark:text-zinc-100">
                <span>{r.from}</span>
                <ArrowRight className="h-3 w-3 text-zinc-400" />
                <span style={{ color: r.accent }}>{r.to}</span>
              </div>
              <span className="px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-white/[0.06] font-mono text-[10px] text-zinc-500 dark:text-zinc-400">
                条款 {r.clause}
              </span>
            </div>
            <p className="text-[11.5px] leading-relaxed text-zinc-600 dark:text-zinc-400">
              {r.condition}
            </p>
          </div>
        ))}
        <div className="rounded-xl border border-dashed border-zinc-200/95 dark:border-white/[0.1] bg-zinc-50/70 dark:bg-white/[0.02] p-3.5 space-y-1.5">
          <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-zinc-800 dark:text-zinc-200">
            <AlertOctagon className="h-3.5 w-3.5 text-amber-500" />
            <span>两版标准放宽检验核心差异</span>
          </div>
          <p className="text-[11px] leading-relaxed text-zinc-500 dark:text-zinc-400">
            <strong>GB/T 2828.1-2012 (ISO 2859-1)</strong> 已取消表2-C 的 Ac/Re 缓冲区间（均为 Re = Ac + 1），并采用「转移得分 ≥ 30」机制；
            <strong>ANSI/ASQ Z1.4</strong> 保留缓冲区间（如 1/4、2/5），落入区间时本批允收且下批转回正常检验。
          </p>
        </div>
      </div>
    </div>
  );
};
