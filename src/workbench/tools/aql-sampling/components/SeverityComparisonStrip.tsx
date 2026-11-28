import React from "react";
import { motion } from "motion/react";
import { ArrowDown, ArrowUp, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { SPRING_SNAPPY, TAP_SCALE_SUBTLE } from "@/lib/motion";
import type { InspectionSeverity, SamplingPlanResult } from "../types";
import { formatAqlValue } from "../core/tables";

interface SeverityComparisonStripProps {
  plans: Record<InspectionSeverity, SamplingPlanResult>;
  activeSeverity: InspectionSeverity;
  focusedLabel: string;
  onSelectSeverity: (severity: InspectionSeverity) => void;
}

const SEVERITY_CARDS: Array<{
  id: InspectionSeverity;
  title: string;
  subtitle: string;
  dot: string;
  activeBorder: string;
  badgeCls: string;
}> = [
  {
    id: "normal",
    title: "正常检验",
    subtitle: "表 2-A · 默认起始基准",
    dot: "bg-emerald-500",
    activeBorder: "border-emerald-400/90 dark:border-emerald-500/50 bg-emerald-50/45 dark:bg-emerald-500/[0.07]",
    badgeCls: "bg-emerald-500/12 text-emerald-700 dark:text-emerald-300",
  },
  {
    id: "tightened",
    title: "加严检验",
    subtitle: "表 2-B · 5批2拒触发",
    dot: "bg-rose-500",
    activeBorder: "border-rose-400/90 dark:border-rose-500/50 bg-rose-50/45 dark:bg-rose-500/[0.07]",
    badgeCls: "bg-rose-500/12 text-rose-700 dark:text-rose-300",
  },
  {
    id: "reduced",
    title: "放宽检验",
    subtitle: "表 2-C · 质量稳定减抽",
    dot: "bg-sky-500",
    activeBorder: "border-sky-400/90 dark:border-sky-500/50 bg-sky-50/45 dark:bg-sky-500/[0.07]",
    badgeCls: "bg-sky-500/12 text-sky-700 dark:text-sky-300",
  },
];

export const SeverityComparisonStrip: React.FC<SeverityComparisonStripProps> = ({
  plans,
  activeSeverity,
  focusedLabel,
  onSelectSeverity,
}) => {
  const normalSample = plans.normal.sampleSize;

  return (
    <section className="space-y-2.5">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-xs font-semibold text-zinc-900 dark:text-zinc-100">
          正常 / 加严 / 放宽 三档方案实时对比
          <span className="ml-2 font-mono text-[11px] font-normal text-zinc-400 dark:text-zinc-500">
            {focusedLabel} · AQL {formatAqlValue(plans.normal.aql)}
          </span>
        </h2>
        <span className="text-[11px] text-zinc-400 dark:text-zinc-500 hidden sm:inline">
          点击卡片一键切换检验严格度
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {SEVERITY_CARDS.map((card) => {
          const plan = plans[card.id];
          const isActive = activeSeverity === card.id;
          const deltaPct =
            card.id === "reduced" && normalSample > 0 && plan.sampleSize < normalSample
              ? Math.round((1 - plan.sampleSize / normalSample) * 100)
              : null;

          return (
            <motion.button
              key={card.id}
              type="button"
              whileTap={TAP_SCALE_SUBTLE}
              transition={SPRING_SNAPPY}
              onClick={() => onSelectSeverity(card.id)}
              className={cn(
                "text-left rounded-xl border p-3.5 transition-all shadow-tactile flex flex-col justify-between gap-2.5",
                isActive
                  ? card.activeBorder
                  : "border-zinc-200/90 dark:border-white/[0.08] bg-white dark:bg-[#111115] hover:border-zinc-300 dark:hover:border-white/[0.16]"
              )}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span className={cn("h-2 w-2 rounded-full shrink-0", card.dot)} />
                  <div className="min-w-0">
                    <div className="text-xs font-semibold text-zinc-900 dark:text-zinc-100 flex items-center gap-1.5">
                      <span>{card.title}</span>
                      {deltaPct !== null && deltaPct > 0 && (
                        <span className="px-1.5 py-0.2 rounded bg-sky-500/12 text-sky-700 dark:text-sky-300 font-mono text-[9.5px]">
                          省 {deltaPct}% 抽检
                        </span>
                      )}
                    </div>
                    <p className="text-[10.5px] text-zinc-400 dark:text-zinc-500 truncate">
                      {card.subtitle}
                    </p>
                  </div>
                </div>
                {isActive && (
                  <span
                    className={cn(
                      "inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md text-[10px] font-semibold shrink-0",
                      card.badgeCls
                    )}
                  >
                    <Check className="h-2.5 w-2.5" />
                    当前
                  </span>
                )}
              </div>

              <div className="grid grid-cols-3 gap-2 pt-2 border-t border-zinc-200/60 dark:border-white/[0.06] font-mono tabular-nums">
                <div>
                  <div className="text-[9.5px] font-sans text-zinc-400">字码</div>
                  <div className="text-sm font-bold text-zinc-900 dark:text-zinc-100 inline-flex items-center gap-0.5">
                    {plan.effectiveCode}
                    {plan.arrowFollowed &&
                      (plan.arrowFollowed === "down" ? (
                        <ArrowDown className="h-3 w-3 text-indigo-500" />
                      ) : (
                        <ArrowUp className="h-3 w-3 text-indigo-500" />
                      ))}
                  </div>
                </div>
                <div>
                  <div className="text-[9.5px] font-sans text-zinc-400">样本量 n</div>
                  <div className="text-sm font-bold text-zinc-900 dark:text-zinc-100">
                    {plan.sampleSize}
                    {plan.isFullInspection && (
                      <span className="ml-0.5 text-[9.5px] font-sans text-amber-600 dark:text-amber-400">
                        全
                      </span>
                    )}
                  </div>
                </div>
                <div>
                  <div className="text-[9.5px] font-sans text-zinc-400">Ac / Re</div>
                  <div className="text-sm font-bold">
                    <span className="text-emerald-600 dark:text-emerald-400">
                      {plan.ac}
                    </span>
                    <span className="text-zinc-400 mx-0.5">/</span>
                    <span className="text-rose-600 dark:text-rose-400">{plan.re}</span>
                  </div>
                </div>
              </div>
            </motion.button>
          );
        })}
      </div>
    </section>
  );
};
