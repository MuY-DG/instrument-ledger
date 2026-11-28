import React, { useMemo, useState } from "react";
import { Activity, Info } from "lucide-react";
import { cn } from "@/lib/utils";
import { PrecisionSwitch } from "@/components/ui/FormControls";
import type { InspectionSeverity, SamplingPlanResult } from "../types";
import {
  computeAcceptanceProbability,
  computeOcAnalytics,
} from "../core/statistics";
import { formatAqlValue } from "../core/tables";

interface OcCurveChartProps {
  plans: Record<InspectionSeverity, SamplingPlanResult>;
  activeSeverity: InspectionSeverity;
  focusedLabel: string;
}

const VIEW_W = 760;
const VIEW_H = 310;
const PAD = { top: 24, right: 28, bottom: 44, left: 54 };
const PLOT_W = VIEW_W - PAD.left - PAD.right;
const PLOT_H = VIEW_H - PAD.top - PAD.bottom;

export const OcCurveChart: React.FC<OcCurveChartProps> = ({
  plans,
  activeSeverity,
  focusedLabel,
}) => {
  const [showAoq, setShowAoq] = useState(false);
  const [hoverP, setHoverP] = useState<number | null>(null);

  const activePlan = plans[activeSeverity];

  const { normalOc, tightenedOc, reducedOc, activeOc, xMax } = useMemo(() => {
    const baseOc = computeOcAnalytics(plans.normal);
    const redOcPreview = computeOcAnalytics(plans.reduced);
    const sharedMax = Math.max(baseOc.xMaxPercent, redOcPreview.xMaxPercent);
    const nOc = computeOcAnalytics(plans.normal, sharedMax);
    const tOc = computeOcAnalytics(plans.tightened, sharedMax);
    const rOc = computeOcAnalytics(plans.reduced, sharedMax);
    const act =
      activeSeverity === "normal"
        ? nOc
        : activeSeverity === "tightened"
          ? tOc
          : rOc;
    return {
      normalOc: nOc,
      tightenedOc: tOc,
      reducedOc: rOc,
      activeOc: act,
      xMax: sharedMax,
    };
  }, [plans, activeSeverity]);

  const toX = (p: number) => PAD.left + (Math.min(xMax, Math.max(0, p)) / xMax) * PLOT_W;
  const toY = (pa: number) => PAD.top + (1 - Math.min(1, Math.max(0, pa))) * PLOT_H;

  const buildPath = (pts: Array<{ x: number; y: number }>) =>
    pts
      .map((pt, i) => `${i === 0 ? "M" : "L"}${pt.x.toFixed(1)},${pt.y.toFixed(1)}`)
      .join(" ");

  const normalPath = useMemo(
    () => buildPath(normalOc.points.map((pt) => ({ x: toX(pt.pPercent), y: toY(pt.pa) }))),
    [normalOc, xMax]
  );
  const tightenedPath = useMemo(
    () => buildPath(tightenedOc.points.map((pt) => ({ x: toX(pt.pPercent), y: toY(pt.pa) }))),
    [tightenedOc, xMax]
  );
  const reducedPath = useMemo(
    () => buildPath(reducedOc.points.map((pt) => ({ x: toX(pt.pPercent), y: toY(pt.pa) }))),
    [reducedOc, xMax]
  );

  const aoqYMax = Math.max(activeOc.aoqlPercent * 1.25, 0.25);
  const aoqPath = useMemo(
    () =>
      buildPath(
        activeOc.points.map((pt) => ({
          x: toX(pt.pPercent),
          y: PAD.top + (1 - pt.aoqPercent / aoqYMax) * PLOT_H,
        }))
      ),
    [activeOc, xMax, aoqYMax]
  );

  const aqlVal = activePlan.aql > 0 ? activePlan.aql : null;

  const hoverStats = useMemo(() => {
    if (hoverP === null) return null;
    const pNorm = computeAcceptanceProbability(plans.normal, hoverP);
    const pTight = computeAcceptanceProbability(plans.tightened, hoverP);
    const pRed = computeAcceptanceProbability(plans.reduced, hoverP);
    const pAct = computeAcceptanceProbability(activePlan, hoverP);
    const finiteFactor =
      activePlan.lotSize !== null && activePlan.lotSize > activePlan.sampleSize
        ? (activePlan.lotSize - activePlan.sampleSize) / activePlan.lotSize
        : 1;
    const aoq = hoverP * pAct * finiteFactor;
    return { pNorm, pTight, pRed, pAct, aoq };
  }, [hoverP, plans, activePlan]);

  const yTicks = [0, 0.1, 0.25, 0.5, 0.75, 1];
  const xTicks = [0, 0.2, 0.4, 0.6, 0.8, 1].map((f) => f * xMax);

  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const relX = ((e.clientX - rect.left) / rect.width) * VIEW_W;
    if (relX < PAD.left || relX > VIEW_W - PAD.right) {
      setHoverP(null);
      return;
    }
    const frac = (relX - PAD.left) / PLOT_W;
    setHoverP(Math.max(0, Math.min(xMax, frac * xMax)));
  };

  const unitLabel = activePlan.isDefectsPerHundred ? "每百单位缺陷数" : "批不合格品率 p (%)";

  return (
    <div className="space-y-4">
      {/* KPI Risk Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="rounded-xl border border-zinc-200/90 dark:border-white/[0.09] bg-white dark:bg-[#111115] p-3.5 shadow-tactile">
          <div className="text-[11px] text-zinc-500 dark:text-zinc-400">
            AQL 处接收概率 Pa (1 − α)
          </div>
          <div className="mt-1.5 text-2xl font-bold font-mono tabular-nums text-emerald-600 dark:text-emerald-400">
            {activePlan.isZeroDefect ? "—" : `${(activeOc.paAtAql * 100).toFixed(1)}%`}
          </div>
          <div className="text-[10.5px] text-zinc-400 dark:text-zinc-500 mt-0.5">
            {activePlan.isZeroDefect
              ? "零缺陷标准 (Ac=0)"
              : `当批不良率 = ${formatAqlValue(activePlan.aql)}%`}
          </div>
        </div>

        <div className="rounded-xl border border-zinc-200/90 dark:border-white/[0.09] bg-white dark:bg-[#111115] p-3.5 shadow-tactile">
          <div className="text-[11px] text-zinc-500 dark:text-zinc-400">
            生产方风险 α (弃真风险)
          </div>
          <div className="mt-1.5 text-2xl font-bold font-mono tabular-nums text-amber-600 dark:text-amber-400">
            {activePlan.isZeroDefect ? "—" : `${(activeOc.producerRisk * 100).toFixed(1)}%`}
          </div>
          <div className="text-[10.5px] text-zinc-400 dark:text-zinc-500 mt-0.5">
            合格批被误判拒收的概率
          </div>
        </div>

        <div className="rounded-xl border border-zinc-200/90 dark:border-white/[0.09] bg-white dark:bg-[#111115] p-3.5 shadow-tactile">
          <div className="text-[11px] text-zinc-500 dark:text-zinc-400">
            使用方风险质量 LQ₁₀ (β = 10%)
          </div>
          <div className="mt-1.5 text-2xl font-bold font-mono tabular-nums text-rose-600 dark:text-rose-400">
            {activeOc.lq10Percent.toFixed(2)}%
          </div>
          <div className="text-[10.5px] text-zinc-400 dark:text-zinc-500 mt-0.5">
            无差别点 IQL₅₀ = {activeOc.iqlPercent.toFixed(2)}%
          </div>
        </div>

        <div className="rounded-xl border border-zinc-200/90 dark:border-white/[0.09] bg-white dark:bg-[#111115] p-3.5 shadow-tactile">
          <div className="text-[11px] text-zinc-500 dark:text-zinc-400">
            平均检出质量上限 (AOQL)
          </div>
          <div className="mt-1.5 text-2xl font-bold font-mono tabular-nums text-indigo-600 dark:text-indigo-400">
            {activeOc.aoqlPercent.toFixed(2)}%
          </div>
          <div className="text-[10.5px] text-zinc-400 dark:text-zinc-500 mt-0.5">
            峰值位于 p = {activeOc.aoqlAtPercent.toFixed(2)}%（全检剔除拒收批）
          </div>
        </div>
      </div>

      {/* Interactive OC SVG Card */}
      <div className="rounded-2xl border border-zinc-200/90 dark:border-white/[0.09] bg-white dark:bg-[#111115] shadow-tactile overflow-hidden">
        <div className="px-4 py-3 border-b border-zinc-200/75 dark:border-white/[0.06] bg-zinc-50/70 dark:bg-white/[0.02] flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Activity className="h-4 w-4 text-emerald-500" />
            <h3 className="text-xs font-semibold text-zinc-900 dark:text-zinc-100">
              OC 抽检特性曲线 · {focusedLabel} (AQL {formatAqlValue(activePlan.aql)})
            </h3>
            <span className="px-1.5 py-0.5 rounded bg-zinc-200/70 dark:bg-white/[0.07] font-mono text-[10px] text-zinc-500 dark:text-zinc-400">
              {activeOc.model === "binomial" ? "精确二项分布" : "泊松分布"}
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-4 text-[11px]">
            <span className="inline-flex items-center gap-1.5 text-zinc-600 dark:text-zinc-300">
              <span className="h-0.5 w-4 rounded bg-emerald-500" />
              正常 (n={plans.normal.sampleSize}, Ac={plans.normal.ac})
            </span>
            <span className="inline-flex items-center gap-1.5 text-zinc-600 dark:text-zinc-300">
              <span className="h-0.5 w-4 rounded border-b-2 border-dashed border-rose-500" />
              加严 (n={plans.tightened.sampleSize}, Ac={plans.tightened.ac})
            </span>
            <span className="inline-flex items-center gap-1.5 text-zinc-600 dark:text-zinc-300">
              <span className="h-0.5 w-4 rounded border-b-2 border-dotted border-sky-500" />
              放宽 (n={plans.reduced.sampleSize}, Ac={plans.reduced.ac})
            </span>
            <label className="inline-flex items-center gap-1.5 text-zinc-500 dark:text-zinc-400 cursor-pointer select-none">
              <PrecisionSwitch
                size="sm"
                checked={showAoq}
                onChange={setShowAoq}
                ariaLabel="叠加 AOQ 曲线"
              />
              <span>AOQ 曲线</span>
            </label>
          </div>
        </div>

        <div className="p-4 relative">
          <svg
            viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
            className="w-full h-auto max-h-[340px] select-none cursor-crosshair"
            onMouseMove={handleMouseMove}
            onMouseLeave={() => setHoverP(null)}
          >
            {/* Horizontal grid lines */}
            {yTicks.map((t) => {
              const y = toY(t);
              const isBeta = t === 0.1;
              return (
                <g key={t}>
                  <line
                    x1={PAD.left}
                    y1={y}
                    x2={VIEW_W - PAD.right}
                    y2={y}
                    stroke="currentColor"
                    className={
                      isBeta
                        ? "text-rose-400/45 dark:text-rose-500/35"
                        : "text-zinc-200 dark:text-white/[0.07]"
                    }
                    strokeDasharray={isBeta ? "4 4" : undefined}
                    strokeWidth={1}
                  />
                  <text
                    x={PAD.left - 8}
                    y={y + 3.5}
                    textAnchor="end"
                    className={cn(
                      "text-[10px] font-mono fill-current",
                      isBeta
                        ? "text-rose-500 dark:text-rose-400 font-semibold"
                        : "text-zinc-400 dark:text-zinc-500"
                    )}
                  >
                    {Math.round(t * 100)}%
                  </text>
                </g>
              );
            })}

            {/* Vertical grid lines */}
            {xTicks.map((val, idx) => {
              const x = toX(val);
              return (
                <g key={idx}>
                  <line
                    x1={x}
                    y1={PAD.top}
                    x2={x}
                    y2={VIEW_H - PAD.bottom}
                    stroke="currentColor"
                    className="text-zinc-100 dark:text-white/[0.04]"
                    strokeWidth={1}
                  />
                  <text
                    x={x}
                    y={VIEW_H - PAD.bottom + 16}
                    textAnchor="middle"
                    className="text-[10px] font-mono fill-current text-zinc-400 dark:text-zinc-500"
                  >
                    {val >= 10 ? val.toFixed(1) : val.toFixed(2)}%
                  </text>
                </g>
              );
            })}

            {/* Axis Titles */}
            <text
              x={PAD.left + PLOT_W / 2}
              y={VIEW_H - 6}
              textAnchor="middle"
              className="text-[10.5px] fill-current text-zinc-500 dark:text-zinc-400"
            >
              {unitLabel}
            </text>
            <text
              x={14}
              y={PAD.top + PLOT_H / 2}
              textAnchor="middle"
              transform={`rotate(-90 14 ${PAD.top + PLOT_H / 2})`}
              className="text-[10.5px] fill-current text-zinc-500 dark:text-zinc-400"
            >
              批接收概率 Pa
            </text>

            {/* AQL vertical reference line */}
            {aqlVal !== null && aqlVal <= xMax && (
              <g>
                <line
                  x1={toX(aqlVal)}
                  y1={PAD.top}
                  x2={toX(aqlVal)}
                  y2={VIEW_H - PAD.bottom}
                  stroke="#10b981"
                  strokeOpacity={0.55}
                  strokeDasharray="3 3"
                  strokeWidth={1.25}
                />
                <text
                  x={toX(aqlVal) + 4}
                  y={PAD.top + 12}
                  className="text-[10px] font-mono font-semibold fill-emerald-600 dark:fill-emerald-400"
                >
                  AQL {formatAqlValue(activePlan.aql)}%
                </text>
              </g>
            )}

            {/* LQ10 marker on active curve */}
            {activeOc.lq10Percent <= xMax && (
              <g>
                <circle
                  cx={toX(activeOc.lq10Percent)}
                  cy={toY(0.1)}
                  r={3.5}
                  fill="#f43f5e"
                />
                <text
                  x={Math.min(VIEW_W - PAD.right - 68, toX(activeOc.lq10Percent) + 6)}
                  y={toY(0.1) - 6}
                  className="text-[9.5px] font-mono font-semibold fill-rose-600 dark:fill-rose-400"
                >
                  LQ₁₀={activeOc.lq10Percent.toFixed(2)}%
                </text>
              </g>
            )}

            {/* Optional AOQ curve (scaled to aoqYMax) */}
            {showAoq && (
              <path
                d={aoqPath}
                fill="none"
                stroke="#6366f1"
                strokeWidth={1.75}
                strokeOpacity={0.75}
              />
            )}

            {/* OC Curves: Reduced, Tightened, Normal */}
            <path
              d={reducedPath}
              fill="none"
              stroke="#0ea5e9"
              strokeWidth={activeSeverity === "reduced" ? 2.6 : 1.6}
              strokeOpacity={activeSeverity === "reduced" ? 1 : 0.65}
              strokeDasharray="2 3"
            />
            <path
              d={tightenedPath}
              fill="none"
              stroke="#f43f5e"
              strokeWidth={activeSeverity === "tightened" ? 2.6 : 1.6}
              strokeOpacity={activeSeverity === "tightened" ? 1 : 0.65}
              strokeDasharray="6 4"
            />
            <path
              d={normalPath}
              fill="none"
              stroke="#10b981"
              strokeWidth={activeSeverity === "normal" ? 2.75 : 1.75}
              strokeOpacity={activeSeverity === "normal" ? 1 : 0.7}
            />

            {/* Interactive Hover Crosshair */}
            {hoverP !== null && hoverStats && (
              <g>
                <line
                  x1={toX(hoverP)}
                  y1={PAD.top}
                  x2={toX(hoverP)}
                  y2={VIEW_H - PAD.bottom}
                  stroke="currentColor"
                  className="text-zinc-400 dark:text-zinc-500"
                  strokeDasharray="3 2"
                  strokeWidth={1}
                />
                <circle cx={toX(hoverP)} cy={toY(hoverStats.pNorm)} r={4} fill="#10b981" />
                <circle cx={toX(hoverP)} cy={toY(hoverStats.pTight)} r={3.5} fill="#f43f5e" />
                <circle cx={toX(hoverP)} cy={toY(hoverStats.pRed)} r={3.5} fill="#0ea5e9" />
              </g>
            )}
          </svg>

          {/* Live Crosshair Readout Strip */}
          <div className="mt-2 pt-2.5 border-t border-zinc-100 dark:border-white/[0.06] flex flex-wrap items-center justify-between gap-2 text-[11px]">
            {hoverP !== null && hoverStats ? (
              <div className="flex flex-wrap items-center gap-4 font-mono tabular-nums">
                <span className="font-semibold text-zinc-900 dark:text-zinc-100">
                  p = {hoverP.toFixed(2)}%
                </span>
                <span className="text-emerald-600 dark:text-emerald-400">
                  正常 Pa = {(hoverStats.pNorm * 100).toFixed(1)}%
                </span>
                <span className="text-rose-600 dark:text-rose-400">
                  加严 Pa = {(hoverStats.pTight * 100).toFixed(1)}%
                </span>
                <span className="text-sky-600 dark:text-sky-400">
                  放宽 Pa = {(hoverStats.pRed * 100).toFixed(1)}%
                </span>
                {showAoq && (
                  <span className="text-indigo-600 dark:text-indigo-400">
                    AOQ = {hoverStats.aoq.toFixed(2)}%
                  </span>
                )}
              </div>
            ) : (
              <span className="inline-flex items-center gap-1.5 text-zinc-400 dark:text-zinc-500">
                <Info className="h-3.5 w-3.5" />
                移动鼠标到曲线上可实时读取任意真实不良率 p% 下的三档接收概率与检出质量
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
