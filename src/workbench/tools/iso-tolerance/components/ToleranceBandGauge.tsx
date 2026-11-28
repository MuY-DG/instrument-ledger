import React from "react";
import { cn } from "@/lib/utils";
import type { MeasurementEvaluation } from "../types";

interface ToleranceBandGaugeProps {
  nominal: number;
  lowerLimit: number;
  upperLimit: number;
  unit?: string;
  unilateral?: boolean;
  evaluation?: MeasurementEvaluation | null;
  decimals?: number;
  className?: string;
}

/**
 * Precision SVG Tolerance Band Gauge.
 * Visualizes safe core (0-80%), guard-band warning zone (80-100%), out-of-spec overflow regions,
 * and an optional live measured-value caliper marker.
 */
export const ToleranceBandGauge: React.FC<ToleranceBandGaugeProps> = ({
  nominal,
  lowerLimit,
  upperLimit,
  unit = "mm",
  unilateral = false,
  evaluation,
  decimals = 3,
  className,
}) => {
  const width = 620;
  const height = 104;
  const padX = 44;
  const trackW = width - padX * 2;
  const trackY = 44;
  const trackH = 18;

  // Map tolerance interval [lowerLimit, upperLimit] to central 68% of track, leaving 16% OOS margin on each side
  const oosFrac = unilateral ? 0.22 : 0.16;
  const band = Math.max(1e-9, upperLimit - lowerLimit);
  const viewMin = unilateral ? 0 : lowerLimit - (band * oosFrac) / (1 - 2 * oosFrac);
  const viewMax = unilateral
    ? upperLimit / (1 - oosFrac)
    : upperLimit + (band * oosFrac) / (1 - 2 * oosFrac);
  const viewSpan = Math.max(1e-9, viewMax - viewMin);

  const toX = (val: number) => {
    const ratio = (val - viewMin) / viewSpan;
    const clamped = Math.max(0, Math.min(1, ratio));
    return padX + clamped * trackW;
  };

  const lslX = toX(lowerLimit);
  const uslX = toX(upperLimit);
  const nomX = toX(unilateral ? 0 : nominal);
  const bandPx = Math.max(2, uslX - lslX);

  // Guard bands (80%..100% of tolerance zone)
  const warnLeftStart = lslX;
  const warnLeftW = unilateral ? 0 : bandPx * 0.1;
  const warnRightW = unilateral ? bandPx * 0.2 : bandPx * 0.1;
  const warnRightStart = uslX - warnRightW;
  const safeStart = warnLeftStart + warnLeftW;
  const safeW = Math.max(0, warnRightStart - safeStart);

  const measured = evaluation?.measured ?? null;
  const measX = measured !== null ? toX(measured) : null;
  const verdict = evaluation?.verdict ?? "pending";

  const markerColor =
    verdict === "ng"
      ? "#f43f5e"
      : verdict === "warning"
        ? "#f59e0b"
        : "#10b981";

  return (
    <div
      className={cn(
        "rounded-xl border border-zinc-200/85 dark:border-white/[0.08] bg-zinc-50/60 dark:bg-white/[0.02] px-3 py-2.5",
        className
      )}
    >
      <div className="flex items-center justify-between gap-2 mb-1">
        <span className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400">
          可视化公差带标尺
        </span>
        <div className="flex items-center gap-3 text-[10px] text-zinc-400 dark:text-zinc-500">
          <span className="inline-flex items-center gap-1">
            <span className="h-2 w-2 rounded-sm bg-emerald-500/75" />
            安全区 (&lt;80%)
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="h-2 w-2 rounded-sm bg-amber-500/80" />
            临界预警
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="h-2 w-2 rounded-sm bg-rose-500/70" />
            超差区
          </span>
        </div>
      </div>

      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full h-auto select-none overflow-visible"
        role="img"
        aria-label="公差带标尺示意图"
      >
        {/* Full track out-of-spec background */}
        <rect
          x={padX}
          y={trackY}
          width={trackW}
          height={trackH}
          rx={6}
          className="fill-rose-500/18 dark:fill-rose-500/20"
        />

        {/* Safe core zone */}
        <rect
          x={safeStart}
          y={trackY}
          width={safeW}
          height={trackH}
          className="fill-emerald-500/28 dark:fill-emerald-500/32"
        />

        {/* Warning guard bands */}
        {!unilateral && warnLeftW > 0 && (
          <rect
            x={warnLeftStart}
            y={trackY}
            width={warnLeftW}
            height={trackH}
            className="fill-amber-500/32 dark:fill-amber-500/35"
          />
        )}
        {warnRightW > 0 && (
          <rect
            x={warnRightStart}
            y={trackY}
            width={warnRightW}
            height={trackH}
            className="fill-amber-500/32 dark:fill-amber-500/35"
          />
        )}

        {/* Outer border of track */}
        <rect
          x={padX}
          y={trackY}
          width={trackW}
          height={trackH}
          rx={6}
          fill="none"
          className="stroke-zinc-300/90 dark:stroke-white/[0.12]"
          strokeWidth={1}
        />

        {/* LSL & USL Limit Boundary Lines */}
        <line
          x1={lslX}
          y1={trackY - 6}
          x2={lslX}
          y2={trackY + trackH + 10}
          className="stroke-zinc-600 dark:stroke-zinc-300"
          strokeWidth={1.5}
        />
        <line
          x1={uslX}
          y1={trackY - 6}
          x2={uslX}
          y2={trackY + trackH + 10}
          className="stroke-zinc-600 dark:stroke-zinc-300"
          strokeWidth={1.5}
        />

        {/* Nominal center line (bilateral only) */}
        {!unilateral && (
          <>
            <line
              x1={nomX}
              y1={trackY - 4}
              x2={nomX}
              y2={trackY + trackH + 8}
              strokeDasharray="3 2.5"
              className="stroke-zinc-500 dark:stroke-zinc-400"
              strokeWidth={1.25}
            />
            <text
              x={nomX}
              y={trackY + trackH + 24}
              textAnchor="middle"
              className="fill-zinc-500 dark:fill-zinc-400 font-mono text-[10px]"
            >
              公称 {nominal.toFixed(Math.min(decimals, 3))}
            </text>
          </>
        )}

        {/* Limit value labels */}
        <text
          x={lslX}
          y={trackY + trackH + 24}
          textAnchor={unilateral ? "start" : "middle"}
          className="fill-zinc-700 dark:fill-zinc-200 font-mono text-[10.5px] font-semibold"
        >
          {unilateral ? `0 ${unit}` : `下限 ${lowerLimit.toFixed(decimals)}`}
        </text>
        <text
          x={uslX}
          y={trackY + trackH + 24}
          textAnchor="middle"
          className="fill-zinc-700 dark:fill-zinc-200 font-mono text-[10.5px] font-semibold"
        >
          上限 {upperLimit.toFixed(decimals)}
        </text>

        {/* Measured Value Precision Caliper Marker */}
        {measX !== null && measured !== null && (
          <g>
            <line
              x1={measX}
              y1={trackY - 14}
              x2={measX}
              y2={trackY + trackH + 4}
              stroke={markerColor}
              strokeWidth={2.2}
            />
            <polygon
              points={`${measX},${trackY - 2} ${measX - 5.5},${trackY - 11} ${measX + 5.5},${trackY - 11}`}
              fill={markerColor}
            />
            <rect
              x={Math.max(4, Math.min(width - 122, measX - 58))}
              y={4}
              width={116}
              height={22}
              rx={6}
              fill={markerColor}
            />
            <text
              x={Math.max(62, Math.min(width - 64, measX))}
              y={18.5}
              textAnchor="middle"
              fill="#ffffff"
              className="font-mono text-[10.5px] font-bold"
            >
              实测 {measured.toFixed(decimals)} {unit}
            </text>
          </g>
        )}
      </svg>
    </div>
  );
};
