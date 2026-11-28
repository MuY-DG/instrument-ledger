import React from "react";
import { cn } from "@/lib/utils";
import type { Iso286FitResult } from "../types";
import { formatSignedMicrons } from "../core/iso286Engine";

interface FitZoneDiagramProps {
  fit: Iso286FitResult;
  measuredHoleMm?: number | null;
  measuredShaftMm?: number | null;
  className?: string;
}

/**
 * Precision ISO 286 Hole & Shaft Tolerance Zone Diagram relative to Zero Line (0 µm).
 * Draws exact scaled zone boxes, ES/EI & es/ei deviation callouts, fit clearance/interference span,
 * and optional live measured hole/shaft markers.
 */
export const FitZoneDiagram: React.FC<FitZoneDiagramProps> = ({
  fit,
  measuredHoleMm = null,
  measuredShaftMm = null,
  className,
}) => {
  const width = 640;
  const height = 270;
  const plotTop = 30;
  const plotBottom = 236;
  const plotH = plotBottom - plotTop;
  const leftAxisX = 64;
  const rightEdgeX = width - 26;

  const measHoleUm =
    measuredHoleMm !== null && Number.isFinite(measuredHoleMm)
      ? (measuredHoleMm - fit.nominalMm) * 1000
      : null;
  const measShaftUm =
    measuredShaftMm !== null && Number.isFinite(measuredShaftMm)
      ? (measuredShaftMm - fit.nominalMm) * 1000
      : null;

  const allYValues = [
    0,
    fit.hole.upperDevMicrons,
    fit.hole.lowerDevMicrons,
    fit.shaft.upperDevMicrons,
    fit.shaft.lowerDevMicrons,
  ];
  if (measHoleUm !== null) allYValues.push(measHoleUm);
  if (measShaftUm !== null) allYValues.push(measShaftUm);

  const rawMin = Math.min(...allYValues);
  const rawMax = Math.max(...allYValues);
  const span = Math.max(12, rawMax - rawMin);
  const pad = span * 0.18;
  const yMin = rawMin - pad;
  const yMax = rawMax + pad;
  const toY = (um: number) => plotTop + ((yMax - um) / (yMax - yMin)) * plotH;

  const zeroY = toY(0);

  // Hole box coordinates
  const holeX = 128;
  const barW = 148;
  const holeTopY = toY(fit.hole.upperDevMicrons);
  const holeBotY = toY(fit.hole.lowerDevMicrons);
  const holeH = Math.max(4, holeBotY - holeTopY);

  // Shaft box coordinates
  const shaftX = 336;
  const shaftTopY = toY(fit.shaft.upperDevMicrons);
  const shaftBotY = toY(fit.shaft.lowerDevMicrons);
  const shaftH = Math.max(4, shaftBotY - shaftTopY);

  // Nice grid ticks
  const stepCandidates = [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000];
  const rawStep = (yMax - yMin) / 5;
  const gridStep = stepCandidates.find((s) => s >= rawStep) ?? Math.ceil(rawStep / 500) * 500;
  const ticks: number[] = [];
  const firstTick = Math.ceil(yMin / gridStep) * gridStep;
  for (let t = firstTick; t <= yMax; t += gridStep) {
    if (Math.abs(t) > 1e-6) ticks.push(t);
  }

  const fitBadgeColor =
    fit.fitNature === "clearance"
      ? "#10b981"
      : fit.fitNature === "transition"
        ? "#f59e0b"
        : "#f43f5e";

  return (
    <div
      className={cn(
        "rounded-2xl border border-zinc-200/90 dark:border-white/[0.09] bg-white dark:bg-[#111115] p-4 shadow-tactile",
        className
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-2 mb-2.5">
        <div>
          <h3 className="text-xs font-semibold text-zinc-900 dark:text-zinc-100">
            ISO 286 孔轴公差带剖面示意图
          </h3>
          <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
            以公称尺寸 Ø{fit.nominalMm} mm 零线为基准按微米 (µm) 精确比例绘制
          </p>
        </div>
        <div className="flex items-center gap-3 text-[10.5px]">
          <span className="inline-flex items-center gap-1.5 text-indigo-600 dark:text-indigo-300 font-medium">
            <span className="h-2.5 w-2.5 rounded-sm bg-indigo-500/30 border border-indigo-500" />
            孔 {fit.hole.designation}
          </span>
          <span className="inline-flex items-center gap-1.5 text-amber-600 dark:text-amber-300 font-medium">
            <span className="h-2.5 w-2.5 rounded-sm bg-amber-500/30 border border-amber-500" />
            轴 {fit.shaft.designation}
          </span>
        </div>
      </div>

      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full h-auto select-none"
        role="img"
        aria-label={`Ø${fit.nominalMm} ${fit.fitCode} 孔轴公差带剖面图`}
      >
        <defs>
          <pattern
            id="iso-hole-hatch"
            width="8"
            height="8"
            patternUnits="userSpaceOnUse"
            patternTransform="rotate(45)"
          >
            <line
              x1="0"
              y1="0"
              x2="0"
              y2="8"
              stroke="#6366f1"
              strokeOpacity="0.26"
              strokeWidth="2"
            />
          </pattern>
          <pattern
            id="iso-shaft-hatch"
            width="8"
            height="8"
            patternUnits="userSpaceOnUse"
            patternTransform="rotate(-45)"
          >
            <line
              x1="0"
              y1="0"
              x2="0"
              y2="8"
              stroke="#f59e0b"
              strokeOpacity="0.3"
              strokeWidth="2"
            />
          </pattern>
        </defs>

        {/* Subtle horizontal gridlines */}
        {ticks.map((tick) => {
          const y = toY(tick);
          return (
            <g key={tick}>
              <line
                x1={leftAxisX}
                y1={y}
                x2={rightEdgeX}
                y2={y}
                className="stroke-zinc-200/70 dark:stroke-white/[0.06]"
                strokeWidth={1}
              />
              <text
                x={leftAxisX - 8}
                y={y + 3.5}
                textAnchor="end"
                className="fill-zinc-400 dark:fill-zinc-500 font-mono text-[10px]"
              >
                {formatSignedMicrons(tick)}
              </text>
            </g>
          );
        })}

        {/* Vertical axis */}
        <line
          x1={leftAxisX}
          y1={plotTop - 6}
          x2={leftAxisX}
          y2={plotBottom + 4}
          className="stroke-zinc-300 dark:stroke-white/[0.15]"
          strokeWidth={1}
        />
        <text
          x={leftAxisX - 8}
          y={16}
          textAnchor="end"
          className="fill-zinc-400 dark:fill-zinc-500 font-mono text-[10px]"
        >
          µm
        </text>

        {/* Zero Line (Basic Nominal Size) */}
        <line
          x1={leftAxisX}
          y1={zeroY}
          x2={rightEdgeX}
          y2={zeroY}
          strokeDasharray="6 4"
          className="stroke-zinc-900 dark:stroke-zinc-200"
          strokeWidth={1.5}
        />
        <rect
          x={10}
          y={zeroY - 9}
          width={48}
          height={18}
          rx={4}
          className="fill-zinc-900 dark:fill-white"
        />
        <text
          x={34}
          y={zeroY + 3.5}
          textAnchor="middle"
          className="fill-white dark:fill-zinc-950 font-mono text-[10px] font-bold"
        >
          0 零线
        </text>

        {/* Hole Tolerance Zone */}
        <g>
          <rect
            x={holeX}
            y={holeTopY}
            width={barW}
            height={holeH}
            rx={4}
            className="fill-indigo-500/12 dark:fill-indigo-500/20"
          />
          <rect
            x={holeX}
            y={holeTopY}
            width={barW}
            height={holeH}
            rx={4}
            fill="url(#iso-hole-hatch)"
            className="stroke-indigo-500 dark:stroke-indigo-400"
            strokeWidth={1.8}
          />
          {holeH >= 22 && (
            <text
              x={holeX + barW / 2}
              y={holeTopY + holeH / 2 + 4.5}
              textAnchor="middle"
              className="fill-indigo-900 dark:fill-indigo-100 font-mono text-[13px] font-bold"
            >
              {fit.hole.designation} (IT{fit.hole.grade})
            </text>
          )}
          <text
            x={holeX + barW / 2}
            y={holeTopY - 7}
            textAnchor="middle"
            className="fill-indigo-600 dark:fill-indigo-300 font-mono text-[10.5px] font-semibold"
          >
            ES {formatSignedMicrons(fit.hole.upperDevMicrons)} µm
          </text>
          <text
            x={holeX + barW / 2}
            y={holeBotY + 14}
            textAnchor="middle"
            className="fill-indigo-600 dark:fill-indigo-300 font-mono text-[10.5px] font-semibold"
          >
            EI {formatSignedMicrons(fit.hole.lowerDevMicrons)} µm
          </text>
        </g>

        {/* Shaft Tolerance Zone */}
        <g>
          <rect
            x={shaftX}
            y={shaftTopY}
            width={barW}
            height={shaftH}
            rx={4}
            className="fill-amber-500/14 dark:fill-amber-500/20"
          />
          <rect
            x={shaftX}
            y={shaftTopY}
            width={barW}
            height={shaftH}
            rx={4}
            fill="url(#iso-shaft-hatch)"
            className="stroke-amber-500 dark:stroke-amber-400"
            strokeWidth={1.8}
          />
          {shaftH >= 22 && (
            <text
              x={shaftX + barW / 2}
              y={shaftTopY + shaftH / 2 + 4.5}
              textAnchor="middle"
              className="fill-amber-950 dark:fill-amber-100 font-mono text-[13px] font-bold"
            >
              {fit.shaft.designation} (IT{fit.shaft.grade})
            </text>
          )}
          <text
            x={shaftX + barW / 2}
            y={shaftTopY - 7}
            textAnchor="middle"
            className="fill-amber-700 dark:fill-amber-300 font-mono text-[10.5px] font-semibold"
          >
            es {formatSignedMicrons(fit.shaft.upperDevMicrons)} µm
          </text>
          <text
            x={shaftX + barW / 2}
            y={shaftBotY + 14}
            textAnchor="middle"
            className="fill-amber-700 dark:fill-amber-300 font-mono text-[10.5px] font-semibold"
          >
            ei {formatSignedMicrons(fit.shaft.lowerDevMicrons)} µm
          </text>
        </g>

        {/* Right Side Fit Envelope Callout Bracket */}
        <g>
          {/* Guide lines from extremes */}
          <line
            x1={holeX + barW}
            y1={holeTopY}
            x2={516}
            y2={holeTopY}
            stroke={fitBadgeColor}
            strokeOpacity={0.35}
            strokeDasharray="3 2"
          />
          <line
            x1={shaftX + barW}
            y1={shaftBotY}
            x2={516}
            y2={shaftBotY}
            stroke={fitBadgeColor}
            strokeOpacity={0.35}
            strokeDasharray="3 2"
          />
          {/* Vertical span bar */}
          <line
            x1={516}
            y1={Math.min(holeTopY, shaftBotY)}
            x2={516}
            y2={Math.max(holeTopY, shaftBotY)}
            stroke={fitBadgeColor}
            strokeWidth={2}
          />
          <circle cx={516} cy={holeTopY} r={3} fill={fitBadgeColor} />
          <circle cx={516} cy={shaftBotY} r={3} fill={fitBadgeColor} />

          {/* Summary callout box on right */}
          <rect
            x={526}
            y={Math.max(plotTop, Math.min(plotBottom - 76, (holeTopY + shaftBotY) / 2 - 36))}
            width={102}
            height={74}
            rx={8}
            className="fill-zinc-50 dark:fill-white/[0.04] stroke-zinc-200 dark:stroke-white/[0.1]"
            strokeWidth={1}
          />
          {(() => {
            const cy = Math.max(plotTop, Math.min(plotBottom - 76, (holeTopY + shaftBotY) / 2 - 36));
            return (
              <>
                <text
                  x={577}
                  y={cy + 18}
                  textAnchor="middle"
                  fill={fitBadgeColor}
                  className="font-mono text-[10px] font-bold"
                >
                  {fit.fitNature === "clearance"
                    ? "间隙配合"
                    : fit.fitNature === "transition"
                      ? "过渡配合"
                      : "过盈配合"}
                </text>
                <text
                  x={577}
                  y={cy + 36}
                  textAnchor="middle"
                  className="fill-zinc-800 dark:fill-zinc-100 font-mono text-[10.5px] font-semibold"
                >
                  {fit.fitNature === "interference"
                    ? `Ymax -${fit.maxInterferenceMicrons}`
                    : `Xmax +${fit.maxClearanceMicrons}`}
                </text>
                <text
                  x={577}
                  y={cy + 52}
                  textAnchor="middle"
                  className="fill-zinc-500 dark:fill-zinc-400 font-mono text-[10px]"
                >
                  {fit.fitNature === "clearance"
                    ? `Xmin +${fit.minClearanceMicrons}`
                    : fit.fitNature === "interference"
                      ? `Ymin -${fit.minInterferenceMicrons}`
                      : `Ymax -${fit.maxInterferenceMicrons}`}
                </text>
                <text
                  x={577}
                  y={cy + 66}
                  textAnchor="middle"
                  className="fill-zinc-400 dark:fill-zinc-500 font-mono text-[9.5px]"
                >
                  Tf = {fit.fitToleranceMicrons} µm
                </text>
              </>
            );
          })()}
        </g>

        {/* Live Measured Hole Pin */}
        {measHoleUm !== null && (
          <g>
            {(() => {
              const my = toY(measHoleUm);
              const ok =
                measHoleUm >= fit.hole.lowerDevMicrons - 1e-6 &&
                measHoleUm <= fit.hole.upperDevMicrons + 1e-6;
              const col = ok ? "#10b981" : "#f43f5e";
              return (
                <>
                  <line
                    x1={holeX - 8}
                    y1={my}
                    x2={holeX + barW + 8}
                    y2={my}
                    stroke={col}
                    strokeWidth={2}
                  />
                  <circle cx={holeX - 8} cy={my} r={4} fill={col} />
                  <text
                    x={holeX - 14}
                    y={my + 3.5}
                    textAnchor="end"
                    fill={col}
                    className="font-mono text-[9.5px] font-bold"
                  >
                    测{formatSignedMicrons(measHoleUm)}
                  </text>
                </>
              );
            })()}
          </g>
        )}

        {/* Live Measured Shaft Pin */}
        {measShaftUm !== null && (
          <g>
            {(() => {
              const my = toY(measShaftUm);
              const ok =
                measShaftUm >= fit.shaft.lowerDevMicrons - 1e-6 &&
                measShaftUm <= fit.shaft.upperDevMicrons + 1e-6;
              const col = ok ? "#10b981" : "#f43f5e";
              return (
                <>
                  <line
                    x1={shaftX - 8}
                    y1={my}
                    x2={shaftX + barW + 8}
                    y2={my}
                    stroke={col}
                    strokeWidth={2}
                  />
                  <circle cx={shaftX + barW + 8} cy={my} r={4} fill={col} />
                </>
              );
            })()}
          </g>
        )}

        {/* Footer Axis Caption */}
        <text
          x={holeX + barW / 2}
          y={height - 6}
          textAnchor="middle"
          className="fill-zinc-500 dark:fill-zinc-400 font-mono text-[10.5px]"
        >
          孔 {fit.hole.minSizeMm.toFixed(3)} ～ {fit.hole.maxSizeMm.toFixed(3)} mm
        </text>
        <text
          x={shaftX + barW / 2}
          y={height - 6}
          textAnchor="middle"
          className="fill-zinc-500 dark:fill-zinc-400 font-mono text-[10.5px]"
        >
          轴 {fit.shaft.minSizeMm.toFixed(3)} ～ {fit.shaft.maxSizeMm.toFixed(3)} mm
        </text>
      </svg>
    </div>
  );
};
