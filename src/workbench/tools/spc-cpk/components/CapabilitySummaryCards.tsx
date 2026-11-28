import React from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Info,
  ShieldAlert,
  Sparkles,
  XCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { SpcAnalysisResult } from "../types";
import { GRADE_META } from "../core/engine";
import { inferDisplayDecimals } from "../core/parser";

interface CapabilitySummaryCardsProps {
  result: SpcAnalysisResult;
  unit: string;
}

function fmtIdx(v: number | null, d = 2): string {
  if (v === null || !Number.isFinite(v)) return "—";
  return v.toFixed(d);
}

function fmtPpm(ppm: number): string {
  if (!Number.isFinite(ppm)) return "—";
  if (ppm < 0.05) return "< 0.1";
  if (ppm < 10) return ppm.toFixed(1);
  return Math.round(ppm).toLocaleString("zh-CN");
}

export const CapabilitySummaryCards: React.FC<CapabilitySummaryCardsProps> = ({
  result,
  unit,
}) => {
  const { capability, observed, expectedWithin, expectedOverall, spec } = result;
  const gradeInfo = GRADE_META[capability.grade];
  const dec = inferDisplayDecimals(
    spec.usl !== null && spec.lsl !== null ? spec.usl - spec.lsl : result.range
  );

  const gradeColors = {
    emerald: {
      card: "border-emerald-200/90 dark:border-emerald-500/30 bg-emerald-50/65 dark:bg-emerald-500/[0.08]",
      text: "text-emerald-600 dark:text-emerald-400",
      pill: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
    },
    sky: {
      card: "border-sky-200/90 dark:border-sky-500/30 bg-sky-50/65 dark:bg-sky-500/[0.08]",
      text: "text-sky-600 dark:text-sky-400",
      pill: "bg-sky-500/15 text-sky-700 dark:text-sky-300",
    },
    amber: {
      card: "border-amber-200/90 dark:border-amber-500/30 bg-amber-50/70 dark:bg-amber-500/[0.08]",
      text: "text-amber-600 dark:text-amber-400",
      pill: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
    },
    orange: {
      card: "border-orange-200/90 dark:border-orange-500/30 bg-orange-50/70 dark:bg-orange-500/[0.08]",
      text: "text-orange-600 dark:text-orange-400",
      pill: "bg-orange-500/15 text-orange-700 dark:text-orange-300",
    },
    rose: {
      card: "border-rose-200/90 dark:border-rose-500/30 bg-rose-50/70 dark:bg-rose-500/[0.08]",
      text: "text-rose-600 dark:text-rose-400",
      pill: "bg-rose-500/15 text-rose-700 dark:text-rose-300",
    },
    zinc: {
      card: "border-zinc-200/90 dark:border-white/[0.09] bg-white dark:bg-[#111115]",
      text: "text-zinc-600 dark:text-zinc-300",
      pill: "bg-zinc-200/70 dark:bg-white/[0.08] text-zinc-600 dark:text-zinc-300",
    },
  }[gradeInfo.tone];

  // Centering bar position (Ca in [-1, 1] -> [0%, 100%])
  const caClamped =
    capability.ca !== null ? Math.max(-1, Math.min(1, capability.ca)) : 0;
  const caPosPct = 50 + caClamped * 46;

  return (
    <div className="space-y-3">
      {/* 4 Headline KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
        {/* 1. Primary Cpk & Grade */}
        <div
          className={cn(
            "rounded-xl border p-3.5 shadow-tactile flex flex-col justify-between gap-2 transition-colors",
            gradeColors.card
          )}
        >
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] font-medium text-zinc-600 dark:text-zinc-300">
              短期能力 Cpk
            </span>
            <span
              className={cn(
                "px-1.5 py-0.5 rounded font-mono text-[10px] font-bold tracking-wide",
                gradeColors.pill
              )}
            >
              {capability.grade} 级 ·{" "}
              {capability.meetsTarget === null
                ? "待评"
                : capability.meetsTarget
                  ? "PASS"
                  : "FAIL"}
            </span>
          </div>
          <div className="flex items-baseline gap-2.5">
            <span
              className={cn(
                "text-3xl font-bold font-mono tabular-nums tracking-tight leading-none",
                gradeColors.text
              )}
            >
              {fmtIdx(capability.cpk, 2)}
            </span>
            <span className="text-[11px] font-mono text-zinc-500 dark:text-zinc-400">
              目标 ≥ {spec.cpkThreshold.toFixed(2)}
            </span>
          </div>
          <p className="text-[10.5px] font-mono text-zinc-600 dark:text-zinc-300 truncate">
            {capability.cpkCi
              ? `95% CI [${capability.cpkCi.lower.toFixed(2)}, ${capability.cpkCi.upper.toFixed(2)}] · Cpu ${fmtIdx(capability.cpu)} / Cpl ${fmtIdx(capability.cpl)}`
              : `Cpu ${fmtIdx(capability.cpu)} / Cpl ${fmtIdx(capability.cpl)}`}
          </p>
        </div>

        {/* 2. Cp & Centering Offset Ca */}
        <div className="rounded-xl border border-zinc-200/90 dark:border-white/[0.09] bg-white dark:bg-[#111115] p-3.5 shadow-tactile flex flex-col justify-between gap-2">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400">
              潜在能力 Cp / 偏移 Ca
            </span>
            {capability.ca !== null && (
              <span
                className={cn(
                  "px-1.5 py-0.5 rounded font-mono text-[10px] font-semibold",
                  Math.abs(capability.ca) <= 0.125
                    ? "bg-emerald-500/12 text-emerald-700 dark:text-emerald-300"
                    : Math.abs(capability.ca) <= 0.25
                      ? "bg-amber-500/12 text-amber-700 dark:text-amber-300"
                      : "bg-rose-500/12 text-rose-700 dark:text-rose-300"
                )}
              >
                Ca {capability.ca >= 0 ? "+" : ""}
                {(capability.ca * 100).toFixed(1)}%
              </span>
            )}
          </div>
          <div className="flex items-baseline gap-2.5">
            <span className="text-3xl font-bold font-mono tabular-nums tracking-tight text-zinc-950 dark:text-white leading-none">
              {fmtIdx(capability.cp, 2)}
            </span>
            <span className="text-[11px] font-mono text-zinc-400 dark:text-zinc-500 truncate">
              {capability.cr !== null
                ? `CR ${(capability.cr * 100).toFixed(1)}%`
                : "单边规格"}
            </span>
          </div>
          {capability.ca !== null ? (
            <div className="space-y-1">
              <div className="relative h-1.5 rounded-full bg-zinc-100 dark:bg-white/[0.08] overflow-hidden">
                <span className="absolute left-1/2 top-0 bottom-0 w-px bg-zinc-400/70" />
                <span
                  style={{ left: `${caPosPct}%` }}
                  className={cn(
                    "absolute top-1/2 -translate-x-1/2 -translate-y-1/2 h-2.5 w-2.5 rounded-full border-2 border-white dark:border-[#111115]",
                    Math.abs(capability.ca) <= 0.125
                      ? "bg-emerald-500"
                      : Math.abs(capability.ca) <= 0.25
                        ? "bg-amber-500"
                        : "bg-rose-500"
                  )}
                />
              </div>
              <div className="flex items-center justify-between text-[9.5px] font-mono text-zinc-400">
                <span>LSL</span>
                <span>
                  {Math.abs(capability.ca) < 0.05
                    ? "居中良好"
                    : capability.ca > 0
                      ? "偏向上限 →"
                      : "← 偏向下限"}
                </span>
                <span>USL</span>
              </div>
            </div>
          ) : (
            <p className="text-[10.5px] text-zinc-500 dark:text-zinc-400 truncate">
              单边公差不计算双边 Cp 与偏移度 Ca
            </p>
          )}
        </div>

        {/* 3. Long-term Ppk / Pp / Cpm */}
        <div className="rounded-xl border border-zinc-200/90 dark:border-white/[0.09] bg-white dark:bg-[#111115] p-3.5 shadow-tactile flex flex-col justify-between gap-2">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400">
              长期表现 Ppk / Pp
            </span>
            {capability.cpm !== null && (
              <span className="font-mono text-[10.5px] text-indigo-600 dark:text-indigo-400">
                Cpm {capability.cpm.toFixed(2)}
              </span>
            )}
          </div>
          <div className="flex items-baseline gap-2.5">
            <span className="text-3xl font-bold font-mono tabular-nums tracking-tight text-zinc-950 dark:text-white leading-none">
              {fmtIdx(capability.ppk, 2)}
            </span>
            <span className="text-[11px] font-mono text-zinc-400 dark:text-zinc-500">
              Pp {fmtIdx(capability.pp, 2)}
            </span>
          </div>
          <p className="text-[10.5px] font-mono text-zinc-500 dark:text-zinc-400 truncate">
            σ组内 {result.sigmaWithin.toFixed(dec + 1)} · σ整体{" "}
            {result.sigmaOverall.toFixed(dec + 1)}
            {unit ? ` ${unit}` : ""}
          </p>
        </div>

        {/* 4. Observed OOS & Expected PPM */}
        <div className="rounded-xl border border-zinc-200/90 dark:border-white/[0.09] bg-white dark:bg-[#111115] p-3.5 shadow-tactile flex flex-col justify-between gap-2">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400">
              预期不良率 (PPM) & 实测超差
            </span>
            <span
              className={cn(
                "px-1.5 py-0.5 rounded font-mono text-[10px] font-semibold",
                observed.totalOosCount > 0
                  ? "bg-rose-500/12 text-rose-700 dark:text-rose-300"
                  : "bg-emerald-500/12 text-emerald-700 dark:text-emerald-300"
              )}
            >
              实测超差 {observed.totalOosCount}/{result.count}
            </span>
          </div>
          <div className="flex items-baseline gap-2">
            <span
              className={cn(
                "text-2xl font-bold font-mono tabular-nums tracking-tight leading-none",
                expectedWithin.ppmTotal > 1000
                  ? "text-rose-600 dark:text-rose-400"
                  : expectedWithin.ppmTotal > 64
                    ? "text-amber-600 dark:text-amber-400"
                    : "text-emerald-600 dark:text-emerald-400"
              )}
            >
              {fmtPpm(expectedWithin.ppmTotal)}
            </span>
            <span className="text-[11px] font-mono text-zinc-400">PPM (组内)</span>
          </div>
          <p className="text-[10.5px] font-mono text-zinc-500 dark:text-zinc-400 truncate">
            整体预期 {fmtPpm(expectedOverall.ppmTotal)} PPM · 实测良率{" "}
            {observed.yieldPercent.toFixed(2)}%
          </p>
        </div>
      </div>

      {/* Actionable Engineering Diagnostics Strip */}
      {result.diagnostics.length > 0 && (
        <div className="rounded-2xl border border-zinc-200/90 dark:border-white/[0.09] bg-white dark:bg-[#111115] p-3.5 shadow-tactile space-y-2">
          <div className="flex items-center justify-between gap-2">
            <span className="inline-flex items-center gap-1.5 text-[11.5px] font-semibold text-zinc-800 dark:text-zinc-200">
              <Sparkles className="h-3.5 w-3.5 text-indigo-500" />
              <span>智能过程诊断与 QE 改善建议</span>
            </span>
            <span className="text-[10.5px] font-mono text-zinc-400">
              均值 x̄ = {result.mean.toFixed(dec)}
              {unit ? ` ${unit}` : ""} · 极差 R = {result.range.toFixed(dec)} ·{" "}
              {result.isInControl ? "SPC 受控" : `${result.violations.length} 处判异`}
            </span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {result.diagnostics.map((d) => {
              const Icon =
                d.severity === "danger"
                  ? XCircle
                  : d.severity === "warning"
                    ? AlertTriangle
                    : d.severity === "success"
                      ? CheckCircle2
                      : Info;
              const style =
                d.severity === "danger"
                  ? "border-rose-200/85 dark:border-rose-500/25 bg-rose-50/55 dark:bg-rose-500/[0.06] text-rose-700 dark:text-rose-300"
                  : d.severity === "warning"
                    ? "border-amber-200/85 dark:border-amber-500/25 bg-amber-50/60 dark:bg-amber-500/[0.06] text-amber-700 dark:text-amber-300"
                    : d.severity === "success"
                      ? "border-emerald-200/85 dark:border-emerald-500/25 bg-emerald-50/55 dark:bg-emerald-500/[0.06] text-emerald-700 dark:text-emerald-300"
                      : "border-indigo-200/80 dark:border-indigo-500/25 bg-indigo-50/50 dark:bg-indigo-500/[0.06] text-indigo-700 dark:text-indigo-300";

              return (
                <div
                  key={d.id}
                  className={cn(
                    "rounded-xl border px-3 py-2 flex items-start gap-2",
                    style
                  )}
                >
                  <Icon className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                  <div className="min-w-0 space-y-0.5">
                    <div className="text-[11.5px] font-semibold leading-snug">
                      {d.title}
                    </div>
                    <p className="text-[10.5px] leading-relaxed text-zinc-600 dark:text-zinc-300">
                      {d.detail}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
          {result.droppedTrailingCount > 0 && (
            <div className="flex items-center gap-1.5 text-[10.5px] text-amber-600 dark:text-amber-400 pt-0.5">
              <ShieldAlert className="h-3.5 w-3.5 shrink-0" />
              <span>
                注：总样本 {result.count} 件按子组大小 n={result.subgroupSize} 划分，末尾余{" "}
                {result.droppedTrailingCount} 件未构成完整子组，已计入整体 Ppk/直方图，未计入控制图子组。
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
