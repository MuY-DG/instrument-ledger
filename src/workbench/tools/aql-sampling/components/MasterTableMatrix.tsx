import React, { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, Table2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { PrecisionSwitch } from "@/components/ui/FormControls";
import type {
  AqlStandardEdition,
  InspectionLevel,
  InspectionSeverity,
  PrimaryCodeLetter,
  SamplingPlanResult,
  StandardAqlValue,
} from "../types";
import {
  INSPECTION_LEVELS,
  PERCENT_AQL_VALUES,
  PRIMARY_CODE_LETTERS,
  STANDARD_AQL_VALUES,
  TABLE_1_LOT_RANGES,
  formatAqlShort,
  getMasterTableCell,
  getMasterTableRows,
  getTableReferenceLabel,
  getTableSampleSize,
} from "../core/tables";

interface MasterTableMatrixProps {
  standard: AqlStandardEdition;
  severity: InspectionSeverity;
  level: InspectionLevel;
  plan: SamplingPlanResult;
  onSelectSeverity: (severity: InspectionSeverity) => void;
  onJumpToCodeAndAql: (code: PrimaryCodeLetter, aql: StandardAqlValue) => void;
  onJumpToLotAndLevel: (midLotSize: number, level: InspectionLevel) => void;
}

export const MasterTableMatrix: React.FC<MasterTableMatrixProps> = ({
  standard,
  severity,
  level,
  plan,
  onSelectSeverity,
  onJumpToCodeAndAql,
  onJumpToLotAndLevel,
}) => {
  const [tableView, setTableView] = useState<"table2" | "table1">("table2");
  const [showAllAql, setShowAllAql] = useState<boolean>(plan.isDefectsPerHundred);

  const aqlColumns = useMemo(
    () => (showAllAql || plan.isDefectsPerHundred ? STANDARD_AQL_VALUES : PERCENT_AQL_VALUES),
    [showAllAql, plan.isDefectsPerHundred]
  );

  const rows = useMemo(() => getMasterTableRows(severity), [severity]);

  const activeAqlColIdx = useMemo(() => {
    if (plan.aql === 0) return -1;
    return aqlColumns.indexOf(plan.aql);
  }, [plan.aql, aqlColumns]);

  const originalRowIdx = rows.indexOf(plan.originalCode);
  const effectiveRowIdx = rows.indexOf(plan.effectiveCode);

  const trailRowSet = useMemo(() => {
    const set = new Set<number>();
    if (originalRowIdx < 0 || effectiveRowIdx < 0 || originalRowIdx === effectiveRowIdx) {
      return set;
    }
    const lo = Math.min(originalRowIdx, effectiveRowIdx);
    const hi = Math.max(originalRowIdx, effectiveRowIdx);
    for (let i = lo; i <= hi; i++) {
      set.add(i);
    }
    return set;
  }, [originalRowIdx, effectiveRowIdx]);

  return (
    <div className="space-y-3.5">
      {/* Sub-toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex items-center p-0.5 rounded-lg bg-zinc-200/70 dark:bg-white/[0.06] border border-zinc-200/80 dark:border-white/[0.07]">
            <button
              type="button"
              onClick={() => setTableView("table2")}
              className={cn(
                "px-2.5 py-1 rounded-md text-xs font-medium transition-colors",
                tableView === "table2"
                  ? "bg-white dark:bg-white/[0.12] text-zinc-950 dark:text-white shadow-tactile"
                  : "text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white"
              )}
            >
              表 2 · 一次抽样主表 (Ac/Re)
            </button>
            <button
              type="button"
              onClick={() => setTableView("table1")}
              className={cn(
                "px-2.5 py-1 rounded-md text-xs font-medium transition-colors",
                tableView === "table1"
                  ? "bg-white dark:bg-white/[0.12] text-zinc-950 dark:text-white shadow-tactile"
                  : "text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white"
              )}
            >
              表 1 · 样本量字码表 (N × 水平)
            </button>
          </div>

          {tableView === "table2" && (
            <div className="inline-flex items-center p-0.5 rounded-lg bg-zinc-100 dark:bg-white/[0.04] border border-zinc-200/75 dark:border-white/[0.06]">
              {(
                [
                  ["normal", "正常 2-A"],
                  ["tightened", "加严 2-B"],
                  ["reduced", "放宽 2-C"],
                ] as const
              ).map(([sev, lbl]) => (
                <button
                  key={sev}
                  type="button"
                  onClick={() => onSelectSeverity(sev)}
                  className={cn(
                    "px-2 py-1 rounded-md text-[11px] font-medium transition-colors",
                    severity === sev
                      ? "bg-zinc-900 dark:bg-white text-white dark:text-zinc-950 shadow-hairline"
                      : "text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white"
                  )}
                >
                  {lbl}
                </button>
              ))}
            </div>
          )}
        </div>

        {tableView === "table2" && (
          <div className="flex items-center gap-3">
            <label className="inline-flex items-center gap-1.5 text-[11px] text-zinc-500 dark:text-zinc-400 cursor-pointer select-none">
              <PrecisionSwitch
                size="sm"
                checked={showAllAql}
                onChange={setShowAllAql}
                ariaLabel="显示完整 26 列 AQL"
              />
              <span>展开全部 26 列 (0.010 ~ 1000)</span>
            </label>
          </div>
        )}
      </div>

      {/* Table 2 Master Matrix */}
      {tableView === "table2" ? (
        <div className="rounded-2xl border border-zinc-200/90 dark:border-white/[0.09] bg-white dark:bg-[#111115] shadow-tactile overflow-hidden">
          <div className="px-4 py-2.5 border-b border-zinc-200/75 dark:border-white/[0.06] bg-zinc-50/70 dark:bg-white/[0.02] flex flex-wrap items-center justify-between gap-2 text-[11px]">
            <span className="inline-flex items-center gap-1.5 font-medium text-zinc-700 dark:text-zinc-200">
              <Table2 className="h-3.5 w-3.5 text-emerald-500" />
              {getTableReferenceLabel(standard, severity)}
            </span>
            <div className="flex flex-wrap items-center gap-3 text-[10.5px] text-zinc-500 dark:text-zinc-400">
              <span className="inline-flex items-center gap-1">
                <span className="h-2.5 w-2.5 rounded-sm bg-emerald-500/20 border border-emerald-500" />
                生效方案 ({plan.effectiveCode})
              </span>
              {plan.arrowFollowed && (
                <span className="inline-flex items-center gap-1">
                  <span className="h-2.5 w-2.5 rounded-sm bg-indigo-500/20 border border-indigo-400" />
                  箭头转移路径 ({plan.originalCode}
                  {plan.arrowFollowed === "down" ? "↓" : "↑"}
                  {plan.effectiveCode})
                </span>
              )}
              <span>点击任意单元格可跳转计算</span>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-center font-mono text-[11px] tabular-nums">
              <thead>
                <tr className="bg-zinc-50 dark:bg-white/[0.03] border-b border-zinc-200/80 dark:border-white/[0.07]">
                  <th className="sticky left-0 z-20 bg-zinc-50 dark:bg-[#15151a] px-2.5 py-2 text-[10.5px] font-sans font-semibold text-zinc-600 dark:text-zinc-300 border-r border-zinc-200/75 dark:border-white/[0.07]">
                    字码
                  </th>
                  <th className="sticky left-[46px] z-20 bg-zinc-50 dark:bg-[#15151a] px-2.5 py-2 text-[10.5px] font-sans font-semibold text-zinc-600 dark:text-zinc-300 border-r border-zinc-200/80 dark:border-white/[0.08]">
                    样本 n
                  </th>
                  {aqlColumns.map((aql, colIdx) => {
                    const isActiveCol = colIdx === activeAqlColIdx;
                    return (
                      <th
                        key={aql}
                        className={cn(
                          "px-2 py-2 font-semibold whitespace-nowrap border-r border-zinc-100 dark:border-white/[0.04] last:border-r-0",
                          isActiveCol
                            ? "bg-emerald-500/12 text-emerald-700 dark:text-emerald-300"
                            : "text-zinc-500 dark:text-zinc-400"
                        )}
                      >
                        {formatAqlShort(aql)}
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-white/[0.04]">
                {rows.map((code, rowIdx) => {
                  const nVal = getTableSampleSize(code, severity);
                  const isOriginalRow = rowIdx === originalRowIdx;
                  const isEffectiveRow = rowIdx === effectiveRowIdx;
                  const canDirectJump = PRIMARY_CODE_LETTERS.includes(
                    code as PrimaryCodeLetter
                  );

                  return (
                    <tr
                      key={code}
                      className={cn(
                        isEffectiveRow
                          ? "bg-emerald-500/[0.04]"
                          : isOriginalRow
                            ? "bg-indigo-500/[0.035]"
                            : "hover:bg-zinc-50/80 dark:hover:bg-white/[0.02]"
                      )}
                    >
                      <td
                        className={cn(
                          "sticky left-0 z-10 px-2.5 py-1.5 font-bold border-r border-zinc-200/75 dark:border-white/[0.07]",
                          isEffectiveRow
                            ? "bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300"
                            : isOriginalRow
                              ? "bg-indigo-50 dark:bg-indigo-950/50 text-indigo-700 dark:text-indigo-300"
                              : "bg-white dark:bg-[#111115] text-zinc-800 dark:text-zinc-200"
                        )}
                      >
                        {code}
                      </td>
                      <td
                        className={cn(
                          "sticky left-[46px] z-10 px-2.5 py-1.5 font-medium border-r border-zinc-200/80 dark:border-white/[0.08]",
                          isEffectiveRow
                            ? "bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 font-semibold"
                            : "bg-white dark:bg-[#111115] text-zinc-500 dark:text-zinc-400"
                        )}
                      >
                        {nVal}
                      </td>

                      {aqlColumns.map((aql, colIdx) => {
                        const globalAqlIdx = STANDARD_AQL_VALUES.indexOf(aql);
                        const cell = getMasterTableCell(
                          standard,
                          severity,
                          rowIdx,
                          globalAqlIdx
                        );
                        const isActiveCol = colIdx === activeAqlColIdx;
                        const isTargetCell = isActiveCol && isEffectiveRow;
                        const isTrailCell =
                          isActiveCol &&
                          !isTargetCell &&
                          trailRowSet.has(rowIdx);
                        const isOriginCell =
                          isActiveCol && isOriginalRow && !isTargetCell;

                        return (
                          <td
                            key={aql}
                            onClick={() => {
                              if (canDirectJump) {
                                onJumpToCodeAndAql(code as PrimaryCodeLetter, aql);
                              }
                            }}
                            title={
                              cell.kind === "plan"
                                ? `字码 ${code} (n=${nVal}) · AQL ${formatAqlShort(aql)} → Ac=${cell.ac}, Re=${cell.re}`
                                : `字码 ${code} · AQL ${formatAqlShort(aql)} → 沿${cell.direction === "down" ? "向下" : "向上"}箭头取首个有效方案`
                            }
                            className={cn(
                              "px-1.5 py-1.5 whitespace-nowrap border-r border-zinc-100/80 dark:border-white/[0.035] last:border-r-0 transition-colors",
                              canDirectJump && "cursor-pointer",
                              isTargetCell
                                ? "bg-emerald-500/20 dark:bg-emerald-500/25 ring-2 ring-inset ring-emerald-500 font-bold text-emerald-900 dark:text-emerald-100"
                                : isOriginCell
                                  ? "bg-indigo-500/20 dark:bg-indigo-500/25 ring-1 ring-inset ring-indigo-500 text-indigo-700 dark:text-indigo-200"
                                  : isTrailCell
                                    ? "bg-indigo-500/10 dark:bg-indigo-500/15 text-indigo-600 dark:text-indigo-300"
                                    : isActiveCol
                                      ? "bg-emerald-500/[0.04]"
                                      : ""
                            )}
                          >
                            {cell.kind === "plan" ? (
                              <span>
                                <span
                                  className={cn(
                                    isTargetCell
                                      ? "text-emerald-800 dark:text-emerald-200"
                                      : "text-zinc-800 dark:text-zinc-200"
                                  )}
                                >
                                  {cell.ac}
                                </span>
                                <span className="text-zinc-300 dark:text-zinc-600 mx-0.5">
                                  /
                                </span>
                                <span
                                  className={cn(
                                    cell.re > cell.ac + 1
                                      ? "text-amber-600 dark:text-amber-400 font-semibold"
                                      : isTargetCell
                                        ? "text-rose-700 dark:text-rose-300"
                                        : "text-zinc-500 dark:text-zinc-400"
                                  )}
                                >
                                  {cell.re}
                                </span>
                              </span>
                            ) : (
                              <span
                                className={cn(
                                  "inline-flex items-center justify-center",
                                  isTrailCell || isOriginCell
                                    ? "text-indigo-600 dark:text-indigo-300"
                                    : "text-zinc-300 dark:text-zinc-600"
                                )}
                              >
                                {cell.direction === "down" ? (
                                  <ArrowDown className="h-3 w-3" />
                                ) : (
                                  <ArrowUp className="h-3 w-3" />
                                )}
                              </span>
                            )}
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
      ) : (
        /* Table 1 Sample Size Code Letters */
        <div className="rounded-2xl border border-zinc-200/90 dark:border-white/[0.09] bg-white dark:bg-[#111115] shadow-tactile overflow-hidden">
          <div className="px-4 py-2.5 border-b border-zinc-200/75 dark:border-white/[0.06] bg-zinc-50/70 dark:bg-white/[0.02] flex items-center justify-between text-[11px]">
            <span className="inline-flex items-center gap-1.5 font-medium text-zinc-700 dark:text-zinc-200">
              <Table2 className="h-3.5 w-3.5 text-emerald-500" />
              表 1 · 样本量字码表（GB/T 2828.1-2012 / ANSI Z1.4 通用）
            </span>
            <span className="text-zinc-400 dark:text-zinc-500">
              点击任意行/列单元格可切换批量区间与检验水平
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-center text-xs font-mono tabular-nums">
              <thead>
                <tr className="bg-zinc-50 dark:bg-white/[0.03] border-b border-zinc-200/80 dark:border-white/[0.07]">
                  <th
                    rowSpan={2}
                    className="px-3.5 py-2 text-left font-sans font-semibold text-zinc-600 dark:text-zinc-300 border-r border-zinc-200/80 dark:border-white/[0.08]"
                  >
                    批量范围 (N)
                  </th>
                  <th
                    colSpan={4}
                    className="px-2 py-1.5 font-sans text-[11px] font-semibold text-indigo-600 dark:text-indigo-300 border-b border-r border-zinc-200/80 dark:border-white/[0.08]"
                  >
                    特殊检验水平
                  </th>
                  <th
                    colSpan={3}
                    className="px-2 py-1.5 font-sans text-[11px] font-semibold text-emerald-600 dark:text-emerald-300 border-b border-zinc-200/80 dark:border-white/[0.08]"
                  >
                    一般检验水平
                  </th>
                </tr>
                <tr className="bg-zinc-50/70 dark:bg-white/[0.02] border-b border-zinc-200/80 dark:border-white/[0.07]">
                  {INSPECTION_LEVELS.map((lv) => (
                    <th
                      key={lv}
                      className={cn(
                        "px-3 py-1.5 font-semibold border-r border-zinc-100 dark:border-white/[0.05] last:border-r-0",
                        lv === level
                          ? "bg-emerald-500/12 text-emerald-700 dark:text-emerald-300"
                          : "text-zinc-500 dark:text-zinc-400"
                      )}
                    >
                      {lv}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-white/[0.04]">
                {TABLE_1_LOT_RANGES.map((range) => {
                  const isActiveRow = plan.lotRange?.id === range.id;
                  const sampleLot =
                    range.max !== null
                      ? Math.round((range.min + range.max) / 2)
                      : 600000;
                  return (
                    <tr
                      key={range.id}
                      className={cn(
                        isActiveRow
                          ? "bg-emerald-500/[0.05]"
                          : "hover:bg-zinc-50/70 dark:hover:bg-white/[0.02]"
                      )}
                    >
                      <td
                        className={cn(
                          "px-3.5 py-2 text-left font-medium border-r border-zinc-200/80 dark:border-white/[0.08] whitespace-nowrap",
                          isActiveRow
                            ? "text-emerald-700 dark:text-emerald-300 font-semibold"
                            : "text-zinc-700 dark:text-zinc-300"
                        )}
                      >
                        {range.label}
                      </td>
                      {INSPECTION_LEVELS.map((lv) => {
                        const isTarget = isActiveRow && lv === level;
                        return (
                          <td
                            key={lv}
                            onClick={() => onJumpToLotAndLevel(sampleLot, lv)}
                            className={cn(
                              "px-3 py-2 cursor-pointer border-r border-zinc-100/80 dark:border-white/[0.04] last:border-r-0 transition-colors",
                              isTarget
                                ? "bg-emerald-500/20 dark:bg-emerald-500/25 ring-2 ring-inset ring-emerald-500 font-bold text-emerald-900 dark:text-emerald-100"
                                : lv === level
                                  ? "bg-emerald-500/[0.03] text-zinc-800 dark:text-zinc-200"
                                  : "text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-white/[0.06]"
                            )}
                          >
                            {range.codes[lv]}
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
      )}
    </div>
  );
};
