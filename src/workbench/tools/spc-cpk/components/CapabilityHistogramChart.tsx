import React, { useMemo, useState } from "react";
import { BarChart3, Info } from "lucide-react";
import { cn } from "@/lib/utils";
import { PrecisionSelect, PrecisionSwitch } from "@/components/ui/FormControls";
import type { HistogramBin, SpcAnalysisResult } from "../types";
import { normalPdf } from "../core/statistics";
import { inferDisplayDecimals } from "../core/parser";

interface CapabilityHistogramChartProps {
  result: SpcAnalysisResult;
  unit: string;
  customBins: number | null;
  onChangeBins: (bins: number | null) => void;
}

const VIEW_W = 760;
const VIEW_H = 310;
const PAD = { top: 32, right: 26, bottom: 44, left: 48 };
const PLOT_W = VIEW_W - PAD.left - PAD.right;
const PLOT_H = VIEW_H - PAD.top - PAD.bottom;

const BIN_OPTIONS: Array<{ value: number; label: string }> = [
  { value: 0, label: "自动分组" },
  { value: 6, label: "6 组" },
  { value: 8, label: "8 组" },
  { value: 10, label: "10 组" },
  { value: 12, label: "12 组" },
  { value: 15, label: "15 组" },
  { value: 20, label: "20 组" },
];

function fmtPpm(ppm: number): string {
  if (!Number.isFinite(ppm)) return "—";
  if (ppm < 0.05) return "< 0.1";
  if (ppm < 10) return ppm.toFixed(1);
  return Math.round(ppm).toLocaleString("zh-CN");
}

export const CapabilityHistogramChart: React.FC<CapabilityHistogramChartProps> = ({
  result,
  unit,
  customBins,
  onChangeBins,
}) => {
  const [showWithin, setShowWithin] = useState(true);
  const [showOverall, setShowOverall] = useState(true);
  const [show3Sigma, setShow3Sigma] = useState(false);
  const [hoveredBin, setHoveredBin] = useState<HistogramBin | null>(null);

  const { spec, histogram, mean, sigmaWithin, sigmaOverall } = result;
  const dec = inferDisplayDecimals(
    spec.usl !== null && spec.lsl !== null ? spec.usl - spec.lsl : result.range
  );

  const hasLsl =
    (spec.toleranceType === "bilateral" || spec.toleranceType === "lower_only") &&
    spec.lsl !== null;
  const hasUsl =
    (spec.toleranceType === "bilateral" || spec.toleranceType === "upper_only") &&
    spec.usl !== null;

  const { xMin, xMax, yMax, withinPath, overallPath, xTicks } = useMemo(() => {
    const sigmaRef = Math.max(sigmaOverall, sigmaWithin, 0);
    const candidates: number[] = [result.min, result.max];
    if (sigmaRef > 0) {
      candidates.push(mean - 3.5 * sigmaRef, mean + 3.5 * sigmaRef);
    }
    if (hasLsl && spec.lsl !== null) candidates.push(spec.lsl);
    if (hasUsl && spec.usl !== null) candidates.push(spec.usl);
    if (histogram.length > 0) {
      candidates.push(histogram[0].start, histogram[histogram.length - 1].end);
    }

    const lo = Math.min(...candidates);
    const hi = Math.max(...candidates);
    const span = Math.max(hi - lo, 1e-6);
    const x0 = lo - span * 0.06;
    const x1 = hi + span * 0.06;

    const maxBinDensity = Math.max(...histogram.map((b) => b.density), 0);
    const peakW = sigmaWithin > 0 ? normalPdf(mean, mean, sigmaWithin) : 0;
    const peakO = sigmaOverall > 0 ? normalPdf(mean, mean, sigmaOverall) : 0;
    const ym = Math.max(maxBinDensity, peakW, peakO, 1e-6) * 1.15;

    const mapX = (v: number) => PAD.left + ((v - x0) / (x1 - x0)) * PLOT_W;
    const mapY = (d: number) => PAD.top + (1 - d / ym) * PLOT_H;

    const buildCurve = (sd: number) => {
      if (sd <= 0) return "";
      const pts: string[] = [];
      const steps = 140;
      for (let i = 0; i <= steps; i++) {
        const xv = x0 + ((x1 - x0) * i) / steps;
        const yv = mapY(normalPdf(xv, mean, sd));
        pts.push(`${i === 0 ? "M" : "L"}${mapX(xv).toFixed(1)},${yv.toFixed(1)}`);
      }
      return pts.join(" ");
    };

    const ticks = [0, 0.2, 0.4, 0.6, 0.8, 1].map((f) => x0 + f * (x1 - x0));

    return {
      xMin: x0,
      xMax: x1,
      yMax: ym,
      withinPath: buildCurve(sigmaWithin),
      overallPath: buildCurve(sigmaOverall),
      xTicks: ticks,
    };
  }, [histogram, mean, sigmaWithin, sigmaOverall, hasLsl, hasUsl, spec, result.min, result.max]);

  const toX = (v: number) => PAD.left + ((v - xMin) / (xMax - xMin)) * PLOT_W;
  const toY = (d: number) => PAD.top + (1 - d / yMax) * PLOT_H;

  const targetVal =
    spec.target ??
    (spec.toleranceType === "bilateral" && spec.lsl !== null && spec.usl !== null
      ? (spec.lsl + spec.usl) / 2
      : null);

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-zinc-200/90 dark:border-white/[0.09] bg-white dark:bg-[#111115] shadow-tactile overflow-hidden">
        {/* Card Header */}
        <div className="px-4 py-3 border-b border-zinc-200/75 dark:border-white/[0.06] bg-zinc-50/70 dark:bg-white/[0.02] flex flex-wrap items-center justify-between gap-2.5">
          <div className="flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-indigo-500" />
            <h3 className="text-xs font-semibold text-zinc-900 dark:text-zinc-100">
              过程能力分布直方图 & 正态密度拟合
            </h3>
            <span className="px-1.5 py-0.5 rounded bg-zinc-200/70 dark:bg-white/[0.07] font-mono text-[10px] text-zinc-500 dark:text-zinc-400">
              N = {result.count} · {histogram.length} 组直方
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-3 text-[11px]">
            <label className="inline-flex items-center gap-1.5 text-zinc-600 dark:text-zinc-300 cursor-pointer select-none">
              <PrecisionSwitch
                size="sm"
                checked={showWithin}
                onChange={setShowWithin}
                ariaLabel="显示组内正态曲线"
              />
              <span className="inline-flex items-center gap-1">
                <span className="h-0.5 w-3.5 rounded bg-indigo-500" />
                组内 (Cpk)
              </span>
            </label>

            <label className="inline-flex items-center gap-1.5 text-zinc-600 dark:text-zinc-300 cursor-pointer select-none">
              <PrecisionSwitch
                size="sm"
                checked={showOverall}
                onChange={setShowOverall}
                ariaLabel="显示整体正态曲线"
              />
              <span className="inline-flex items-center gap-1">
                <span className="h-0.5 w-3.5 border-b-2 border-dashed border-amber-500" />
                整体 (Ppk)
              </span>
            </label>

            <label className="hidden sm:inline-flex items-center gap-1.5 text-zinc-500 dark:text-zinc-400 cursor-pointer select-none">
              <PrecisionSwitch
                size="sm"
                checked={show3Sigma}
                onChange={setShow3Sigma}
                ariaLabel="显示 ±3σ 区间"
              />
              <span>±3σ</span>
            </label>

            <PrecisionSelect<number>
              value={customBins ?? 0}
              options={BIN_OPTIONS}
              size="xs"
              onChange={(v) => onChangeBins(v === 0 ? null : v)}
              className="w-24 font-mono"
            />
          </div>
        </div>

        {/* SVG Plot */}
        <div className="p-4">
          <svg
            viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
            className="w-full h-auto max-h-[330px] select-none"
            onMouseLeave={() => setHoveredBin(null)}
          >
            {/* Optional out-of-spec shaded zones */}
            {hasLsl && spec.lsl !== null && toX(spec.lsl) > PAD.left && (
              <rect
                x={PAD.left}
                y={PAD.top}
                width={Math.min(PLOT_W, Math.max(0, toX(spec.lsl) - PAD.left))}
                height={PLOT_H}
                className="fill-rose-500/[0.06] dark:fill-rose-500/[0.09]"
              />
            )}
            {hasUsl && spec.usl !== null && toX(spec.usl) < VIEW_W - PAD.right && (
              <rect
                x={Math.max(PAD.left, toX(spec.usl))}
                y={PAD.top}
                width={Math.max(0, VIEW_W - PAD.right - Math.max(PAD.left, toX(spec.usl)))}
                height={PLOT_H}
                className="fill-rose-500/[0.06] dark:fill-rose-500/[0.09]"
              />
            )}

            {/* Optional ±3 sigma within band */}
            {show3Sigma && sigmaWithin > 0 && (
              <rect
                x={Math.max(PAD.left, toX(mean - 3 * sigmaWithin))}
                y={PAD.top}
                width={Math.max(
                  0,
                  Math.min(VIEW_W - PAD.right, toX(mean + 3 * sigmaWithin)) -
                    Math.max(PAD.left, toX(mean - 3 * sigmaWithin))
                )}
                height={PLOT_H}
                className="fill-indigo-500/[0.06] dark:fill-indigo-400/[0.09]"
              />
            )}

            {/* Horizontal grid lines */}
            {[0, 0.25, 0.5, 0.75, 1].map((frac) => {
              const y = PAD.top + (1 - frac) * PLOT_H;
              const estCount = Math.round(
                frac * yMax * result.count * Math.max(result.binWidth, 1e-9)
              );
              return (
                <g key={frac}>
                  <line
                    x1={PAD.left}
                    y1={y}
                    x2={VIEW_W - PAD.right}
                    y2={y}
                    stroke="currentColor"
                    className="text-zinc-200/80 dark:text-white/[0.06]"
                    strokeWidth={1}
                  />
                  <text
                    x={PAD.left - 8}
                    y={y + 3.5}
                    textAnchor="end"
                    className="text-[10px] font-mono fill-current text-zinc-400 dark:text-zinc-500"
                  >
                    {estCount}
                  </text>
                </g>
              );
            })}

            {/* Histogram bars */}
            {histogram.map((bin) => {
              const bx1 = toX(bin.start);
              const bx2 = toX(bin.end);
              const bw = Math.max(2, bx2 - bx1 - 2);
              const by = toY(bin.density);
              const bh = Math.max(0, PAD.top + PLOT_H - by);
              const isHover = hoveredBin?.index === bin.index;
              return (
                <g
                  key={bin.index}
                  onMouseEnter={() => setHoveredBin(bin)}
                  className="cursor-pointer"
                >
                  {/* Full-height hit zone for smooth hover */}
                  <rect
                    x={bx1}
                    y={PAD.top}
                    width={Math.max(4, bx2 - bx1)}
                    height={PLOT_H}
                    fill="transparent"
                  />
                  <rect
                    x={bx1 + 1}
                    y={by}
                    width={bw}
                    height={bh}
                    rx={2}
                    className={cn(
                      "transition-opacity duration-100",
                      bin.isOutOfSpec
                        ? isHover
                          ? "fill-rose-500/70 stroke-rose-500"
                          : "fill-rose-500/45 stroke-rose-500/80"
                        : isHover
                          ? "fill-indigo-500/55 stroke-indigo-500"
                          : "fill-indigo-500/28 dark:fill-indigo-400/30 stroke-indigo-500/65 dark:stroke-indigo-400/70"
                    )}
                    strokeWidth={isHover ? 1.5 : 1}
                  />
                  {bin.count > 0 && bw >= 18 && bh >= 14 && (
                    <text
                      x={bx1 + 1 + bw / 2}
                      y={by - 4}
                      textAnchor="middle"
                      className="text-[9px] font-mono fill-current text-zinc-500 dark:text-zinc-400 pointer-events-none"
                    >
                      {bin.count}
                    </text>
                  )}
                </g>
              );
            })}

            {/* Overall normal curve */}
            {showOverall && overallPath && (
              <path
                d={overallPath}
                fill="none"
                stroke="#f59e0b"
                strokeWidth={1.85}
                strokeDasharray="6 4"
                className="pointer-events-none"
              />
            )}

            {/* Within normal curve */}
            {showWithin && withinPath && (
              <path
                d={withinPath}
                fill="none"
                stroke="#6366f1"
                strokeWidth={2.4}
                className="pointer-events-none"
              />
            )}

            {/* Target vertical reference */}
            {targetVal !== null && (
              <g className="pointer-events-none">
                <line
                  x1={toX(targetVal)}
                  y1={PAD.top}
                  x2={toX(targetVal)}
                  y2={PAD.top + PLOT_H}
                  stroke="#10b981"
                  strokeOpacity={0.75}
                  strokeDasharray="3 3"
                  strokeWidth={1.3}
                />
                <text
                  x={toX(targetVal)}
                  y={PAD.top - 16}
                  textAnchor="middle"
                  className="text-[9.5px] font-mono font-semibold fill-emerald-600 dark:fill-emerald-400"
                >
                  T={targetVal.toFixed(dec)}
                </text>
              </g>
            )}

            {/* Process Mean vertical line */}
            <g className="pointer-events-none">
              <line
                x1={toX(mean)}
                y1={PAD.top}
                x2={toX(mean)}
                y2={PAD.top + PLOT_H}
                stroke="#6366f1"
                strokeDasharray="2 2"
                strokeWidth={1.4}
              />
              <text
                x={toX(mean)}
                y={PAD.top - 5}
                textAnchor="middle"
                className="text-[9.5px] font-mono font-semibold fill-indigo-600 dark:fill-indigo-300"
              >
                x̄={mean.toFixed(dec)}
              </text>
            </g>

            {/* LSL vertical line */}
            {hasLsl && spec.lsl !== null && (
              <g className="pointer-events-none">
                <line
                  x1={toX(spec.lsl)}
                  y1={PAD.top}
                  x2={toX(spec.lsl)}
                  y2={PAD.top + PLOT_H}
                  stroke="#f43f5e"
                  strokeWidth={1.8}
                />
                <text
                  x={toX(spec.lsl)}
                  y={PAD.top - 5}
                  textAnchor="middle"
                  className="text-[10px] font-mono font-bold fill-rose-600 dark:fill-rose-400"
                >
                  LSL {spec.lsl.toFixed(dec)}
                </text>
              </g>
            )}

            {/* USL vertical line */}
            {hasUsl && spec.usl !== null && (
              <g className="pointer-events-none">
                <line
                  x1={toX(spec.usl)}
                  y1={PAD.top}
                  x2={toX(spec.usl)}
                  y2={PAD.top + PLOT_H}
                  stroke="#f43f5e"
                  strokeWidth={1.8}
                />
                <text
                  x={toX(spec.usl)}
                  y={PAD.top - 5}
                  textAnchor="middle"
                  className="text-[10px] font-mono font-bold fill-rose-600 dark:fill-rose-400"
                >
                  USL {spec.usl.toFixed(dec)}
                </text>
              </g>
            )}

            {/* X-axis baseline & ticks */}
            <line
              x1={PAD.left}
              y1={PAD.top + PLOT_H}
              x2={VIEW_W - PAD.right}
              y2={PAD.top + PLOT_H}
              stroke="currentColor"
              className="text-zinc-300 dark:text-white/[0.15]"
              strokeWidth={1}
            />
            {xTicks.map((val, idx) => (
              <text
                key={idx}
                x={toX(val)}
                y={PAD.top + PLOT_H + 17}
                textAnchor="middle"
                className="text-[10px] font-mono fill-current text-zinc-400 dark:text-zinc-500"
              >
                {val.toFixed(dec)}
              </text>
            ))}

            {/* Axis Titles */}
            <text
              x={PAD.left + PLOT_W / 2}
              y={VIEW_H - 6}
              textAnchor="middle"
              className="text-[10.5px] fill-current text-zinc-500 dark:text-zinc-400"
            >
              实测值{unit ? ` (${unit})` : ""}
            </text>
            <text
              x={13}
              y={PAD.top + PLOT_H / 2}
              textAnchor="middle"
              transform={`rotate(-90 13 ${PAD.top + PLOT_H / 2})`}
              className="text-[10.5px] fill-current text-zinc-500 dark:text-zinc-400"
            >
              频数
            </text>
          </svg>

          {/* Interactive Hover Readout */}
          <div className="mt-2 pt-2.5 border-t border-zinc-100 dark:border-white/[0.06] flex flex-wrap items-center justify-between gap-2 text-[11px]">
            {hoveredBin ? (
              <div className="flex flex-wrap items-center gap-4 font-mono tabular-nums">
                <span className="font-semibold text-zinc-900 dark:text-zinc-100">
                  区间 [{hoveredBin.start.toFixed(dec)}, {hoveredBin.end.toFixed(dec)}]
                </span>
                <span className="text-indigo-600 dark:text-indigo-400">
                  频数 {hoveredBin.count} 件 ({hoveredBin.percent.toFixed(1)}%)
                </span>
                <span className="text-zinc-500 dark:text-zinc-400">
                  累计 {hoveredBin.cumulativePercent.toFixed(1)}%
                </span>
                {hoveredBin.isOutOfSpec && (
                  <span className="px-1.5 py-0.5 rounded bg-rose-500/12 text-rose-600 dark:text-rose-400 font-sans font-semibold text-[10px]">
                    超出公差带
                  </span>
                )}
              </div>
            ) : (
              <span className="inline-flex items-center gap-1.5 text-zinc-400 dark:text-zinc-500">
                <Info className="h-3.5 w-3.5" />
                悬停直方柱可查看各分组区间频数、占比与累计分布；红色柱表示落于公差限之外
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Observed vs Expected Within vs Expected Overall Performance Table */}
      <div className="rounded-2xl border border-zinc-200/90 dark:border-white/[0.09] bg-white dark:bg-[#111115] shadow-tactile overflow-hidden">
        <div className="px-4 py-2.5 border-b border-zinc-200/75 dark:border-white/[0.06] bg-zinc-50/70 dark:bg-white/[0.02] flex items-center justify-between">
          <span className="text-xs font-semibold text-zinc-900 dark:text-zinc-100">
            过程表现对比：实测样本 vs 组内预期 vs 整体预期
          </span>
          <span className="text-[10.5px] font-mono text-zinc-400">
            σ组内估计：{result.sigmaWithinMethod}
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-zinc-200/75 dark:border-white/[0.06] text-[10.5px] text-zinc-500 dark:text-zinc-400 bg-zinc-50/40 dark:bg-white/[0.01]">
                <th className="text-left font-medium px-4 py-2">评估维度</th>
                <th className="text-right font-medium px-4 py-2">低于 LSL</th>
                <th className="text-right font-medium px-4 py-2">高于 USL</th>
                <th className="text-right font-medium px-4 py-2">总不良 (PPM)</th>
                <th className="text-right font-medium px-4 py-2">预期 / 实测良率</th>
                <th className="text-right font-medium px-4 py-2">等效 Z 水平</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-white/[0.05] font-mono tabular-nums">
              <tr>
                <td className="px-4 py-2.5 font-sans font-medium text-zinc-800 dark:text-zinc-200">
                  实测样本 (Observed)
                </td>
                <td className="px-4 py-2.5 text-right text-zinc-600 dark:text-zinc-300">
                  {hasLsl
                    ? `${result.observed.belowLslCount} 件 (${((result.observed.belowLslCount / result.count) * 100).toFixed(2)}%)`
                    : "—"}
                </td>
                <td className="px-4 py-2.5 text-right text-zinc-600 dark:text-zinc-300">
                  {hasUsl
                    ? `${result.observed.aboveUslCount} 件 (${((result.observed.aboveUslCount / result.count) * 100).toFixed(2)}%)`
                    : "—"}
                </td>
                <td
                  className={cn(
                    "px-4 py-2.5 text-right font-semibold",
                    result.observed.totalOosCount > 0
                      ? "text-rose-600 dark:text-rose-400"
                      : "text-emerald-600 dark:text-emerald-400"
                  )}
                >
                  {fmtPpm(result.observed.ppmTotal)}
                </td>
                <td className="px-4 py-2.5 text-right text-zinc-800 dark:text-zinc-200">
                  {result.observed.yieldPercent.toFixed(3)}%
                </td>
                <td className="px-4 py-2.5 text-right text-zinc-400">—</td>
              </tr>

              <tr>
                <td className="px-4 py-2.5 font-sans font-medium text-indigo-700 dark:text-indigo-300">
                  组内预期 (Expected Within · Cpk)
                </td>
                <td className="px-4 py-2.5 text-right text-zinc-600 dark:text-zinc-300">
                  {hasLsl ? `${fmtPpm(result.expectedWithin.ppmBelowLsl)} PPM` : "—"}
                </td>
                <td className="px-4 py-2.5 text-right text-zinc-600 dark:text-zinc-300">
                  {hasUsl ? `${fmtPpm(result.expectedWithin.ppmAboveUsl)} PPM` : "—"}
                </td>
                <td className="px-4 py-2.5 text-right font-semibold text-indigo-600 dark:text-indigo-400">
                  {fmtPpm(result.expectedWithin.ppmTotal)}
                </td>
                <td className="px-4 py-2.5 text-right text-zinc-800 dark:text-zinc-200">
                  {result.expectedWithin.yieldPercent.toFixed(4)}%
                </td>
                <td className="px-4 py-2.5 text-right text-zinc-600 dark:text-zinc-300">
                  {result.expectedWithin.sigmaLevel !== null
                    ? `${result.expectedWithin.sigmaLevel.toFixed(2)}σ`
                    : "—"}
                </td>
              </tr>

              <tr>
                <td className="px-4 py-2.5 font-sans font-medium text-amber-700 dark:text-amber-300">
                  整体预期 (Expected Overall · Ppk)
                </td>
                <td className="px-4 py-2.5 text-right text-zinc-600 dark:text-zinc-300">
                  {hasLsl ? `${fmtPpm(result.expectedOverall.ppmBelowLsl)} PPM` : "—"}
                </td>
                <td className="px-4 py-2.5 text-right text-zinc-600 dark:text-zinc-300">
                  {hasUsl ? `${fmtPpm(result.expectedOverall.ppmAboveUsl)} PPM` : "—"}
                </td>
                <td className="px-4 py-2.5 text-right font-semibold text-amber-600 dark:text-amber-400">
                  {fmtPpm(result.expectedOverall.ppmTotal)}
                </td>
                <td className="px-4 py-2.5 text-right text-zinc-800 dark:text-zinc-200">
                  {result.expectedOverall.yieldPercent.toFixed(4)}%
                </td>
                <td className="px-4 py-2.5 text-right text-zinc-600 dark:text-zinc-300">
                  {result.expectedOverall.sigmaLevel !== null
                    ? `${result.expectedOverall.sigmaLevel.toFixed(2)}σ`
                    : "—"}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
