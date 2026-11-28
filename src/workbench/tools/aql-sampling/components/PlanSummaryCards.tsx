import React from "react";
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  CheckCircle2,
  ShieldAlert,
  XCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type {
  DefectClassEvaluation,
  LotInspectionSummary,
  SamplingPlanResult,
} from "../types";
import { formatAqlValue } from "../core/tables";

interface PlanSummaryCardsProps {
  focusedEval: DefectClassEvaluation;
  summary: LotInspectionSummary;
}

export const PlanSummaryCards: React.FC<PlanSummaryCardsProps> = ({
  focusedEval,
  summary,
}) => {
  const plan: SamplingPlanResult = focusedEval.plan;
  const verdict = summary.overallVerdict;

  const verdictConfig =
    verdict === "reject"
      ? {
          title: "整批拒收",
          badge: "REJECT",
          desc: "存在不合格数 ≥ Re 的缺陷项，判定该批不接收",
          icon: XCircle,
          cardCls:
            "border-rose-200/90 dark:border-rose-500/30 bg-rose-50/70 dark:bg-rose-500/[0.08]",
          accentText: "text-rose-600 dark:text-rose-400",
          pillCls: "bg-rose-500/15 text-rose-700 dark:text-rose-300",
        }
      : verdict === "accept_revert_normal"
        ? {
            title: "允收 · 下批转正常",
            badge: "ACCEPT / REVERT",
            desc: "放宽检验不合格数落入 Ac~Re 缓冲区间，本批放行且下批恢复正常检验",
            icon: AlertTriangle,
            cardCls:
              "border-amber-200/90 dark:border-amber-500/30 bg-amber-50/75 dark:bg-amber-500/[0.08]",
            accentText: "text-amber-600 dark:text-amber-400",
            pillCls: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
          }
        : {
            title: "整批允收",
            badge: "ACCEPT",
            desc: "所有启用缺陷等级实测不良均 ≤ Ac，符合抽样放行标准",
            icon: CheckCircle2,
            cardCls:
              "border-emerald-200/90 dark:border-emerald-500/30 bg-emerald-50/65 dark:bg-emerald-500/[0.08]",
            accentText: "text-emerald-600 dark:text-emerald-400",
            pillCls: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
          };

  const VerdictIcon = verdictConfig.icon;
  const ratioPct =
    plan.samplingRatio !== null ? `${(plan.samplingRatio * 100).toFixed(plan.samplingRatio >= 0.1 ? 1 : 2)}%` : null;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
      {/* 1. Code Letter */}
      <div className="rounded-xl border border-zinc-200/90 dark:border-white/[0.09] bg-white dark:bg-[#111115] p-3.5 shadow-tactile flex flex-col justify-between gap-2">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400">
            样本量字码 ({focusedEval.config.shortLabel})
          </span>
          {plan.arrowFollowed && (
            <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md bg-indigo-500/10 text-indigo-600 dark:text-indigo-300 font-mono text-[10px] font-semibold">
              {plan.originalCode}
              {plan.arrowFollowed === "down" ? (
                <ArrowDown className="h-2.5 w-2.5" />
              ) : (
                <ArrowUp className="h-2.5 w-2.5" />
              )}
              {plan.effectiveCode}
            </span>
          )}
        </div>
        <div className="flex items-baseline gap-2.5">
          <span className="text-3xl font-bold font-mono tracking-tight text-zinc-950 dark:text-white leading-none">
            {plan.effectiveCode}
          </span>
          <span className="text-[11px] text-zinc-400 dark:text-zinc-500 font-mono truncate">
            AQL {formatAqlValue(plan.aql)}
          </span>
        </div>
        <p className="text-[10.5px] text-zinc-500 dark:text-zinc-400 truncate">
          {plan.arrowFollowed
            ? `原字码 ${plan.originalCode} 遇${plan.arrowFollowed === "down" ? "向下" : "向上"}箭头转至 ${plan.effectiveCode}`
            : plan.lotRange
              ? `批量区间 ${plan.lotRange.label} · 水平 ${plan.level}`
              : `直接字码检索 · 水平 ${plan.level}`}
        </p>
      </div>

      {/* 2. Sample Size */}
      <div className="rounded-xl border border-zinc-200/90 dark:border-white/[0.09] bg-white dark:bg-[#111115] p-3.5 shadow-tactile flex flex-col justify-between gap-2">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400">
            建议抽样数 (n)
          </span>
          {plan.isFullInspection ? (
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-amber-500/12 text-amber-700 dark:text-amber-300 text-[10px] font-semibold">
              100% 全检
            </span>
          ) : (
            ratioPct && (
              <span className="font-mono text-[10.5px] text-zinc-400 dark:text-zinc-500 tabular-nums">
                抽检比 {ratioPct}
              </span>
            )
          )}
        </div>
        <div className="flex items-baseline gap-2">
          <span className="text-3xl font-bold font-mono tabular-nums tracking-tight text-zinc-950 dark:text-white leading-none">
            {summary.recommendedTotalSample.toLocaleString("zh-CN")}
          </span>
          <span className="text-xs text-zinc-400 dark:text-zinc-500">件</span>
          {summary.hasMixedSampleSizes && (
            <span className="text-[10.5px] font-mono text-indigo-600 dark:text-indigo-400">
              当前项 {plan.sampleSize}
            </span>
          )}
        </div>
        <p className="text-[10.5px] text-zinc-500 dark:text-zinc-400 truncate">
          {plan.isFullInspection && plan.lotSize !== null
            ? `表定 n=${plan.tableSampleSize} ≥ 批量 ${plan.lotSize}，按标准执行全检`
            : summary.hasMixedSampleSizes
              ? "多缺陷项样本量不同，取最大值作为现场总抽样数"
              : `按表定样本量 n=${plan.tableSampleSize} 随机抽取`}
        </p>
      </div>

      {/* 3. Ac / Re */}
      <div className="rounded-xl border border-zinc-200/90 dark:border-white/[0.09] bg-white dark:bg-[#111115] p-3.5 shadow-tactile flex flex-col justify-between gap-2">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400">
            判定数组 ({focusedEval.config.shortLabel})
          </span>
          {plan.hasReducedGap && (
            <span
              title="ANSI/ASQ Z1.4 表II-C 放宽检验存在 Ac 与 Re 缓冲区间"
              className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md bg-amber-500/12 text-amber-700 dark:text-amber-300 text-[10px] font-medium"
            >
              <ShieldAlert className="h-2.5 w-2.5" />
              缓冲区间
            </span>
          )}
        </div>
        <div className="flex items-baseline gap-3 font-mono tabular-nums leading-none">
          <div className="flex items-baseline gap-1">
            <span className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
              Ac
            </span>
            <span className="text-3xl font-bold text-emerald-600 dark:text-emerald-400">
              {plan.ac}
            </span>
          </div>
          <span className="text-zinc-300 dark:text-zinc-600 text-lg">/</span>
          <div className="flex items-baseline gap-1">
            <span className="text-[11px] font-semibold text-rose-600 dark:text-rose-400">
              Re
            </span>
            <span className="text-3xl font-bold text-rose-600 dark:text-rose-400">
              {plan.re}
            </span>
          </div>
        </div>
        <p className="text-[10.5px] text-zinc-500 dark:text-zinc-400 truncate">
          {plan.hasReducedGap
            ? `≤${plan.ac} 允收 · ${plan.ac + 1}~${plan.re - 1} 允收转正常 · ≥${plan.re} 拒收`
            : `不合格数 ≤ ${plan.ac} 接收，≥ ${plan.re} 拒收`}
        </p>
      </div>

      {/* 4. Overall Verdict */}
      <div
        className={cn(
          "rounded-xl border p-3.5 shadow-tactile flex flex-col justify-between gap-2 transition-colors",
          verdictConfig.cardCls
        )}
      >
        <div className="flex items-center justify-between gap-2">
          <span className="text-[11px] font-medium text-zinc-600 dark:text-zinc-300">
            实时综合判定
          </span>
          <span
            className={cn(
              "px-1.5 py-0.5 rounded font-mono text-[10px] font-bold tracking-wide",
              verdictConfig.pillCls
            )}
          >
            {verdictConfig.badge}
          </span>
        </div>
        <div className={cn("flex items-center gap-2", verdictConfig.accentText)}>
          <VerdictIcon className="h-6 w-6 shrink-0" />
          <span className="text-lg font-bold tracking-tight leading-tight">
            {verdictConfig.title}
          </span>
        </div>
        <p className="text-[10.5px] text-zinc-600 dark:text-zinc-300 line-clamp-1">
          {verdictConfig.desc}
        </p>
      </div>
    </div>
  );
};
