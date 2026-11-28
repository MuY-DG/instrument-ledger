import React, { useMemo } from "react";
import { motion } from "motion/react";
import {
  AlertCircle,
  ArrowDown,
  ArrowUp,
  CheckCircle2,
  Info,
  Minus,
  Plus,
  RotateCcw,
  XCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { PrecisionSelect, PrecisionSwitch, type SelectOption } from "@/components/ui/FormControls";
import { SPRING_SNAPPY, TAP_SCALE_ICON } from "@/lib/motion";
import type {
  AqlValue,
  DefectClassConfig,
  DefectClassEvaluation,
  LotInspectionSummary,
} from "../types";
import {
  DEFECTS_PER_100_AQL_VALUES,
  PERCENT_AQL_VALUES,
  formatAqlValue,
} from "../core/tables";

interface MultiClassJudgePanelProps {
  classes: DefectClassConfig[];
  summary: LotInspectionSummary;
  focusedClassId: DefectClassConfig["id"];
  showExtendedAql: boolean;
  onToggleExtendedAql: (next: boolean) => void;
  onFocusClass: (id: DefectClassConfig["id"]) => void;
  onUpdateClass: (
    id: DefectClassConfig["id"],
    patch: Partial<DefectClassConfig>
  ) => void;
  onResetDefects: () => void;
}

const CLASS_ACCENT: Record<
  DefectClassConfig["id"],
  { dot: string; tag: string; desc: string }
> = {
  critical: {
    dot: "bg-rose-500",
    tag: "安全 / 法规 / 致命失效",
    desc: "通常采用零缺陷 (AQL 0 / Ac=0, Re=1)",
  },
  major: {
    dot: "bg-amber-500",
    tag: "功能 / 关键尺寸 / 装配失效",
    desc: "常用 AQL 0.40 ~ 1.5",
  },
  minor: {
    dot: "bg-sky-500",
    tag: "外观瑕疵 / 次要尺寸",
    desc: "常用 AQL 1.5 ~ 4.0",
  },
};

export const MultiClassJudgePanel: React.FC<MultiClassJudgePanelProps> = ({
  classes,
  summary,
  focusedClassId,
  showExtendedAql,
  onToggleExtendedAql,
  onFocusClass,
  onUpdateClass,
  onResetDefects,
}) => {
  const enabledCount = classes.filter((c) => c.enabled).length;

  const evalById = useMemo(() => {
    const map = new Map<DefectClassConfig["id"], DefectClassEvaluation>();
    for (const ev of summary.evaluations) {
      map.set(ev.config.id, ev);
    }
    return map;
  }, [summary.evaluations]);

  const aqlOptions: SelectOption<AqlValue>[] = useMemo(() => {
    const base: SelectOption<AqlValue>[] = [
      { value: 0, label: "AQL 0 (零缺陷)", hint: "Ac=0" },
      ...PERCENT_AQL_VALUES.map((v) => ({
        value: v as AqlValue,
        label: `AQL ${formatAqlValue(v)}`,
        hint: "%",
      })),
    ];
    if (showExtendedAql) {
      base.push(
        ...DEFECTS_PER_100_AQL_VALUES.map((v) => ({
          value: v as AqlValue,
          label: `AQL ${formatAqlValue(v)}`,
          hint: "/100件",
        }))
      );
    }
    return base;
  }, [showExtendedAql]);

  const hasAnyDefects = classes.some((c) => c.enabled && c.defectsFound > 0);

  return (
    <section className="rounded-2xl border border-zinc-200/90 dark:border-white/[0.09] bg-white dark:bg-[#111115] shadow-tactile overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-zinc-200/75 dark:border-white/[0.06] bg-zinc-50/70 dark:bg-white/[0.02] flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <h2 className="text-xs font-semibold text-zinc-900 dark:text-zinc-100">
            多缺陷等级联合抽检与实时判定 (CR / MAJ / MIN)
          </h2>
          <span className="text-[10.5px] text-zinc-400 dark:text-zinc-500 hidden sm:inline">
            点击行可联动下方严格度对比与 OC 曲线
          </span>
        </div>
        <div className="flex items-center gap-3">
          <label className="inline-flex items-center gap-1.5 text-[11px] text-zinc-500 dark:text-zinc-400 cursor-pointer select-none">
            <PrecisionSwitch
              size="sm"
              checked={showExtendedAql}
              onChange={onToggleExtendedAql}
              ariaLabel="显示每百单位不合格数 AQL (15~1000)"
            />
            <span>扩展 AQL (&gt;10)</span>
          </label>
          {hasAnyDefects && (
            <button
              type="button"
              onClick={onResetDefects}
              className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white hover:bg-zinc-200/60 dark:hover:bg-white/[0.07] transition-colors"
            >
              <RotateCcw className="h-3 w-3" />
              <span>不良归零</span>
            </button>
          )}
        </div>
      </div>

      {/* Defect Class Rows */}
      <div className="divide-y divide-zinc-200/70 dark:divide-white/[0.06]">
        {classes.map((cls) => {
          const ev = evalById.get(cls.id);
          const accent = CLASS_ACCENT[cls.id];
          const isFocused = cls.enabled && focusedClassId === cls.id;
          const canDisable = !cls.enabled || enabledCount > 1;

          return (
            <div
              key={cls.id}
              onClick={() => {
                if (cls.enabled) onFocusClass(cls.id);
              }}
              className={cn(
                "px-4 py-3 transition-colors flex flex-col lg:flex-row lg:items-center justify-between gap-3",
                cls.enabled ? "cursor-pointer" : "opacity-55 bg-zinc-50/40 dark:bg-white/[0.01]",
                isFocused &&
                  "bg-emerald-500/[0.045] dark:bg-emerald-500/[0.06] ring-1 ring-inset ring-emerald-500/25"
              )}
            >
              {/* Left: Toggle + Label + AQL selector */}
              <div className="flex flex-wrap items-center gap-3 min-w-0">
                <div
                  onClick={(e) => e.stopPropagation()}
                  className="shrink-0"
                >
                  <PrecisionSwitch
                    size="sm"
                    checked={cls.enabled}
                    disabled={!canDisable}
                    ariaLabel={`启用 ${cls.label}`}
                    onChange={(next) => {
                      onUpdateClass(cls.id, { enabled: next });
                      if (next) onFocusClass(cls.id);
                    }}
                  />
                </div>

                <div className="min-w-[140px]">
                  <div className="flex items-center gap-1.5">
                    <span className={cn("h-2 w-2 rounded-full shrink-0", accent.dot)} />
                    <span className="text-xs font-semibold text-zinc-900 dark:text-zinc-100">
                      {cls.label}
                    </span>
                    {isFocused && (
                      <span className="px-1.5 py-0.2 rounded bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 text-[9.5px] font-medium">
                        聚焦分析
                      </span>
                    )}
                  </div>
                  <p className="text-[10.5px] text-zinc-400 dark:text-zinc-500 mt-0.5">
                    {accent.tag}
                  </p>
                </div>

                <div onClick={(e) => e.stopPropagation()}>
                  <PrecisionSelect<AqlValue>
                    value={cls.aql}
                    options={aqlOptions}
                    disabled={!cls.enabled}
                    size="xs"
                    className="w-[138px] font-mono"
                    onChange={(nextAql) => {
                      onUpdateClass(cls.id, { aql: nextAql });
                      if (cls.enabled) onFocusClass(cls.id);
                    }}
                  />
                </div>
              </div>

              {/* Right: Plan numbers + defect count stepper + Verdict pill */}
              {cls.enabled && ev ? (
                <div className="flex flex-wrap items-center justify-between lg:justify-end gap-3 sm:gap-4">
                  {/* Resolved Code, n, Ac/Re */}
                  <div className="flex items-center gap-3 font-mono text-xs tabular-nums">
                    <div className="flex flex-col items-center min-w-[46px]">
                      <span className="text-[9.5px] uppercase text-zinc-400 font-sans">
                        字码
                      </span>
                      <span className="font-semibold text-zinc-900 dark:text-zinc-100 inline-flex items-center gap-0.5">
                        {ev.plan.arrowFollowed && (
                          <span className="text-[10px] text-zinc-400">
                            {ev.plan.originalCode}
                            {ev.plan.arrowFollowed === "down" ? (
                              <ArrowDown className="inline h-2.5 w-2.5 text-indigo-500" />
                            ) : (
                              <ArrowUp className="inline h-2.5 w-2.5 text-indigo-500" />
                            )}
                          </span>
                        )}
                        {ev.plan.effectiveCode}
                      </span>
                    </div>

                    <div className="h-6 w-px bg-zinc-200/80 dark:bg-white/[0.08]" />

                    <div className="flex flex-col items-center min-w-[54px]">
                      <span className="text-[9.5px] uppercase text-zinc-400 font-sans">
                        抽样 n
                      </span>
                      <span className="font-semibold text-zinc-900 dark:text-zinc-100">
                        {ev.plan.sampleSize}
                        {ev.plan.isFullInspection && (
                          <span className="ml-0.5 text-[9.5px] text-amber-600 dark:text-amber-400 font-sans">
                            全
                          </span>
                        )}
                      </span>
                    </div>

                    <div className="h-6 w-px bg-zinc-200/80 dark:bg-white/[0.08]" />

                    <div className="flex flex-col items-center min-w-[70px]">
                      <span className="text-[9.5px] uppercase text-zinc-400 font-sans">
                        Ac / Re
                      </span>
                      <span>
                        <span className="font-bold text-emerald-600 dark:text-emerald-400">
                          {ev.plan.ac}
                        </span>
                        <span className="text-zinc-400 mx-1">/</span>
                        <span className="font-bold text-rose-600 dark:text-rose-400">
                          {ev.plan.re}
                        </span>
                      </span>
                    </div>
                  </div>

                  {/* Defect Count Stepper */}
                  <div
                    onClick={(e) => e.stopPropagation()}
                    className="inline-flex items-center rounded-lg border border-zinc-200/95 dark:border-white/[0.1] bg-zinc-50/70 dark:bg-white/[0.03] p-0.5"
                  >
                    <motion.button
                      type="button"
                      whileTap={TAP_SCALE_ICON}
                      transition={SPRING_SNAPPY}
                      disabled={cls.defectsFound <= 0}
                      onClick={() =>
                        onUpdateClass(cls.id, {
                          defectsFound: Math.max(0, cls.defectsFound - 1),
                        })
                      }
                      aria-label={`减少 ${cls.label} 实测不良数`}
                      className="h-6 w-6 rounded-md flex items-center justify-center text-zinc-500 hover:text-zinc-900 dark:hover:text-white hover:bg-white dark:hover:bg-white/[0.08] disabled:opacity-35 transition-colors"
                    >
                      <Minus className="h-3 w-3" />
                    </motion.button>
                    <input
                      type="number"
                      min={0}
                      max={99999}
                      value={cls.defectsFound}
                      onChange={(e) => {
                        const val = Math.max(
                          0,
                          Math.floor(Number(e.target.value) || 0)
                        );
                        onUpdateClass(cls.id, { defectsFound: val });
                      }}
                      aria-label={`${cls.label} 实测不良数`}
                      className="w-12 text-center font-mono text-xs font-semibold tabular-nums bg-transparent text-zinc-950 dark:text-white focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                    />
                    <motion.button
                      type="button"
                      whileTap={TAP_SCALE_ICON}
                      transition={SPRING_SNAPPY}
                      onClick={() =>
                        onUpdateClass(cls.id, {
                          defectsFound: cls.defectsFound + 1,
                        })
                      }
                      aria-label={`增加 ${cls.label} 实测不良数`}
                      className="h-6 w-6 rounded-md flex items-center justify-center text-zinc-500 hover:text-zinc-900 dark:hover:text-white hover:bg-white dark:hover:bg-white/[0.08] transition-colors"
                    >
                      <Plus className="h-3 w-3" />
                    </motion.button>
                  </div>

                  {/* Per-row Verdict Pill */}
                  <div className="min-w-[104px] flex justify-end">
                    {ev.verdict === "accept" ? (
                      <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-emerald-500/12 text-emerald-700 dark:text-emerald-300 text-[11px] font-semibold">
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        <span>允收</span>
                      </span>
                    ) : ev.verdict === "accept_revert_normal" ? (
                      <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-amber-500/15 text-amber-700 dark:text-amber-300 text-[11px] font-semibold">
                        <AlertCircle className="h-3.5 w-3.5" />
                        <span>允收·转正常</span>
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-rose-500/14 text-rose-700 dark:text-rose-300 text-[11px] font-semibold">
                        <XCircle className="h-3.5 w-3.5" />
                        <span>拒收</span>
                      </span>
                    )}
                  </div>
                </div>
              ) : (
                <span className="text-[11px] text-zinc-400 dark:text-zinc-500">
                  未启用该缺陷等级
                </span>
              )}
            </div>
          );
        })}
      </div>

      {/* Mixed sample sizes advisory banner */}
      {summary.hasMixedSampleSizes && (
        <div className="px-4 py-2.5 border-t border-zinc-200/75 dark:border-white/[0.06] bg-indigo-50/60 dark:bg-indigo-500/[0.07] flex items-start gap-2 text-[11px] text-indigo-800 dark:text-indigo-200">
          <Info className="h-3.5 w-3.5 shrink-0 mt-0.5 text-indigo-500" />
          <span>
            不同缺陷等级因 AQL 箭头转移匹配到不同样本量，现场建议一次随机抽取最大样本量{" "}
            <strong className="font-mono">{summary.recommendedTotalSample} 件</strong>
            ，各等级分别按各自对应的抽样数与 Ac/Re 独立判定。
          </span>
        </div>
      )}
    </section>
  );
};
