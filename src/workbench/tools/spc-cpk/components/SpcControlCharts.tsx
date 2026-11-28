import React, { useMemo, useState } from "react";
import { Activity, AlertTriangle, CheckCircle2, Info, ShieldAlert } from "lucide-react";
import { cn } from "@/lib/utils";
import { PrecisionSwitch } from "@/components/ui/FormControls";
import type {
  ControlLimits,
  NelsonPresetId,
  NelsonRuleId,
  NelsonViolation,
  SpcAnalysisResult,
} from "../types";
import { NELSON_RULES, NELSON_RULE_PRESETS } from "../core/nelson";
import { inferDisplayDecimals } from "../core/parser";

interface SpcControlChartsProps {
  result: SpcAnalysisResult;
  unit: string;
  enabledRules: NelsonRuleId[];
  onChangeRules: (rules: NelsonRuleId[]) => void;
}

const VIEW_W = 820;
const PRIMARY_H = 250;
const SECONDARY_H = 195;
const PAD = { top: 22, right: 86, bottom: 30, left: 56 };
const PLOT_W = VIEW_W - PAD.left - PAD.right;

export const SpcControlCharts: React.FC<SpcControlChartsProps> = ({
  result,
  unit,
  enabledRules,
  onChangeRules,
}) => {
  const [showZones, setShowZones] = useState(true);
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const [focusedViolationIdx, setFocusedViolationIdx] = useState<number | null>(null);

  const dec = inferDisplayDecimals(
    result.spec.usl !== null && result.spec.lsl !== null
      ? result.spec.usl - result.spec.lsl
      : result.range
  );

  const count = result.primarySeries.length;
  const focusedPoints = useMemo(() => {
    if (focusedViolationIdx === null || !result.violations[focusedViolationIdx]) {
      return null;
    }
    return new Set(result.violations[focusedViolationIdx].pointIndices);
  }, [focusedViolationIdx, result.violations]);

  const toX = (i: number) =>
    count <= 1 ? PAD.left + PLOT_W / 2 : PAD.left + (i / (count - 1)) * PLOT_W;

  const primaryBounds = useMemo(() => {
    const { ucl, lcl, cl } = result.primaryLimits;
    const all = [...result.primarySeries, ucl, lcl, cl];
    const lo = Math.min(...all);
    const hi = Math.max(...all);
    const span = Math.max(hi - lo, 1e-6);
    return { yMin: lo - span * 0.14, yMax: hi + span * 0.14 };
  }, [result.primarySeries, result.primaryLimits]);

  const secondaryBounds = useMemo(() => {
    const { ucl, lcl, cl } = result.secondaryLimits;
    const nums = result.secondarySeries.filter((v): v is number => v !== null);
    const all = [...nums, ucl, lcl, cl, 0];
    const lo = Math.min(...all);
    const hi = Math.max(...all);
    const span = Math.max(hi - lo, 1e-6);
    return { yMin: Math.max(0, lo - span * 0.08), yMax: hi + span * 0.16 };
  }, [result.secondarySeries, result.secondaryLimits]);

  const mapY = (v: number, yMin: number, yMax: number, h: number) => {
    const plotH = h - PAD.top - PAD.bottom;
    return PAD.top + (1 - (v - yMin) / (yMax - yMin)) * plotH;
  };

  const primaryPolyline = useMemo(
    () =>
      result.primarySeries
        .map((v, i) => `${toX(i).toFixed(1)},${mapY(v, primaryBounds.yMin, primaryBounds.yMax, PRIMARY_H).toFixed(1)}`)
        .join(" "),
    [result.primarySeries, primaryBounds, count]
  );

  const secondaryPath = useMemo(() => {
    let d = "";
    let started = false;
    result.secondarySeries.forEach((v, i) => {
      if (v === null) {
        started = false;
        return;
      }
      const x = toX(i).toFixed(1);
      const y = mapY(v, secondaryBounds.yMin, secondaryBounds.yMax, SECONDARY_H).toFixed(1);
      d += `${started ? " L" : "M"}${x},${y}`;
      started = true;
    });
    return d;
  }, [result.secondarySeries, secondaryBounds, count]);

  const xLabelStep = Math.max(1, Math.ceil(count / 14));

  const handleSvgMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    if (count === 0) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const relX = ((e.clientX - rect.left) / rect.width) * VIEW_W;
    if (relX < PAD.left - 10 || relX > VIEW_W - PAD.right + 10) {
      setHoverIdx(null);
      return;
    }
    const frac = Math.max(0, Math.min(1, (relX - PAD.left) / PLOT_W));
    const idx = count <= 1 ? 0 : Math.round(frac * (count - 1));
    setHoverIdx(idx);
  };

  const toggleRule = (id: NelsonRuleId) => {
    const set = new Set(enabledRules);
    if (set.has(id)) {
      set.delete(id);
    } else {
      set.add(id);
    }
    onChangeRules(Array.from(set).sort((a, b) => a - b));
  };

  const applyRulePreset = (presetId: NelsonPresetId) => {
    onChangeRules([...NELSON_RULE_PRESETS[presetId].rules]);
    setFocusedViolationIdx(null);
  };

  const hoveredSubgroup = hoverIdx !== null ? result.subgroups[hoverIdx] : null;
  const hoveredViolations: NelsonViolation[] =
    hoverIdx !== null
      ? result.violations.filter((v) => v.pointIndices.includes(hoverIdx))
      : [];

  const renderLimits = (
    limits: ControlLimits,
    yMin: number,
    yMax: number,
    h: number,
    showSigmaZones: boolean
  ) => {
    const yUcl = mapY(limits.ucl, yMin, yMax, h);
    const yCl = mapY(limits.cl, yMin, yMax, h);
    const yLcl = mapY(limits.lcl, yMin, yMax, h);
    const yPlus1 = mapY(limits.cl + limits.sigma, yMin, yMax, h);
    const yMinus1 = mapY(limits.cl - limits.sigma, yMin, yMax, h);
    const yPlus2 = mapY(limits.cl + 2 * limits.sigma, yMin, yMax, h);
    const yMinus2 = mapY(limits.cl - 2 * limits.sigma, yMin, yMax, h);

    return (
      <g className="pointer-events-none">
        {showSigmaZones && limits.sigma > 0 && (
          <>
            {/* Zone C (±1σ) */}
            <rect
              x={PAD.left}
              y={yPlus1}
              width={PLOT_W}
              height={Math.max(0, yMinus1 - yPlus1)}
              className="fill-emerald-500/[0.045] dark:fill-emerald-400/[0.05]"
            />
            {/* Zone B (±1σ..±2σ) */}
            <rect
              x={PAD.left}
              y={yPlus2}
              width={PLOT_W}
              height={Math.max(0, yPlus1 - yPlus2)}
              className="fill-amber-500/[0.04] dark:fill-amber-400/[0.045]"
            />
            <rect
              x={PAD.left}
              y={yMinus1}
              width={PLOT_W}
              height={Math.max(0, yMinus2 - yMinus1)}
              className="fill-amber-500/[0.04] dark:fill-amber-400/[0.045]"
            />
            {/* Zone A (±2σ..±3σ) */}
            <rect
              x={PAD.left}
              y={yUcl}
              width={PLOT_W}
              height={Math.max(0, yPlus2 - yUcl)}
              className="fill-rose-500/[0.04] dark:fill-rose-400/[0.045]"
            />
            <rect
              x={PAD.left}
              y={yMinus2}
              width={PLOT_W}
              height={Math.max(0, yLcl - yMinus2)}
              className="fill-rose-500/[0.04] dark:fill-rose-400/[0.045]"
            />

            {[yPlus1, yMinus1, yPlus2, yMinus2].map((zy, i) => (
              <line
                key={i}
                x1={PAD.left}
                y1={zy}
                x2={VIEW_W - PAD.right}
                y2={zy}
                stroke="currentColor"
                className="text-zinc-300/60 dark:text-white/[0.07]"
                strokeDasharray="2 4"
                strokeWidth={0.85}
              />
            ))}
          </>
        )}

        {/* UCL */}
        <line
          x1={PAD.left}
          y1={yUcl}
          x2={VIEW_W - PAD.right}
          y2={yUcl}
          stroke="#f43f5e"
          strokeDasharray="5 4"
          strokeWidth={1.4}
        />
        <text
          x={VIEW_W - PAD.right + 6}
          y={yUcl + 3.5}
          className="text-[9.5px] font-mono font-semibold fill-rose-600 dark:fill-rose-400"
        >
          UCL {limits.ucl.toFixed(dec)}
        </text>

        {/* CL */}
        <line
          x1={PAD.left}
          y1={yCl}
          x2={VIEW_W - PAD.right}
          y2={yCl}
          stroke="#10b981"
          strokeWidth={1.45}
        />
        <text
          x={VIEW_W - PAD.right + 6}
          y={yCl + 3.5}
          className="text-[9.5px] font-mono font-semibold fill-emerald-600 dark:fill-emerald-400"
        >
          CL {limits.cl.toFixed(dec)}
        </text>

        {/* LCL */}
        <line
          x1={PAD.left}
          y1={yLcl}
          x2={VIEW_W - PAD.right}
          y2={yLcl}
          stroke="#f43f5e"
          strokeDasharray="5 4"
          strokeWidth={1.4}
        />
        <text
          x={VIEW_W - PAD.right + 6}
          y={yLcl + 3.5}
          className="text-[9.5px] font-mono font-semibold fill-rose-600 dark:fill-rose-400"
        >
          LCL {limits.lcl.toFixed(dec)}
        </text>
      </g>
    );
  };

  return (
    <div className="space-y-4">
      {/* Nelson Rules Selector & Status Strip */}
      <div className="rounded-2xl border border-zinc-200/90 dark:border-white/[0.09] bg-white dark:bg-[#111115] p-3.5 shadow-tactile space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2.5">
          <div className="flex items-center gap-2">
            {result.isInControl ? (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-500/12 text-emerald-700 dark:text-emerald-300 text-xs font-semibold">
                <CheckCircle2 className="h-3.5 w-3.5" />
                <span>过程统计受控 (0 处判异)</span>
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-rose-500/12 text-rose-700 dark:text-rose-300 text-xs font-semibold">
                <ShieldAlert className="h-3.5 w-3.5" />
                <span>检出 {result.violations.length} 处 Nelson 判异信号</span>
              </span>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {(Object.keys(NELSON_RULE_PRESETS) as NelsonPresetId[]).map((pid) => {
              const p = NELSON_RULE_PRESETS[pid];
              const isMatch =
                p.rules.length === enabledRules.length &&
                p.rules.every((r, i) => enabledRules[i] === r);
              return (
                <button
                  key={pid}
                  type="button"
                  onClick={() => applyRulePreset(pid)}
                  className={cn(
                    "px-2 py-1 rounded-md text-[11px] font-medium border transition-colors",
                    isMatch
                      ? "bg-zinc-900 dark:bg-white text-white dark:text-zinc-950 border-zinc-900 dark:border-white"
                      : "bg-zinc-50 dark:bg-white/[0.03] text-zinc-600 dark:text-zinc-300 border-zinc-200/85 dark:border-white/[0.08] hover:border-zinc-300"
                  )}
                >
                  {p.label}
                </button>
              );
            })}

            <label className="inline-flex items-center gap-1.5 ml-1 text-[11px] text-zinc-500 dark:text-zinc-400 cursor-pointer select-none">
              <PrecisionSwitch
                size="sm"
                checked={showZones}
                onChange={setShowZones}
                ariaLabel="显示 ±1σ/±2σ/±3σ 分区色带"
              />
              <span>A/B/C 分区</span>
            </label>
          </div>
        </div>

        {/* Individual R1..R8 Toggle Pills */}
        <div className="flex flex-wrap gap-1.5">
          {NELSON_RULES.map((rule) => {
            const enabled = enabledRules.includes(rule.id);
            const hitCount = result.violations.filter(
              (v) => v.ruleId === rule.id
            ).length;
            return (
              <button
                key={rule.id}
                type="button"
                onClick={() => toggleRule(rule.id)}
                title={`${rule.description}\n常见原因：${rule.typicalCause}`}
                className={cn(
                  "inline-flex items-center gap-1 px-2 py-1 rounded-lg border text-[11px] transition-all",
                  enabled
                    ? hitCount > 0
                      ? "bg-rose-500/12 border-rose-400/60 text-rose-700 dark:text-rose-300 font-semibold"
                      : "bg-indigo-500/10 border-indigo-400/45 text-indigo-700 dark:text-indigo-300 font-medium"
                    : "bg-zinc-50/70 dark:bg-white/[0.02] border-zinc-200/80 dark:border-white/[0.07] text-zinc-400 dark:text-zinc-500"
                )}
              >
                <span className="font-mono font-bold">{rule.code}</span>
                <span>{rule.shortName}</span>
                {hitCount > 0 && (
                  <span className="px-1 rounded-full bg-rose-500 text-white font-mono text-[9.5px]">
                    {hitCount}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Dual Stacked SPC Control Charts Card */}
      <div className="rounded-2xl border border-zinc-200/90 dark:border-white/[0.09] bg-white dark:bg-[#111115] shadow-tactile overflow-hidden">
        {/* Primary Chart Header */}
        <div className="px-4 py-2.5 border-b border-zinc-200/75 dark:border-white/[0.06] bg-zinc-50/70 dark:bg-white/[0.02] flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Activity className="h-4 w-4 text-indigo-500" />
            <h3 className="text-xs font-semibold text-zinc-900 dark:text-zinc-100">
              {result.primaryChartTitle}
            </h3>
            <span className="text-[10.5px] font-mono text-zinc-400">
              共 {result.subgroups.length} 个{result.subgroupSize === 1 ? "单值点" : "子组"}
            </span>
          </div>
          <div className="flex items-center gap-3 text-[10.5px] font-mono text-zinc-500 dark:text-zinc-400">
            <span>UCL {result.primaryLimits.ucl.toFixed(dec)}</span>
            <span className="text-emerald-600 dark:text-emerald-400">
              CL {result.primaryLimits.cl.toFixed(dec)}
            </span>
            <span>LCL {result.primaryLimits.lcl.toFixed(dec)}</span>
          </div>
        </div>

        {/* Primary Chart SVG */}
        <div className="px-4 pt-3 pb-1">
          <svg
            viewBox={`0 0 ${VIEW_W} ${PRIMARY_H}`}
            className="w-full h-auto max-h-[260px] select-none cursor-crosshair"
            onMouseMove={handleSvgMouseMove}
            onMouseLeave={() => setHoverIdx(null)}
          >
            {renderLimits(
              result.primaryLimits,
              primaryBounds.yMin,
              primaryBounds.yMax,
              PRIMARY_H,
              showZones
            )}

            {/* Y-axis ticks */}
            {[0, 0.5, 1].map((f) => {
              const val =
                primaryBounds.yMin + f * (primaryBounds.yMax - primaryBounds.yMin);
              const y = mapY(val, primaryBounds.yMin, primaryBounds.yMax, PRIMARY_H);
              return (
                <text
                  key={f}
                  x={PAD.left - 8}
                  y={y + 3}
                  textAnchor="end"
                  className="text-[9.5px] font-mono fill-current text-zinc-400 dark:text-zinc-500"
                >
                  {val.toFixed(dec)}
                </text>
              );
            })}

            {/* Hover vertical crosshair */}
            {hoverIdx !== null && (
              <line
                x1={toX(hoverIdx)}
                y1={PAD.top}
                x2={toX(hoverIdx)}
                y2={PRIMARY_H - PAD.bottom}
                stroke="currentColor"
                className="text-zinc-400 dark:text-zinc-500"
                strokeDasharray="3 2"
                strokeWidth={1}
              />
            )}

            {/* Series Polyline */}
            <polyline
              points={primaryPolyline}
              fill="none"
              stroke="#6366f1"
              strokeWidth={1.9}
              strokeLinejoin="round"
            />

            {/* Data Points */}
            {result.primarySeries.map((v, i) => {
              const cx = toX(i);
              const cy = mapY(v, primaryBounds.yMin, primaryBounds.yMax, PRIMARY_H);
              const isOoc = result.primaryViolationPointSet.has(i);
              const isFocused = focusedPoints?.has(i) ?? false;
              const isHover = hoverIdx === i;

              return (
                <g key={i}>
                  {(isOoc || isFocused) && (
                    <circle
                      cx={cx}
                      cy={cy}
                      r={isFocused ? 8.5 : 6.5}
                      className={
                        isFocused
                          ? "fill-rose-500/30 stroke-rose-500"
                          : "fill-rose-500/18"
                      }
                      strokeWidth={isFocused ? 1.5 : 0}
                    />
                  )}
                  <circle
                    cx={cx}
                    cy={cy}
                    r={isHover ? 5 : isOoc ? 4 : 3}
                    fill={isOoc ? "#f43f5e" : "#6366f1"}
                    stroke="#ffffff"
                    strokeWidth={isHover ? 1.6 : 0.9}
                  />
                </g>
              );
            })}

            {/* X-axis subgroup ticks */}
            {result.primarySeries.map((_, i) => {
              if (i % xLabelStep !== 0 && i !== count - 1) return null;
              return (
                <text
                  key={i}
                  x={toX(i)}
                  y={PRIMARY_H - 9}
                  textAnchor="middle"
                  className="text-[9.5px] font-mono fill-current text-zinc-400 dark:text-zinc-500"
                >
                  #{i + 1}
                </text>
              );
            })}
          </svg>
        </div>

        {/* Secondary Chart Divider & Header */}
        <div className="px-4 py-2 border-y border-zinc-200/75 dark:border-white/[0.06] bg-zinc-50/70 dark:bg-white/[0.02] flex flex-wrap items-center justify-between gap-2">
          <span className="text-xs font-semibold text-zinc-800 dark:text-zinc-200">
            {result.secondaryChartTitle}
          </span>
          <div className="flex items-center gap-3 text-[10.5px] font-mono text-zinc-500 dark:text-zinc-400">
            <span>UCL {result.secondaryLimits.ucl.toFixed(dec)}</span>
            <span className="text-emerald-600 dark:text-emerald-400">
              CL {result.secondaryLimits.cl.toFixed(dec)}
            </span>
            <span>LCL {result.secondaryLimits.lcl.toFixed(dec)}</span>
          </div>
        </div>

        {/* Secondary Chart SVG */}
        <div className="px-4 pt-3 pb-2">
          <svg
            viewBox={`0 0 ${VIEW_W} ${SECONDARY_H}`}
            className="w-full h-auto max-h-[205px] select-none cursor-crosshair"
            onMouseMove={handleSvgMouseMove}
            onMouseLeave={() => setHoverIdx(null)}
          >
            {renderLimits(
              result.secondaryLimits,
              secondaryBounds.yMin,
              secondaryBounds.yMax,
              SECONDARY_H,
              false
            )}

            {[0, 0.5, 1].map((f) => {
              const val =
                secondaryBounds.yMin +
                f * (secondaryBounds.yMax - secondaryBounds.yMin);
              const y = mapY(
                val,
                secondaryBounds.yMin,
                secondaryBounds.yMax,
                SECONDARY_H
              );
              return (
                <text
                  key={f}
                  x={PAD.left - 8}
                  y={y + 3}
                  textAnchor="end"
                  className="text-[9.5px] font-mono fill-current text-zinc-400 dark:text-zinc-500"
                >
                  {val.toFixed(dec)}
                </text>
              );
            })}

            {hoverIdx !== null && (
              <line
                x1={toX(hoverIdx)}
                y1={PAD.top}
                x2={toX(hoverIdx)}
                y2={SECONDARY_H - PAD.bottom}
                stroke="currentColor"
                className="text-zinc-400 dark:text-zinc-500"
                strokeDasharray="3 2"
                strokeWidth={1}
              />
            )}

            {secondaryPath && (
              <path
                d={secondaryPath}
                fill="none"
                stroke="#0ea5e9"
                strokeWidth={1.8}
                strokeLinejoin="round"
              />
            )}

            {result.secondarySeries.map((v, i) => {
              if (v === null) return null;
              const cx = toX(i);
              const cy = mapY(
                v,
                secondaryBounds.yMin,
                secondaryBounds.yMax,
                SECONDARY_H
              );
              const isOoc = result.secondaryViolationPointSet.has(i);
              const isHover = hoverIdx === i;
              return (
                <g key={i}>
                  {isOoc && (
                    <circle cx={cx} cy={cy} r={6.5} className="fill-rose-500/20" />
                  )}
                  <circle
                    cx={cx}
                    cy={cy}
                    r={isHover ? 5 : isOoc ? 4 : 2.8}
                    fill={isOoc ? "#f43f5e" : "#0ea5e9"}
                    stroke="#ffffff"
                    strokeWidth={isHover ? 1.6 : 0.8}
                  />
                </g>
              );
            })}

            {result.secondarySeries.map((_, i) => {
              if (i % xLabelStep !== 0 && i !== count - 1) return null;
              return (
                <text
                  key={i}
                  x={toX(i)}
                  y={SECONDARY_H - 9}
                  textAnchor="middle"
                  className="text-[9.5px] font-mono fill-current text-zinc-400 dark:text-zinc-500"
                >
                  #{i + 1}
                </text>
              );
            })}
          </svg>

          {/* Synchronized Hover Readout Strip */}
          <div className="mt-2 pt-2.5 border-t border-zinc-100 dark:border-white/[0.06] flex flex-wrap items-center justify-between gap-2 text-[11px]">
            {hoveredSubgroup && hoverIdx !== null ? (
              <div className="flex flex-wrap items-center gap-3.5 font-mono tabular-nums">
                <span className="font-semibold text-zinc-900 dark:text-zinc-100">
                  {result.subgroupSize === 1
                    ? `样本 #${hoveredSubgroup.index}`
                    : `子组 #${hoveredSubgroup.index} (行 ${hoveredSubgroup.startRow}~${hoveredSubgroup.endRow})`}
                </span>
                <span className="text-indigo-600 dark:text-indigo-400">
                  {result.subgroupSize === 1 ? "X" : "X̄"} ={" "}
                  {hoveredSubgroup.mean.toFixed(dec)}
                  {unit ? ` ${unit}` : ""}
                </span>
                <span className="text-sky-600 dark:text-sky-400">
                  {result.effectiveChartType === "imr"
                    ? `MR = ${hoveredSubgroup.movingRange !== null ? hoveredSubgroup.movingRange.toFixed(dec) : "—"}`
                    : result.effectiveChartType === "xbar_r"
                      ? `R = ${hoveredSubgroup.range.toFixed(dec)}`
                      : `S = ${hoveredSubgroup.stdDev.toFixed(dec + 1)}`}
                </span>
                {result.primaryLimits.sigma > 0 && (
                  <span className="text-zinc-500 dark:text-zinc-400">
                    Z ={" "}
                    {(
                      (hoveredSubgroup.mean - result.primaryLimits.cl) /
                      result.primaryLimits.sigma
                    ).toFixed(2)}
                    σ
                  </span>
                )}
                {hoveredViolations.length > 0 && (
                  <span className="px-1.5 py-0.5 rounded bg-rose-500/12 text-rose-600 dark:text-rose-400 font-sans font-semibold text-[10px]">
                    触发 {hoveredViolations.map((v) => `R${v.ruleId}`).join(" / ")}
                  </span>
                )}
              </div>
            ) : (
              <span className="inline-flex items-center gap-1.5 text-zinc-400 dark:text-zinc-500">
                <Info className="h-3.5 w-3.5" />
                移动鼠标到主/副控制图上可同步追踪任意子组的均值、极差/标准差、偏离 σ 数与判异信号
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Violation Detail List (clickable to spotlight on chart) */}
      {result.violations.length > 0 && (
        <div className="rounded-2xl border border-rose-200/85 dark:border-rose-500/25 bg-rose-50/40 dark:bg-rose-500/[0.04] p-4 space-y-2.5">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-semibold text-rose-700 dark:text-rose-300 flex items-center gap-1.5">
              <AlertTriangle className="h-3.5 w-3.5" />
              <span>判异信号追踪清单（点击可在控制图上高亮对应点位）</span>
            </h4>
            {focusedViolationIdx !== null && (
              <button
                type="button"
                onClick={() => setFocusedViolationIdx(null)}
                className="text-[11px] text-rose-600 dark:text-rose-400 hover:underline"
              >
                清除高亮
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {result.violations.map((v, idx) => {
              const active = focusedViolationIdx === idx;
              const ruleMeta = NELSON_RULES[v.ruleId - 1];
              return (
                <button
                  key={`${v.chart}-${v.ruleId}-${v.triggerIndex}-${idx}`}
                  type="button"
                  onClick={() =>
                    setFocusedViolationIdx(active ? null : idx)
                  }
                  className={cn(
                    "text-left rounded-xl border p-2.5 transition-all",
                    active
                      ? "bg-white dark:bg-[#16161b] border-rose-400 dark:border-rose-400/70 shadow-tactile ring-2 ring-rose-500/20"
                      : "bg-white/80 dark:bg-[#111115]/90 border-rose-200/70 dark:border-white/[0.08] hover:border-rose-300"
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11.5px] font-semibold text-rose-700 dark:text-rose-300">
                      {v.title}
                    </span>
                    <span className="px-1.5 py-0.5 rounded bg-rose-500/12 font-mono text-[10px] text-rose-600 dark:text-rose-300">
                      {v.chart === "primary" ? "主图" : "副图"} · 触发 #{v.triggerIndex + 1}
                    </span>
                  </div>
                  <p className="text-[11px] text-zinc-700 dark:text-zinc-300 mt-1">
                    {v.detail}
                  </p>
                  <p className="text-[10px] text-zinc-400 dark:text-zinc-500 mt-0.5">
                    排查方向：{ruleMeta.typicalCause}
                  </p>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
