import React, { useMemo, useRef, useState } from "react";
import { motion } from "motion/react";
import {
  AlertTriangle,
  BookmarkPlus,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Plus,
  Sparkles,
  Trash2,
  XCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { TAP_SCALE, TAP_SCALE_SUBTLE } from "@/lib/motion";
import { PrecisionSelect, type SelectOption } from "@/components/ui/FormControls";
import type {
  ChecksheetItem,
  ChecksheetItemMode,
  ChecksheetMetadata,
  Iso2768GeomClass,
  Iso2768LinearClass,
  Iso286ItGrade,
  ResolvedChecksheetRow,
} from "../types";
import { CHECKSHEET_SCENE_PRESETS } from "../core/presets";
import { summarizeChecksheet } from "../core/inspector";
import {
  ISO286_HOLE_LETTERS,
  ISO286_IT_GRADES,
  ISO286_SHAFT_LETTERS,
} from "../core/iso286Tables";

const MODE_OPTIONS: readonly SelectOption<ChecksheetItemMode>[] = [
  { value: "iso2768_linear", label: "ISO 2768 线性尺寸" },
  { value: "iso2768_chamfer", label: "ISO 2768 倒圆/倒角" },
  { value: "iso2768_angular", label: "ISO 2768 角度尺寸" },
  { value: "iso2768_gdt", label: "ISO 2768-2 形位公差" },
  { value: "iso286_hole", label: "ISO 286 孔公差带" },
  { value: "iso286_shaft", label: "ISO 286 轴公差带" },
  { value: "custom", label: "图纸自定义 ± 公差" },
];

const STAGES: readonly ChecksheetMetadata["stage"][] = [
  "FAI",
  "IQC",
  "IPQC",
  "OQC",
  "ME",
] as const;

interface BatchInspectorPanelProps {
  rows: readonly ResolvedChecksheetRow[];
  meta: ChecksheetMetadata;
  onChangeMeta: (patch: Partial<ChecksheetMetadata>) => void;
  onAddItem: (item: Omit<ChecksheetItem, "id" | "balloonNo">) => void;
  onUpdateItem: (id: string, patch: Partial<ChecksheetItem>) => void;
  onDeleteItem: (id: string) => void;
  onClearItems: () => void;
  onApplyPreset: (presetId: string) => void;
  onSaveArchive: () => void;
}

export const BatchInspectorPanel: React.FC<BatchInspectorPanelProps> = ({
  rows,
  meta,
  onChangeMeta,
  onAddItem,
  onUpdateItem,
  onDeleteItem,
  onClearItems,
  onApplyPreset,
  onSaveArchive,
}) => {
  const [metaExpanded, setMetaExpanded] = useState(false);

  // Quick-add form state
  const [newMode, setNewMode] = useState<ChecksheetItemMode>("iso2768_linear");
  const [newName, setNewName] = useState("");
  const [newNominal, setNewNominal] = useState("25");
  const [newShortSide, setNewShortSide] = useState("25");
  const [newLinClass, setNewLinClass] = useState<Iso2768LinearClass>("m");
  const [newGeomClass, setNewGeomClass] = useState<Iso2768GeomClass>("K");
  const [newGdtKind, setNewGdtKind] = useState<
    NonNullable<ChecksheetItem["gdtKind"]>
  >("straightness_flatness");
  const [newLetter, setNewLetter] = useState("H");
  const [newGrade, setNewGrade] = useState<Iso286ItGrade>("7");
  const [newUpperDev, setNewUpperDev] = useState("0.05");
  const [newLowerDev, setNewLowerDev] = useState("-0.05");

  const measInputRefs = useRef<Array<HTMLInputElement | null>>([]);
  const summary = useMemo(() => summarizeChecksheet(rows), [rows]);

  const handleQuickAdd = (e: React.FormEvent) => {
    e.preventDefault();
    const nom = Number(newNominal);
    if (!Number.isFinite(nom) || nom <= 0) return;

    const autoName =
      newName.trim() ||
      (newMode === "iso286_hole"
        ? `孔径 Ø${nom} ${newLetter.toUpperCase()}${newGrade}`
        : newMode === "iso286_shaft"
          ? `轴径 Ø${nom} ${newLetter.toLowerCase()}${newGrade}`
          : newMode === "iso2768_angular"
            ? `角度 ${nom}°`
            : newMode === "iso2768_gdt"
              ? `未注形位 (L=${nom}mm)`
              : `尺寸 ${nom} mm`);

    onAddItem({
      featureName: autoName,
      mode: newMode,
      nominal: nom,
      shortSideMm: newMode === "iso2768_angular" ? Number(newShortSide) || 20 : undefined,
      iso2768LinearClass:
        newMode === "iso2768_linear" ||
        newMode === "iso2768_chamfer" ||
        newMode === "iso2768_angular"
          ? newLinClass
          : undefined,
      iso2768GeomClass: newMode === "iso2768_gdt" ? newGeomClass : undefined,
      gdtKind: newMode === "iso2768_gdt" ? newGdtKind : undefined,
      iso286Letter:
        newMode === "iso286_hole"
          ? newLetter.toUpperCase()
          : newMode === "iso286_shaft"
            ? newLetter.toLowerCase()
            : undefined,
      iso286Grade:
        newMode === "iso286_hole" || newMode === "iso286_shaft" ? newGrade : undefined,
      customUpperDevMm: newMode === "custom" ? Number(newUpperDev) || 0.05 : undefined,
      customLowerDevMm: newMode === "custom" ? Number(newLowerDev) || -0.05 : undefined,
      measured: null,
      unit: newMode === "iso2768_angular" ? "°" : "mm",
    });
    setNewName("");
  };

  return (
    <div className="space-y-4">
      {/* Scene Preset Bar */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1">
        <span className="inline-flex items-center gap-1 text-[11px] font-medium text-zinc-400 shrink-0">
          <Sparkles className="h-3 w-3 text-amber-500" />
          <span>检验单模板</span>
        </span>
        {CHECKSHEET_SCENE_PRESETS.map((preset) => (
          <motion.button
            key={preset.id}
            type="button"
            whileTap={TAP_SCALE_SUBTLE}
            onClick={() => onApplyPreset(preset.id)}
            title={preset.description}
            className="shrink-0 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-zinc-200/90 dark:border-white/[0.08] bg-zinc-50/75 dark:bg-white/[0.03] hover:border-amber-300 dark:hover:border-amber-500/40 text-[11px] font-medium text-zinc-700 dark:text-zinc-300 transition-colors"
          >
            <span className="px-1 py-0.2 rounded bg-zinc-200/70 dark:bg-white/[0.08] font-mono text-[9.5px] text-zinc-600 dark:text-zinc-400">
              {preset.stage}
            </span>
            <span>{preset.name}</span>
          </motion.button>
        ))}
      </div>

      {/* Verdict KPI Summary Strip */}
      <div className="rounded-2xl border border-zinc-200/90 dark:border-white/[0.09] bg-white dark:bg-[#111115] p-4 shadow-tactile flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-4">
          <div
            className={cn(
              "px-3.5 py-2 rounded-xl border font-mono text-sm font-bold flex items-center gap-2",
              summary.overallVerdict === "FAIL"
                ? "bg-rose-500/10 border-rose-500/30 text-rose-700 dark:text-rose-300"
                : summary.overallVerdict === "PASS"
                  ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-700 dark:text-emerald-300"
                  : "bg-zinc-100 dark:bg-white/[0.05] border-zinc-200 dark:border-white/[0.08] text-zinc-600 dark:text-zinc-300"
            )}
          >
            {summary.overallVerdict === "FAIL" ? (
              <XCircle className="h-4 w-4" />
            ) : summary.overallVerdict === "PASS" ? (
              <CheckCircle2 className="h-4 w-4" />
            ) : (
              <AlertTriangle className="h-4 w-4" />
            )}
            <span>
              {summary.overallVerdict === "FAIL"
                ? "FAIL · 存在超差"
                : summary.overallVerdict === "PASS"
                  ? "PASS · 全检合格"
                  : "PENDING · 待录实测"}
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-3 text-xs font-mono tabular-nums">
            <span className="text-zinc-500 dark:text-zinc-400">
              共 <b className="text-zinc-900 dark:text-white">{summary.total}</b> 项
            </span>
            <span className="text-emerald-600 dark:text-emerald-400">
              OK <b>{summary.okCount}</b>
            </span>
            <span className="text-amber-600 dark:text-amber-400">
              临界 <b>{summary.warningCount}</b>
            </span>
            <span className="text-rose-600 dark:text-rose-400">
              NG <b>{summary.ngCount}</b>
            </span>
            {summary.passRatePercent !== null && (
              <span className="px-2 py-0.5 rounded bg-zinc-100 dark:bg-white/[0.06] text-zinc-700 dark:text-zinc-200">
                合格率 {summary.passRatePercent}%
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setMetaExpanded((v) => !v)}
            className="btn-tactile inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-zinc-200/90 dark:border-white/[0.1] bg-zinc-50 dark:bg-white/[0.03] text-xs font-medium text-zinc-600 dark:text-zinc-300"
          >
            <span>单据信息</span>
            {metaExpanded ? (
              <ChevronUp className="h-3.5 w-3.5" />
            ) : (
              <ChevronDown className="h-3.5 w-3.5" />
            )}
          </button>

          <motion.button
            type="button"
            whileTap={TAP_SCALE}
            onClick={onSaveArchive}
            className="btn-tactile inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-900 dark:bg-white text-white dark:text-zinc-950 text-xs font-medium shadow-tactile-primary"
          >
            <BookmarkPlus className="h-3.5 w-3.5" />
            <span>归档本检验单</span>
          </motion.button>
        </div>
      </div>

      {/* Collapsible Metadata Card */}
      {metaExpanded && (
        <div className="rounded-2xl border border-zinc-200/90 dark:border-white/[0.09] bg-white dark:bg-[#111115] p-4 shadow-tactile grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="space-y-1">
            <label className="text-[11px] font-medium text-zinc-500">零件 / 物料名称</label>
            <input
              type="text"
              value={meta.partName}
              onChange={(e) => onChangeMeta({ partName: e.target.value })}
              placeholder="如：伺服电机前端盖"
              className="precision-field w-full rounded-lg border border-zinc-200 dark:border-white/[0.1] bg-zinc-50/50 dark:bg-white/[0.03] px-2.5 py-1.5 text-xs text-zinc-900 dark:text-white"
            />
          </div>
          <div className="space-y-1">
            <label className="text-[11px] font-medium text-zinc-500">工程图号</label>
            <input
              type="text"
              value={meta.drawingNo}
              onChange={(e) => onChangeMeta({ drawingNo: e.target.value })}
              placeholder="如：MTR-EC-2026-A2"
              className="precision-field w-full rounded-lg border border-zinc-200 dark:border-white/[0.1] bg-zinc-50/50 dark:bg-white/[0.03] px-2.5 py-1.5 font-mono text-xs text-zinc-900 dark:text-white"
            />
          </div>
          <div className="space-y-1">
            <label className="text-[11px] font-medium text-zinc-500">工单 / 批次号</label>
            <input
              type="text"
              value={meta.lotNo}
              onChange={(e) => onChangeMeta({ lotNo: e.target.value })}
              placeholder="如：LOT-20261128"
              className="precision-field w-full rounded-lg border border-zinc-200 dark:border-white/[0.1] bg-zinc-50/50 dark:bg-white/[0.03] px-2.5 py-1.5 font-mono text-xs text-zinc-900 dark:text-white"
            />
          </div>
          <div className="space-y-1">
            <label className="text-[11px] font-medium text-zinc-500">检验阶段</label>
            <div className="grid grid-cols-5 gap-1">
              {STAGES.map((st) => (
                <button
                  key={st}
                  type="button"
                  onClick={() => onChangeMeta({ stage: st })}
                  className={cn(
                    "py-1.5 rounded-md font-mono text-[10.5px] font-semibold border transition-colors",
                    meta.stage === st
                      ? "bg-zinc-900 dark:bg-white text-white dark:text-zinc-950 border-zinc-900 dark:border-white"
                      : "bg-zinc-50 dark:bg-white/[0.03] text-zinc-500 border-zinc-200 dark:border-white/[0.08]"
                  )}
                >
                  {st}
                </button>
              ))}
            </div>
          </div>
          <div className="space-y-1">
            <label className="text-[11px] font-medium text-zinc-500">图纸未注标准</label>
            <input
              type="text"
              value={meta.drawingStandard}
              onChange={(e) => onChangeMeta({ drawingStandard: e.target.value })}
              placeholder="ISO 2768-mK"
              className="precision-field w-full rounded-lg border border-zinc-200 dark:border-white/[0.1] bg-zinc-50/50 dark:bg-white/[0.03] px-2.5 py-1.5 font-mono text-xs text-zinc-900 dark:text-white"
            />
          </div>
          <div className="space-y-1">
            <label className="text-[11px] font-medium text-zinc-500">检验员</label>
            <input
              type="text"
              value={meta.inspector}
              onChange={(e) => onChangeMeta({ inspector: e.target.value })}
              placeholder="姓名 / 工号"
              className="precision-field w-full rounded-lg border border-zinc-200 dark:border-white/[0.1] bg-zinc-50/50 dark:bg-white/[0.03] px-2.5 py-1.5 text-xs text-zinc-900 dark:text-white"
            />
          </div>
          <div className="space-y-1 sm:col-span-2">
            <label className="text-[11px] font-medium text-zinc-500">测量环境与备注</label>
            <input
              type="text"
              value={meta.notes}
              onChange={(e) => onChangeMeta({ notes: e.target.value })}
              placeholder="如：20°C 恒温室三坐标检验"
              className="precision-field w-full rounded-lg border border-zinc-200 dark:border-white/[0.1] bg-zinc-50/50 dark:bg-white/[0.03] px-2.5 py-1.5 text-xs text-zinc-900 dark:text-white"
            />
          </div>
        </div>
      )}

      {/* Inline Quick Add Dimension Form */}
      <form
        onSubmit={handleQuickAdd}
        className="rounded-2xl border border-zinc-200/90 dark:border-white/[0.09] bg-white dark:bg-[#111115] p-3.5 shadow-tactile flex flex-wrap items-end gap-2.5"
      >
        <div className="space-y-1 min-w-[155px]">
          <label className="text-[10.5px] font-medium text-zinc-500">公差依据类型</label>
          <PrecisionSelect
            value={newMode}
            options={MODE_OPTIONS}
            onChange={(m) => {
              setNewMode(m);
              if (m === "iso286_hole") setNewLetter("H");
              if (m === "iso286_shaft") setNewLetter("g");
            }}
            className="w-full"
          />
        </div>

        <div className="space-y-1 flex-1 min-w-[140px]">
          <label className="text-[10.5px] font-medium text-zinc-500">检验特征描述</label>
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="留空自动生成，如 轴承孔径..."
            className="precision-field w-full rounded-lg border border-zinc-200 dark:border-white/[0.1] bg-zinc-50/50 dark:bg-white/[0.03] px-2.5 py-1.5 text-xs text-zinc-900 dark:text-white"
          />
        </div>

        <div className="space-y-1 w-24">
          <label className="text-[10.5px] font-medium text-zinc-500">
            {newMode === "iso2768_angular" ? "公称角(°)" : "公称值(mm)"}
          </label>
          <input
            type="number"
            step="any"
            value={newNominal}
            onChange={(e) => setNewNominal(e.target.value)}
            className="precision-field w-full rounded-lg border border-zinc-200 dark:border-white/[0.1] bg-zinc-50/50 dark:bg-white/[0.03] px-2.5 py-1.5 font-mono text-xs font-semibold text-zinc-900 dark:text-white"
          />
        </div>

        {(newMode === "iso2768_linear" ||
          newMode === "iso2768_chamfer" ||
          newMode === "iso2768_angular") && (
          <div className="space-y-1 w-24">
            <label className="text-[10.5px] font-medium text-zinc-500">2768 等级</label>
            <PrecisionSelect
              value={newLinClass}
              options={[
                { value: "f", label: "f 精密" },
                { value: "m", label: "m 中等" },
                { value: "c", label: "c 粗糙" },
                { value: "v", label: "v 最粗" },
              ]}
              onChange={setNewLinClass}
              className="w-full"
            />
          </div>
        )}

        {newMode === "iso2768_angular" && (
          <div className="space-y-1 w-24">
            <label className="text-[10.5px] font-medium text-zinc-500">短边(mm)</label>
            <input
              type="number"
              step="any"
              value={newShortSide}
              onChange={(e) => setNewShortSide(e.target.value)}
              className="precision-field w-full rounded-lg border border-zinc-200 dark:border-white/[0.1] bg-zinc-50/50 dark:bg-white/[0.03] px-2.5 py-1.5 font-mono text-xs text-zinc-900 dark:text-white"
            />
          </div>
        )}

        {newMode === "iso2768_gdt" && (
          <>
            <div className="space-y-1 w-32">
              <label className="text-[10.5px] font-medium text-zinc-500">形位类型</label>
              <PrecisionSelect
                value={newGdtKind}
                options={[
                  { value: "straightness_flatness", label: "直线/平面度" },
                  { value: "perpendicularity", label: "垂直度" },
                  { value: "symmetry", label: "对称度" },
                  { value: "runout", label: "圆跳动" },
                ]}
                onChange={setNewGdtKind}
                className="w-full"
              />
            </div>
            <div className="space-y-1 w-20">
              <label className="text-[10.5px] font-medium text-zinc-500">等级</label>
              <PrecisionSelect
                value={newGeomClass}
                options={[
                  { value: "H", label: "H" },
                  { value: "K", label: "K" },
                  { value: "L", label: "L" },
                ]}
                onChange={setNewGeomClass}
                className="w-full"
              />
            </div>
          </>
        )}

        {(newMode === "iso286_hole" || newMode === "iso286_shaft") && (
          <>
            <div className="space-y-1 w-20">
              <label className="text-[10.5px] font-medium text-zinc-500">基本偏差</label>
              <PrecisionSelect
                value={newLetter}
                options={(newMode === "iso286_hole"
                  ? ISO286_HOLE_LETTERS
                  : ISO286_SHAFT_LETTERS
                ).map((l) => ({ value: l, label: l }))}
                onChange={setNewLetter}
                className="w-full"
              />
            </div>
            <div className="space-y-1 w-20">
              <label className="text-[10.5px] font-medium text-zinc-500">IT 等级</label>
              <PrecisionSelect
                value={newGrade}
                options={ISO286_IT_GRADES.map((g) => ({ value: g, label: `IT${g}` }))}
                onChange={setNewGrade}
                className="w-full"
              />
            </div>
          </>
        )}

        {newMode === "custom" && (
          <>
            <div className="space-y-1 w-24">
              <label className="text-[10.5px] font-medium text-zinc-500">上偏差(mm)</label>
              <input
                type="number"
                step="any"
                value={newUpperDev}
                onChange={(e) => setNewUpperDev(e.target.value)}
                className="precision-field w-full rounded-lg border border-zinc-200 dark:border-white/[0.1] bg-zinc-50/50 dark:bg-white/[0.03] px-2 py-1.5 font-mono text-xs text-zinc-900 dark:text-white"
              />
            </div>
            <div className="space-y-1 w-24">
              <label className="text-[10.5px] font-medium text-zinc-500">下偏差(mm)</label>
              <input
                type="number"
                step="any"
                value={newLowerDev}
                onChange={(e) => setNewLowerDev(e.target.value)}
                className="precision-field w-full rounded-lg border border-zinc-200 dark:border-white/[0.1] bg-zinc-50/50 dark:bg-white/[0.03] px-2 py-1.5 font-mono text-xs text-zinc-900 dark:text-white"
              />
            </div>
          </>
        )}

        <button
          type="submit"
          className="btn-tactile inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-600 text-white text-xs font-semibold shadow-tactile"
        >
          <Plus className="h-3.5 w-3.5" />
          <span>添加检验项</span>
        </button>
      </form>

      {/* Checksheet Table */}
      <div className="rounded-2xl border border-zinc-200/90 dark:border-white/[0.09] bg-white dark:bg-[#111115] overflow-hidden shadow-tactile">
        <div className="px-4 py-2.5 border-b border-zinc-200/80 dark:border-white/[0.07] bg-zinc-50/70 dark:bg-white/[0.02] flex items-center justify-between">
          <span className="text-xs font-semibold text-zinc-900 dark:text-zinc-100">
            尺寸检核明细表（实测输入框按 Enter 跳至下一行）
          </span>
          {rows.length > 0 && (
            <button
              type="button"
              onClick={onClearItems}
              className="text-[11px] text-zinc-400 hover:text-rose-500 transition-colors"
            >
              清空列表
            </button>
          )}
        </div>

        {rows.length === 0 ? (
          <div className="py-12 text-center text-xs text-zinc-400">
            检核表为空。可在上方添加检验项，或从「ISO 2768 / 孔轴配合」页一键加入。
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="border-b border-zinc-200/80 dark:border-white/[0.07] bg-zinc-50/40 dark:bg-white/[0.015] text-zinc-500 dark:text-zinc-400">
                  <th className="py-2 px-2.5 text-center font-medium w-14">气泡</th>
                  <th className="py-2 px-3 text-left font-medium">尺寸 / 特征</th>
                  <th className="py-2 px-3 text-left font-medium">标准公差依据</th>
                  <th className="py-2 px-3 text-right font-medium">允许极限</th>
                  <th className="py-2 px-3 text-center font-medium w-32">实测值</th>
                  <th className="py-2 px-3 text-center font-medium w-32">公差占比</th>
                  <th className="py-2 px-3 text-center font-medium w-24">判定</th>
                  <th className="py-2 px-2 w-10" />
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-white/[0.05]">
                {rows.map((row, idx) => {
                  const v = row.evaluation.verdict;
                  const usage = row.evaluation.bandUsagePercent;
                  const pctBar = usage !== null ? Math.min(100, Math.max(4, usage)) : 0;
                  return (
                    <tr
                      key={row.item.id}
                      className={cn(
                        "transition-colors",
                        v === "ng"
                          ? "bg-rose-500/[0.04] dark:bg-rose-500/[0.07]"
                          : v === "warning"
                            ? "bg-amber-500/[0.04]"
                            : "hover:bg-zinc-50/70 dark:hover:bg-white/[0.02]"
                      )}
                    >
                      <td className="py-2 px-2 text-center">
                        <input
                          type="text"
                          value={row.item.balloonNo}
                          onChange={(e) =>
                            onUpdateItem(row.item.id, { balloonNo: e.target.value })
                          }
                          className="w-10 text-center font-mono text-[11px] font-bold rounded-md border border-transparent hover:border-zinc-200 dark:hover:border-white/[0.1] focus:border-amber-400 bg-transparent py-0.5 text-zinc-700 dark:text-zinc-300 focus:outline-none"
                        />
                      </td>
                      <td className="py-2 px-3">
                        <input
                          type="text"
                          value={row.item.featureName}
                          onChange={(e) =>
                            onUpdateItem(row.item.id, { featureName: e.target.value })
                          }
                          className="w-full min-w-[140px] rounded-md border border-transparent hover:border-zinc-200 dark:hover:border-white/[0.1] focus:border-amber-400 bg-transparent py-0.5 text-xs font-medium text-zinc-900 dark:text-zinc-100 focus:outline-none"
                        />
                      </td>
                      <td className="py-2 px-3 font-mono text-[11px] text-zinc-500 dark:text-zinc-400 whitespace-nowrap">
                        {row.standardSpecLabel}
                      </td>
                      <td className="py-2 px-3 text-right font-mono tabular-nums text-zinc-700 dark:text-zinc-300 whitespace-nowrap">
                        {row.error ? (
                          <span className="text-rose-500 text-[10.5px]">{row.error}</span>
                        ) : row.unilateral ? (
                          `≤ ${row.upperLimit} ${row.item.unit}`
                        ) : (
                          `${row.lowerLimit?.toFixed(3)} ～ ${row.upperLimit?.toFixed(3)}`
                        )}
                      </td>
                      <td className="py-2 px-2.5 text-center">
                        <input
                          ref={(el) => {
                            measInputRefs.current[idx] = el;
                          }}
                          type="number"
                          step="any"
                          value={row.item.measured ?? ""}
                          onChange={(e) => {
                            const raw = e.target.value.trim();
                            const n = raw === "" ? null : Number(raw);
                            onUpdateItem(row.item.id, {
                              measured: n !== null && Number.isFinite(n) ? n : null,
                            });
                          }}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              measInputRefs.current[idx + 1]?.focus();
                            }
                          }}
                          placeholder="输入实测"
                          className="precision-field w-24 text-center rounded-lg border border-zinc-200/95 dark:border-white/[0.12] bg-zinc-50/70 dark:bg-white/[0.04] px-2 py-1 font-mono text-xs font-bold tabular-nums text-zinc-950 dark:text-white"
                        />
                      </td>
                      <td className="py-2 px-3">
                        {usage !== null ? (
                          <div className="space-y-1">
                            <div className="h-1.5 w-full rounded-full bg-zinc-200/80 dark:bg-white/[0.08] overflow-hidden">
                              <div
                                className={cn(
                                  "h-full rounded-full transition-all",
                                  v === "ng"
                                    ? "bg-rose-500"
                                    : v === "warning"
                                      ? "bg-amber-500"
                                      : "bg-emerald-500"
                                )}
                                style={{ width: `${pctBar}%` }}
                              />
                            </div>
                            <div className="text-[10px] font-mono tabular-nums text-zinc-500 dark:text-zinc-400 text-center">
                              {usage.toFixed(0)}%
                            </div>
                          </div>
                        ) : (
                          <div className="text-center text-[10.5px] text-zinc-400">—</div>
                        )}
                      </td>
                      <td className="py-2 px-3 text-center whitespace-nowrap">
                        <span
                          title={row.evaluation.summaryText}
                          className={cn(
                            "inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-mono text-[10.5px] font-bold",
                            v === "ok"
                              ? "bg-emerald-500/12 text-emerald-700 dark:text-emerald-300"
                              : v === "warning"
                                ? "bg-amber-500/15 text-amber-800 dark:text-amber-300"
                                : v === "ng"
                                  ? "bg-rose-500/14 text-rose-700 dark:text-rose-300"
                                  : "bg-zinc-100 dark:bg-white/[0.06] text-zinc-400"
                          )}
                        >
                          {v === "ok"
                            ? "OK"
                            : v === "warning"
                              ? "临界"
                              : v === "ng"
                                ? "NG"
                                : "待测"}
                        </span>
                      </td>
                      <td className="py-2 px-2 text-center">
                        <button
                          type="button"
                          onClick={() => onDeleteItem(row.item.id)}
                          aria-label="删除检验项"
                          className="p-1 rounded-md text-zinc-400 hover:text-rose-500 hover:bg-rose-500/10 transition-colors"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
