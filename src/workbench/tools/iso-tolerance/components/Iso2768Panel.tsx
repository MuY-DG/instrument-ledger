import React, { useMemo, useState } from "react";
import { motion } from "motion/react";
import {
  AlertTriangle,
  CheckCircle2,
  Compass,
  PlusCircle,
  Ruler,
  Shapes,
  Sparkles,
  Triangle,
  XCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { TAP_SCALE_SUBTLE } from "@/lib/motion";
import type {
  ChecksheetItem,
  Iso2768GeomClass,
  Iso2768LinearClass,
  StandardSystemLabel,
} from "../types";
import {
  ISO2768_ANGULAR_TABLE,
  ISO2768_CHAMFER_TABLE,
  ISO2768_GEOM_CLASSES,
  ISO2768_GEOM_CLASS_META,
  ISO2768_LINEAR_CLASSES,
  ISO2768_LINEAR_CLASS_META,
  ISO2768_LINEAR_TABLE,
  ISO2768_PERPENDICULARITY_TABLE,
  ISO2768_RUNOUT_VALUES,
  ISO2768_STRAIGHTNESS_TABLE,
  ISO2768_SYMMETRY_TABLE,
  evaluateMeasurement,
  formatArcMinutesToDms,
  lookupIso2768Angular,
  lookupIso2768Geom,
  lookupIso2768Linear,
} from "../core/iso2768";
import { ISO2768_CALLOUT_PRESETS } from "../core/presets";
import { ToleranceBandGauge } from "./ToleranceBandGauge";

type Iso2768InputMode = "linear" | "chamfer" | "angular" | "gdt";
type GdtSubKind = "straightness_flatness" | "perpendicularity" | "symmetry" | "runout";

const QUICK_SIZES = [2, 5, 12, 25, 50, 100, 200, 500, 1200] as const;

interface Iso2768PanelProps {
  standardSystem: StandardSystemLabel;
  nominalText: string;
  onChangeNominalText: (v: string) => void;
  linearClass: Iso2768LinearClass;
  onChangeLinearClass: (v: Iso2768LinearClass) => void;
  geomClass: Iso2768GeomClass;
  onChangeGeomClass: (v: Iso2768GeomClass) => void;
  measuredText: string;
  onChangeMeasuredText: (v: string) => void;
  onAddToChecksheet: (item: Omit<ChecksheetItem, "id" | "balloonNo">) => void;
}

export const Iso2768Panel: React.FC<Iso2768PanelProps> = ({
  standardSystem,
  nominalText,
  onChangeNominalText,
  linearClass,
  onChangeLinearClass,
  geomClass,
  onChangeGeomClass,
  measuredText,
  onChangeMeasuredText,
  onAddToChecksheet,
}) => {
  const [mode, setMode] = useState<Iso2768InputMode>("linear");
  const [angleText, setAngleText] = useState<string>("90");
  const [shortSideText, setShortSideText] = useState<string>("35");
  const [gdtSubKind, setGdtSubKind] = useState<GdtSubKind>("straightness_flatness");
  const [tableTab, setTableTab] = useState<"linear" | "chamfer" | "angular" | "gdt">("linear");

  const nominalVal = useMemo(() => {
    const n = Number(nominalText);
    return Number.isFinite(n) && n > 0 ? n : 25;
  }, [nominalText]);

  const angleVal = useMemo(() => {
    const n = Number(angleText);
    return Number.isFinite(n) ? n : 90;
  }, [angleText]);

  const shortSideVal = useMemo(() => {
    const n = Number(shortSideText);
    return Number.isFinite(n) && n > 0 ? n : 35;
  }, [shortSideText]);

  const measuredVal = useMemo(() => {
    const s = measuredText.trim();
    if (!s) return null;
    const n = Number(s);
    return Number.isFinite(n) ? n : null;
  }, [measuredText]);

  const linearEval = useMemo(
    () =>
      lookupIso2768Linear(
        nominalVal,
        linearClass,
        mode === "chamfer" ? "chamfer" : "linear"
      ),
    [nominalVal, linearClass, mode]
  );

  const angularEval = useMemo(
    () => lookupIso2768Angular(angleVal, shortSideVal, linearClass),
    [angleVal, shortSideVal, linearClass]
  );

  const geomEval = useMemo(
    () => lookupIso2768Geom(nominalVal, geomClass, linearClass),
    [nominalVal, geomClass, linearClass]
  );

  const activeGdtLimit = useMemo(() => {
    if (gdtSubKind === "straightness_flatness") return geomEval.straightnessFlatness.valueMm;
    if (gdtSubKind === "perpendicularity") return geomEval.perpendicularity.valueMm;
    if (gdtSubKind === "symmetry") return geomEval.symmetry.valueMm;
    return geomEval.runout.valueMm;
  }, [geomEval, gdtSubKind]);

  // Unified measurement evaluation for current mode
  const measurementEval = useMemo(() => {
    if (mode === "linear" || mode === "chamfer") {
      if (linearEval.lowerLimitMm === null || linearEval.upperLimitMm === null) return null;
      return evaluateMeasurement({
        measured: measuredVal,
        nominal: nominalVal,
        lowerLimit: linearEval.lowerLimitMm,
        upperLimit: linearEval.upperLimitMm,
        unit: "mm",
      });
    }
    if (mode === "angular") {
      return evaluateMeasurement({
        measured: measuredVal,
        nominal: angleVal,
        lowerLimit: angularEval.lowerLimitDeg,
        upperLimit: angularEval.upperLimitDeg,
        unit: "°",
      });
    }
    if (activeGdtLimit === null) return null;
    return evaluateMeasurement({
      measured: measuredVal,
      nominal: 0,
      lowerLimit: 0,
      upperLimit: activeGdtLimit,
      unilateral: true,
      unit: "mm",
    });
  }, [mode, linearEval, angularEval, activeGdtLimit, measuredVal, nominalVal, angleVal]);

  const handleAddCurrent = () => {
    if (mode === "linear") {
      onAddToChecksheet({
        featureName: `未注线性尺寸 ${nominalVal} mm`,
        mode: "iso2768_linear",
        nominal: nominalVal,
        iso2768LinearClass: linearClass,
        measured: measuredVal,
        unit: "mm",
      });
    } else if (mode === "chamfer") {
      onAddToChecksheet({
        featureName: `未注倒圆/倒角 ${nominalVal} mm`,
        mode: "iso2768_chamfer",
        nominal: nominalVal,
        iso2768LinearClass: linearClass,
        measured: measuredVal,
        unit: "mm",
      });
    } else if (mode === "angular") {
      onAddToChecksheet({
        featureName: `未注角度 ${angleVal}° (短边 ${shortSideVal}mm)`,
        mode: "iso2768_angular",
        nominal: angleVal,
        shortSideMm: shortSideVal,
        iso2768LinearClass: linearClass,
        measured: measuredVal,
        unit: "°",
      });
    } else {
      const labelMap: Record<GdtSubKind, string> = {
        straightness_flatness: "直线度/平面度",
        perpendicularity: "垂直度",
        symmetry: "对称度",
        runout: "圆跳动",
      };
      onAddToChecksheet({
        featureName: `未注${labelMap[gdtSubKind]} (L=${nominalVal}mm)`,
        mode: "iso2768_gdt",
        nominal: nominalVal,
        iso2768GeomClass: geomClass,
        gdtKind: gdtSubKind,
        measured: measuredVal,
        unit: "mm",
      });
    }
  };

  const calloutLabel =
    standardSystem === "gb"
      ? `GB/T 1804-${linearClass} / 1184-${geomClass}`
      : `ISO 2768-${linearClass}${geomClass}`;

  return (
    <div className="space-y-4">
      {/* Quick Title-Block Callout Presets */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1">
        <span className="inline-flex items-center gap-1 text-[11px] font-medium text-zinc-400 dark:text-zinc-500 shrink-0">
          <Sparkles className="h-3 w-3 text-amber-500" />
          <span>图纸标题栏常用代号</span>
        </span>
        {ISO2768_CALLOUT_PRESETS.map((preset) => {
          const active =
            linearClass === preset.linearClass && geomClass === preset.geomClass;
          return (
            <motion.button
              key={preset.id}
              type="button"
              whileTap={TAP_SCALE_SUBTLE}
              onClick={() => {
                onChangeLinearClass(preset.linearClass);
                onChangeGeomClass(preset.geomClass);
              }}
              title={preset.description}
              className={cn(
                "shrink-0 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[11px] font-medium transition-colors",
                active
                  ? "border-amber-400 dark:border-amber-500/60 bg-amber-50/90 dark:bg-amber-500/15 text-amber-900 dark:text-amber-200 shadow-hairline"
                  : "border-zinc-200/90 dark:border-white/[0.08] bg-zinc-50/75 dark:bg-white/[0.03] hover:border-amber-300 dark:hover:border-amber-500/40 text-zinc-700 dark:text-zinc-300"
              )}
            >
              <span className="font-mono font-semibold">
                {standardSystem === "gb" ? preset.gbCallout : preset.callout}
              </span>
              <span className="text-[10.5px] opacity-75">{preset.label}</span>
            </motion.button>
          );
        })}
      </div>

      {/* 2-Column Main Workbench Grid */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-5 items-start">
        {/* Left Parameter & Live Measurement Rail */}
        <aside className="xl:col-span-4 space-y-4">
          <div className="rounded-2xl border border-zinc-200/90 dark:border-white/[0.09] bg-white dark:bg-[#111115] p-4 shadow-tactile space-y-4">
            {/* Feature Mode Segmented Picker */}
            <div className="space-y-1.5">
              <span className="text-xs font-semibold text-zinc-900 dark:text-zinc-100">
                查询要素类别
              </span>
              <div className="grid grid-cols-2 gap-1.5">
                {(
                  [
                    ["linear", "线性尺寸", Ruler],
                    ["chamfer", "倒圆 / 倒角", Triangle],
                    ["angular", "角度尺寸", Compass],
                    ["gdt", "未注形位", Shapes],
                  ] as const
                ).map(([id, label, Icon]) => {
                  const active = mode === id;
                  return (
                    <button
                      key={id}
                      type="button"
                      onClick={() => {
                        setMode(id);
                        setTableTab(id);
                        onChangeMeasuredText("");
                      }}
                      className={cn(
                        "flex items-center gap-1.5 px-2.5 py-2 rounded-xl border text-xs font-medium transition-all",
                        active
                          ? "bg-zinc-900 dark:bg-white text-white dark:text-zinc-950 border-zinc-900 dark:border-white shadow-tactile"
                          : "bg-zinc-50/70 dark:bg-white/[0.025] text-zinc-600 dark:text-zinc-300 border-zinc-200/80 dark:border-white/[0.08] hover:border-zinc-300 dark:hover:border-white/[0.16]"
                      )}
                    >
                      <Icon className="h-3.5 w-3.5 shrink-0" />
                      <span>{label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Nominal Dimension Inputs */}
            {mode !== "angular" ? (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label
                    htmlFor="iso2768-nominal"
                    className="text-[11.5px] font-medium text-zinc-600 dark:text-zinc-300"
                  >
                    {mode === "chamfer"
                      ? "倒圆半径 R / 倒角高度 C"
                      : mode === "gdt"
                        ? "要素公称长度 / 基准边长"
                        : "公称尺寸 (Nominal)"}
                  </label>
                  <span className="font-mono text-[10.5px] text-amber-600 dark:text-amber-400">
                    {mode === "gdt"
                      ? geomEval.straightnessFlatness.rangeLabel
                      : linearEval.rangeLabel}
                  </span>
                </div>
                <div className="relative">
                  <input
                    id="iso2768-nominal"
                    type="number"
                    step="any"
                    min={0.1}
                    max={4000}
                    value={nominalText}
                    onChange={(e) => onChangeNominalText(e.target.value)}
                    placeholder="输入公称尺寸..."
                    className="precision-field w-full rounded-xl border border-zinc-200/95 dark:border-white/[0.12] bg-zinc-50/50 dark:bg-white/[0.03] px-3.5 py-2.5 pr-12 font-mono text-base font-bold tabular-nums text-zinc-950 dark:text-white"
                  />
                  <span className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-xs font-mono text-zinc-400">
                    mm
                  </span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {QUICK_SIZES.map((sz) => (
                    <button
                      key={sz}
                      type="button"
                      onClick={() => onChangeNominalText(String(sz))}
                      className={cn(
                        "px-2 py-0.5 rounded-md font-mono text-[10.5px] tabular-nums transition-colors border",
                        nominalVal === sz
                          ? "bg-zinc-900 dark:bg-white text-white dark:text-zinc-950 border-zinc-900 dark:border-white font-semibold"
                          : "bg-zinc-50 dark:bg-white/[0.03] text-zinc-600 dark:text-zinc-400 border-zinc-200/80 dark:border-white/[0.07] hover:border-zinc-300 dark:hover:border-white/[0.18]"
                      )}
                    >
                      {sz}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2.5">
                <div className="space-y-1">
                  <label className="text-[11px] font-medium text-zinc-600 dark:text-zinc-300">
                    公称角度 (°)
                  </label>
                  <input
                    type="number"
                    step="any"
                    value={angleText}
                    onChange={(e) => setAngleText(e.target.value)}
                    className="precision-field w-full rounded-xl border border-zinc-200/95 dark:border-white/[0.12] bg-zinc-50/50 dark:bg-white/[0.03] px-3 py-2 font-mono text-sm font-bold tabular-nums text-zinc-950 dark:text-white"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[11px] font-medium text-zinc-600 dark:text-zinc-300">
                    角度短边长 L (mm)
                  </label>
                  <input
                    type="number"
                    step="any"
                    min={0.1}
                    value={shortSideText}
                    onChange={(e) => setShortSideText(e.target.value)}
                    className="precision-field w-full rounded-xl border border-zinc-200/95 dark:border-white/[0.12] bg-zinc-50/50 dark:bg-white/[0.03] px-3 py-2 font-mono text-sm font-bold tabular-nums text-zinc-950 dark:text-white"
                  />
                </div>
              </div>
            )}

            {/* Linear Class f/m/c/v */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-[11.5px] font-medium text-zinc-600 dark:text-zinc-300">
                  {standardSystem === "gb" ? "GB/T 1804 线性/角度等级" : "ISO 2768-1 尺寸公差等级"}
                </span>
                <span className="text-[10.5px] text-zinc-400">
                  {ISO2768_LINEAR_CLASS_META[linearClass].name}
                </span>
              </div>
              <div className="grid grid-cols-4 gap-1.5">
                {ISO2768_LINEAR_CLASSES.map((cls) => {
                  const active = linearClass === cls;
                  const meta = ISO2768_LINEAR_CLASS_META[cls];
                  return (
                    <button
                      key={cls}
                      type="button"
                      onClick={() => onChangeLinearClass(cls)}
                      className={cn(
                        "py-2 rounded-xl border text-center transition-all",
                        active
                          ? "bg-amber-500 text-white border-amber-500 shadow-tactile"
                          : "bg-zinc-50/70 dark:bg-white/[0.03] text-zinc-700 dark:text-zinc-300 border-zinc-200/80 dark:border-white/[0.08] hover:border-amber-300 dark:hover:border-amber-500/40"
                      )}
                    >
                      <div className="font-mono text-sm font-bold leading-none">{cls}</div>
                      <div className={cn("text-[10px] mt-1", active ? "text-amber-50" : "text-zinc-400")}>
                        {meta.name}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Geometric Class H/K/L */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-[11.5px] font-medium text-zinc-600 dark:text-zinc-300">
                  {standardSystem === "gb" ? "GB/T 1184 形位公差等级" : "ISO 2768-2 形位公差等级"}
                </span>
                <span className="text-[10.5px] text-zinc-400">
                  {ISO2768_GEOM_CLASS_META[geomClass].name}
                </span>
              </div>
              <div className="grid grid-cols-3 gap-1.5">
                {ISO2768_GEOM_CLASSES.map((cls) => {
                  const active = geomClass === cls;
                  return (
                    <button
                      key={cls}
                      type="button"
                      onClick={() => onChangeGeomClass(cls)}
                      className={cn(
                        "py-1.5 rounded-xl border text-center transition-all",
                        active
                          ? "bg-zinc-900 dark:bg-white text-white dark:text-zinc-950 border-zinc-900 dark:border-white shadow-tactile"
                          : "bg-zinc-50/70 dark:bg-white/[0.03] text-zinc-700 dark:text-zinc-300 border-zinc-200/80 dark:border-white/[0.08] hover:border-zinc-300"
                      )}
                    >
                      <span className="font-mono text-xs font-bold">{cls} 级</span>
                    </button>
                  );
                })}
              </div>
              {mode === "gdt" && (
                <div className="grid grid-cols-2 gap-1.5 pt-1">
                  {(
                    [
                      ["straightness_flatness", "直线度/平面度"],
                      ["perpendicularity", "垂直度"],
                      ["symmetry", "对称度"],
                      ["runout", "圆跳动"],
                    ] as const
                  ).map(([k, lbl]) => (
                    <button
                      key={k}
                      type="button"
                      onClick={() => setGdtSubKind(k)}
                      className={cn(
                        "px-2 py-1 rounded-lg text-[11px] font-medium border transition-colors",
                        gdtSubKind === k
                          ? "bg-amber-500/12 border-amber-400/70 text-amber-800 dark:text-amber-300"
                          : "border-zinc-200/70 dark:border-white/[0.07] text-zinc-500 dark:text-zinc-400"
                      )}
                    >
                      {lbl}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Live Measured Value Pass/Fail Evaluator */}
          <div className="rounded-2xl border border-zinc-200/90 dark:border-white/[0.09] bg-white dark:bg-[#111115] p-4 shadow-tactile space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-zinc-900 dark:text-zinc-100">
                现场实测值快速判合
              </span>
              <span className="text-[10.5px] font-mono text-zinc-400">
                ≥80% 临界预警
              </span>
            </div>
            <div className="relative">
              <input
                type="number"
                step="any"
                value={measuredText}
                onChange={(e) => onChangeMeasuredText(e.target.value)}
                placeholder={
                  mode === "angular"
                    ? `输入实测角度，如 ${(angleVal + 0.1).toFixed(2)}`
                    : mode === "gdt"
                      ? "输入实测形位误差，如 0.08"
                      : `输入实测尺寸，如 ${(nominalVal + 0.05).toFixed(2)}`
                }
                className="precision-field w-full rounded-xl border border-zinc-200/95 dark:border-white/[0.12] bg-zinc-50/50 dark:bg-white/[0.03] px-3.5 py-2 pr-12 font-mono text-sm font-semibold tabular-nums text-zinc-950 dark:text-white"
              />
              <span className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-xs font-mono text-zinc-400">
                {mode === "angular" ? "°" : "mm"}
              </span>
            </div>

            {measurementEval && measurementEval.measured !== null && (
              <div
                className={cn(
                  "rounded-xl border px-3 py-2.5 flex items-start gap-2.5",
                  measurementEval.verdict === "ng"
                    ? "bg-rose-500/8 border-rose-500/30 text-rose-700 dark:text-rose-300"
                    : measurementEval.verdict === "warning"
                      ? "bg-amber-500/10 border-amber-500/35 text-amber-800 dark:text-amber-300"
                      : "bg-emerald-500/8 border-emerald-500/30 text-emerald-700 dark:text-emerald-300"
                )}
              >
                {measurementEval.verdict === "ng" ? (
                  <XCircle className="h-4 w-4 shrink-0 mt-0.5" />
                ) : measurementEval.verdict === "warning" ? (
                  <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                ) : (
                  <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5" />
                )}
                <div className="min-w-0 space-y-0.5">
                  <div className="text-xs font-semibold">
                    {measurementEval.verdict === "ng"
                      ? "NG · 超出允许公差带"
                      : measurementEval.verdict === "warning"
                        ? "临界合格 · 接近公差边界"
                        : "OK · 符合标准公差要求"}
                  </div>
                  <div className="text-[11px] font-mono tabular-nums opacity-90">
                    {measurementEval.summaryText}
                    {mode !== "gdt" && measurementEval.deviationFromNominal !== null && (
                      <span>
                        {" "}
                        · 实测偏差{" "}
                        {measurementEval.deviationFromNominal >= 0 ? "+" : ""}
                        {measurementEval.deviationFromNominal.toFixed(4)}
                        {mode === "angular" ? "°" : " mm"}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            )}

            <button
              type="button"
              onClick={handleAddCurrent}
              className="btn-tactile w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl border border-zinc-200/95 dark:border-white/[0.1] bg-zinc-50 hover:bg-zinc-100 dark:bg-white/[0.04] dark:hover:bg-white/[0.08] text-xs font-medium text-zinc-800 dark:text-zinc-200"
            >
              <PlusCircle className="h-3.5 w-3.5 text-amber-500" />
              <span>加入批量尺寸检核单 (FAI / IQC)</span>
            </button>
          </div>
        </aside>

        {/* Right Result Workspace */}
        <div className="xl:col-span-8 space-y-4">
          {/* Hero KPI Card */}
          <div className="rounded-2xl border border-zinc-200/90 dark:border-white/[0.09] bg-white dark:bg-[#111115] p-5 shadow-tactile space-y-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="px-2 py-0.5 rounded-md bg-amber-500/12 border border-amber-500/25 font-mono text-xs font-bold text-amber-700 dark:text-amber-300">
                    {calloutLabel}
                  </span>
                  <span className="text-xs text-zinc-500 dark:text-zinc-400">
                    {mode === "angular"
                      ? angularEval.rangeLabel
                      : mode === "gdt"
                        ? `公称长度 ${nominalVal} mm`
                        : `尺寸分段 ${linearEval.rangeLabel}`}
                  </span>
                </div>
                <p className="text-[11.5px] text-zinc-500 dark:text-zinc-400 mt-1">
                  {ISO2768_LINEAR_CLASS_META[linearClass].process}
                </p>
              </div>

              <div className="text-right">
                <div className="text-[10.5px] uppercase tracking-wider text-zinc-400">
                  {mode === "angular"
                    ? "允许角度偏差"
                    : mode === "gdt"
                      ? "允许形位公差上限"
                      : "未注对称极限偏差"}
                </div>
                <div className="font-mono text-2xl font-bold tabular-nums text-zinc-950 dark:text-white">
                  {mode === "angular" ? (
                    <>
                      {angularEval.toleranceDms}
                      <span className="text-sm font-medium text-zinc-400 ml-1.5">
                        (±{angularEval.toleranceDeg.toFixed(3)}°)
                      </span>
                    </>
                  ) : mode === "gdt" ? (
                    activeGdtLimit !== null ? (
                      `≤ ${activeGdtLimit} mm`
                    ) : (
                      "无定义"
                    )
                  ) : linearEval.toleranceMm !== null ? (
                    `±${linearEval.toleranceMm} mm`
                  ) : (
                    "无定义"
                  )}
                </div>
              </div>
            </div>

            {/* Warning alert if out of ISO 2768 range */}
            {((mode === "linear" || mode === "chamfer") && linearEval.warning) ||
            (mode === "gdt" && geomEval.warning) ? (
              <div className="rounded-xl border border-amber-500/35 bg-amber-500/8 px-3.5 py-2.5 flex items-start gap-2 text-xs text-amber-800 dark:text-amber-300">
                <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                <span>{mode === "gdt" ? geomEval.warning : linearEval.warning}</span>
              </div>
            ) : null}

            {/* Limit Summary Strip */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              {mode === "angular" ? (
                <>
                  <div className="rounded-xl bg-zinc-50/80 dark:bg-white/[0.03] border border-zinc-200/75 dark:border-white/[0.07] p-3">
                    <div className="text-[10.5px] text-zinc-400">最小允许角度</div>
                    <div className="font-mono text-sm font-bold tabular-nums text-zinc-900 dark:text-white mt-0.5">
                      {angularEval.lowerLimitDeg.toFixed(3)}°
                    </div>
                  </div>
                  <div className="rounded-xl bg-zinc-50/80 dark:bg-white/[0.03] border border-zinc-200/75 dark:border-white/[0.07] p-3">
                    <div className="text-[10.5px] text-zinc-400">最大允许角度</div>
                    <div className="font-mono text-sm font-bold tabular-nums text-zinc-900 dark:text-white mt-0.5">
                      {angularEval.upperLimitDeg.toFixed(3)}°
                    </div>
                  </div>
                  <div className="rounded-xl bg-zinc-50/80 dark:bg-white/[0.03] border border-zinc-200/75 dark:border-white/[0.07] p-3">
                    <div className="text-[10.5px] text-zinc-400">角分换算</div>
                    <div className="font-mono text-sm font-bold tabular-nums text-zinc-900 dark:text-white mt-0.5">
                      ±{angularEval.toleranceArcMin}&apos;
                    </div>
                  </div>
                  <div className="rounded-xl bg-amber-500/8 dark:bg-amber-500/12 border border-amber-500/25 p-3">
                    <div className="text-[10.5px] text-amber-700 dark:text-amber-300">
                      短边端点弦偏 (L·tanΔθ)
                    </div>
                    <div className="font-mono text-sm font-bold tabular-nums text-amber-800 dark:text-amber-200 mt-0.5">
                      ±{angularEval.chordDeviationMm.toFixed(3)} mm
                    </div>
                  </div>
                </>
              ) : mode === "gdt" ? (
                <>
                  <div className="rounded-xl bg-zinc-50/80 dark:bg-white/[0.03] border border-zinc-200/75 dark:border-white/[0.07] p-3">
                    <div className="text-[10.5px] text-zinc-400">直线度 / 平面度</div>
                    <div className="font-mono text-sm font-bold tabular-nums text-zinc-900 dark:text-white mt-0.5">
                      {geomEval.straightnessFlatness.valueMm !== null
                        ? `${geomEval.straightnessFlatness.valueMm} mm`
                        : "—"}
                    </div>
                  </div>
                  <div className="rounded-xl bg-zinc-50/80 dark:bg-white/[0.03] border border-zinc-200/75 dark:border-white/[0.07] p-3">
                    <div className="text-[10.5px] text-zinc-400">垂直度 (短边)</div>
                    <div className="font-mono text-sm font-bold tabular-nums text-zinc-900 dark:text-white mt-0.5">
                      {geomEval.perpendicularity.valueMm !== null
                        ? `${geomEval.perpendicularity.valueMm} mm`
                        : "—"}
                    </div>
                  </div>
                  <div className="rounded-xl bg-zinc-50/80 dark:bg-white/[0.03] border border-zinc-200/75 dark:border-white/[0.07] p-3">
                    <div className="text-[10.5px] text-zinc-400">对称度 (长边)</div>
                    <div className="font-mono text-sm font-bold tabular-nums text-zinc-900 dark:text-white mt-0.5">
                      {geomEval.symmetry.valueMm !== null
                        ? `${geomEval.symmetry.valueMm} mm`
                        : "—"}
                    </div>
                  </div>
                  <div className="rounded-xl bg-zinc-50/80 dark:bg-white/[0.03] border border-zinc-200/75 dark:border-white/[0.07] p-3">
                    <div className="text-[10.5px] text-zinc-400">圆跳动 (全尺寸)</div>
                    <div className="font-mono text-sm font-bold tabular-nums text-zinc-900 dark:text-white mt-0.5">
                      {geomEval.runout.valueMm} mm
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <div className="rounded-xl bg-zinc-50/80 dark:bg-white/[0.03] border border-zinc-200/75 dark:border-white/[0.07] p-3">
                    <div className="text-[10.5px] text-zinc-400">最小极限 (LSL)</div>
                    <div className="font-mono text-sm font-bold tabular-nums text-zinc-900 dark:text-white mt-0.5">
                      {linearEval.lowerLimitMm !== null
                        ? `${linearEval.lowerLimitMm.toFixed(3)} mm`
                        : "—"}
                    </div>
                  </div>
                  <div className="rounded-xl bg-zinc-50/80 dark:bg-white/[0.03] border border-zinc-200/75 dark:border-white/[0.07] p-3">
                    <div className="text-[10.5px] text-zinc-400">最大极限 (USL)</div>
                    <div className="font-mono text-sm font-bold tabular-nums text-zinc-900 dark:text-white mt-0.5">
                      {linearEval.upperLimitMm !== null
                        ? `${linearEval.upperLimitMm.toFixed(3)} mm`
                        : "—"}
                    </div>
                  </div>
                  <div className="rounded-xl bg-zinc-50/80 dark:bg-white/[0.03] border border-zinc-200/75 dark:border-white/[0.07] p-3">
                    <div className="text-[10.5px] text-zinc-400">总公差带宽</div>
                    <div className="font-mono text-sm font-bold tabular-nums text-zinc-900 dark:text-white mt-0.5">
                      {linearEval.bandWidthMm !== null
                        ? `${linearEval.bandWidthMm.toFixed(3)} mm`
                        : "—"}
                    </div>
                  </div>
                  <div className="rounded-xl bg-zinc-50/80 dark:bg-white/[0.03] border border-zinc-200/75 dark:border-white/[0.07] p-3">
                    <div className="text-[10.5px] text-zinc-400">微米换算</div>
                    <div className="font-mono text-sm font-bold tabular-nums text-zinc-900 dark:text-white mt-0.5">
                      {linearEval.toleranceMm !== null
                        ? `±${Math.round(linearEval.toleranceMm * 1000)} µm`
                        : "—"}
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* Interactive SVG Tolerance Band Gauge */}
            {mode !== "gdt" &&
            (mode === "angular" ||
              (linearEval.lowerLimitMm !== null && linearEval.upperLimitMm !== null)) ? (
              <ToleranceBandGauge
                nominal={mode === "angular" ? angleVal : nominalVal}
                lowerLimit={
                  mode === "angular"
                    ? angularEval.lowerLimitDeg
                    : linearEval.lowerLimitMm!
                }
                upperLimit={
                  mode === "angular"
                    ? angularEval.upperLimitDeg
                    : linearEval.upperLimitMm!
                }
                unit={mode === "angular" ? "°" : "mm"}
                decimals={mode === "angular" ? 3 : 3}
                evaluation={measurementEval}
              />
            ) : mode === "gdt" && activeGdtLimit !== null ? (
              <ToleranceBandGauge
                nominal={0}
                lowerLimit={0}
                upperLimit={activeGdtLimit}
                unilateral
                unit="mm"
                decimals={3}
                evaluation={measurementEval}
              />
            ) : null}

            {/* 4-Class Side-by-Side Comparison Strip */}
            <div className="grid grid-cols-4 gap-2">
              {ISO2768_LINEAR_CLASSES.map((cls) => {
                const active = linearClass === cls;
                const valStr =
                  mode === "angular"
                    ? angularEval.allClasses[cls].dms
                    : linearEval.allClasses[cls] !== null
                      ? `±${linearEval.allClasses[cls]} mm`
                      : "—";
                return (
                  <button
                    key={cls}
                    type="button"
                    onClick={() => onChangeLinearClass(cls)}
                    className={cn(
                      "rounded-xl border px-3 py-2 text-left transition-all",
                      active
                        ? "border-amber-400/90 dark:border-amber-500/60 bg-amber-50/75 dark:bg-amber-500/12"
                        : "border-zinc-200/80 dark:border-white/[0.07] bg-zinc-50/40 dark:bg-white/[0.02] hover:border-zinc-300 dark:hover:border-white/[0.15]"
                    )}
                  >
                    <div className="flex items-center justify-between text-[10.5px]">
                      <span className="font-mono font-bold text-zinc-700 dark:text-zinc-200">
                        {cls} 级
                      </span>
                      <span className="text-zinc-400">
                        {ISO2768_LINEAR_CLASS_META[cls].name}
                      </span>
                    </div>
                    <div className="font-mono text-sm font-bold tabular-nums text-zinc-950 dark:text-white mt-1">
                      {valStr}
                    </div>
                  </button>
                );
              })}
            </div>

            {/* ISO 2768-2 Derived Engineering Caps */}
            <div className="rounded-xl border border-zinc-200/75 dark:border-white/[0.07] bg-zinc-50/60 dark:bg-white/[0.02] px-3.5 py-2.5 flex flex-wrap items-center justify-between gap-2 text-[11px] text-zinc-600 dark:text-zinc-300">
              <span>
                <strong className="text-zinc-900 dark:text-zinc-100">
                  ISO 2768-2 ({geomClass} 级) 联动形位：
                </strong>
                直线/平面 ≤{" "}
                <b className="font-mono">{geomEval.straightnessFlatness.valueMm ?? "—"}</b> · 垂直 ≤{" "}
                <b className="font-mono">{geomEval.perpendicularity.valueMm ?? "—"}</b> · 对称 ≤{" "}
                <b className="font-mono">{geomEval.symmetry.valueMm ?? "—"}</b> · 圆跳动 ≤{" "}
                <b className="font-mono">{geomEval.runout.valueMm}</b> mm
              </span>
              {geomEval.derivedCircularityMaxMm !== null && (
                <span className="font-mono text-[10.5px] text-amber-700 dark:text-amber-300">
                  派生上限：圆度 ≤ {geomEval.derivedCircularityMaxMm} · 平行度 ≤{" "}
                  {geomEval.derivedParallelismMaxMm} mm
                </span>
              )}
            </div>
          </div>

          {/* Interactive Full Reference Tables */}
          <div className="rounded-2xl border border-zinc-200/90 dark:border-white/[0.09] bg-white dark:bg-[#111115] overflow-hidden shadow-tactile">
            <div className="px-4 py-2.5 border-b border-zinc-200/80 dark:border-white/[0.07] bg-zinc-50/70 dark:bg-white/[0.02] flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs font-semibold text-zinc-900 dark:text-zinc-100">
                完整标准对照表（点击单元格快速定位）
              </span>
              <div className="inline-flex items-center p-0.5 rounded-lg bg-zinc-200/65 dark:bg-white/[0.05] text-[11px]">
                {(
                  [
                    ["linear", "表1 线性尺寸"],
                    ["chamfer", "表2 倒圆倒角"],
                    ["angular", "表3 角度尺寸"],
                    ["gdt", "ISO 2768-2 形位"],
                  ] as const
                ).map(([id, lbl]) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setTableTab(id)}
                    className={cn(
                      "px-2 py-0.5 rounded-md font-medium transition-colors",
                      tableTab === id
                        ? "bg-white dark:bg-white/[0.12] text-zinc-950 dark:text-white shadow-hairline"
                        : "text-zinc-500 dark:text-zinc-400"
                    )}
                  >
                    {lbl}
                  </button>
                ))}
              </div>
            </div>

            <div className="overflow-x-auto">
              {(tableTab === "linear" || tableTab === "chamfer") && (
                <table className="w-full text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-zinc-200/80 dark:border-white/[0.07] bg-zinc-50/50 dark:bg-white/[0.015] text-zinc-500 dark:text-zinc-400">
                      <th className="py-2 px-3 text-left font-medium">公称尺寸分段 (mm)</th>
                      {ISO2768_LINEAR_CLASSES.map((c) => (
                        <th
                          key={c}
                          className={cn(
                            "py-2 px-3 text-center font-mono font-semibold",
                            linearClass === c && "text-amber-600 dark:text-amber-300 bg-amber-500/8"
                          )}
                        >
                          {c} ({ISO2768_LINEAR_CLASS_META[c].name})
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100 dark:divide-white/[0.05]">
                    {(tableTab === "chamfer" ? ISO2768_CHAMFER_TABLE : ISO2768_LINEAR_TABLE).map(
                      (row) => {
                        const rowActive = linearEval.rangeId === row.id;
                        return (
                          <tr
                            key={row.id}
                            className={cn(
                              "transition-colors",
                              rowActive
                                ? "bg-amber-500/[0.06] dark:bg-amber-500/[0.08]"
                                : "hover:bg-zinc-50/70 dark:hover:bg-white/[0.02]"
                            )}
                          >
                            <td className="py-2 px-3 font-mono font-medium text-zinc-700 dark:text-zinc-300">
                              {row.label}
                            </td>
                            {ISO2768_LINEAR_CLASSES.map((c) => {
                              const val = row[c];
                              const isCellActive = rowActive && linearClass === c;
                              return (
                                <td
                                  key={c}
                                  onClick={() => {
                                    onChangeLinearClass(c);
                                    const sampleNominal =
                                      row.max !== null
                                        ? Number(((row.min + row.max) / 2).toFixed(1))
                                        : row.min + 4;
                                    onChangeNominalText(String(sampleNominal));
                                    setMode(tableTab);
                                  }}
                                  className={cn(
                                    "py-2 px-3 text-center font-mono tabular-nums cursor-pointer transition-colors",
                                    isCellActive
                                      ? "bg-amber-500 text-white font-bold"
                                      : linearClass === c
                                        ? "bg-amber-500/[0.05] text-zinc-900 dark:text-zinc-100 font-semibold"
                                        : "text-zinc-600 dark:text-zinc-400"
                                  )}
                                >
                                  {val !== null ? `±${val}` : "—"}
                                </td>
                              );
                            })}
                          </tr>
                        );
                      }
                    )}
                  </tbody>
                </table>
              )}

              {tableTab === "angular" && (
                <table className="w-full text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-zinc-200/80 dark:border-white/[0.07] bg-zinc-50/50 dark:bg-white/[0.015] text-zinc-500 dark:text-zinc-400">
                      <th className="py-2 px-3 text-left font-medium">角度短边长度 (mm)</th>
                      {ISO2768_LINEAR_CLASSES.map((c) => (
                        <th
                          key={c}
                          className={cn(
                            "py-2 px-3 text-center font-mono font-semibold",
                            linearClass === c && "text-amber-600 dark:text-amber-300 bg-amber-500/8"
                          )}
                        >
                          {c} 级
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100 dark:divide-white/[0.05]">
                    {ISO2768_ANGULAR_TABLE.map((row) => {
                      const rowActive = angularEval.rangeId === row.id;
                      return (
                        <tr
                          key={row.id}
                          className={cn(
                            rowActive && "bg-amber-500/[0.06] dark:bg-amber-500/[0.08]"
                          )}
                        >
                          <td className="py-2 px-3 font-mono font-medium text-zinc-700 dark:text-zinc-300">
                            {row.label}
                          </td>
                          {ISO2768_LINEAR_CLASSES.map((c) => {
                            const isCellActive = rowActive && linearClass === c;
                            return (
                              <td
                                key={c}
                                onClick={() => {
                                  onChangeLinearClass(c);
                                  setShortSideText(
                                    String(row.max ? Math.round((row.min + row.max) / 2) : 500)
                                  );
                                  setMode("angular");
                                }}
                                className={cn(
                                  "py-2 px-3 text-center font-mono tabular-nums cursor-pointer",
                                  isCellActive
                                    ? "bg-amber-500 text-white font-bold"
                                    : "text-zinc-600 dark:text-zinc-400"
                                )}
                              >
                                {formatArcMinutesToDms(row[c])}
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}

              {tableTab === "gdt" && (
                <div className="p-3.5 grid grid-cols-1 md:grid-cols-2 gap-3.5">
                  {[
                    { title: "直线度与平面度 (mm)", rows: ISO2768_STRAIGHTNESS_TABLE },
                    { title: "垂直度 (按短边, mm)", rows: ISO2768_PERPENDICULARITY_TABLE },
                    { title: "对称度 (按长边, mm)", rows: ISO2768_SYMMETRY_TABLE },
                  ].map((tbl) => (
                    <div
                      key={tbl.title}
                      className="rounded-xl border border-zinc-200/80 dark:border-white/[0.08] overflow-hidden"
                    >
                      <div className="px-3 py-1.5 bg-zinc-50 dark:bg-white/[0.03] text-[11px] font-semibold text-zinc-700 dark:text-zinc-200 border-b border-zinc-200/70 dark:border-white/[0.06]">
                        {tbl.title}
                      </div>
                      <table className="w-full text-[11.5px]">
                        <thead>
                          <tr className="text-zinc-400 border-b border-zinc-100 dark:border-white/[0.05]">
                            <th className="py-1.5 px-2.5 text-left font-medium">公称长度</th>
                            {ISO2768_GEOM_CLASSES.map((g) => (
                              <th
                                key={g}
                                className={cn(
                                  "py-1.5 px-2 text-center font-mono",
                                  geomClass === g && "text-amber-600 dark:text-amber-300"
                                )}
                              >
                                {g}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-zinc-100 dark:divide-white/[0.04]">
                          {tbl.rows.map((r) => (
                            <tr key={r.id}>
                              <td className="py-1.5 px-2.5 font-mono text-zinc-600 dark:text-zinc-400">
                                {r.label}
                              </td>
                              {ISO2768_GEOM_CLASSES.map((g) => (
                                <td
                                  key={g}
                                  onClick={() => onChangeGeomClass(g)}
                                  className={cn(
                                    "py-1.5 px-2 text-center font-mono tabular-nums cursor-pointer",
                                    geomClass === g
                                      ? "font-bold text-zinc-950 dark:text-white bg-amber-500/10"
                                      : "text-zinc-500 dark:text-zinc-400"
                                  )}
                                >
                                  {r[g]}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ))}
                  {/* Circular Runout mini card */}
                  <div className="rounded-xl border border-zinc-200/80 dark:border-white/[0.08] p-3 flex flex-col justify-between bg-zinc-50/40 dark:bg-white/[0.02]">
                    <div>
                      <div className="text-[11px] font-semibold text-zinc-800 dark:text-zinc-200">
                        圆跳动（全尺寸段通用，mm）
                      </div>
                      <p className="text-[10.5px] text-zinc-500 dark:text-zinc-400 mt-0.5">
                        ISO 2768-2 表 4 规定圆跳动未注公差与公称尺寸无关，同时作为圆度的上限约束。
                      </p>
                    </div>
                    <div className="grid grid-cols-3 gap-2 pt-3">
                      {ISO2768_GEOM_CLASSES.map((g) => (
                        <button
                          key={g}
                          type="button"
                          onClick={() => onChangeGeomClass(g)}
                          className={cn(
                            "rounded-lg border py-2 text-center font-mono transition-colors",
                            geomClass === g
                              ? "bg-zinc-900 dark:bg-white text-white dark:text-zinc-950 border-zinc-900 dark:border-white font-bold"
                              : "bg-white dark:bg-white/[0.04] border-zinc-200/80 dark:border-white/[0.08] text-zinc-600 dark:text-zinc-300"
                          )}
                        >
                          <div className="text-[10px] opacity-75">{g} 级</div>
                          <div className="text-sm">{ISO2768_RUNOUT_VALUES[g]}</div>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
