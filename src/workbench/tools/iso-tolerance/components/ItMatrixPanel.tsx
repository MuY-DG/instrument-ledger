import React, { useMemo, useState } from "react";
import { ArrowUpRight, Compass, Layers, Table2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type {
  Iso286HoleLetter,
  Iso286ItGrade,
  Iso286ShaftLetter,
} from "../types";
import {
  ISO286_IT_GRADES,
  ISO286_IT_TABLE,
  ISO286_MAIN_STEPS,
  IT_GRADE_PROCESS_HINTS,
} from "../core/iso286Tables";
import {
  findMainStep,
  formatSignedMicrons,
  recommendItGradesForTolerance,
  resolveIso286Fit,
} from "../core/iso286Engine";
import { PREFERRED_FITS } from "../core/presets";

interface ItMatrixPanelProps {
  nominalMm: number;
  activeHoleGrade: Iso286ItGrade;
  activeShaftGrade: Iso286ItGrade;
  onJumpToFit: (params: {
    nominalMm: number;
    holeLetter: Iso286HoleLetter;
    holeGrade: Iso286ItGrade;
    shaftLetter: Iso286ShaftLetter;
    shaftGrade: Iso286ItGrade;
  }) => void;
}

export const ItMatrixPanel: React.FC<ItMatrixPanelProps> = ({
  nominalMm,
  activeHoleGrade,
  activeShaftGrade,
  onJumpToFit,
}) => {
  const [unit, setUnit] = useState<"um" | "mm">("um");
  const [rangeBand, setRangeBand] = useState<"small500" | "large3150">(
    nominalMm > 500 ? "large3150" : "small500"
  );
  const [compareBasis, setCompareBasis] = useState<"hole_basis" | "shaft_basis">(
    "hole_basis"
  );
  const [reverseTargetMode, setReverseTargetMode] = useState<"band" | "plusminus">(
    "plusminus"
  );
  const [reverseTargetText, setReverseTargetText] = useState<string>("0.015");
  const [selectedItInfo, setSelectedItInfo] = useState<Iso286ItGrade>(activeHoleGrade);

  const activeStep = useMemo(() => findMainStep(nominalMm), [nominalMm]);

  const reverseMatches = useMemo(() => {
    const v = Number(reverseTargetText);
    if (!Number.isFinite(v) || v <= 0) return [];
    const targetBandMm = reverseTargetMode === "plusminus" ? v * 2 : v;
    return recommendItGradesForTolerance(nominalMm, targetBandMm).slice(0, 4);
  }, [nominalMm, reverseTargetText, reverseTargetMode]);

  const preferredRows = useMemo(() => {
    return PREFERRED_FITS.filter((p) => p.basis === compareBasis).map((spec) => ({
      spec,
      result: resolveIso286Fit({
        nominalMm,
        holeLetter: spec.holeLetter,
        holeGrade: spec.holeGrade,
        shaftLetter: spec.shaftLetter,
        shaftGrade: spec.shaftGrade,
      }),
    }));
  }, [nominalMm, compareBasis]);

  const visibleSteps = useMemo(
    () =>
      rangeBand === "small500"
        ? ISO286_MAIN_STEPS.slice(0, 13)
        : ISO286_MAIN_STEPS.slice(13),
    [rangeBand]
  );

  const visibleGrades: readonly Iso286ItGrade[] =
    rangeBand === "small500" ? ISO286_IT_GRADES : ISO286_IT_GRADES.slice(7); // IT6..IT18 for >500mm

  return (
    <div className="space-y-5">
      {/* Section 1: Reverse IT Grade Recommender */}
      <div className="rounded-2xl border border-zinc-200/90 dark:border-white/[0.09] bg-white dark:bg-[#111115] p-4 shadow-tactile space-y-3.5">
        <div className="flex flex-wrap items-center justify-between gap-2.5">
          <div className="flex items-center gap-2">
            <Compass className="h-4 w-4 text-amber-500" />
            <div>
              <h3 className="text-xs font-semibold text-zinc-900 dark:text-zinc-100">
                按图纸公差反查 IT 等级与加工工艺能力（当前公称 Ø{nominalMm} mm）
              </h3>
              <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                输入图纸要求的对称公差 (±) 或总公差带宽，即时匹配最接近的标准 IT 等级与对应机加工艺
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="inline-flex items-center p-0.5 rounded-lg bg-zinc-100 dark:bg-white/[0.06] text-[11px]">
              <button
                type="button"
                onClick={() => setReverseTargetMode("plusminus")}
                className={cn(
                  "px-2 py-0.5 rounded font-medium",
                  reverseTargetMode === "plusminus"
                    ? "bg-white dark:bg-white/[0.14] text-zinc-950 dark:text-white shadow-hairline"
                    : "text-zinc-500"
                )}
              >
                对称 ±
              </button>
              <button
                type="button"
                onClick={() => setReverseTargetMode("band")}
                className={cn(
                  "px-2 py-0.5 rounded font-medium",
                  reverseTargetMode === "band"
                    ? "bg-white dark:bg-white/[0.14] text-zinc-950 dark:text-white shadow-hairline"
                    : "text-zinc-500"
                )}
              >
                总带宽 T
              </button>
            </div>
            <div className="relative w-32">
              <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 font-mono text-xs text-zinc-400">
                {reverseTargetMode === "plusminus" ? "±" : "T"}
              </span>
              <input
                type="number"
                step="any"
                min={0.0001}
                value={reverseTargetText}
                onChange={(e) => setReverseTargetText(e.target.value)}
                className="precision-field w-full rounded-lg border border-zinc-200/95 dark:border-white/[0.12] bg-zinc-50/60 dark:bg-white/[0.03] pl-6 pr-8 py-1.5 font-mono text-xs font-bold tabular-nums text-zinc-950 dark:text-white"
              />
              <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 font-mono text-[10px] text-zinc-400">
                mm
              </span>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
          {reverseMatches.map((m, idx) => (
            <div
              key={m.grade}
              className={cn(
                "rounded-xl border p-3 space-y-1.5 transition-colors",
                idx === 0
                  ? "border-amber-400/80 dark:border-amber-500/50 bg-amber-50/60 dark:bg-amber-500/10"
                  : "border-zinc-200/80 dark:border-white/[0.08] bg-zinc-50/50 dark:bg-white/[0.02]"
              )}
            >
              <div className="flex items-center justify-between">
                <span className="font-mono text-sm font-bold text-zinc-950 dark:text-white">
                  IT{m.grade}
                </span>
                <span
                  className={cn(
                    "px-1.5 py-0.5 rounded font-mono text-[10px] font-semibold",
                    m.isTighterOrEqual
                      ? "bg-emerald-500/12 text-emerald-700 dark:text-emerald-300"
                      : "bg-zinc-200/75 dark:bg-white/[0.08] text-zinc-600 dark:text-zinc-400"
                  )}
                >
                  {m.isTighterOrEqual ? "满足要求" : "略宽松"}
                </span>
              </div>
              <div className="font-mono text-xs font-semibold tabular-nums text-zinc-800 dark:text-zinc-200">
                带宽 {m.itMicrons} µm (±{m.halfMm.toFixed(4)} mm)
              </div>
              <p className="text-[10.5px] leading-snug text-zinc-500 dark:text-zinc-400">
                {m.processHint}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* Section 2: Preferred Fits Side-by-Side Comparison at Current ØD */}
      <div className="rounded-2xl border border-zinc-200/90 dark:border-white/[0.09] bg-white dark:bg-[#111115] overflow-hidden shadow-tactile">
        <div className="px-4 py-3 border-b border-zinc-200/80 dark:border-white/[0.07] bg-zinc-50/70 dark:bg-white/[0.02] flex flex-wrap items-center justify-between gap-2.5">
          <div className="flex items-center gap-2">
            <Layers className="h-4 w-4 text-indigo-500" />
            <span className="text-xs font-semibold text-zinc-900 dark:text-zinc-100">
              GB/T 1801 / ISO 286-2 常用优先配合横向对比（Ø{nominalMm} mm）
            </span>
          </div>
          <div className="inline-flex items-center p-0.5 rounded-lg bg-zinc-200/65 dark:bg-white/[0.05] text-[11px]">
            <button
              type="button"
              onClick={() => setCompareBasis("hole_basis")}
              className={cn(
                "px-2.5 py-0.5 rounded-md font-medium",
                compareBasis === "hole_basis"
                  ? "bg-white dark:bg-white/[0.13] text-zinc-950 dark:text-white shadow-hairline"
                  : "text-zinc-500 dark:text-zinc-400"
              )}
            >
              基孔制 (H)
            </button>
            <button
              type="button"
              onClick={() => setCompareBasis("shaft_basis")}
              className={cn(
                "px-2.5 py-0.5 rounded-md font-medium",
                compareBasis === "shaft_basis"
                  ? "bg-white dark:bg-white/[0.13] text-zinc-950 dark:text-white shadow-hairline"
                  : "text-zinc-500 dark:text-zinc-400"
              )}
            >
              基轴制 (h)
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="border-b border-zinc-200/80 dark:border-white/[0.07] bg-zinc-50/40 dark:bg-white/[0.01] text-zinc-500 dark:text-zinc-400">
                <th className="py-2 px-3 text-left font-medium">配合代号</th>
                <th className="py-2 px-3 text-left font-medium">性质</th>
                <th className="py-2 px-3 text-right font-medium">孔偏差 (µm)</th>
                <th className="py-2 px-3 text-right font-medium">轴偏差 (µm)</th>
                <th className="py-2 px-3 text-right font-medium">配合极限 (µm)</th>
                <th className="py-2 px-3 text-left font-medium hidden md:table-cell">典型用途</th>
                <th className="py-2 px-3 text-right font-medium">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-white/[0.05]">
              {preferredRows.map(({ spec, result }) => (
                <tr
                  key={spec.id}
                  className="hover:bg-zinc-50/80 dark:hover:bg-white/[0.025] transition-colors"
                >
                  <td className="py-2 px-3 font-mono font-bold text-zinc-950 dark:text-white whitespace-nowrap">
                    {spec.code}
                  </td>
                  <td className="py-2 px-3 whitespace-nowrap">
                    <span
                      className={cn(
                        "inline-flex items-center px-1.5 py-0.5 rounded text-[10.5px] font-medium",
                        spec.nature === "clearance"
                          ? "bg-emerald-500/12 text-emerald-700 dark:text-emerald-300"
                          : spec.nature === "transition"
                            ? "bg-amber-500/12 text-amber-800 dark:text-amber-300"
                            : "bg-rose-500/12 text-rose-700 dark:text-rose-300"
                      )}
                    >
                      {spec.shortLabel}
                    </span>
                  </td>
                  <td className="py-2 px-3 text-right font-mono tabular-nums text-indigo-700 dark:text-indigo-300 whitespace-nowrap">
                    {result.valid
                      ? `${formatSignedMicrons(result.hole.upperDevMicrons)} / ${formatSignedMicrons(result.hole.lowerDevMicrons)}`
                      : "—"}
                  </td>
                  <td className="py-2 px-3 text-right font-mono tabular-nums text-amber-700 dark:text-amber-300 whitespace-nowrap">
                    {result.valid
                      ? `${formatSignedMicrons(result.shaft.upperDevMicrons)} / ${formatSignedMicrons(result.shaft.lowerDevMicrons)}`
                      : "—"}
                  </td>
                  <td className="py-2 px-3 text-right font-mono font-semibold tabular-nums text-zinc-900 dark:text-zinc-100 whitespace-nowrap">
                    {result.valid
                      ? result.fitNature === "clearance"
                        ? `+${result.minClearanceMicrons} ～ +${result.maxClearanceMicrons}`
                        : result.fitNature === "interference"
                          ? `-${result.minInterferenceMicrons} ～ -${result.maxInterferenceMicrons}`
                          : `+${result.maxClearanceMicrons} / -${result.maxInterferenceMicrons}`
                      : "超出范围"}
                  </td>
                  <td className="py-2 px-3 text-[11px] text-zinc-500 dark:text-zinc-400 hidden md:table-cell max-w-xs truncate">
                    {spec.application}
                  </td>
                  <td className="py-2 px-3 text-right whitespace-nowrap">
                    {result.valid && (
                      <button
                        type="button"
                        onClick={() =>
                          onJumpToFit({
                            nominalMm,
                            holeLetter: spec.holeLetter,
                            holeGrade: spec.holeGrade,
                            shaftLetter: spec.shaftLetter,
                            shaftGrade: spec.shaftGrade,
                          })
                        }
                        className="inline-flex items-center gap-0.5 text-[11px] font-medium text-indigo-600 dark:text-indigo-400 hover:underline"
                      >
                        <span>选用</span>
                        <ArrowUpRight className="h-3 w-3" />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Section 3: Full ISO 286-1 IT01–IT18 Master Matrix */}
      <div className="rounded-2xl border border-zinc-200/90 dark:border-white/[0.09] bg-white dark:bg-[#111115] overflow-hidden shadow-tactile">
        <div className="px-4 py-3 border-b border-zinc-200/80 dark:border-white/[0.07] bg-zinc-50/70 dark:bg-white/[0.02] flex flex-wrap items-center justify-between gap-2.5">
          <div className="flex items-center gap-2">
            <Table2 className="h-4 w-4 text-amber-500" />
            <span className="text-xs font-semibold text-zinc-900 dark:text-zinc-100">
              ISO 286-1 / GB/T 1800.1 标准公差数值总表 (IT01 ～ IT18)
            </span>
          </div>

          <div className="flex items-center gap-2">
            <div className="inline-flex items-center p-0.5 rounded-lg bg-zinc-200/65 dark:bg-white/[0.05] text-[11px]">
              <button
                type="button"
                onClick={() => setRangeBand("small500")}
                className={cn(
                  "px-2 py-0.5 rounded-md font-mono font-medium",
                  rangeBand === "small500"
                    ? "bg-white dark:bg-white/[0.13] text-zinc-950 dark:text-white shadow-hairline"
                    : "text-zinc-500"
                )}
              >
                ≤ 500 mm
              </button>
              <button
                type="button"
                onClick={() => setRangeBand("large3150")}
                className={cn(
                  "px-2 py-0.5 rounded-md font-mono font-medium",
                  rangeBand === "large3150"
                    ? "bg-white dark:bg-white/[0.13] text-zinc-950 dark:text-white shadow-hairline"
                    : "text-zinc-500"
                )}
              >
                &gt;500 ～ 3150 mm
              </button>
            </div>

            <div className="inline-flex items-center p-0.5 rounded-lg bg-zinc-200/65 dark:bg-white/[0.05] text-[11px]">
              <button
                type="button"
                onClick={() => setUnit("um")}
                className={cn(
                  "px-2 py-0.5 rounded-md font-mono font-medium",
                  unit === "um"
                    ? "bg-white dark:bg-white/[0.13] text-zinc-950 dark:text-white shadow-hairline"
                    : "text-zinc-500"
                )}
              >
                µm
              </button>
              <button
                type="button"
                onClick={() => setUnit("mm")}
                className={cn(
                  "px-2 py-0.5 rounded-md font-mono font-medium",
                  unit === "mm"
                    ? "bg-white dark:bg-white/[0.13] text-zinc-950 dark:text-white shadow-hairline"
                    : "text-zinc-500"
                )}
              >
                mm
              </button>
            </div>
          </div>
        </div>

        {/* Selected IT Grade Process Capability Bar */}
        <div className="px-4 py-2 bg-amber-500/[0.06] dark:bg-amber-500/[0.08] border-b border-amber-500/15 flex items-center justify-between gap-2 text-[11.5px]">
          <span className="text-zinc-700 dark:text-zinc-200">
            <strong className="font-mono text-amber-700 dark:text-amber-300 mr-1.5">
              IT{selectedItInfo}
            </strong>
            典型制造工艺：{IT_GRADE_PROCESS_HINTS[selectedItInfo]}
          </span>
          <span className="text-[10.5px] text-zinc-400 hidden sm:inline">
            点击表头查看各等级典型工艺
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-[11px] border-collapse">
            <thead>
              <tr className="border-b border-zinc-200/80 dark:border-white/[0.07] bg-zinc-50/50 dark:bg-white/[0.015] text-zinc-500 dark:text-zinc-400">
                <th className="sticky left-0 z-10 bg-zinc-50 dark:bg-[#141418] py-2 px-3 text-left font-medium whitespace-nowrap border-r border-zinc-200/70 dark:border-white/[0.07]">
                  尺寸分段 (mm)
                </th>
                {visibleGrades.map((g) => {
                  const isHighlighted =
                    g === activeHoleGrade || g === activeShaftGrade || g === selectedItInfo;
                  return (
                    <th
                      key={g}
                      onClick={() => setSelectedItInfo(g)}
                      className={cn(
                        "py-2 px-2 text-center font-mono cursor-pointer transition-colors whitespace-nowrap",
                        selectedItInfo === g
                          ? "bg-amber-500 text-white font-bold"
                          : isHighlighted
                            ? "bg-amber-500/12 text-amber-700 dark:text-amber-300 font-bold"
                            : "hover:bg-zinc-200/60 dark:hover:bg-white/[0.06]"
                      )}
                    >
                      IT{g}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-white/[0.04]">
              {visibleSteps.map((step) => {
                const isRowActive = activeStep?.index === step.index;
                return (
                  <tr
                    key={step.index}
                    className={cn(
                      isRowActive
                        ? "bg-amber-500/[0.06] dark:bg-amber-500/[0.08]"
                        : "hover:bg-zinc-50/70 dark:hover:bg-white/[0.02]"
                    )}
                  >
                    <td className="sticky left-0 z-10 bg-white dark:bg-[#111115] py-1.5 px-3 font-mono font-medium text-zinc-700 dark:text-zinc-300 whitespace-nowrap border-r border-zinc-200/70 dark:border-white/[0.07]">
                      {step.label}
                    </td>
                    {visibleGrades.map((g) => {
                      const um = ISO286_IT_TABLE[g][step.index];
                      const display =
                        um === null
                          ? "—"
                          : unit === "um"
                            ? String(um)
                            : (um / 1000).toFixed(um < 10 ? 4 : 3);
                      const isCellHit = isRowActive && g === selectedItInfo;
                      return (
                        <td
                          key={g}
                          onClick={() => setSelectedItInfo(g)}
                          className={cn(
                            "py-1.5 px-2 text-center font-mono tabular-nums cursor-pointer whitespace-nowrap",
                            isCellHit
                              ? "bg-amber-500 text-white font-bold"
                              : g === selectedItInfo
                                ? "bg-amber-500/[0.06] text-zinc-900 dark:text-white font-semibold"
                                : "text-zinc-600 dark:text-zinc-400"
                          )}
                        >
                          {display}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
