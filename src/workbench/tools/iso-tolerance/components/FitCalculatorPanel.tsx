import React, { useMemo, useState } from "react";
import { motion } from "motion/react";
import {
  AlertTriangle,
  CheckCircle2,
  Flame,
  PlusCircle,
  Search,
  Sparkles,
  XCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { TAP_SCALE_SUBTLE } from "@/lib/motion";
import { PrecisionSelect, type SelectOption } from "@/components/ui/FormControls";
import type {
  ChecksheetItem,
  FitBasisMode,
  Iso286FitResult,
  Iso286HoleLetter,
  Iso286ItGrade,
  Iso286ShaftLetter,
} from "../types";
import {
  ISO286_HOLE_LETTERS,
  ISO286_IT_GRADES,
  ISO286_SHAFT_LETTERS,
} from "../core/iso286Tables";
import {
  formatSignedMicrons,
  formatSignedMm,
  inferMmDecimals,
  parseIso286Notation,
} from "../core/iso286Engine";
import { PREFERRED_FITS } from "../core/presets";
import { FitZoneDiagram } from "./FitZoneDiagram";

const QUICK_DIAMETERS = [6, 10, 16, 20, 25, 32, 40, 50, 80, 100, 160, 250] as const;

interface FitCalculatorPanelProps {
  nominalText: string;
  onChangeNominalText: (v: string) => void;
  holeLetter: Iso286HoleLetter;
  onChangeHoleLetter: (v: Iso286HoleLetter) => void;
  holeGrade: Iso286ItGrade;
  onChangeHoleGrade: (v: Iso286ItGrade) => void;
  shaftLetter: Iso286ShaftLetter;
  onChangeShaftLetter: (v: Iso286ShaftLetter) => void;
  shaftGrade: Iso286ItGrade;
  onChangeShaftGrade: (v: Iso286ItGrade) => void;
  fit: Iso286FitResult;
  measuredHoleText: string;
  onChangeMeasuredHoleText: (v: string) => void;
  measuredShaftText: string;
  onChangeMeasuredShaftText: (v: string) => void;
  onAddToChecksheet: (item: Omit<ChecksheetItem, "id" | "balloonNo">) => void;
  onNotify: (msg: string, type?: "success" | "error") => void;
}

export const FitCalculatorPanel: React.FC<FitCalculatorPanelProps> = ({
  nominalText,
  onChangeNominalText,
  holeLetter,
  onChangeHoleLetter,
  holeGrade,
  onChangeHoleGrade,
  shaftLetter,
  onChangeShaftLetter,
  shaftGrade,
  onChangeShaftGrade,
  fit,
  measuredHoleText,
  onChangeMeasuredHoleText,
  measuredShaftText,
  onChangeMeasuredShaftText,
  onAddToChecksheet,
  onNotify,
}) => {
  const [basis, setBasis] = useState<FitBasisMode>("hole_basis");
  const [notationInput, setNotationInput] = useState("");

  const nominalVal = fit.nominalMm;
  const preferredForBasis = useMemo(
    () =>
      PREFERRED_FITS.filter((p) =>
        basis === "shaft_basis" ? p.basis === "shaft_basis" : p.basis === "hole_basis"
      ),
    [basis]
  );

  const holeLetterOptions: SelectOption<Iso286HoleLetter>[] = useMemo(
    () =>
      ISO286_HOLE_LETTERS.map((l) => ({
        value: l,
        label: l,
        hint:
          l === "H"
            ? "基准孔"
            : l === "JS"
              ? "对称"
              : ["A", "B", "C", "CD", "D", "E", "EF", "F", "FG", "G"].includes(l)
                ? "间隙"
                : ["J", "K", "M", "N"].includes(l)
                  ? "过渡"
                  : "过盈",
      })),
    []
  );

  const shaftLetterOptions: SelectOption<Iso286ShaftLetter>[] = useMemo(
    () =>
      ISO286_SHAFT_LETTERS.map((l) => ({
        value: l,
        label: l,
        hint:
          l === "h"
            ? "基准轴"
            : l === "js"
              ? "对称"
              : ["a", "b", "c", "cd", "d", "e", "ef", "f", "fg", "g"].includes(l)
                ? "间隙"
                : ["j", "k", "m", "n"].includes(l)
                  ? "过渡"
                  : "过盈",
      })),
    []
  );

  const gradeOptions: SelectOption<Iso286ItGrade>[] = useMemo(
    () =>
      ISO286_IT_GRADES.map((g) => ({
        value: g,
        label: `IT${g}`,
        hint: g === "6" || g === "7" ? "常用" : undefined,
      })),
    []
  );

  const handleQuickParse = (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = parseIso286Notation(notationInput);
    if (!parsed) {
      onNotify("无法识别代号，请输入如 Ø25 H7/g6、50 K7/h6 或 30 p6", "error");
      return;
    }
    if (parsed.nominalMm !== null && parsed.nominalMm > 0 && parsed.nominalMm <= 3150) {
      onChangeNominalText(String(parsed.nominalMm));
    }
    if (parsed.hole) {
      onChangeHoleLetter(parsed.hole.letter);
      onChangeHoleGrade(parsed.hole.grade);
    }
    if (parsed.shaft) {
      onChangeShaftLetter(parsed.shaft.letter);
      onChangeShaftGrade(parsed.shaft.grade);
    }
    if (parsed.hole?.letter === "H") setBasis("hole_basis");
    else if (parsed.shaft?.letter === "h") setBasis("shaft_basis");
    else setBasis("custom");
    onNotify(`已解析并定位配合：${notationInput.trim()}`, "success");
  };

  const measHoleVal = useMemo(() => {
    const s = measuredHoleText.trim();
    if (!s) return null;
    const n = Number(s);
    return Number.isFinite(n) ? n : null;
  }, [measuredHoleText]);

  const measShaftVal = useMemo(() => {
    const s = measuredShaftText.trim();
    if (!s) return null;
    const n = Number(s);
    return Number.isFinite(n) ? n : null;
  }, [measuredShaftText]);

  const matingStatus = useMemo(() => {
    if (!fit.valid) return null;
    const holeOk =
      measHoleVal === null
        ? null
        : measHoleVal >= fit.hole.minSizeMm - 1e-7 &&
          measHoleVal <= fit.hole.maxSizeMm + 1e-7;
    const shaftOk =
      measShaftVal === null
        ? null
        : measShaftVal >= fit.shaft.minSizeMm - 1e-7 &&
          measShaftVal <= fit.shaft.maxSizeMm + 1e-7;
    const actualClearanceUm =
      measHoleVal !== null && measShaftVal !== null
        ? Number(((measHoleVal - measShaftVal) * 1000).toFixed(1))
        : null;
    const clearanceInEnvelope =
      actualClearanceUm !== null
        ? actualClearanceUm >= fit.minClearanceMicrons - 0.05 &&
          actualClearanceUm <= fit.maxClearanceMicrons + 0.05
        : null;
    return { holeOk, shaftOk, actualClearanceUm, clearanceInEnvelope };
  }, [fit, measHoleVal, measShaftVal]);

  const holeDec = inferMmDecimals(fit.hole.itMicrons);
  const shaftDec = inferMmDecimals(fit.shaft.itMicrons);

  return (
    <div className="space-y-4">
      {/* Top Smart Notation Quick Input + Preferred Fits Strip */}
      <div className="rounded-2xl border border-zinc-200/90 dark:border-white/[0.09] bg-white dark:bg-[#111115] p-3.5 shadow-tactile space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2.5">
          {/* Fit Basis Segmented Switch */}
          <div className="inline-flex items-center p-0.5 rounded-lg bg-zinc-100 dark:bg-white/[0.06] border border-zinc-200/80 dark:border-white/[0.07] text-[11px]">
            {(
              [
                ["hole_basis", "基孔制优先 (H-base)"],
                ["shaft_basis", "基轴制优先 (h-base)"],
                ["custom", "自由组合"],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => {
                  setBasis(id);
                  if (id === "hole_basis") onChangeHoleLetter("H");
                  if (id === "shaft_basis") onChangeShaftLetter("h");
                }}
                className={cn(
                  "px-2.5 py-1 rounded-md font-medium transition-colors",
                  basis === id
                    ? "bg-white dark:bg-white/[0.14] text-zinc-950 dark:text-white shadow-hairline"
                    : "text-zinc-500 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200"
                )}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Smart Notation Parser */}
          <form onSubmit={handleQuickParse} className="flex items-center gap-1.5 flex-1 sm:flex-initial">
            <div className="relative flex-1 sm:w-56">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-400" />
              <input
                type="text"
                value={notationInput}
                onChange={(e) => setNotationInput(e.target.value)}
                placeholder="直输代号，如 Ø25 H7/g6..."
                className="precision-field w-full rounded-lg border border-zinc-200/95 dark:border-white/[0.1] bg-zinc-50/60 dark:bg-white/[0.03] pl-8 pr-2.5 py-1.5 font-mono text-xs text-zinc-900 dark:text-zinc-100"
              />
            </div>
            <button
              type="submit"
              className="btn-tactile px-2.5 py-1.5 rounded-lg bg-zinc-900 dark:bg-white text-white dark:text-zinc-950 text-[11px] font-medium shrink-0"
            >
              解析
            </button>
          </form>
        </div>

        {/* Preferred Engineering Fits Quick Chips */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5">
          <span className="inline-flex items-center gap-1 text-[10.5px] font-medium text-zinc-400 shrink-0 pr-1">
            <Sparkles className="h-3 w-3 text-amber-500" />
            <span>优先配合</span>
          </span>
          {preferredForBasis.map((spec) => {
            const active =
              holeLetter === spec.holeLetter &&
              holeGrade === spec.holeGrade &&
              shaftLetter === spec.shaftLetter &&
              shaftGrade === spec.shaftGrade;
            const dotCls =
              spec.nature === "clearance"
                ? "bg-emerald-500"
                : spec.nature === "transition"
                  ? "bg-amber-500"
                  : "bg-rose-500";
            return (
              <motion.button
                key={spec.id}
                type="button"
                whileTap={TAP_SCALE_SUBTLE}
                onClick={() => {
                  onChangeHoleLetter(spec.holeLetter);
                  onChangeHoleGrade(spec.holeGrade);
                  onChangeShaftLetter(spec.shaftLetter);
                  onChangeShaftGrade(spec.shaftGrade);
                }}
                title={`${spec.code} · ${spec.shortLabel}：${spec.application}`}
                className={cn(
                  "shrink-0 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[11px] transition-colors",
                  active
                    ? "bg-zinc-900 dark:bg-white text-white dark:text-zinc-950 border-zinc-900 dark:border-white font-semibold"
                    : "bg-zinc-50/80 dark:bg-white/[0.03] border-zinc-200/80 dark:border-white/[0.08] text-zinc-700 dark:text-zinc-300 hover:border-zinc-300 dark:hover:border-white/[0.18]"
                )}
              >
                <span className={cn("h-1.5 w-1.5 rounded-full shrink-0", dotCls)} />
                <span className="font-mono font-semibold">{spec.code}</span>
                <span className="text-[10px] opacity-75">{spec.shortLabel}</span>
              </motion.button>
            );
          })}
        </div>
      </div>

      {/* Main 2-Column Layout */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-5 items-start">
        {/* Left Parameter & Dual Mating Inspector Rail */}
        <aside className="xl:col-span-4 space-y-4">
          <div className="rounded-2xl border border-zinc-200/90 dark:border-white/[0.09] bg-white dark:bg-[#111115] p-4 shadow-tactile space-y-4">
            {/* Nominal Diameter */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label
                  htmlFor="iso286-nominal"
                  className="text-[11.5px] font-medium text-zinc-600 dark:text-zinc-300"
                >
                  公称直径 ØD (0 ～ 3150 mm)
                </label>
                {fit.valid && (
                  <span className="font-mono text-[10.5px] text-indigo-600 dark:text-indigo-400">
                    分段 {fit.hole.stepLabel}
                  </span>
                )}
              </div>
              <div className="relative">
                <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 font-mono text-sm font-bold text-zinc-400">
                  Ø
                </span>
                <input
                  id="iso286-nominal"
                  type="number"
                  step="any"
                  min={0.1}
                  max={3150}
                  value={nominalText}
                  onChange={(e) => onChangeNominalText(e.target.value)}
                  className="precision-field w-full rounded-xl border border-zinc-200/95 dark:border-white/[0.12] bg-zinc-50/50 dark:bg-white/[0.03] pl-8 pr-12 py-2.5 font-mono text-base font-bold tabular-nums text-zinc-950 dark:text-white"
                />
                <span className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-xs font-mono text-zinc-400">
                  mm
                </span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {QUICK_DIAMETERS.map((d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => onChangeNominalText(String(d))}
                    className={cn(
                      "px-2 py-0.5 rounded-md font-mono text-[10.5px] tabular-nums transition-colors border",
                      nominalVal === d
                        ? "bg-zinc-900 dark:bg-white text-white dark:text-zinc-950 border-zinc-900 dark:border-white font-semibold"
                        : "bg-zinc-50 dark:bg-white/[0.03] text-zinc-600 dark:text-zinc-400 border-zinc-200/80 dark:border-white/[0.07] hover:border-zinc-300"
                    )}
                  >
                    Ø{d}
                  </button>
                ))}
              </div>
            </div>

            {/* Hole Tolerance Selector */}
            <div className="rounded-xl border border-indigo-200/75 dark:border-indigo-500/25 bg-indigo-50/40 dark:bg-indigo-500/[0.05] p-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-indigo-800 dark:text-indigo-200">
                  孔公差带 (Hole · 大写)
                </span>
                <span className="font-mono text-xs font-bold text-indigo-600 dark:text-indigo-300">
                  {holeLetter}
                  {holeGrade}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <PrecisionSelect
                  value={holeLetter}
                  options={holeLetterOptions}
                  onChange={(v) => {
                    onChangeHoleLetter(v);
                    if (v !== "H" && basis === "hole_basis") setBasis("custom");
                  }}
                />
                <PrecisionSelect
                  value={holeGrade}
                  options={gradeOptions}
                  onChange={onChangeHoleGrade}
                />
              </div>
              {fit.hole.valid && fit.hole.deltaAppliedMicrons !== 0 && (
                <div className="text-[10.5px] font-mono text-indigo-600/85 dark:text-indigo-300/85">
                  已应用 ISO 286-1 Δ 修正：+{fit.hole.deltaAppliedMicrons} µm
                </div>
              )}
            </div>

            {/* Shaft Tolerance Selector */}
            <div className="rounded-xl border border-amber-200/80 dark:border-amber-500/25 bg-amber-50/45 dark:bg-amber-500/[0.05] p-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-amber-800 dark:text-amber-200">
                  轴公差带 (Shaft · 小写)
                </span>
                <span className="font-mono text-xs font-bold text-amber-700 dark:text-amber-300">
                  {shaftLetter}
                  {shaftGrade}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <PrecisionSelect
                  value={shaftLetter}
                  options={shaftLetterOptions}
                  onChange={(v) => {
                    onChangeShaftLetter(v);
                    if (v !== "h" && basis === "shaft_basis") setBasis("custom");
                  }}
                />
                <PrecisionSelect
                  value={shaftGrade}
                  options={gradeOptions}
                  onChange={onChangeShaftGrade}
                />
              </div>
            </div>

            {fit.valid && (
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() =>
                    onAddToChecksheet({
                      featureName: `孔径 Ø${fit.nominalMm} ${fit.hole.designation}`,
                      mode: "iso286_hole",
                      nominal: fit.nominalMm,
                      iso286Letter: fit.hole.letter,
                      iso286Grade: fit.hole.grade,
                      measured: measHoleVal,
                      unit: "mm",
                    })
                  }
                  className="btn-tactile inline-flex items-center justify-center gap-1 px-2.5 py-2 rounded-xl border border-indigo-200 dark:border-indigo-500/30 bg-indigo-50/60 dark:bg-indigo-500/10 text-[11px] font-medium text-indigo-700 dark:text-indigo-200"
                >
                  <PlusCircle className="h-3.5 w-3.5" />
                  <span>孔加入检核单</span>
                </button>
                <button
                  type="button"
                  onClick={() =>
                    onAddToChecksheet({
                      featureName: `轴径 Ø${fit.nominalMm} ${fit.shaft.designation}`,
                      mode: "iso286_shaft",
                      nominal: fit.nominalMm,
                      iso286Letter: fit.shaft.letter,
                      iso286Grade: fit.shaft.grade,
                      measured: measShaftVal,
                      unit: "mm",
                    })
                  }
                  className="btn-tactile inline-flex items-center justify-center gap-1 px-2.5 py-2 rounded-xl border border-amber-200 dark:border-amber-500/30 bg-amber-50/70 dark:bg-amber-500/10 text-[11px] font-medium text-amber-800 dark:text-amber-200"
                >
                  <PlusCircle className="h-3.5 w-3.5" />
                  <span>轴加入检核单</span>
                </button>
              </div>
            )}
          </div>

          {/* Dual Actual Mating Measurement Verification */}
          <div className="rounded-2xl border border-zinc-200/90 dark:border-white/[0.09] bg-white dark:bg-[#111115] p-4 shadow-tactile space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-zinc-900 dark:text-zinc-100">
                实测孔轴配对试装校验
              </span>
              <span className="text-[10.5px] font-mono text-zinc-400">D实测 - d实测</span>
            </div>
            <div className="grid grid-cols-2 gap-2.5">
              <div className="space-y-1">
                <label className="text-[11px] font-medium text-indigo-600 dark:text-indigo-300">
                  实测孔径 (mm)
                </label>
                <input
                  type="number"
                  step="any"
                  value={measuredHoleText}
                  onChange={(e) => onChangeMeasuredHoleText(e.target.value)}
                  placeholder={fit.valid ? fit.hole.midSizeMm.toFixed(3) : ""}
                  className="precision-field w-full rounded-xl border border-zinc-200/95 dark:border-white/[0.12] bg-zinc-50/50 dark:bg-white/[0.03] px-2.5 py-1.5 font-mono text-xs font-semibold tabular-nums text-zinc-950 dark:text-white"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[11px] font-medium text-amber-700 dark:text-amber-300">
                  实测轴径 (mm)
                </label>
                <input
                  type="number"
                  step="any"
                  value={measuredShaftText}
                  onChange={(e) => onChangeMeasuredShaftText(e.target.value)}
                  placeholder={fit.valid ? fit.shaft.midSizeMm.toFixed(3) : ""}
                  className="precision-field w-full rounded-xl border border-zinc-200/95 dark:border-white/[0.12] bg-zinc-50/50 dark:bg-white/[0.03] px-2.5 py-1.5 font-mono text-xs font-semibold tabular-nums text-zinc-950 dark:text-white"
                />
              </div>
            </div>

            {matingStatus && (matingStatus.holeOk !== null || matingStatus.shaftOk !== null) && (
              <div className="space-y-2 pt-0.5">
                <div className="flex flex-wrap gap-2 text-[11px] font-mono">
                  {matingStatus.holeOk !== null && (
                    <span
                      className={cn(
                        "inline-flex items-center gap-1 px-2 py-0.5 rounded-md border font-semibold",
                        matingStatus.holeOk
                          ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-700 dark:text-emerald-300"
                          : "bg-rose-500/10 border-rose-500/30 text-rose-700 dark:text-rose-300"
                      )}
                    >
                      {matingStatus.holeOk ? (
                        <CheckCircle2 className="h-3 w-3" />
                      ) : (
                        <XCircle className="h-3 w-3" />
                      )}
                      孔 {matingStatus.holeOk ? "OK" : "NG"}
                    </span>
                  )}
                  {matingStatus.shaftOk !== null && (
                    <span
                      className={cn(
                        "inline-flex items-center gap-1 px-2 py-0.5 rounded-md border font-semibold",
                        matingStatus.shaftOk
                          ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-700 dark:text-emerald-300"
                          : "bg-rose-500/10 border-rose-500/30 text-rose-700 dark:text-rose-300"
                      )}
                    >
                      {matingStatus.shaftOk ? (
                        <CheckCircle2 className="h-3 w-3" />
                      ) : (
                        <XCircle className="h-3 w-3" />
                      )}
                      轴 {matingStatus.shaftOk ? "OK" : "NG"}
                    </span>
                  )}
                </div>

                {matingStatus.actualClearanceUm !== null && (
                  <div
                    className={cn(
                      "rounded-xl border px-3 py-2 text-xs font-mono tabular-nums",
                      matingStatus.clearanceInEnvelope
                        ? "bg-emerald-500/8 border-emerald-500/25 text-emerald-800 dark:text-emerald-300"
                        : "bg-rose-500/8 border-rose-500/30 text-rose-800 dark:text-rose-300"
                    )}
                  >
                    实测配对：
                    <strong>
                      {matingStatus.actualClearanceUm >= 0 ? "间隙 " : "过盈 "}
                      {formatSignedMicrons(matingStatus.actualClearanceUm)} µm
                    </strong>
                    <span className="block text-[10.5px] opacity-80 mt-0.5">
                      {matingStatus.clearanceInEnvelope
                        ? "实测配合量落在理论设计配合区间内"
                        : "实测配合量已超出设计配合极限范围"}
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>
        </aside>

        {/* Right Workspace: KPI Cards + SVG Diagram + Thermal Shrink-Fit */}
        <div className="xl:col-span-8 space-y-4">
          {!fit.valid ? (
            <div className="rounded-2xl border border-amber-500/35 bg-amber-500/8 p-6 flex items-start gap-3 text-sm text-amber-800 dark:text-amber-200">
              <AlertTriangle className="h-5 w-5 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <div className="font-semibold">当前配合组合超出 ISO 286-1 标准定义范围</div>
                <p className="text-xs opacity-90">{fit.error}</p>
              </div>
            </div>
          ) : (
            <>
              {/* Hero Fit Nature Banner + 3 KPI Cards */}
              <div className="rounded-2xl border border-zinc-200/90 dark:border-white/[0.09] bg-white dark:bg-[#111115] p-5 shadow-tactile space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5 flex-wrap">
                    <span className="font-mono text-2xl font-bold tracking-tight text-zinc-950 dark:text-white">
                      Ø{fit.nominalMm} {fit.fitCode}
                    </span>
                    <span
                      className={cn(
                        "px-2.5 py-0.5 rounded-full text-xs font-semibold border",
                        fit.fitNature === "clearance"
                          ? "bg-emerald-500/12 border-emerald-500/30 text-emerald-700 dark:text-emerald-300"
                          : fit.fitNature === "transition"
                            ? "bg-amber-500/12 border-amber-500/35 text-amber-800 dark:text-amber-300"
                            : "bg-rose-500/12 border-rose-500/30 text-rose-700 dark:text-rose-300"
                      )}
                    >
                      {fit.fitNatureLabel}
                    </span>
                  </div>
                  <span className="font-mono text-xs text-zinc-500 dark:text-zinc-400">
                    配合公差 Tf = {fit.fitToleranceMicrons} µm (
                    {(fit.fitToleranceMicrons / 1000).toFixed(3)} mm)
                  </span>
                </div>

                {/* 3 Detailed Cards: Hole / Shaft / Fit Extremes */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  {/* Hole Card */}
                  <div className="rounded-xl border border-indigo-200/80 dark:border-indigo-500/25 bg-indigo-50/40 dark:bg-indigo-500/[0.05] p-3.5 space-y-1.5">
                    <div className="flex items-center justify-between text-[11px] font-semibold text-indigo-700 dark:text-indigo-300">
                      <span>孔 {fit.hole.designation}</span>
                      <span className="font-mono">IT{fit.hole.grade} = {fit.hole.itMicrons} µm</span>
                    </div>
                    <div className="font-mono text-base font-bold tabular-nums text-zinc-950 dark:text-white">
                      ES {formatSignedMicrons(fit.hole.upperDevMicrons)} / EI{" "}
                      {formatSignedMicrons(fit.hole.lowerDevMicrons)}{" "}
                      <span className="text-xs font-normal text-zinc-400">µm</span>
                    </div>
                    <div className="font-mono text-[11px] tabular-nums text-zinc-600 dark:text-zinc-300">
                      {formatSignedMm(fit.hole.upperDevMm, holeDec)} /{" "}
                      {formatSignedMm(fit.hole.lowerDevMm, holeDec)} mm
                    </div>
                    <div className="pt-1 border-t border-indigo-200/60 dark:border-indigo-500/20 font-mono text-xs font-semibold tabular-nums text-indigo-900 dark:text-indigo-200">
                      {fit.hole.minSizeMm.toFixed(holeDec)} ～ {fit.hole.maxSizeMm.toFixed(holeDec)} mm
                    </div>
                  </div>

                  {/* Shaft Card */}
                  <div className="rounded-xl border border-amber-200/80 dark:border-amber-500/25 bg-amber-50/45 dark:bg-amber-500/[0.05] p-3.5 space-y-1.5">
                    <div className="flex items-center justify-between text-[11px] font-semibold text-amber-800 dark:text-amber-300">
                      <span>轴 {fit.shaft.designation}</span>
                      <span className="font-mono">IT{fit.shaft.grade} = {fit.shaft.itMicrons} µm</span>
                    </div>
                    <div className="font-mono text-base font-bold tabular-nums text-zinc-950 dark:text-white">
                      es {formatSignedMicrons(fit.shaft.upperDevMicrons)} / ei{" "}
                      {formatSignedMicrons(fit.shaft.lowerDevMicrons)}{" "}
                      <span className="text-xs font-normal text-zinc-400">µm</span>
                    </div>
                    <div className="font-mono text-[11px] tabular-nums text-zinc-600 dark:text-zinc-300">
                      {formatSignedMm(fit.shaft.upperDevMm, shaftDec)} /{" "}
                      {formatSignedMm(fit.shaft.lowerDevMm, shaftDec)} mm
                    </div>
                    <div className="pt-1 border-t border-amber-200/60 dark:border-amber-500/20 font-mono text-xs font-semibold tabular-nums text-amber-900 dark:text-amber-200">
                      {fit.shaft.minSizeMm.toFixed(shaftDec)} ～ {fit.shaft.maxSizeMm.toFixed(shaftDec)} mm
                    </div>
                  </div>

                  {/* Fit Extremes Card */}
                  <div className="rounded-xl border border-zinc-200/85 dark:border-white/[0.09] bg-zinc-50/75 dark:bg-white/[0.03] p-3.5 space-y-1.5">
                    <div className="flex items-center justify-between text-[11px] font-semibold text-zinc-600 dark:text-zinc-300">
                      <span>配合间隙 / 过盈极限</span>
                      <span className="font-mono">
                        {fit.fitNature === "transition"
                          ? `间隙比 ${fit.clearanceRatioPercent}%`
                          : "100% 确定"}
                      </span>
                    </div>
                    {fit.fitNature === "clearance" ? (
                      <>
                        <div className="font-mono text-base font-bold tabular-nums text-emerald-700 dark:text-emerald-300">
                          +{fit.minClearanceMicrons} ～ +{fit.maxClearanceMicrons}{" "}
                          <span className="text-xs font-normal text-zinc-400">µm</span>
                        </div>
                        <div className="font-mono text-[11px] text-zinc-500 dark:text-zinc-400">
                          Xmin +{(fit.minClearanceMicrons / 1000).toFixed(3)} / Xmax +
                          {(fit.maxClearanceMicrons / 1000).toFixed(3)} mm
                        </div>
                        <div className="pt-1 border-t border-zinc-200/70 dark:border-white/[0.07] font-mono text-xs text-zinc-700 dark:text-zinc-300">
                          平均间隙 +{fit.meanClearanceMicrons} µm
                        </div>
                      </>
                    ) : fit.fitNature === "interference" ? (
                      <>
                        <div className="font-mono text-base font-bold tabular-nums text-rose-700 dark:text-rose-300">
                          -{fit.minInterferenceMicrons} ～ -{fit.maxInterferenceMicrons}{" "}
                          <span className="text-xs font-normal text-zinc-400">µm</span>
                        </div>
                        <div className="font-mono text-[11px] text-zinc-500 dark:text-zinc-400">
                          Ymin -{(fit.minInterferenceMicrons / 1000).toFixed(3)} / Ymax -
                          {(fit.maxInterferenceMicrons / 1000).toFixed(3)} mm
                        </div>
                        <div className="pt-1 border-t border-zinc-200/70 dark:border-white/[0.07] font-mono text-xs text-zinc-700 dark:text-zinc-300">
                          平均过盈 {fit.meanClearanceMicrons} µm
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="font-mono text-base font-bold tabular-nums text-amber-700 dark:text-amber-300">
                          +{fit.maxClearanceMicrons} / -{fit.maxInterferenceMicrons}{" "}
                          <span className="text-xs font-normal text-zinc-400">µm</span>
                        </div>
                        <div className="font-mono text-[11px] text-zinc-500 dark:text-zinc-400">
                          最大间隙 +{(fit.maxClearanceMicrons / 1000).toFixed(3)} / 最大过盈 -
                          {(fit.maxInterferenceMicrons / 1000).toFixed(3)} mm
                        </div>
                        <div className="pt-1 border-t border-zinc-200/70 dark:border-white/[0.07] font-mono text-xs text-zinc-700 dark:text-zinc-300">
                          平均配合 {formatSignedMicrons(fit.meanClearanceMicrons)} µm
                        </div>
                      </>
                    )}
                  </div>
                </div>

                {fit.applicationHint && (
                  <div className="rounded-xl bg-zinc-50/80 dark:bg-white/[0.025] border border-zinc-200/70 dark:border-white/[0.06] px-3.5 py-2 text-[11.5px] text-zinc-600 dark:text-zinc-300">
                    <strong className="text-zinc-900 dark:text-zinc-100">典型工程应用：</strong>
                    {fit.applicationHint}
                  </div>
                )}
              </div>

              {/* Precision SVG Hole/Shaft Tolerance Zone Profile Diagram */}
              <FitZoneDiagram
                fit={fit}
                measuredHoleMm={measHoleVal}
                measuredShaftMm={measShaftVal}
              />

              {/* Thermal Shrink-Fit Reference (when interference is present) */}
              {fit.shrinkFitThermal && (
                <div className="rounded-2xl border border-rose-200/80 dark:border-rose-500/25 bg-rose-50/40 dark:bg-rose-500/[0.05] p-4 flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-start gap-2.5">
                    <div className="h-8 w-8 rounded-lg bg-rose-500/15 text-rose-600 dark:text-rose-300 flex items-center justify-center shrink-0">
                      <Flame className="h-4 w-4" />
                    </div>
                    <div>
                      <div className="text-xs font-semibold text-rose-900 dark:text-rose-200">
                        温差热装 / 冷装参考温升 ΔT（消除过盈所需最小温差）
                      </div>
                      <p className="text-[11px] text-rose-700/85 dark:text-rose-300/80 mt-0.5">
                        按线膨胀公式 ΔD = α·D·ΔT 估算（实际热装请额外预留 20～40 °C 装配间隙裕量）
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 font-mono text-xs">
                    <div className="px-3 py-1.5 rounded-lg bg-white/85 dark:bg-white/[0.06] border border-rose-200/70 dark:border-rose-500/25">
                      <span className="text-[10px] text-zinc-500 block">碳钢/合金钢 (α=11.5)</span>
                      <strong className="text-rose-700 dark:text-rose-300">
                        +{fit.shrinkFitThermal.steelMinDeltaC} ～ +{fit.shrinkFitThermal.steelMaxDeltaC} °C
                      </strong>
                    </div>
                    <div className="px-3 py-1.5 rounded-lg bg-white/85 dark:bg-white/[0.06] border border-rose-200/70 dark:border-rose-500/25">
                      <span className="text-[10px] text-zinc-500 block">铝合金 (α=23.0)</span>
                      <strong className="text-rose-700 dark:text-rose-300">
                        +{fit.shrinkFitThermal.aluminumMinDeltaC} ～ +{fit.shrinkFitThermal.aluminumMaxDeltaC} °C
                      </strong>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};
