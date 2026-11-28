import React, { useCallback, useMemo, useState } from "react";
import { motion } from "motion/react";
import {
  Activity,
  BookmarkPlus,
  Calculator,
  Check,
  ChevronDown,
  ChevronUp,
  ClipboardCopy,
  FileSpreadsheet,
  GitBranch,
  History,
  ImageDown,
  Sparkles,
  Table2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { SPRING_SNAPPY, TAP_SCALE, TAP_SCALE_SUBTLE } from "@/lib/motion";
import { PrecisionSelect } from "@/components/ui/FormControls";
import type { WorkbenchToolProps } from "../../types";
import { saveExportBlob } from "../../desktopBridge";
import type {
  AqlStandardEdition,
  DefectClassConfig,
  InspectionLevel,
  InspectionMeta,
  InspectionSeverity,
  InspectionStage,
  PrimaryCodeLetter,
  SavedInspectionRecord,
  StandardAqlValue,
} from "./types";
import {
  GENERAL_LEVELS,
  INSPECTION_LEVEL_META,
  PRIMARY_CODE_LETTERS,
  SPECIAL_LEVELS,
  formatAqlShort,
} from "./core/tables";
import { compareAllSeverities, evaluateMultiClassLot } from "./core/engine";
import { AQL_SCENE_PRESETS, createDefaultDefectClasses } from "./core/presets";
import {
  buildAqlExcelBlob,
  buildInspectionSummaryText,
  renderInspectionCardPngBlob,
} from "./core/export";
import {
  appendInspectionRecord,
  clearInspectionHistory,
  deleteInspectionRecord,
  loadInspectionHistory,
} from "./core/storage";
import { PlanSummaryCards } from "./components/PlanSummaryCards";
import { MultiClassJudgePanel } from "./components/MultiClassJudgePanel";
import { SeverityComparisonStrip } from "./components/SeverityComparisonStrip";
import { OcCurveChart } from "./components/OcCurveChart";
import { MasterTableMatrix } from "./components/MasterTableMatrix";
import { SwitchingRulesPanel } from "./components/SwitchingRulesPanel";
import { HistoryDrawerPanel } from "./components/HistoryDrawerPanel";

type SubViewTab = "calculator" | "matrix" | "oc" | "switching" | "history";

const QUICK_LOT_SIZES = [50, 200, 500, 1000, 2000, 5000, 10000, 50000] as const;

const STAGES: readonly InspectionStage[] = ["IQC", "IPQC", "OQC", "FQC"] as const;

export const AqlSamplingWorkbench: React.FC<WorkbenchToolProps> = ({
  onNotify,
}) => {
  const [subTab, setSubTab] = useState<SubViewTab>("calculator");
  const [standard, setStandard] = useState<AqlStandardEdition>("gbt2828");
  const [lookupMode, setLookupMode] = useState<"lot" | "code">("lot");
  const [lotSizeInput, setLotSizeInput] = useState<string>("2000");
  const [directCode, setDirectCode] = useState<PrimaryCodeLetter>("K");
  const [level, setLevel] = useState<InspectionLevel>("II");
  const [severity, setSeverity] = useState<InspectionSeverity>("normal");
  const [classes, setClasses] = useState<DefectClassConfig[]>(
    createDefaultDefectClasses
  );
  const [focusedClassId, setFocusedClassId] =
    useState<DefectClassConfig["id"]>("major");
  const [showExtendedAql, setShowExtendedAql] = useState(false);
  const [metaExpanded, setMetaExpanded] = useState(true);
  const [meta, setMeta] = useState<InspectionMeta>({
    partName: "",
    lotNo: "",
    supplier: "",
    stage: "IQC",
    inspector: "",
    notes: "",
  });
  const [copiedSummary, setCopiedSummary] = useState(false);
  const [exportingExcel, setExportingExcel] = useState(false);
  const [exportingPng, setExportingPng] = useState(false);
  const [history, setHistory] = useState<SavedInspectionRecord[]>(() =>
    loadInspectionHistory()
  );

  const parsedLotSize = useMemo(() => {
    if (lookupMode === "code") return null;
    const n = Math.floor(Number(lotSizeInput));
    if (!Number.isFinite(n) || n < 1) return 1;
    return Math.min(n, 999_999_999);
  }, [lookupMode, lotSizeInput]);

  const effectiveDirectCode = lookupMode === "code" ? directCode : null;

  const summary = useMemo(
    () =>
      evaluateMultiClassLot({
        standard,
        lotSize: parsedLotSize,
        level,
        severity,
        directCodeLetter: effectiveDirectCode,
        classes,
      }),
    [standard, parsedLotSize, level, severity, effectiveDirectCode, classes]
  );

  const focusedEval = useMemo(() => {
    return (
      summary.evaluations.find((e) => e.config.id === focusedClassId) ??
      summary.evaluations[0]
    );
  }, [summary.evaluations, focusedClassId]);

  const severityComparison = useMemo(
    () =>
      compareAllSeverities({
        standard,
        lotSize: parsedLotSize,
        level,
        aql: focusedEval.config.aql,
        directCodeLetter: effectiveDirectCode,
      }),
    [standard, parsedLotSize, level, focusedEval.config.aql, effectiveDirectCode]
  );

  const handleUpdateClass = useCallback(
    (id: DefectClassConfig["id"], patch: Partial<DefectClassConfig>) => {
      setClasses((prev) =>
        prev.map((c) => (c.id === id ? { ...c, ...patch } : c))
      );
    },
    []
  );

  const handleApplyPreset = useCallback(
    (presetId: string) => {
      const preset = AQL_SCENE_PRESETS.find((p) => p.id === presetId);
      if (!preset) return;
      setLookupMode("lot");
      setLotSizeInput(String(preset.lotSize));
      setLevel(preset.level);
      setSeverity(preset.severity);
      setMeta((prev) => ({ ...prev, stage: preset.stage }));
      setClasses((prev) =>
        prev.map((c) => {
          const cfg = preset.classes[c.id];
          return {
            ...c,
            enabled: cfg.enabled,
            aql: cfg.aql,
            defectsFound: 0,
          };
        })
      );
      setFocusedClassId(preset.classes.major.enabled ? "major" : "minor");
      onNotify(`已套用场景模板：${preset.name}`, "success");
    },
    [onNotify]
  );

  const buildCurrentRecord = useCallback((): SavedInspectionRecord => {
    const now = new Date();
    const createdAt = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(
      2,
      "0"
    )}-${String(now.getDate()).padStart(2, "0")} ${String(
      now.getHours()
    ).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;

    return {
      id: `aql-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      createdAt,
      standard,
      lotSize: parsedLotSize ?? focusedEval.plan.sampleSize,
      level,
      severity,
      meta: { ...meta },
      classes: summary.evaluations.map((ev) => ({
        id: ev.config.id,
        label: ev.config.label,
        aql: ev.config.aql,
        effectiveCode: ev.plan.effectiveCode,
        sampleSize: ev.plan.sampleSize,
        ac: ev.plan.ac,
        re: ev.plan.re,
        defectsFound: ev.config.defectsFound,
        verdict: ev.verdict,
      })),
      recommendedTotalSample: summary.recommendedTotalSample,
      overallVerdict: summary.overallVerdict,
    };
  }, [standard, parsedLotSize, focusedEval.plan.sampleSize, level, severity, meta, summary]);

  const handleCopySummary = useCallback(async () => {
    const text = buildInspectionSummaryText({
      standard,
      lotSize: parsedLotSize,
      level,
      severity,
      meta,
      summary,
    });
    try {
      await navigator.clipboard.writeText(text);
      setCopiedSummary(true);
      onNotify("已复制 AQL 抽样方案与判定摘要", "success");
      window.setTimeout(() => setCopiedSummary(false), 1600);
    } catch {
      onNotify("复制失败，请检查系统剪贴板权限", "error");
    }
  }, [standard, parsedLotSize, level, severity, meta, summary, onNotify]);

  const handleSaveRecord = useCallback(() => {
    const rec = buildCurrentRecord();
    const next = appendInspectionRecord(rec);
    setHistory(next);
    onNotify("已保存到本地检验记录", "success");
  }, [buildCurrentRecord, onNotify]);

  const handleExportExcel = useCallback(
    async (recordsToExport?: SavedInspectionRecord[]) => {
      if (exportingExcel) return;
      setExportingExcel(true);
      try {
        const list = recordsToExport ?? [buildCurrentRecord()];
        const blob = await buildAqlExcelBlob(list);
        const dateTag = new Date().toISOString().slice(0, 10);
        const fileName =
          list.length > 1
            ? `AQL抽样检验记录汇总_${dateTag}.xlsx`
            : `AQL抽样判定单_${meta.lotNo.trim() || dateTag}.xlsx`;
        const res = await saveExportBlob(blob, fileName, "导出 AQL 抽样检验 Excel");
        if (res.status === "saved") {
          onNotify("已导出 AQL 抽样检验 Excel 表格", "success");
        }
      } catch (err) {
        onNotify(
          `Excel 导出失败：${err instanceof Error ? err.message : "未知错误"}`,
          "error"
        );
      } finally {
        setExportingExcel(false);
      }
    },
    [exportingExcel, buildCurrentRecord, meta.lotNo, onNotify]
  );

  const handleExportPng = useCallback(async () => {
    if (exportingPng) return;
    setExportingPng(true);
    try {
      const blob = await renderInspectionCardPngBlob({
        standard,
        lotSize: parsedLotSize,
        level,
        severity,
        meta,
        summary,
      });
      const dateTag = new Date().toISOString().slice(0, 10);
      const fileName = `AQL判定卡_${meta.lotNo.trim() || dateTag}.png`;
      const res = await saveExportBlob(blob, fileName, "导出 AQL 判定卡片图片");
      if (res.status === "saved") {
        onNotify("已导出高清 AQL 判定卡片图片", "success");
      }
    } catch (err) {
      onNotify(
        `图片导出失败：${err instanceof Error ? err.message : "未知错误"}`,
        "error"
      );
    } finally {
      setExportingPng(false);
    }
  }, [exportingPng, standard, parsedLotSize, level, severity, meta, summary, onNotify]);

  const handleJumpToCodeAndAql = useCallback(
    (code: PrimaryCodeLetter, aql: StandardAqlValue) => {
      setLookupMode("code");
      setDirectCode(code);
      if (aql > 10) setShowExtendedAql(true);
      handleUpdateClass(focusedEval.config.id, { aql });
      setSubTab("calculator");
      onNotify(
        `已切换至字码 ${code} · AQL ${formatAqlShort(aql)}`,
        "success"
      );
    },
    [focusedEval.config.id, handleUpdateClass, onNotify]
  );

  const handleJumpToLotAndLevel = useCallback(
    (midLotSize: number, lv: InspectionLevel) => {
      setLookupMode("lot");
      setLotSizeInput(String(midLotSize));
      setLevel(lv);
      setSubTab("calculator");
      onNotify(`已切换至批量 ${midLotSize.toLocaleString("zh-CN")} · 水平 ${lv}`, "success");
    },
    [onNotify]
  );

  const handleLoadRecord = useCallback(
    (rec: SavedInspectionRecord) => {
      setStandard(rec.standard);
      setLookupMode("lot");
      setLotSizeInput(String(rec.lotSize));
      setLevel(rec.level);
      setSeverity(rec.severity);
      setMeta({ ...rec.meta });
      const byId = new Map(rec.classes.map((c) => [c.id, c]));
      setClasses((prev) =>
        prev.map((c) => {
          const saved = byId.get(c.id);
          if (!saved) return { ...c, enabled: false, defectsFound: 0 };
          return {
            ...c,
            enabled: true,
            aql: saved.aql,
            defectsFound: saved.defectsFound,
          };
        })
      );
      if (rec.classes.some((c) => c.aql > 10)) {
        setShowExtendedAql(true);
      }
      setSubTab("calculator");
      onNotify("已载入历史抽检记录", "success");
    },
    [onNotify]
  );

  const handleCopySavedRecord = useCallback(
    async (rec: SavedInspectionRecord) => {
      const lines = [
        `【${rec.meta.stage} AQL 抽样检验记录】`,
        `时间：${rec.createdAt} | 物料：${rec.meta.partName || "-"} | 批次：${rec.meta.lotNo || "-"}`,
        `批量 N=${rec.lotSize} | 水平 ${rec.level} | 抽样 ${rec.recommendedTotalSample} 件`,
        ...rec.classes.map(
          (c) =>
            `• ${c.label} | AQL ${formatAqlShort(c.aql)} | ${c.effectiveCode}(n=${c.sampleSize}) | Ac=${c.ac}/Re=${c.re} | 实测=${c.defectsFound}`
        ),
      ];
      try {
        await navigator.clipboard.writeText(lines.join("\n"));
        onNotify("已复制该条检验记录摘要", "success");
      } catch {
        onNotify("复制失败", "error");
      }
    },
    [onNotify]
  );

  const TABS: Array<{ id: SubViewTab; label: string; icon: React.ComponentType<{ className?: string }>; badge?: number }> = [
    { id: "calculator", label: "方案计算与判定", icon: Calculator },
    { id: "matrix", label: "完整标准查表", icon: Table2 },
    { id: "oc", label: "OC 曲线与风险", icon: Activity },
    { id: "switching", label: "转移规则演练", icon: GitBranch },
    { id: "history", label: "检验记录", icon: History, badge: history.length },
  ];

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-white dark:bg-[#09090b] overflow-hidden">
      {/* Top Sub-navigation & Export Bar */}
      <div className="px-4 sm:px-5 py-2.5 border-b border-zinc-200/80 dark:border-white/[0.07] bg-[#fafaf9] dark:bg-white/[0.015] flex flex-wrap items-center justify-between gap-2.5 shrink-0">
        {/* Sub-view Pill Tabs */}
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
                    layoutId="aql-subtab-pill"
                    transition={SPRING_SNAPPY}
                    className="absolute inset-0 rounded-md bg-white dark:bg-white/[0.11] shadow-tactile"
                  />
                )}
                <Icon className="relative z-10 h-3.5 w-3.5 shrink-0" />
                <span className="relative z-10">{t.label}</span>
                {typeof t.badge === "number" && t.badge > 0 && (
                  <span className="relative z-10 px-1.5 py-0.2 rounded-full bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 font-mono text-[10px]">
                    {t.badge}
                  </span>
                )}
              </motion.button>
            );
          })}
        </div>

        {/* Right: Standard Switcher + Export Controls */}
        <div className="flex flex-wrap items-center gap-2">
          <div
            className="inline-flex items-center p-0.5 rounded-lg bg-zinc-200/65 dark:bg-white/[0.05] border border-zinc-200/80 dark:border-white/[0.06]"
            title="切换抽样标准版本（正常/加严一致，放宽表 2-C 存在差异）"
          >
            {(
              [
                ["gbt2828", "GB/T 2828.1"],
                ["ansi_z14", "ANSI Z1.4"],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setStandard(id)}
                className={cn(
                  "px-2 py-1 rounded-md text-[11px] font-mono font-medium transition-colors",
                  standard === id
                    ? "bg-white dark:bg-white/[0.12] text-zinc-950 dark:text-white shadow-hairline"
                    : "text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white"
                )}
              >
                {label}
              </button>
            ))}
          </div>

          <motion.button
            type="button"
            whileTap={TAP_SCALE}
            onClick={handleCopySummary}
            className="btn-tactile inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-zinc-200/95 dark:border-white/[0.1] bg-white dark:bg-[#141418] text-[11.5px] font-medium text-zinc-700 dark:text-zinc-200 hover:border-zinc-300 dark:hover:border-white/[0.2] shadow-tactile"
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
            disabled={exportingPng}
            onClick={handleExportPng}
            className="btn-tactile hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-zinc-200/95 dark:border-white/[0.1] bg-white dark:bg-[#141418] text-[11.5px] font-medium text-zinc-700 dark:text-zinc-200 hover:border-zinc-300 dark:hover:border-white/[0.2] shadow-tactile disabled:opacity-50"
          >
            <ImageDown className="h-3.5 w-3.5 text-indigo-500" />
            <span>导出卡片</span>
          </motion.button>

          <motion.button
            type="button"
            whileTap={TAP_SCALE}
            disabled={exportingExcel}
            onClick={() => handleExportExcel()}
            className="btn-sheen inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 dark:bg-white dark:hover:bg-zinc-200 text-white dark:text-zinc-950 text-[11.5px] font-medium shadow-tactile-primary disabled:opacity-50"
          >
            <FileSpreadsheet className="h-3.5 w-3.5" />
            <span>导出 Excel</span>
          </motion.button>
        </div>
      </div>

      {/* Main Scrollable Content */}
      <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-5">
        <div className="max-w-7xl mx-auto">
          {subTab === "calculator" && (
            <div className="space-y-4">
              {/* Industry Quick Presets */}
              <div className="flex items-center gap-2 overflow-x-auto pb-1">
                <span className="inline-flex items-center gap-1 text-[11px] font-medium text-zinc-400 dark:text-zinc-500 shrink-0">
                  <Sparkles className="h-3 w-3 text-emerald-500" />
                  <span>场景快选</span>
                </span>
                {AQL_SCENE_PRESETS.map((preset) => (
                  <motion.button
                    key={preset.id}
                    type="button"
                    whileTap={TAP_SCALE_SUBTLE}
                    onClick={() => handleApplyPreset(preset.id)}
                    title={preset.description}
                    className="shrink-0 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-zinc-200/90 dark:border-white/[0.08] bg-zinc-50/75 dark:bg-white/[0.03] hover:border-emerald-300 dark:hover:border-emerald-500/40 hover:bg-emerald-50/50 dark:hover:bg-emerald-500/[0.07] text-[11px] font-medium text-zinc-700 dark:text-zinc-300 transition-colors"
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
                {/* Left Parameter Rail */}
                <aside className="xl:col-span-4 space-y-4">
                  {/* Core Sampling Parameters Card */}
                  <div className="rounded-2xl border border-zinc-200/90 dark:border-white/[0.09] bg-white dark:bg-[#111115] p-4 shadow-tactile space-y-4">
                    {/* Mode Switch: Lot Size vs Direct Code */}
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-semibold text-zinc-900 dark:text-zinc-100">
                        抽样检索条件
                      </span>
                      <div className="inline-flex items-center p-0.5 rounded-md bg-zinc-100 dark:bg-white/[0.06] text-[10.5px]">
                        <button
                          type="button"
                          onClick={() => setLookupMode("lot")}
                          className={cn(
                            "px-2 py-0.5 rounded font-medium transition-colors",
                            lookupMode === "lot"
                              ? "bg-white dark:bg-white/[0.14] text-zinc-950 dark:text-white shadow-hairline"
                              : "text-zinc-500 dark:text-zinc-400"
                          )}
                        >
                          按批量 N
                        </button>
                        <button
                          type="button"
                          onClick={() => setLookupMode("code")}
                          className={cn(
                            "px-2 py-0.5 rounded font-medium transition-colors",
                            lookupMode === "code"
                              ? "bg-white dark:bg-white/[0.14] text-zinc-950 dark:text-white shadow-hairline"
                              : "text-zinc-500 dark:text-zinc-400"
                          )}
                        >
                          字码直查
                        </button>
                      </div>
                    </div>

                    {/* Lot Size Input OR Direct Code Letter Picker */}
                    {lookupMode === "lot" ? (
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <label
                            htmlFor="aql-lot-size"
                            className="text-[11.5px] font-medium text-zinc-600 dark:text-zinc-300"
                          >
                            检验批量 (Lot Size N)
                          </label>
                          {focusedEval.plan.lotRange && (
                            <span className="font-mono text-[10.5px] text-emerald-600 dark:text-emerald-400">
                              区间 {focusedEval.plan.lotRange.label} → {focusedEval.plan.originalCode}
                            </span>
                          )}
                        </div>
                        <div className="relative">
                          <input
                            id="aql-lot-size"
                            type="number"
                            min={1}
                            max={999999999}
                            value={lotSizeInput}
                            onChange={(e) => setLotSizeInput(e.target.value)}
                            placeholder="输入来料/出货批量..."
                            className="precision-field w-full rounded-xl border border-zinc-200/95 dark:border-white/[0.12] bg-zinc-50/50 dark:bg-white/[0.03] px-3.5 py-2.5 pr-12 font-mono text-base font-bold tabular-nums text-zinc-950 dark:text-white"
                          />
                          <span className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-xs text-zinc-400">
                            PCS
                          </span>
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {QUICK_LOT_SIZES.map((sz) => {
                            const selected = parsedLotSize === sz;
                            return (
                              <button
                                key={sz}
                                type="button"
                                onClick={() => setLotSizeInput(String(sz))}
                                className={cn(
                                  "px-2 py-0.5 rounded-md font-mono text-[10.5px] tabular-nums transition-colors border",
                                  selected
                                    ? "bg-zinc-900 dark:bg-white text-white dark:text-zinc-950 border-zinc-900 dark:border-white font-semibold"
                                    : "bg-zinc-50 dark:bg-white/[0.03] text-zinc-600 dark:text-zinc-400 border-zinc-200/80 dark:border-white/[0.07] hover:border-zinc-300 dark:hover:border-white/[0.18]"
                                )}
                              >
                                {sz.toLocaleString("zh-CN")}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-[11.5px] font-medium text-zinc-600 dark:text-zinc-300">
                            直接选择样本量字码 (A ~ R)
                          </span>
                          <span className="font-mono text-[10.5px] text-emerald-600 dark:text-emerald-400">
                            当前：{directCode}
                          </span>
                        </div>
                        <div className="grid grid-cols-8 gap-1">
                          {PRIMARY_CODE_LETTERS.map((code) => (
                            <button
                              key={code}
                              type="button"
                              onClick={() => setDirectCode(code)}
                              className={cn(
                                "py-1.5 rounded-lg font-mono text-xs font-semibold border transition-colors",
                                directCode === code
                                  ? "bg-zinc-900 dark:bg-white text-white dark:text-zinc-950 border-zinc-900 dark:border-white"
                                  : "bg-zinc-50 dark:bg-white/[0.03] text-zinc-700 dark:text-zinc-300 border-zinc-200/80 dark:border-white/[0.08] hover:border-zinc-300"
                              )}
                            >
                              {code}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Inspection Level */}
                    <div className="space-y-2 pt-1 border-t border-zinc-100 dark:border-white/[0.06]">
                      <div className="flex items-center justify-between">
                        <span className="text-[11.5px] font-medium text-zinc-600 dark:text-zinc-300">
                          检验水平 (Inspection Level)
                        </span>
                        <span className="text-[10.5px] text-zinc-400 font-mono">
                          {INSPECTION_LEVEL_META[level].shortLabel}
                        </span>
                      </div>

                      <div className="space-y-1.5">
                        <div className="grid grid-cols-3 gap-1.5">
                          {GENERAL_LEVELS.map((lv) => {
                            const active = level === lv;
                            return (
                              <button
                                key={lv}
                                type="button"
                                disabled={lookupMode === "code"}
                                onClick={() => setLevel(lv)}
                                className={cn(
                                  "py-1.5 px-2 rounded-lg text-xs font-medium border transition-all disabled:opacity-45",
                                  active
                                    ? "bg-emerald-500/12 border-emerald-500/50 text-emerald-800 dark:text-emerald-200 font-semibold"
                                    : "bg-zinc-50/70 dark:bg-white/[0.03] border-zinc-200/85 dark:border-white/[0.08] text-zinc-600 dark:text-zinc-300 hover:border-zinc-300"
                                )}
                              >
                                一般 {lv}
                              </button>
                            );
                          })}
                        </div>
                        <div className="grid grid-cols-4 gap-1.5">
                          {SPECIAL_LEVELS.map((lv) => {
                            const active = level === lv;
                            return (
                              <button
                                key={lv}
                                type="button"
                                disabled={lookupMode === "code"}
                                onClick={() => setLevel(lv)}
                                className={cn(
                                  "py-1.5 px-1.5 rounded-lg font-mono text-[11.5px] font-medium border transition-all disabled:opacity-45",
                                  active
                                    ? "bg-indigo-500/12 border-indigo-500/50 text-indigo-800 dark:text-indigo-200 font-semibold"
                                    : "bg-zinc-50/70 dark:bg-white/[0.03] border-zinc-200/85 dark:border-white/[0.08] text-zinc-600 dark:text-zinc-300 hover:border-zinc-300"
                                )}
                              >
                                {lv}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                      <p className="text-[10.5px] leading-relaxed text-zinc-400 dark:text-zinc-500">
                        {INSPECTION_LEVEL_META[level].summary}
                      </p>
                    </div>

                    {/* Inspection Severity */}
                    <div className="space-y-2 pt-1 border-t border-zinc-100 dark:border-white/[0.06]">
                      <span className="text-[11.5px] font-medium text-zinc-600 dark:text-zinc-300 block">
                        检验严格度 (Severity)
                      </span>
                      <div className="grid grid-cols-3 gap-1.5">
                        {(
                          [
                            ["normal", "正常", "emerald"],
                            ["tightened", "加严", "rose"],
                            ["reduced", "放宽", "sky"],
                          ] as const
                        ).map(([id, lbl, tone]) => {
                          const active = severity === id;
                          return (
                            <button
                              key={id}
                              type="button"
                              onClick={() => setSeverity(id)}
                              className={cn(
                                "py-1.5 rounded-lg text-xs font-medium border transition-all",
                                active
                                  ? tone === "emerald"
                                    ? "bg-emerald-500/14 border-emerald-500/55 text-emerald-800 dark:text-emerald-200 font-semibold"
                                    : tone === "rose"
                                      ? "bg-rose-500/14 border-rose-500/55 text-rose-800 dark:text-rose-200 font-semibold"
                                      : "bg-sky-500/14 border-sky-500/55 text-sky-800 dark:text-sky-200 font-semibold"
                                  : "bg-zinc-50/70 dark:bg-white/[0.03] border-zinc-200/85 dark:border-white/[0.08] text-zinc-600 dark:text-zinc-300 hover:border-zinc-300"
                              )}
                            >
                              {lbl}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>

                  {/* Lot Metadata & Save Record Card */}
                  <div className="rounded-2xl border border-zinc-200/90 dark:border-white/[0.09] bg-white dark:bg-[#111115] shadow-tactile overflow-hidden">
                    <button
                      type="button"
                      onClick={() => setMetaExpanded((v) => !v)}
                      className="w-full px-4 py-3 flex items-center justify-between text-xs font-semibold text-zinc-900 dark:text-zinc-100 hover:bg-zinc-50/70 dark:hover:bg-white/[0.02] transition-colors"
                    >
                      <span>现场抽检批号信息（用于归档与报表）</span>
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
                              检验环节
                            </label>
                            <PrecisionSelect<InspectionStage>
                              value={meta.stage}
                              options={STAGES.map((s) => ({ value: s, label: s }))}
                              size="xs"
                              className="w-full font-mono"
                              onChange={(stage) => setMeta((m) => ({ ...m, stage }))}
                            />
                          </div>
                          <div>
                            <label className="text-[10.5px] text-zinc-500 dark:text-zinc-400 block mb-1">
                              检验员
                            </label>
                            <input
                              type="text"
                              value={meta.inspector}
                              onChange={(e) =>
                                setMeta((m) => ({ ...m, inspector: e.target.value }))
                              }
                              placeholder="姓名/工号"
                              className="precision-field w-full rounded-lg border border-zinc-200/95 dark:border-white/[0.1] bg-zinc-50/50 dark:bg-white/[0.03] px-2.5 py-1.5 text-xs text-zinc-900 dark:text-zinc-100"
                            />
                          </div>
                        </div>

                        <div>
                          <label className="text-[10.5px] text-zinc-500 dark:text-zinc-400 block mb-1">
                            物料 / 产品名称或料号
                          </label>
                          <input
                            type="text"
                            value={meta.partName}
                            onChange={(e) =>
                              setMeta((m) => ({ ...m, partName: e.target.value }))
                            }
                            placeholder="如：铝合金壳体 CNC-204"
                            className="precision-field w-full rounded-lg border border-zinc-200/95 dark:border-white/[0.1] bg-zinc-50/50 dark:bg-white/[0.03] px-2.5 py-1.5 text-xs text-zinc-900 dark:text-zinc-100"
                          />
                        </div>

                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="text-[10.5px] text-zinc-500 dark:text-zinc-400 block mb-1">
                              批次 / 来料单号
                            </label>
                            <input
                              type="text"
                              value={meta.lotNo}
                              onChange={(e) =>
                                setMeta((m) => ({ ...m, lotNo: e.target.value }))
                              }
                              placeholder="如：PO-20261128"
                              className="precision-field w-full rounded-lg border border-zinc-200/95 dark:border-white/[0.1] bg-zinc-50/50 dark:bg-white/[0.03] px-2.5 py-1.5 text-xs font-mono text-zinc-900 dark:text-zinc-100"
                            />
                          </div>
                          <div>
                            <label className="text-[10.5px] text-zinc-500 dark:text-zinc-400 block mb-1">
                              供方 / 产线
                            </label>
                            <input
                              type="text"
                              value={meta.supplier}
                              onChange={(e) =>
                                setMeta((m) => ({ ...m, supplier: e.target.value }))
                              }
                              placeholder="供应商或车间"
                              className="precision-field w-full rounded-lg border border-zinc-200/95 dark:border-white/[0.1] bg-zinc-50/50 dark:bg-white/[0.03] px-2.5 py-1.5 text-xs text-zinc-900 dark:text-zinc-100"
                            />
                          </div>
                        </div>

                        <div>
                          <label className="text-[10.5px] text-zinc-500 dark:text-zinc-400 block mb-1">
                            不良现象 / 处置备注
                          </label>
                          <input
                            type="text"
                            value={meta.notes}
                            onChange={(e) =>
                              setMeta((m) => ({ ...m, notes: e.target.value }))
                            }
                            placeholder="如：表面划伤 1 件，特采/退货处理说明..."
                            className="precision-field w-full rounded-lg border border-zinc-200/95 dark:border-white/[0.1] bg-zinc-50/50 dark:bg-white/[0.03] px-2.5 py-1.5 text-xs text-zinc-900 dark:text-zinc-100"
                          />
                        </div>

                        <motion.button
                          type="button"
                          whileTap={TAP_SCALE}
                          onClick={handleSaveRecord}
                          className="btn-sheen w-full mt-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold shadow-tactile transition-colors"
                        >
                          <BookmarkPlus className="h-3.5 w-3.5" />
                          <span>保存到检验记录 ({history.length})</span>
                        </motion.button>
                      </div>
                    )}
                  </div>
                </aside>

                {/* Right Primary Results & Live Multi-Class Judge */}
                <div className="xl:col-span-8 space-y-4 min-w-0">
                  <PlanSummaryCards focusedEval={focusedEval} summary={summary} />

                  <MultiClassJudgePanel
                    classes={classes}
                    summary={summary}
                    focusedClassId={focusedEval.config.id}
                    showExtendedAql={showExtendedAql}
                    onToggleExtendedAql={setShowExtendedAql}
                    onFocusClass={setFocusedClassId}
                    onUpdateClass={handleUpdateClass}
                    onResetDefects={() =>
                      setClasses((prev) =>
                        prev.map((c) => ({ ...c, defectsFound: 0 }))
                      )
                    }
                  />

                  <SeverityComparisonStrip
                    plans={severityComparison}
                    activeSeverity={severity}
                    focusedLabel={focusedEval.config.label}
                    onSelectSeverity={setSeverity}
                  />
                </div>
              </div>
            </div>
          )}

          {subTab === "matrix" && (
            <MasterTableMatrix
              standard={standard}
              severity={severity}
              level={level}
              plan={focusedEval.plan}
              onSelectSeverity={setSeverity}
              onJumpToCodeAndAql={handleJumpToCodeAndAql}
              onJumpToLotAndLevel={handleJumpToLotAndLevel}
            />
          )}

          {subTab === "oc" && (
            <OcCurveChart
              plans={severityComparison}
              activeSeverity={severity}
              focusedLabel={focusedEval.config.label}
            />
          )}

          {subTab === "switching" && (
            <SwitchingRulesPanel
              standard={standard}
              activeSeverity={severity}
              activePlan={focusedEval.plan}
              onApplySeverity={(sev) => {
                setSeverity(sev);
                setSubTab("calculator");
                onNotify("已将演练严格度同步至抽样计算器", "success");
              }}
            />
          )}

          {subTab === "history" && (
            <HistoryDrawerPanel
              records={history}
              onLoadRecord={handleLoadRecord}
              onCopyRecord={handleCopySavedRecord}
              onDeleteRecord={(id) => {
                setHistory(deleteInspectionRecord(id));
                onNotify("已删除该条检验记录", "success");
              }}
              onClearAll={() => {
                setHistory(clearInspectionHistory());
                onNotify("已清空本地检验记录", "success");
              }}
              onExportAllExcel={() => handleExportExcel(history)}
            />
          )}
        </div>
      </div>
    </div>
  );
};
