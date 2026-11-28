import React, { useCallback, useMemo, useRef, useState } from "react";
import { motion } from "motion/react";
import {
  Activity,
  AlertTriangle,
  BarChart3,
  BookmarkPlus,
  Check,
  ChevronDown,
  ChevronUp,
  ClipboardCopy,
  Eraser,
  FileSpreadsheet,
  History,
  ImageDown,
  Sigma,
  Sparkles,
  Upload,
  Wand2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { SPRING_SNAPPY, TAP_SCALE, TAP_SCALE_SUBTLE } from "@/lib/motion";
import { PrecisionSelect } from "@/components/ui/FormControls";
import type { WorkbenchToolProps } from "../../types";
import {
  pickSpreadsheetFileInTauri,
  saveExportBlob,
} from "../../desktopBridge";
import type {
  NelsonRuleId,
  SavedSpcRecord,
  SpcChartMode,
  SpcMetadata,
  SpcStage,
  ToleranceType,
} from "./types";
import { runSpcAnalysis } from "./core/engine";
import {
  formatCompactNumber,
  formatValuesAsText,
  parseRawMeasurements,
  parseSpreadsheetFile,
  type ImportedColumnOption,
  type ImportedMatrixOption,
  type ParsedSpreadsheetResult,
} from "./core/parser";
import { SPC_SCENE_PRESETS } from "./core/presets";
import {
  appendSpcRecord,
  clearSpcHistory,
  deleteSpcRecord,
  loadSpcHistory,
} from "./core/storage";
import {
  buildSpcExcelBlob,
  buildSpcHistoryExcelBlob,
  buildSpcSummaryText,
  renderSpcReportPngBlob,
} from "./core/export";
import { CapabilitySummaryCards } from "./components/CapabilitySummaryCards";
import { CapabilityHistogramChart } from "./components/CapabilityHistogramChart";
import { SpcControlCharts } from "./components/SpcControlCharts";
import { NormalityAndDataPanel } from "./components/NormalityAndDataPanel";
import { SpcHistoryPanel } from "./components/SpcHistoryPanel";
import { ImportPreviewModal } from "./components/ImportPreviewModal";

type SubViewTab = "overview" | "spc" | "normality" | "history";
type SpecInputMode = "limits" | "nominal";

const STAGES: readonly SpcStage[] = ["IQC", "IPQC", "FQC", "OQC", "PPAP", "MSA"] as const;
const QUICK_SUBGROUPS = [1, 3, 4, 5, 10] as const;
const CPK_THRESHOLDS = [1.0, 1.33, 1.67] as const;

const DEFAULT_PRESET = SPC_SCENE_PRESETS[0];

function parseOptionalNumber(raw: string): number | null {
  const s = raw.trim();
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

export const SpcCpkWorkbench: React.FC<WorkbenchToolProps> = ({ onNotify }) => {
  const [subTab, setSubTab] = useState<SubViewTab>("overview");
  const [toleranceType, setToleranceType] = useState<ToleranceType>(
    DEFAULT_PRESET.spec.toleranceType
  );
  const [specInputMode, setSpecInputMode] = useState<SpecInputMode>("limits");

  // Spec inputs (string state so typing decimals like "20." or "-0.0" never jumps)
  const [uslText, setUslText] = useState<string>(
    DEFAULT_PRESET.spec.usl !== null ? String(DEFAULT_PRESET.spec.usl) : ""
  );
  const [lslText, setLslText] = useState<string>(
    DEFAULT_PRESET.spec.lsl !== null ? String(DEFAULT_PRESET.spec.lsl) : ""
  );
  const [targetText, setTargetText] = useState<string>(
    DEFAULT_PRESET.spec.target !== null ? String(DEFAULT_PRESET.spec.target) : ""
  );
  const [nominalText, setNominalText] = useState<string>("20");
  const [upperTolText, setUpperTolText] = useState<string>("0.05");
  const [lowerTolText, setLowerTolText] = useState<string>("0.05");
  const [cpkThreshold, setCpkThreshold] = useState<number>(
    DEFAULT_PRESET.spec.cpkThreshold
  );

  // Subgroup & Chart config
  const [subgroupSize, setSubgroupSize] = useState<number>(DEFAULT_PRESET.subgroupSize);
  const [chartMode, setChartMode] = useState<SpcChartMode>(DEFAULT_PRESET.chartMode);
  const [enabledRules, setEnabledRules] = useState<NelsonRuleId[]>([
    1, 2, 3, 4, 5, 6, 7, 8,
  ]);
  const [customBins, setCustomBins] = useState<number | null>(null);

  // Raw measurement text
  const [rawDataText, setRawDataText] = useState<string>(() =>
    formatValuesAsText(DEFAULT_PRESET.values, DEFAULT_PRESET.subgroupSize, 4)
  );
  const [isDraggingFile, setIsDraggingFile] = useState(false);
  const [importPreview, setImportPreview] =
    useState<ParsedSpreadsheetResult | null>(null);

  // Metadata
  const [metaExpanded, setMetaExpanded] = useState(false);
  const [meta, setMeta] = useState<SpcMetadata>({ ...DEFAULT_PRESET.meta });

  // Export & History state
  const [copiedSummary, setCopiedSummary] = useState(false);
  const [exportingExcel, setExportingExcel] = useState(false);
  const [exportingPng, setExportingPng] = useState(false);
  const [history, setHistory] = useState<SavedSpcRecord[]>(() => loadSpcHistory());

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const parsedData = useMemo(
    () => parseRawMeasurements(rawDataText),
    [rawDataText]
  );

  // Compute effective spec limits from current input mode
  const effectiveSpec = useMemo(() => {
    if (toleranceType === "bilateral" && specInputMode === "nominal") {
      const nom = parseOptionalNumber(nominalText);
      const up = parseOptionalNumber(upperTolText);
      const lo = parseOptionalNumber(lowerTolText);
      return {
        toleranceType,
        usl: nom !== null && up !== null ? Number((nom + up).toFixed(8)) : null,
        lsl: nom !== null && lo !== null ? Number((nom - Math.abs(lo)).toFixed(8)) : null,
        target: nom,
        cpkThreshold,
      };
    }
    return {
      toleranceType,
      usl: toleranceType === "lower_only" ? null : parseOptionalNumber(uslText),
      lsl: toleranceType === "upper_only" ? null : parseOptionalNumber(lslText),
      target: parseOptionalNumber(targetText),
      cpkThreshold,
    };
  }, [
    toleranceType,
    specInputMode,
    nominalText,
    upperTolText,
    lowerTolText,
    uslText,
    lslText,
    targetText,
    cpkThreshold,
  ]);

  const analysis = useMemo(
    () =>
      runSpcAnalysis(parsedData.values, {
        spec: effectiveSpec,
        subgroupSize,
        chartMode,
        enabledRules,
        histogramBins: customBins,
      }),
    [parsedData.values, effectiveSpec, subgroupSize, chartMode, enabledRules, customBins]
  );

  // Sync limits <-> nominal when user switches spec input mode
  const handleSwitchSpecInputMode = useCallback(
    (nextMode: SpecInputMode) => {
      if (nextMode === specInputMode) return;
      if (nextMode === "nominal") {
        const u = parseOptionalNumber(uslText);
        const l = parseOptionalNumber(lslText);
        const t = parseOptionalNumber(targetText);
        if (u !== null && l !== null && u > l) {
          const nom = t ?? (u + l) / 2;
          setNominalText(formatCompactNumber(nom, 6));
          setUpperTolText(formatCompactNumber(u - nom, 6));
          setLowerTolText(formatCompactNumber(nom - l, 6));
        }
      } else {
        if (effectiveSpec.usl !== null) setUslText(formatCompactNumber(effectiveSpec.usl, 6));
        if (effectiveSpec.lsl !== null) setLslText(formatCompactNumber(effectiveSpec.lsl, 6));
        if (effectiveSpec.target !== null)
          setTargetText(formatCompactNumber(effectiveSpec.target, 6));
      }
      setSpecInputMode(nextMode);
    },
    [specInputMode, uslText, lslText, targetText, effectiveSpec]
  );

  const handleApplyPreset = useCallback(
    (presetId: string) => {
      const preset = SPC_SCENE_PRESETS.find((p) => p.id === presetId);
      if (!preset) return;
      setSpecInputMode("limits");
      setToleranceType(preset.spec.toleranceType);
      setUslText(preset.spec.usl !== null ? String(preset.spec.usl) : "");
      setLslText(preset.spec.lsl !== null ? String(preset.spec.lsl) : "");
      setTargetText(preset.spec.target !== null ? String(preset.spec.target) : "");
      setCpkThreshold(preset.spec.cpkThreshold);
      setSubgroupSize(preset.subgroupSize);
      setChartMode(preset.chartMode);
      setMeta({ ...preset.meta });
      setCustomBins(null);
      setRawDataText(formatValuesAsText(preset.values, preset.subgroupSize));
      onNotify(`已载入工程场景：${preset.name}`, "success");
    },
    [onNotify]
  );

  // Spreadsheet / CSV import pipeline
  const handleProcessFile = useCallback(
    async (file: File) => {
      try {
        const preview = await parseSpreadsheetFile(file);
        if (preview.columns.length === 0) {
          onNotify(preview.warnings[0] || "未在文件中检测到有效数值数据", "error");
          return;
        }
        // If exactly 1 numeric column and no matrix, load directly without modal friction
        if (preview.columns.length === 1 && preview.matrices.length === 0) {
          const col = preview.columns[0];
          setRawDataText(formatValuesAsText(col.values, 1));
          setSubgroupSize(1);
          setChartMode("auto");
          setMeta((prev) => ({
            ...prev,
            characteristic: prev.characteristic || col.header,
          }));
          onNotify(
            `已导入「${col.header}」共 ${col.values.length} 个实测值`,
            "success"
          );
          return;
        }
        setImportPreview(preview);
      } catch (err) {
        onNotify(
          `文件解析失败：${err instanceof Error ? err.message : "格式不受支持"}`,
          "error"
        );
      }
    },
    [onNotify]
  );

  const handleTriggerImport = useCallback(async () => {
    const tauriFile = await pickSpreadsheetFileInTauri();
    if (tauriFile) {
      await handleProcessFile(tauriFile);
      return;
    }
    fileInputRef.current?.click();
  }, [handleProcessFile]);

  const handleSelectImportedColumn = useCallback(
    (col: ImportedColumnOption) => {
      setRawDataText(formatValuesAsText(col.values, 1));
      setSubgroupSize(1);
      setChartMode("auto");
      setMeta((prev) => ({
        ...prev,
        characteristic: col.header || prev.characteristic,
      }));
      setImportPreview(null);
      onNotify(
        `已导入列「${col.header}」（${col.values.length} 个数据）`,
        "success"
      );
    },
    [onNotify]
  );

  const handleSelectImportedMatrix = useCallback(
    (mat: ImportedMatrixOption) => {
      setRawDataText(formatValuesAsText(mat.values, mat.subgroupSize));
      setSubgroupSize(mat.subgroupSize);
      setChartMode(mat.subgroupSize <= 10 ? "xbar_r" : "xbar_s");
      setImportPreview(null);
      onNotify(
        `已导入子组矩阵：${mat.rowCount} 组 × ${mat.subgroupSize} 件（共 ${mat.values.length} 个数据）`,
        "success"
      );
    },
    [onNotify]
  );

  // Inline edits from NormalityAndDataPanel
  const handleUpdateSingleValue = useCallback(
    (idx: number, nextVal: number) => {
      const next = [...parsedData.values];
      if (idx < 0 || idx >= next.length) return;
      next[idx] = nextVal;
      setRawDataText(formatValuesAsText(next, subgroupSize));
    },
    [parsedData.values, subgroupSize]
  );

  const handleDeleteSingleValue = useCallback(
    (idx: number) => {
      const next = parsedData.values.filter((_, i) => i !== idx);
      setRawDataText(formatValuesAsText(next, subgroupSize));
    },
    [parsedData.values, subgroupSize]
  );

  const handleAddSingleValue = useCallback(
    (val: number) => {
      const next = [...parsedData.values, val];
      setRawDataText(formatValuesAsText(next, subgroupSize));
    },
    [parsedData.values, subgroupSize]
  );

  // Save & Export Handlers
  const buildCurrentRecord = useCallback((): SavedSpcRecord => {
    const now = new Date();
    const createdAt = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(
      2,
      "0"
    )}-${String(now.getDate()).padStart(2, "0")} ${String(
      now.getHours()
    ).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;

    return {
      id: `spc-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      createdAt,
      meta: { ...meta },
      spec: { ...effectiveSpec },
      subgroupSize,
      chartMode,
      enabledRules: [...enabledRules],
      values: [...analysis.values],
      count: analysis.count,
      mean: analysis.mean,
      sigmaWithin: analysis.sigmaWithin,
      sigmaOverall: analysis.sigmaOverall,
      cp: analysis.capability.cp,
      cpk: analysis.capability.cpk,
      pp: analysis.capability.pp,
      ppk: analysis.capability.ppk,
      grade: analysis.capability.grade,
      oosCount: analysis.observed.totalOosCount,
      violationCount: analysis.violations.length,
      normalityP: analysis.normality.pValue,
    };
  }, [meta, effectiveSpec, subgroupSize, chartMode, enabledRules, analysis]);

  const handleSaveRecord = useCallback(() => {
    if (!analysis.valid) {
      onNotify("当前分析无效，请先补全公差与实测数据", "error");
      return;
    }
    const rec = buildCurrentRecord();
    setHistory(appendSpcRecord(rec));
    onNotify("已保存至本地 CPK 分析记录", "success");
  }, [analysis.valid, buildCurrentRecord, onNotify]);

  const handleCopySummary = useCallback(async () => {
    if (!analysis.valid) {
      onNotify("当前无有效分析结果可复制", "error");
      return;
    }
    const text = buildSpcSummaryText(analysis, meta);
    try {
      await navigator.clipboard.writeText(text);
      setCopiedSummary(true);
      onNotify("已复制 CPK / SPC 分析摘要", "success");
      window.setTimeout(() => setCopiedSummary(false), 1600);
    } catch {
      onNotify("复制失败，请检查系统剪贴板权限", "error");
    }
  }, [analysis, meta, onNotify]);

  const handleExportPng = useCallback(async () => {
    if (!analysis.valid || exportingPng) return;
    setExportingPng(true);
    try {
      const blob = await renderSpcReportPngBlob(analysis, meta);
      const dateTag = new Date().toISOString().slice(0, 10);
      const safeName = (meta.partName.trim() || meta.lotNo.trim() || dateTag).replace(
        /[/\\:*?"<>|]/g,
        "_"
      );
      const res = await saveExportBlob(
        blob,
        `CPK过程能力报告_${safeName}.png`,
        "导出 CPK 过程能力分析报告图片"
      );
      if (res.status === "saved") {
        onNotify("已导出高清 CPK 过程能力报告图片", "success");
      }
    } catch (err) {
      onNotify(
        `报告图片导出失败：${err instanceof Error ? err.message : "未知错误"}`,
        "error"
      );
    } finally {
      setExportingPng(false);
    }
  }, [analysis, exportingPng, meta, onNotify]);

  const handleExportExcel = useCallback(async () => {
    if (!analysis.valid || exportingExcel) return;
    setExportingExcel(true);
    try {
      const blob = await buildSpcExcelBlob(analysis, meta);
      const dateTag = new Date().toISOString().slice(0, 10);
      const safeName = (meta.partName.trim() || meta.lotNo.trim() || dateTag).replace(
        /[/\\:*?"<>|]/g,
        "_"
      );
      const res = await saveExportBlob(
        blob,
        `CPK过程能力分析_${safeName}.xlsx`,
        "导出 CPK / SPC 分析 Excel 报告"
      );
      if (res.status === "saved") {
        onNotify("已导出 3-Sheet CPK / SPC Excel 分析报告", "success");
      }
    } catch (err) {
      onNotify(
        `Excel 导出失败：${err instanceof Error ? err.message : "未知错误"}`,
        "error"
      );
    } finally {
      setExportingExcel(false);
    }
  }, [analysis, exportingExcel, meta, onNotify]);

  const handleExportHistoryExcel = useCallback(async () => {
    if (history.length === 0) return;
    try {
      const blob = await buildSpcHistoryExcelBlob(history);
      const dateTag = new Date().toISOString().slice(0, 10);
      const res = await saveExportBlob(
        blob,
        `CPK过程能力记录汇总_${dateTag}.xlsx`,
        "导出 CPK 历史分析汇总 Excel"
      );
      if (res.status === "saved") {
        onNotify(`已批量导出 ${history.length} 条 CPK 历史记录`, "success");
      }
    } catch (err) {
      onNotify(
        `批量导出失败：${err instanceof Error ? err.message : "未知错误"}`,
        "error"
      );
    }
  }, [history, onNotify]);

  const handleLoadRecord = useCallback(
    (rec: SavedSpcRecord) => {
      setSpecInputMode("limits");
      setToleranceType(rec.spec.toleranceType);
      setUslText(rec.spec.usl !== null ? String(rec.spec.usl) : "");
      setLslText(rec.spec.lsl !== null ? String(rec.spec.lsl) : "");
      setTargetText(rec.spec.target !== null ? String(rec.spec.target) : "");
      setCpkThreshold(rec.spec.cpkThreshold);
      setSubgroupSize(rec.subgroupSize);
      setChartMode(rec.chartMode);
      setEnabledRules([...rec.enabledRules]);
      setMeta({ ...rec.meta });
      setRawDataText(formatValuesAsText(rec.values, rec.subgroupSize));
      setSubTab("overview");
      onNotify("已载入历史 CPK 分析记录", "success");
    },
    [onNotify]
  );

  const handleCopySavedRecord = useCallback(
    async (rec: SavedSpcRecord) => {
      const lines = [
        `【${rec.meta.stage} CPK 过程能力分析记录】`,
        `时间：${rec.createdAt} | 产品：${rec.meta.partName || "-"} | 特性：${rec.meta.characteristic || "-"}`,
        `样本 N=${rec.count} (n=${rec.subgroupSize}) | 均值 x̄=${rec.mean.toFixed(4)} | σ组内=${rec.sigmaWithin.toFixed(5)}`,
        `Cp=${rec.cp !== null ? rec.cp.toFixed(3) : "—"} | Cpk=${rec.cpk !== null ? rec.cpk.toFixed(3) : "—"} | Ppk=${rec.ppk !== null ? rec.ppk.toFixed(3) : "—"} | 等级 ${rec.grade} 级`,
        `实测超差=${rec.oosCount} 件 | SPC判异=${rec.violationCount} 处 | 正态 p=${rec.normalityP < 0.001 ? "<0.001" : rec.normalityP.toFixed(3)}`,
      ];
      try {
        await navigator.clipboard.writeText(lines.join("\n"));
        onNotify("已复制该条 CPK 分析摘要", "success");
      } catch {
        onNotify("复制失败", "error");
      }
    },
    [onNotify]
  );

  const TABS: Array<{
    id: SubViewTab;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    badge?: number;
    badgeTone?: "rose" | "indigo";
  }> = [
    { id: "overview", label: "能力分析与直方图", icon: BarChart3 },
    {
      id: "spc",
      label: "SPC 控制图与判异",
      icon: Activity,
      badge: analysis.valid ? analysis.violations.length : 0,
      badgeTone: "rose",
    },
    { id: "normality", label: "正态性与数据明细", icon: Sigma },
    {
      id: "history",
      label: "分析记录",
      icon: History,
      badge: history.length,
      badgeTone: "indigo",
    },
  ];

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-white dark:bg-[#09090b] overflow-hidden">
      {/* Hidden browser file input fallback */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".xlsx,.csv,.tsv,.txt"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void handleProcessFile(f);
          e.target.value = "";
        }}
      />

      {/* Top Sub-navigation & Export Bar */}
      <div className="px-4 sm:px-5 py-2.5 border-b border-zinc-200/80 dark:border-white/[0.07] bg-[#fafaf9] dark:bg-white/[0.015] flex flex-wrap items-center justify-between gap-2.5 shrink-0">
        <div className="inline-flex items-center p-0.5 rounded-lg bg-zinc-200/65 dark:bg-white/[0.05] border border-zinc-200/80 dark:border-white/[0.06] overflow-x-auto max-w-full">
          {TABS.map((t) => {
            const Icon = t.icon;
            const active = subTab === t.id;
            return (
              <motion.button
                key={t.id}
                type="button"
                whileTap={TAP_SCALE_SUBTLE}
                onClick={() => setSubTab(t.id)}
                className={cn(
                  "relative inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11.5px] font-medium whitespace-nowrap transition-colors",
                  active
                    ? "text-zinc-950 dark:text-white"
                    : "text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200"
                )}
              >
                {active && (
                  <motion.span
                    layoutId="spc-subtab-pill"
                    transition={SPRING_SNAPPY}
                    className="absolute inset-0 rounded-md bg-white dark:bg-white/[0.11] shadow-tactile"
                  />
                )}
                <Icon className="relative z-10 h-3.5 w-3.5 shrink-0" />
                <span className="relative z-10">{t.label}</span>
                {typeof t.badge === "number" && t.badge > 0 && (
                  <span
                    className={cn(
                      "relative z-10 px-1.5 py-0.2 rounded-full font-mono text-[10px]",
                      t.badgeTone === "rose"
                        ? "bg-rose-500/15 text-rose-700 dark:text-rose-300"
                        : "bg-indigo-500/15 text-indigo-700 dark:text-indigo-300"
                    )}
                  >
                    {t.badge}
                  </span>
                )}
              </motion.button>
            );
          })}
        </div>

        {/* Right: Target Cpk Threshold & Exports */}
        <div className="flex flex-wrap items-center gap-2">
          <div
            className="hidden md:inline-flex items-center p-0.5 rounded-lg bg-zinc-200/65 dark:bg-white/[0.05] border border-zinc-200/80 dark:border-white/[0.06]"
            title="设置 Cpk 达标判定门槛（常规量产 1.33 / 汽车关键特性 CC·SC 1.67）"
          >
            <span className="px-1.5 text-[10.5px] text-zinc-400">目标Cpk</span>
            {CPK_THRESHOLDS.map((th) => (
              <button
                key={th}
                type="button"
                onClick={() => setCpkThreshold(th)}
                className={cn(
                  "px-2 py-0.5 rounded-md text-[11px] font-mono font-medium transition-colors",
                  cpkThreshold === th
                    ? "bg-white dark:bg-white/[0.12] text-zinc-950 dark:text-white shadow-hairline"
                    : "text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white"
                )}
              >
                ≥{th.toFixed(2)}
              </button>
            ))}
          </div>

          <motion.button
            type="button"
            whileTap={TAP_SCALE}
            disabled={!analysis.valid}
            onClick={handleCopySummary}
            className="btn-tactile inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-zinc-200/95 dark:border-white/[0.1] bg-white dark:bg-[#141418] text-[11.5px] font-medium text-zinc-700 dark:text-zinc-200 hover:border-zinc-300 dark:hover:border-white/[0.2] shadow-tactile disabled:opacity-45"
          >
            {copiedSummary ? (
              <Check className="h-3.5 w-3.5 text-emerald-500" />
            ) : (
              <ClipboardCopy className="h-3.5 w-3.5 text-zinc-400" />
            )}
            <span>{copiedSummary ? "已复制" : "复制摘要"}</span>
          </motion.button>

          <motion.button
            type="button"
            whileTap={TAP_SCALE}
            disabled={!analysis.valid || exportingPng}
            onClick={handleExportPng}
            className="btn-tactile hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-zinc-200/95 dark:border-white/[0.1] bg-white dark:bg-[#141418] text-[11.5px] font-medium text-zinc-700 dark:text-zinc-200 hover:border-zinc-300 dark:hover:border-white/[0.2] shadow-tactile disabled:opacity-45"
          >
            <ImageDown className="h-3.5 w-3.5 text-indigo-500" />
            <span>导出报告图</span>
          </motion.button>

          <motion.button
            type="button"
            whileTap={TAP_SCALE}
            disabled={!analysis.valid || exportingExcel}
            onClick={handleExportExcel}
            className="btn-sheen inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 dark:bg-white dark:hover:bg-zinc-200 text-white dark:text-zinc-950 text-[11.5px] font-medium shadow-tactile-primary disabled:opacity-45"
          >
            <FileSpreadsheet className="h-3.5 w-3.5" />
            <span>导出 Excel</span>
          </motion.button>
        </div>
      </div>

      {/* Main Scrollable Content */}
      <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-5">
        <div className="max-w-7xl mx-auto">
          {subTab === "overview" && (
            <div className="space-y-4">
              {/* Industry Quick Presets Strip */}
              <div className="flex items-center gap-2 overflow-x-auto pb-1">
                <span className="inline-flex items-center gap-1 text-[11px] font-medium text-zinc-400 dark:text-zinc-500 shrink-0">
                  <Sparkles className="h-3 w-3 text-indigo-500" />
                  <span>场景快选</span>
                </span>
                {SPC_SCENE_PRESETS.map((preset) => (
                  <motion.button
                    key={preset.id}
                    type="button"
                    whileTap={TAP_SCALE_SUBTLE}
                    onClick={() => handleApplyPreset(preset.id)}
                    title={preset.description}
                    className="shrink-0 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-zinc-200/90 dark:border-white/[0.08] bg-zinc-50/75 dark:bg-white/[0.03] hover:border-indigo-300 dark:hover:border-indigo-500/40 hover:bg-indigo-50/50 dark:hover:bg-indigo-500/[0.07] text-[11px] font-medium text-zinc-700 dark:text-zinc-300 transition-colors"
                  >
                    <span className="px-1 py-0.2 rounded bg-zinc-200/70 dark:bg-white/[0.08] font-mono text-[9.5px] text-zinc-600 dark:text-zinc-400">
                      {preset.stage}
                    </span>
                    <span>{preset.name}</span>
                  </motion.button>
                ))}
              </div>

              {/* 2-Column Main Workbench Grid */}
              <div className="grid grid-cols-1 xl:grid-cols-12 gap-5 items-start">
                {/* Left Parameter & Data Rail */}
                <aside className="xl:col-span-4 space-y-4">
                  {/* 1. Specification & Subgrouping Card */}
                  <div className="rounded-2xl border border-zinc-200/90 dark:border-white/[0.09] bg-white dark:bg-[#111115] p-4 shadow-tactile space-y-3.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-semibold text-zinc-900 dark:text-zinc-100">
                        规格公差带 (Spec Limits)
                      </span>
                      {toleranceType === "bilateral" && (
                        <div className="inline-flex items-center p-0.5 rounded-md bg-zinc-100 dark:bg-white/[0.06] text-[10px]">
                          <button
                            type="button"
                            onClick={() => handleSwitchSpecInputMode("limits")}
                            className={cn(
                              "px-1.5 py-0.5 rounded font-medium transition-colors",
                              specInputMode === "limits"
                                ? "bg-white dark:bg-white/[0.14] text-zinc-950 dark:text-white shadow-hairline"
                                : "text-zinc-500 dark:text-zinc-400"
                            )}
                          >
                            USL / LSL
                          </button>
                          <button
                            type="button"
                            onClick={() => handleSwitchSpecInputMode("nominal")}
                            className={cn(
                              "px-1.5 py-0.5 rounded font-medium transition-colors",
                              specInputMode === "nominal"
                                ? "bg-white dark:bg-white/[0.14] text-zinc-950 dark:text-white shadow-hairline"
                                : "text-zinc-500 dark:text-zinc-400"
                            )}
                          >
                            公称 ± 偏差
                          </button>
                        </div>
                      )}
                    </div>

                    {/* Tolerance Type Selector */}
                    <div className="grid grid-cols-3 gap-1.5">
                      {(
                        [
                          ["bilateral", "双边公差"],
                          ["upper_only", "仅上限(望小)"],
                          ["lower_only", "仅下限(望大)"],
                        ] as const
                      ).map(([id, label]) => (
                        <button
                          key={id}
                          type="button"
                          onClick={() => setToleranceType(id)}
                          className={cn(
                            "py-1.5 px-1.5 rounded-lg text-[11px] font-medium border transition-all",
                            toleranceType === id
                              ? "bg-indigo-500/12 border-indigo-500/50 text-indigo-800 dark:text-indigo-200 font-semibold"
                              : "bg-zinc-50/70 dark:bg-white/[0.03] border-zinc-200/85 dark:border-white/[0.08] text-zinc-600 dark:text-zinc-300 hover:border-zinc-300"
                          )}
                        >
                          {label}
                        </button>
                      ))}
                    </div>

                    {/* Spec Numeric Fields */}
                    {toleranceType === "bilateral" && specInputMode === "nominal" ? (
                      <div className="grid grid-cols-3 gap-2">
                        <div>
                          <label className="text-[10.5px] text-zinc-500 dark:text-zinc-400 block mb-1">
                            公称 / 目标
                          </label>
                          <input
                            type="number"
                            step="any"
                            value={nominalText}
                            onChange={(e) => setNominalText(e.target.value)}
                            className="precision-field w-full rounded-lg border border-zinc-200/95 dark:border-white/[0.12] bg-zinc-50/50 dark:bg-white/[0.03] px-2.5 py-1.5 font-mono text-xs font-semibold text-zinc-950 dark:text-white"
                          />
                        </div>
                        <div>
                          <label className="text-[10.5px] text-zinc-500 dark:text-zinc-400 block mb-1">
                            上偏差 (+)
                          </label>
                          <input
                            type="number"
                            step="any"
                            value={upperTolText}
                            onChange={(e) => setUpperTolText(e.target.value)}
                            className="precision-field w-full rounded-lg border border-zinc-200/95 dark:border-white/[0.12] bg-zinc-50/50 dark:bg-white/[0.03] px-2.5 py-1.5 font-mono text-xs font-semibold text-zinc-950 dark:text-white"
                          />
                        </div>
                        <div>
                          <label className="text-[10.5px] text-zinc-500 dark:text-zinc-400 block mb-1">
                            下偏差 (-)
                          </label>
                          <input
                            type="number"
                            step="any"
                            value={lowerTolText}
                            onChange={(e) => setLowerTolText(e.target.value)}
                            className="precision-field w-full rounded-lg border border-zinc-200/95 dark:border-white/[0.12] bg-zinc-50/50 dark:bg-white/[0.03] px-2.5 py-1.5 font-mono text-xs font-semibold text-zinc-950 dark:text-white"
                          />
                        </div>
                        {effectiveSpec.lsl !== null && effectiveSpec.usl !== null && (
                          <div className="col-span-3 text-[10.5px] font-mono text-zinc-400 flex items-center justify-between">
                            <span>LSL = {effectiveSpec.lsl}</span>
                            <span>
                              公差宽 T ={" "}
                              {formatCompactNumber(effectiveSpec.usl - effectiveSpec.lsl, 6)}
                            </span>
                            <span>USL = {effectiveSpec.usl}</span>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="grid grid-cols-3 gap-2">
                        {toleranceType !== "upper_only" && (
                          <div className={toleranceType === "lower_only" ? "col-span-2" : ""}>
                            <label className="text-[10.5px] text-zinc-500 dark:text-zinc-400 block mb-1">
                              下公差 LSL
                            </label>
                            <input
                              type="number"
                              step="any"
                              value={lslText}
                              onChange={(e) => setLslText(e.target.value)}
                              placeholder="下限值"
                              className="precision-field w-full rounded-lg border border-zinc-200/95 dark:border-white/[0.12] bg-zinc-50/50 dark:bg-white/[0.03] px-2.5 py-1.5 font-mono text-xs font-semibold text-zinc-950 dark:text-white"
                            />
                          </div>
                        )}

                        {toleranceType !== "lower_only" && (
                          <div className={toleranceType === "upper_only" ? "col-span-2" : ""}>
                            <label className="text-[10.5px] text-zinc-500 dark:text-zinc-400 block mb-1">
                              上公差 USL
                            </label>
                            <input
                              type="number"
                              step="any"
                              value={uslText}
                              onChange={(e) => setUslText(e.target.value)}
                              placeholder="上限值"
                              className="precision-field w-full rounded-lg border border-zinc-200/95 dark:border-white/[0.12] bg-zinc-50/50 dark:bg-white/[0.03] px-2.5 py-1.5 font-mono text-xs font-semibold text-zinc-950 dark:text-white"
                            />
                          </div>
                        )}

                        <div>
                          <label className="text-[10.5px] text-zinc-500 dark:text-zinc-400 block mb-1">
                            目标 Target
                          </label>
                          <input
                            type="number"
                            step="any"
                            value={targetText}
                            onChange={(e) => setTargetText(e.target.value)}
                            placeholder="自动居中"
                            className="precision-field w-full rounded-lg border border-zinc-200/95 dark:border-white/[0.12] bg-zinc-50/50 dark:bg-white/[0.03] px-2.5 py-1.5 font-mono text-xs text-zinc-900 dark:text-zinc-100"
                          />
                        </div>
                      </div>
                    )}

                    {/* Subgroup & Chart Type */}
                    <div className="pt-2.5 border-t border-zinc-100 dark:border-white/[0.06] space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-medium text-zinc-600 dark:text-zinc-300">
                          子组大小 (n) & 控制图类型
                        </span>
                        <span className="font-mono text-[10.5px] text-indigo-600 dark:text-indigo-400">
                          {analysis.valid
                            ? `${analysis.subgroups.length} 组 · ${
                                analysis.effectiveChartType === "imr"
                                  ? "I-MR"
                                  : analysis.effectiveChartType === "xbar_r"
                                    ? "X̄-R"
                                    : "X̄-S"
                              }`
                            : `n = ${subgroupSize}`}
                        </span>
                      </div>

                      <div className="flex items-center gap-1.5">
                        {QUICK_SUBGROUPS.map((sz) => (
                          <button
                            key={sz}
                            type="button"
                            onClick={() => {
                              setSubgroupSize(sz);
                              setChartMode(sz === 1 ? "imr" : "auto");
                            }}
                            className={cn(
                              "px-2 py-1 rounded-md font-mono text-[11px] border transition-colors",
                              subgroupSize === sz
                                ? "bg-zinc-900 dark:bg-white text-white dark:text-zinc-950 border-zinc-900 dark:border-white font-semibold"
                                : "bg-zinc-50 dark:bg-white/[0.03] text-zinc-600 dark:text-zinc-400 border-zinc-200/80 dark:border-white/[0.08]"
                            )}
                          >
                            {sz === 1 ? "n=1" : sz}
                          </button>
                        ))}
                        <input
                          type="number"
                          min={1}
                          max={25}
                          value={subgroupSize}
                          onChange={(e) => {
                            const v = Math.max(1, Math.min(25, Math.floor(Number(e.target.value)) || 1));
                            setSubgroupSize(v);
                            if (v === 1) setChartMode("imr");
                            else if (chartMode === "imr") setChartMode("auto");
                          }}
                          title="自定义子组大小 (1 ~ 25)"
                          className="precision-field w-14 rounded-md border border-zinc-200/95 dark:border-white/[0.1] bg-zinc-50/50 dark:bg-white/[0.03] px-2 py-1 font-mono text-[11px] text-center text-zinc-900 dark:text-zinc-100"
                        />
                        <PrecisionSelect<SpcChartMode>
                          value={chartMode}
                          options={[
                            { value: "auto", label: "自动" },
                            { value: "imr", label: "I-MR" },
                            { value: "xbar_r", label: "X̄-R" },
                            { value: "xbar_s", label: "X̄-S" },
                          ]}
                          size="xs"
                          onChange={(m) => {
                            setChartMode(m);
                            if (m === "imr") setSubgroupSize(1);
                            else if (subgroupSize === 1) setSubgroupSize(5);
                          }}
                          className="flex-1 font-mono"
                        />
                      </div>
                    </div>
                  </div>

                  {/* 2. Data Input & Excel/CSV Import Card */}
                  <div
                    onDragOver={(e) => {
                      e.preventDefault();
                      setIsDraggingFile(true);
                    }}
                    onDragLeave={() => setIsDraggingFile(false)}
                    onDrop={(e) => {
                      e.preventDefault();
                      setIsDraggingFile(false);
                      const f = e.dataTransfer.files?.[0];
                      if (f) void handleProcessFile(f);
                    }}
                    className={cn(
                      "rounded-2xl border bg-white dark:bg-[#111115] p-4 shadow-tactile space-y-2.5 transition-colors",
                      isDraggingFile
                        ? "border-indigo-500 ring-2 ring-indigo-500/20 bg-indigo-50/30 dark:bg-indigo-500/[0.06]"
                        : "border-zinc-200/90 dark:border-white/[0.09]"
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-semibold text-zinc-900 dark:text-zinc-100">
                          实测数据录入
                        </span>
                        <span className="px-1.5 py-0.5 rounded bg-indigo-500/10 font-mono text-[10px] font-semibold text-indigo-600 dark:text-indigo-300">
                          N = {parsedData.values.length}
                        </span>
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={handleTriggerImport}
                          className="btn-tactile inline-flex items-center gap-1 px-2 py-1 rounded-md border border-indigo-200/90 dark:border-indigo-500/30 bg-indigo-50/70 dark:bg-indigo-500/10 text-[10.5px] font-medium text-indigo-700 dark:text-indigo-300 hover:bg-indigo-100/80 dark:hover:bg-indigo-500/20"
                        >
                          <Upload className="h-3 w-3" />
                          <span>导入 Excel / CSV</span>
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            setRawDataText(
                              formatValuesAsText(parsedData.values, subgroupSize)
                            )
                          }
                          title="按当前子组列数整齐排版"
                          className="p-1 rounded-md text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-white/[0.07]"
                        >
                          <Wand2 className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setRawDataText("")}
                          title="清空实测数据"
                          className="p-1 rounded-md text-zinc-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-500/10"
                        >
                          <Eraser className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>

                    <textarea
                      value={rawDataText}
                      onChange={(e) => setRawDataText(e.target.value)}
                      rows={7}
                      spellCheck={false}
                      placeholder="直接粘贴 Excel 列、多列子组矩阵、三坐标测量数据，或拖放 .xlsx / .csv 文件到此区域（支持换行、空格、Tab、逗号分隔）..."
                      className="precision-field w-full rounded-xl border border-zinc-200/95 dark:border-white/[0.11] bg-zinc-50/60 dark:bg-white/[0.03] p-2.5 font-mono text-[11.5px] leading-relaxed text-zinc-900 dark:text-zinc-100 resize-y"
                    />

                    {/* Smart Matrix Auto-detection Tip */}
                    {parsedData.detectedSubgroupSize !== null &&
                      parsedData.detectedSubgroupSize !== subgroupSize && (
                        <div className="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg bg-indigo-500/10 border border-indigo-500/25 text-[11px] text-indigo-700 dark:text-indigo-300">
                          <span>
                            检测到每行 {parsedData.detectedSubgroupSize} 列子组布局
                          </span>
                          <button
                            type="button"
                            onClick={() => {
                              setSubgroupSize(parsedData.detectedSubgroupSize!);
                              setChartMode(
                                parsedData.detectedSubgroupSize! <= 10
                                  ? "xbar_r"
                                  : "xbar_s"
                              );
                            }}
                            className="px-2 py-0.5 rounded bg-indigo-600 text-white text-[10.5px] font-semibold shrink-0"
                          >
                            设为 n={parsedData.detectedSubgroupSize}
                          </button>
                        </div>
                      )}

                    <div className="flex items-center justify-between text-[10.5px] text-zinc-400 dark:text-zinc-500">
                      <span>支持拖放 .xlsx / .csv / .txt 文件</span>
                      {parsedData.skippedTokens > 0 && (
                        <span className="text-amber-600 dark:text-amber-400 font-mono">
                          已忽略 {parsedData.skippedTokens} 处非数值文本
                        </span>
                      )}
                    </div>
                  </div>

                  {/* 3. Product / Characteristic Metadata & Save Card */}
                  <div className="rounded-2xl border border-zinc-200/90 dark:border-white/[0.09] bg-white dark:bg-[#111115] shadow-tactile overflow-hidden">
                    <button
                      type="button"
                      onClick={() => setMetaExpanded((v) => !v)}
                      className="w-full px-4 py-3 flex items-center justify-between text-xs font-semibold text-zinc-900 dark:text-zinc-100 hover:bg-zinc-50/70 dark:hover:bg-white/[0.02] transition-colors"
                    >
                      <span>产品与机台信息（用于报告与归档）</span>
                      {metaExpanded ? (
                        <ChevronUp className="h-3.5 w-3.5 text-zinc-400" />
                      ) : (
                        <ChevronDown className="h-3.5 w-3.5 text-zinc-400" />
                      )}
                    </button>

                    {metaExpanded && (
                      <div className="px-4 pb-4 pt-1 space-y-2.5 border-t border-zinc-100 dark:border-white/[0.05]">
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="text-[10.5px] text-zinc-500 dark:text-zinc-400 block mb-1">
                              检验阶段
                            </label>
                            <PrecisionSelect<SpcStage>
                              value={meta.stage}
                              options={STAGES.map((s) => ({ value: s, label: s }))}
                              size="xs"
                              className="w-full font-mono"
                              onChange={(stage) => setMeta((m) => ({ ...m, stage }))}
                            />
                          </div>
                          <div>
                            <label className="text-[10.5px] text-zinc-500 dark:text-zinc-400 block mb-1">
                              测量单位
                            </label>
                            <input
                              type="text"
                              value={meta.unit}
                              onChange={(e) =>
                                setMeta((m) => ({ ...m, unit: e.target.value }))
                              }
                              placeholder="mm / μm / N"
                              className="precision-field w-full rounded-lg border border-zinc-200/95 dark:border-white/[0.1] bg-zinc-50/50 dark:bg-white/[0.03] px-2.5 py-1.5 font-mono text-xs text-zinc-900 dark:text-zinc-100"
                            />
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="text-[10.5px] text-zinc-500 dark:text-zinc-400 block mb-1">
                              产品 / 料号
                            </label>
                            <input
                              type="text"
                              value={meta.partName}
                              onChange={(e) =>
                                setMeta((m) => ({ ...m, partName: e.target.value }))
                              }
                              placeholder="如：主轴 M-204"
                              className="precision-field w-full rounded-lg border border-zinc-200/95 dark:border-white/[0.1] bg-zinc-50/50 dark:bg-white/[0.03] px-2.5 py-1.5 text-xs text-zinc-900 dark:text-zinc-100"
                            />
                          </div>
                          <div>
                            <label className="text-[10.5px] text-zinc-500 dark:text-zinc-400 block mb-1">
                              特性 / 尺寸名
                            </label>
                            <input
                              type="text"
                              value={meta.characteristic}
                              onChange={(e) =>
                                setMeta((m) => ({
                                  ...m,
                                  characteristic: e.target.value,
                                }))
                              }
                              placeholder="如：外径 Ø20±0.05"
                              className="precision-field w-full rounded-lg border border-zinc-200/95 dark:border-white/[0.1] bg-zinc-50/50 dark:bg-white/[0.03] px-2.5 py-1.5 text-xs text-zinc-900 dark:text-zinc-100"
                            />
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="text-[10.5px] text-zinc-500 dark:text-zinc-400 block mb-1">
                              批次 / 工单号
                            </label>
                            <input
                              type="text"
                              value={meta.lotNo}
                              onChange={(e) =>
                                setMeta((m) => ({ ...m, lotNo: e.target.value }))
                              }
                              placeholder="如：WO-20261128"
                              className="precision-field w-full rounded-lg border border-zinc-200/95 dark:border-white/[0.1] bg-zinc-50/50 dark:bg-white/[0.03] px-2.5 py-1.5 font-mono text-xs text-zinc-900 dark:text-zinc-100"
                            />
                          </div>
                          <div>
                            <label className="text-[10.5px] text-zinc-500 dark:text-zinc-400 block mb-1">
                              设备 / 机台 / 模腔
                            </label>
                            <input
                              type="text"
                              value={meta.machine}
                              onChange={(e) =>
                                setMeta((m) => ({ ...m, machine: e.target.value }))
                              }
                              placeholder="如：CNC-03"
                              className="precision-field w-full rounded-lg border border-zinc-200/95 dark:border-white/[0.1] bg-zinc-50/50 dark:bg-white/[0.03] px-2.5 py-1.5 text-xs text-zinc-900 dark:text-zinc-100"
                            />
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="text-[10.5px] text-zinc-500 dark:text-zinc-400 block mb-1">
                              测量 / 分析人
                            </label>
                            <input
                              type="text"
                              value={meta.operator}
                              onChange={(e) =>
                                setMeta((m) => ({ ...m, operator: e.target.value }))
                              }
                              placeholder="姓名/工号"
                              className="precision-field w-full rounded-lg border border-zinc-200/95 dark:border-white/[0.1] bg-zinc-50/50 dark:bg-white/[0.03] px-2.5 py-1.5 text-xs text-zinc-900 dark:text-zinc-100"
                            />
                          </div>
                          <div>
                            <label className="text-[10.5px] text-zinc-500 dark:text-zinc-400 block mb-1">
                              工艺备注
                            </label>
                            <input
                              type="text"
                              value={meta.notes}
                              onChange={(e) =>
                                setMeta((m) => ({ ...m, notes: e.target.value }))
                              }
                              placeholder="可选备注说明..."
                              className="precision-field w-full rounded-lg border border-zinc-200/95 dark:border-white/[0.1] bg-zinc-50/50 dark:bg-white/[0.03] px-2.5 py-1.5 text-xs text-zinc-900 dark:text-zinc-100"
                            />
                          </div>
                        </div>
                      </div>
                    )}

                    <div className="px-4 pb-3.5 pt-1">
                      <motion.button
                        type="button"
                        whileTap={TAP_SCALE}
                        disabled={!analysis.valid}
                        onClick={handleSaveRecord}
                        className="btn-sheen w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold shadow-tactile transition-colors disabled:opacity-45"
                      >
                        <BookmarkPlus className="h-3.5 w-3.5" />
                        <span>保存到分析记录 ({history.length})</span>
                      </motion.button>
                    </div>
                  </div>
                </aside>

                {/* Right Analysis Results */}
                <div className="xl:col-span-8 space-y-4 min-w-0">
                  {analysis.valid ? (
                    <>
                      <CapabilitySummaryCards result={analysis} unit={meta.unit} />
                      <CapabilityHistogramChart
                        result={analysis}
                        unit={meta.unit}
                        customBins={customBins}
                        onChangeBins={setCustomBins}
                      />
                    </>
                  ) : (
                    <div className="rounded-2xl border border-dashed border-amber-300/90 dark:border-amber-500/35 bg-amber-50/55 dark:bg-amber-500/[0.06] p-10 text-center space-y-2.5">
                      <div className="h-10 w-10 rounded-xl bg-amber-500/15 text-amber-600 dark:text-amber-400 flex items-center justify-center mx-auto">
                        <AlertTriangle className="h-5 w-5" />
                      </div>
                      <h3 className="text-sm font-semibold text-zinc-900 dark:text-white">
                        等待有效的规格与实测数据
                      </h3>
                      <p className="text-xs text-zinc-600 dark:text-zinc-300 max-w-md mx-auto">
                        {analysis.errorMessage}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {subTab === "spc" && (
            analysis.valid ? (
              <SpcControlCharts
                result={analysis}
                unit={meta.unit}
                enabledRules={enabledRules}
                onChangeRules={setEnabledRules}
              />
            ) : (
              <div className="rounded-2xl border border-dashed border-zinc-200 dark:border-white/[0.1] p-12 text-center text-xs text-zinc-500">
                {analysis.errorMessage || "请先在「能力分析与直方图」页录入有效实测数据"}
              </div>
            )
          )}

          {subTab === "normality" && (
            analysis.valid ? (
              <NormalityAndDataPanel
                result={analysis}
                unit={meta.unit}
                onUpdateValue={handleUpdateSingleValue}
                onDeleteValue={handleDeleteSingleValue}
                onAddValue={handleAddSingleValue}
              />
            ) : (
              <div className="rounded-2xl border border-dashed border-zinc-200 dark:border-white/[0.1] p-12 text-center text-xs text-zinc-500">
                {analysis.errorMessage || "请先录入有效实测数据"}
              </div>
            )
          )}

          {subTab === "history" && (
            <SpcHistoryPanel
              records={history}
              onLoadRecord={handleLoadRecord}
              onCopyRecord={handleCopySavedRecord}
              onDeleteRecord={(id) => {
                setHistory(deleteSpcRecord(id));
                onNotify("已删除该条 CPK 分析记录", "success");
              }}
              onClearAll={() => {
                setHistory(clearSpcHistory());
                onNotify("已清空本地 CPK 分析记录", "success");
              }}
              onExportAllExcel={handleExportHistoryExcel}
            />
          )}
        </div>
      </div>

      {/* Multi-column Excel/CSV Picker Modal */}
      <ImportPreviewModal
        preview={importPreview}
        onClose={() => setImportPreview(null)}
        onSelectColumn={handleSelectImportedColumn}
        onSelectMatrix={handleSelectImportedMatrix}
      />
    </div>
  );
};
