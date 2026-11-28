import React, { useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Plus,
  Sigma,
  Trash2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { SpcAnalysisResult } from "../types";
import { inferDisplayDecimals } from "../core/parser";

interface NormalityAndDataPanelProps {
  result: SpcAnalysisResult;
  unit: string;
  onUpdateValue: (index: number, nextValue: number) => void;
  onDeleteValue: (index: number) => void;
  onAddValue: (value: number) => void;
}

const QQ_W = 540;
const QQ_H = 290;
const QQ_PAD = { top: 22, right: 24, bottom: 42, left: 54 };
const QQ_PLOT_W = QQ_W - QQ_PAD.left - QQ_PAD.right;
const QQ_PLOT_H = QQ_H - QQ_PAD.top - QQ_PAD.bottom;

export const NormalityAndDataPanel: React.FC<NormalityAndDataPanelProps> = ({
  result,
  unit,
  onUpdateValue,
  onDeleteValue,
  onAddValue,
}) => {
  const [filterMode, setFilterMode] = useState<"all" | "oos">("all");
  const [newValInput, setNewValInput] = useState("");
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const [editingText, setEditingText] = useState("");

  const { spec, normality, values } = result;
  const dec = inferDisplayDecimals(
    spec.usl !== null && spec.lsl !== null ? spec.usl - spec.lsl : result.range
  );

  const hasLsl =
    (spec.toleranceType === "bilateral" || spec.toleranceType === "lower_only") &&
    spec.lsl !== null;
  const hasUsl =
    (spec.toleranceType === "bilateral" || spec.toleranceType === "upper_only") &&
    spec.usl !== null;

  const oosSet = useMemo(() => new Set(result.observed.oosIndices), [result.observed.oosIndices]);

  // Q-Q Plot coordinate bounds
  const qqGeom = useMemo(() => {
    const pts = normality.points;
    if (pts.length < 2) return null;
    const xMinRaw = pts[0].value;
    const xMaxRaw = pts[pts.length - 1].value;
    const xSpan = Math.max(xMaxRaw - xMinRaw, 1e-6);
    const xMin = xMinRaw - xSpan * 0.08;
    const xMax = xMaxRaw + xSpan * 0.08;

    const zMin = Math.min(-2.8, pts[0].expectedZ - 0.35);
    const zMax = Math.max(2.8, pts[pts.length - 1].expectedZ + 0.35);

    const toX = (v: number) => QQ_PAD.left + ((v - xMin) / (xMax - xMin)) * QQ_PLOT_W;
    const toY = (z: number) => QQ_PAD.top + (1 - (z - zMin) / (zMax - zMin)) * QQ_PLOT_H;

    // Reference straight line: x = mean + sigma * z => z = (x - mean) / sigma
    const lineZ1 = Math.max(zMin, (xMin - result.mean) / Math.max(result.sigmaOverall, 1e-9));
    const lineZ2 = Math.min(zMax, (xMax - result.mean) / Math.max(result.sigmaOverall, 1e-9));
    const lineX1 = result.mean + lineZ1 * result.sigmaOverall;
    const lineX2 = result.mean + lineZ2 * result.sigmaOverall;

    return {
      xMin,
      xMax,
      zMin,
      zMax,
      toX,
      toY,
      line: {
        x1: toX(lineX1),
        y1: toY(lineZ1),
        x2: toX(lineX2),
        y2: toY(lineZ2),
      },
    };
  }, [normality.points, result.mean, result.sigmaOverall]);

  const rows = useMemo(() => {
    const out: Array<{
      index: number;
      subgroup: number;
      value: number;
      status: "ok" | "high" | "low";
    }> = [];
    for (let i = 0; i < values.length; i++) {
      const v = values[i];
      const isHigh = hasUsl && v > (spec.usl as number);
      const isLow = hasLsl && v < (spec.lsl as number);
      const status = isHigh ? "high" : isLow ? "low" : "ok";
      if (filterMode === "oos" && status === "ok") continue;
      out.push({
        index: i,
        subgroup: Math.floor(i / result.subgroupSize) + 1,
        value: v,
        status,
      });
    }
    return out;
  }, [values, hasLsl, hasUsl, spec, filterMode, result.subgroupSize]);

  const commitEdit = (idx: number) => {
    const parsed = Number(editingText.trim());
    if (Number.isFinite(parsed)) {
      onUpdateValue(idx, parsed);
    }
    setEditingIdx(null);
  };

  const handleAdd = () => {
    const parsed = Number(newValInput.trim());
    if (!Number.isFinite(parsed)) return;
    onAddValue(parsed);
    setNewValInput("");
  };

  return (
    <div className="space-y-4">
      {/* Top Row: Normal Probability Plot + Descriptive Stats Card */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Normal Probability Plot (Q-Q) */}
        <div className="lg:col-span-7 rounded-2xl border border-zinc-200/90 dark:border-white/[0.09] bg-white dark:bg-[#111115] shadow-tactile overflow-hidden">
          <div className="px-4 py-2.5 border-b border-zinc-200/75 dark:border-white/[0.06] bg-zinc-50/70 dark:bg-white/[0.02] flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Sigma className="h-4 w-4 text-indigo-500" />
              <h3 className="text-xs font-semibold text-zinc-900 dark:text-zinc-100">
                正态概率图 (Normal Probability Plot · Blom Q-Q)
              </h3>
            </div>
            {normality.valid && (
              <span
                className={cn(
                  "inline-flex items-center gap-1 px-2 py-0.5 rounded-md font-mono text-[10.5px] font-semibold",
                  normality.isNormal
                    ? "bg-emerald-500/12 text-emerald-700 dark:text-emerald-300"
                    : "bg-amber-500/14 text-amber-700 dark:text-amber-300"
                )}
              >
                {normality.isNormal ? (
                  <CheckCircle2 className="h-3 w-3" />
                ) : (
                  <AlertTriangle className="h-3 w-3" />
                )}
                <span>
                  A²* = {normality.adAdjusted.toFixed(3)} · p ={" "}
                  {normality.pValue < 0.001 ? "< 0.001" : normality.pValue.toFixed(3)}
                </span>
              </span>
            )}
          </div>

          <div className="p-4">
            {qqGeom ? (
              <svg
                viewBox={`0 0 ${QQ_W} ${QQ_H}`}
                className="w-full h-auto max-h-[290px] select-none"
              >
                {/* Horizontal percentile gridlines (1%, 10%, 50%, 90%, 99%) */}
                {[
                  { z: -2.326, lbl: "1%" },
                  { z: -1.282, lbl: "10%" },
                  { z: 0, lbl: "50%" },
                  { z: 1.282, lbl: "90%" },
                  { z: 2.326, lbl: "99%" },
                ].map((t) => {
                  const y = qqGeom.toY(t.z);
                  if (y < QQ_PAD.top - 4 || y > QQ_H - QQ_PAD.bottom + 4) return null;
                  return (
                    <g key={t.lbl}>
                      <line
                        x1={QQ_PAD.left}
                        y1={y}
                        x2={QQ_W - QQ_PAD.right}
                        y2={y}
                        stroke="currentColor"
                        className={
                          t.z === 0
                            ? "text-zinc-300 dark:text-white/[0.12]"
                            : "text-zinc-100 dark:text-white/[0.05]"
                        }
                        strokeDasharray={t.z === 0 ? "4 3" : undefined}
                      />
                      <text
                        x={QQ_PAD.left - 8}
                        y={y + 3.5}
                        textAnchor="end"
                        className="text-[9.5px] font-mono fill-current text-zinc-400"
                      >
                        {t.lbl}
                      </text>
                    </g>
                  );
                })}

                {/* Theoretical Normal Line */}
                <line
                  x1={qqGeom.line.x1}
                  y1={qqGeom.line.y1}
                  x2={qqGeom.line.x2}
                  y2={qqGeom.line.y2}
                  stroke="#f43f5e"
                  strokeWidth={1.65}
                  strokeDasharray="5 3"
                />

                {/* Observed sorted points */}
                {normality.points.map((pt, i) => (
                  <circle
                    key={i}
                    cx={qqGeom.toX(pt.value)}
                    cy={qqGeom.toY(pt.expectedZ)}
                    r={3.1}
                    className="fill-indigo-500/80 dark:fill-indigo-400/85 stroke-white dark:stroke-[#111115]"
                    strokeWidth={0.8}
                  >
                    <title>
                      实测 {pt.value.toFixed(dec)} | 累计分位 {pt.percentile.toFixed(1)}% (Z=
                      {pt.expectedZ.toFixed(2)})
                    </title>
                  </circle>
                ))}

                {/* X-axis ticks */}
                {[0, 0.25, 0.5, 0.75, 1].map((f) => {
                  const v = qqGeom.xMin + f * (qqGeom.xMax - qqGeom.xMin);
                  return (
                    <text
                      key={f}
                      x={qqGeom.toX(v)}
                      y={QQ_H - QQ_PAD.bottom + 16}
                      textAnchor="middle"
                      className="text-[9.5px] font-mono fill-current text-zinc-400"
                    >
                      {v.toFixed(dec)}
                    </text>
                  );
                })}

                <text
                  x={QQ_PAD.left + QQ_PLOT_W / 2}
                  y={QQ_H - 6}
                  textAnchor="middle"
                  className="text-[10px] fill-current text-zinc-500 dark:text-zinc-400"
                >
                  排序实测值{unit ? ` (${unit})` : ""}
                </text>
                <text
                  x={14}
                  y={QQ_PAD.top + QQ_PLOT_H / 2}
                  textAnchor="middle"
                  transform={`rotate(-90 14 ${QQ_PAD.top + QQ_PLOT_H / 2})`}
                  className="text-[10px] fill-current text-zinc-500 dark:text-zinc-400"
                >
                  正态累计概率
                </text>
              </svg>
            ) : (
              <div className="py-16 text-center text-xs text-zinc-400">
                至少需要 4 个非零方差样本以绘制正态概率图
              </div>
            )}
          </div>
        </div>

        {/* Full Descriptive Statistics Card */}
        <div className="lg:col-span-5 rounded-2xl border border-zinc-200/90 dark:border-white/[0.09] bg-white dark:bg-[#111115] shadow-tactile overflow-hidden flex flex-col">
          <div className="px-4 py-2.5 border-b border-zinc-200/75 dark:border-white/[0.06] bg-zinc-50/70 dark:bg-white/[0.02] flex items-center justify-between">
            <h3 className="text-xs font-semibold text-zinc-900 dark:text-zinc-100">
              全量描述统计与正态性诊断
            </h3>
            <span className="font-mono text-[10.5px] text-zinc-400">
              N = {result.count}
            </span>
          </div>

          <div className="p-4 flex-1 flex flex-col justify-between gap-3">
            <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
              {[
                ["样本均值 (x̄)", `${result.mean.toFixed(dec)}${unit ? ` ${unit}` : ""}`],
                ["中位数 (Median)", `${result.median.toFixed(dec)}${unit ? ` ${unit}` : ""}`],
                ["最小值 (Min)", result.min.toFixed(dec)],
                ["最大值 (Max)", result.max.toFixed(dec)],
                ["全距 (Range)", result.range.toFixed(dec)],
                ["四分位距 (IQR)", result.iqr.toFixed(dec)],
                ["下四分位 (Q1)", result.q1.toFixed(dec)],
                ["上四分位 (Q3)", result.q3.toFixed(dec)],
                ["组内标准差 σw", result.sigmaWithin.toFixed(dec + 2)],
                ["整体标准差 σo", result.sigmaOverall.toFixed(dec + 2)],
                ["偏度 (Skewness)", result.skewness.toFixed(3)],
                ["超额峰度 (Kurtosis)", result.kurtosis.toFixed(3)],
              ].map(([k, v]) => (
                <div
                  key={k}
                  className="flex items-center justify-between gap-2 py-1 border-b border-zinc-100 dark:border-white/[0.05]"
                >
                  <span className="text-[11px] text-zinc-500 dark:text-zinc-400">{k}</span>
                  <span className="font-mono font-semibold tabular-nums text-zinc-900 dark:text-zinc-100">
                    {v}
                  </span>
                </div>
              ))}
            </div>

            <div
              className={cn(
                "rounded-xl border px-3 py-2.5 text-[11px] leading-relaxed",
                normality.isNormal
                  ? "border-emerald-200/80 dark:border-emerald-500/25 bg-emerald-50/55 dark:bg-emerald-500/[0.06] text-emerald-800 dark:text-emerald-200"
                  : "border-amber-200/85 dark:border-amber-500/30 bg-amber-50/65 dark:bg-amber-500/[0.07] text-amber-800 dark:text-amber-200"
              )}
            >
              <div className="font-semibold mb-0.5">
                Anderson-Darling 检验结论（α = 0.05）：
                {normality.isNormal ? "接受正态假设" : "显著偏离正态分布"}
              </div>
              <p className="text-[10.5px] opacity-85">
                {normality.isNormal
                  ? "数据点紧密贴合正态参考直线，经典正态 Cp/Cpk 与 PPM 估算可靠。"
                  : "散点呈现 S 形弯曲或阶梯分叉，常见于双模腔混料、过程漂移或单边物理边界（如平面度/同轴度）。"}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom: Interactive Raw Measurements Inspector Table */}
      <div className="rounded-2xl border border-zinc-200/90 dark:border-white/[0.09] bg-white dark:bg-[#111115] shadow-tactile overflow-hidden">
        <div className="px-4 py-2.5 border-b border-zinc-200/75 dark:border-white/[0.06] bg-zinc-50/70 dark:bg-white/[0.02] flex flex-wrap items-center justify-between gap-2.5">
          <div className="flex items-center gap-2">
            <h3 className="text-xs font-semibold text-zinc-900 dark:text-zinc-100">
              实测数据明细表（双击数值可就地修正异常录入）
            </h3>
            <div className="inline-flex items-center p-0.5 rounded-md bg-zinc-200/65 dark:bg-white/[0.06] text-[10.5px]">
              <button
                type="button"
                onClick={() => setFilterMode("all")}
                className={cn(
                  "px-2 py-0.5 rounded font-medium transition-colors",
                  filterMode === "all"
                    ? "bg-white dark:bg-white/[0.14] text-zinc-950 dark:text-white shadow-hairline"
                    : "text-zinc-500 dark:text-zinc-400"
                )}
              >
                全部 ({values.length})
              </button>
              <button
                type="button"
                onClick={() => setFilterMode("oos")}
                className={cn(
                  "px-2 py-0.5 rounded font-medium transition-colors",
                  filterMode === "oos"
                    ? "bg-white dark:bg-white/[0.14] text-rose-600 dark:text-rose-300 shadow-hairline"
                    : "text-zinc-500 dark:text-zinc-400"
                )}
              >
                仅超差 ({oosSet.size})
              </button>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <input
              type="number"
              step="any"
              value={newValInput}
              onChange={(e) => setNewValInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleAdd();
              }}
              placeholder="追加实测值..."
              className="precision-field w-32 rounded-lg border border-zinc-200/95 dark:border-white/[0.1] bg-white dark:bg-white/[0.04] px-2.5 py-1 font-mono text-xs text-zinc-900 dark:text-zinc-100"
            />
            <button
              type="button"
              onClick={handleAdd}
              className="btn-tactile inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-zinc-900 dark:bg-white text-white dark:text-zinc-950 text-[11px] font-medium"
            >
              <Plus className="h-3 w-3" />
              <span>添加</span>
            </button>
          </div>
        </div>

        <div className="max-h-[300px] overflow-y-auto">
          {rows.length === 0 ? (
            <div className="py-10 text-center text-xs text-zinc-400">
              {filterMode === "oos" ? "当前无超出公差限的样本点 🎉" : "暂无实测数据"}
            </div>
          ) : (
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-zinc-50/95 dark:bg-[#141418]/95 backdrop-blur border-b border-zinc-200/75 dark:border-white/[0.06] text-[10.5px] text-zinc-500 dark:text-zinc-400">
                <tr>
                  <th className="text-left font-medium px-4 py-2 w-16">序号</th>
                  <th className="text-left font-medium px-3 py-2 w-24">所属子组</th>
                  <th className="text-right font-medium px-3 py-2">
                    实测值{unit ? ` (${unit})` : ""}
                  </th>
                  <th className="text-right font-medium px-3 py-2">距均值偏差</th>
                  <th className="text-center font-medium px-3 py-2 w-28">规格判定</th>
                  <th className="text-right font-medium px-4 py-2 w-16">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-white/[0.05] font-mono tabular-nums">
                {rows.map((r) => {
                  const isEditing = editingIdx === r.index;
                  const diff = r.value - result.mean;
                  return (
                    <tr
                      key={r.index}
                      className={cn(
                        "transition-colors hover:bg-zinc-50/70 dark:hover:bg-white/[0.02]",
                        r.status !== "ok" && "bg-rose-50/45 dark:bg-rose-500/[0.05]"
                      )}
                    >
                      <td className="px-4 py-1.5 text-zinc-400">#{r.index + 1}</td>
                      <td className="px-3 py-1.5 text-zinc-500 dark:text-zinc-400">
                        {r.subgroup <= result.subgroups.length
                          ? `组 #${r.subgroup}`
                          : "尾数"}
                      </td>
                      <td
                        className="px-3 py-1.5 text-right font-semibold text-zinc-900 dark:text-zinc-100 cursor-text"
                        onDoubleClick={() => {
                          setEditingIdx(r.index);
                          setEditingText(String(r.value));
                        }}
                      >
                        {isEditing ? (
                          <input
                            type="number"
                            step="any"
                            autoFocus
                            value={editingText}
                            onChange={(e) => setEditingText(e.target.value)}
                            onBlur={() => commitEdit(r.index)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") commitEdit(r.index);
                              if (e.key === "Escape") setEditingIdx(null);
                            }}
                            className="w-28 text-right rounded border border-indigo-400 bg-white dark:bg-[#1a1a22] px-1.5 py-0.5 font-mono text-xs focus:outline-none"
                          />
                        ) : (
                          r.value.toFixed(dec)
                        )}
                      </td>
                      <td className="px-3 py-1.5 text-right text-zinc-500 dark:text-zinc-400">
                        {diff >= 0 ? "+" : ""}
                        {diff.toFixed(dec)}
                      </td>
                      <td className="px-3 py-1.5 text-center font-sans">
                        {r.status === "high" ? (
                          <span className="px-1.5 py-0.5 rounded bg-rose-500/15 text-rose-700 dark:text-rose-300 text-[10px] font-semibold">
                            超上限 &gt;USL
                          </span>
                        ) : r.status === "low" ? (
                          <span className="px-1.5 py-0.5 rounded bg-rose-500/15 text-rose-700 dark:text-rose-300 text-[10px] font-semibold">
                            超下限 &lt;LSL
                          </span>
                        ) : (
                          <span className="px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 text-[10px] font-medium">
                            合格 OK
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-1.5 text-right">
                        <button
                          type="button"
                          onClick={() => onDeleteValue(r.index)}
                          title="删除该条实测值"
                          className="p-1 rounded text-zinc-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
};
