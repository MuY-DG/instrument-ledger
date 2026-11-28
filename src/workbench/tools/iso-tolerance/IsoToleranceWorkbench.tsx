import React, { useCallback, useMemo, useState } from "react";
import { motion } from "motion/react";
import {
  Check,
  ClipboardCopy,
  ClipboardList,
  FileSpreadsheet,
  GitCompare,
  History,
  ImageDown,
  Ruler,
  Table2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { SPRING_SNAPPY, TAP_SCALE, TAP_SCALE_SUBTLE } from "@/lib/motion";
import type { WorkbenchToolProps } from "../../types";
import { saveExportBlob } from "../../desktopBridge";
import type {
  ChecksheetItem,
  ChecksheetMetadata,
  Iso2768GeomClass,
  Iso2768LinearClass,
  Iso286HoleLetter,
  Iso286ItGrade,
  Iso286ShaftLetter,
  SavedToleranceRecord,
  StandardSystemLabel,
} from "./types";
import {
  evaluateMeasurement,
  lookupIso2768Geom,
  lookupIso2768Linear,
} from "./core/iso2768";
import { resolveIso286Fit } from "./core/iso286Engine";
import { resolveChecksheetItem, summarizeChecksheet } from "./core/inspector";
import { CHECKSHEET_SCENE_PRESETS } from "./core/presets";
import {
  appendToleranceRecord,
  clearToleranceHistory,
  deleteToleranceRecord,
  loadToleranceHistory,
} from "./core/storage";
import {
  buildChecksheetExcelBlob,
  buildChecksheetSummaryText,
  buildFitSummaryText,
  buildIso2768SummaryText,
  buildToleranceHistoryExcelBlob,
  renderToleranceCardPngBlob,
} from "./core/export";
import { Iso2768Panel } from "./components/Iso2768Panel";
import { FitCalculatorPanel } from "./components/FitCalculatorPanel";
import { ItMatrixPanel } from "./components/ItMatrixPanel";
import { BatchInspectorPanel } from "./components/BatchInspectorPanel";
import { ToleranceHistoryPanel } from "./components/ToleranceHistoryPanel";

type SubViewTab = "iso2768" | "fits" | "matrix" | "inspector" | "history";

const DEFAULT_CHECKSHEET = CHECKSHEET_SCENE_PRESETS[0];

export const IsoToleranceWorkbench: React.FC<WorkbenchToolProps> = ({
  onNotify,
}) => {
  const [subTab, setSubTab] = useState<SubViewTab>("iso2768");
  const [standardSystem, setStandardSystem] = useState<StandardSystemLabel>("iso");

  // ISO 2768 state
  const [isoNominalText, setIsoNominalText] = useState<string>("25");
  const [isoLinearClass, setIsoLinearClass] = useState<Iso2768LinearClass>("m");
  const [isoGeomClass, setIsoGeomClass] = useState<Iso2768GeomClass>("K");
  const [isoMeasuredText, setIsoMeasuredText] = useState<string>("25.12");

  // ISO 286 Fits state
  const [fitNominalText, setFitNominalText] = useState<string>("25");
  const [holeLetter, setHoleLetter] = useState<Iso286HoleLetter>("H");
  const [holeGrade, setHoleGrade] = useState<Iso286ItGrade>("7");
  const [shaftLetter, setShaftLetter] = useState<Iso286ShaftLetter>("g");
  const [shaftGrade, setShaftGrade] = useState<Iso286ItGrade>("6");
  const [measuredHoleText, setMeasuredHoleText] = useState<string>("");
  const [measuredShaftText, setMeasuredShaftText] = useState<string>("");

  // Batch Checksheet state
  const [meta, setMeta] = useState<ChecksheetMetadata>({
    ...DEFAULT_CHECKSHEET.meta,
  });
  const [items, setItems] = useState<ChecksheetItem[]>(() =>
    DEFAULT_CHECKSHEET.items.map((it) => ({ ...it }))
  );

  // History & Export status
  const [history, setHistory] = useState<SavedToleranceRecord[]>(() =>
    loadToleranceHistory()
  );
  const [copiedSummary, setCopiedSummary] = useState(false);
  const [exportingExcel, setExportingExcel] = useState(false);
  const [exportingPng, setExportingPng] = useState(false);

  const fitNominalVal = useMemo(() => {
    const n = Number(fitNominalText);
    return Number.isFinite(n) && n > 0 ? n : 25;
  }, [fitNominalText]);

  const activeFit = useMemo(
    () =>
      resolveIso286Fit({
        nominalMm: fitNominalVal,
        holeLetter,
        holeGrade,
        shaftLetter,
        shaftGrade,
      }),
    [fitNominalVal, holeLetter, holeGrade, shaftLetter, shaftGrade]
  );

  const resolvedRows = useMemo(
    () => items.map((it) => resolveChecksheetItem(it)),
    [items]
  );

  const handleAddChecksheetItem = useCallback(
    (item: Omit<ChecksheetItem, "id" | "balloonNo">) => {
      setItems((prev) => {
        const nextBalloon = String(prev.length + 1);
        return [
          ...prev,
          {
            ...item,
            id: `tol-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            balloonNo: nextBalloon,
          },
        ];
      });
      onNotify(`已加入检核单：${item.featureName}`, "success");
    },
    [onNotify]
  );

  const handleUpdateChecksheetItem = useCallback(
    (id: string, patch: Partial<ChecksheetItem>) => {
      setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...patch } : it)));
    },
    []
  );

  const handleDeleteChecksheetItem = useCallback((id: string) => {
    setItems((prev) => prev.filter((it) => it.id !== id));
  }, []);

  const handleApplyPreset = useCallback(
    (presetId: string) => {
      const preset = CHECKSHEET_SCENE_PRESETS.find((p) => p.id === presetId);
      if (!preset) return;
      setMeta({ ...preset.meta });
      setItems(preset.items.map((it) => ({ ...it })));
      onNotify(`已载入检验单模板：${preset.name}`, "success");
    },
    [onNotify]
  );

  const handleSaveArchive = useCallback(() => {
    const now = new Date();
    const createdAt = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(
      2,
      "0"
    )}-${String(now.getDate()).padStart(2, "0")} ${String(
      now.getHours()
    ).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
    const sum = summarizeChecksheet(resolvedRows);

    const record: SavedToleranceRecord = {
      id: `tolrec-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      createdAt,
      title: meta.partName.trim() || `${meta.stage} 尺寸检核单 (${items.length} 项)`,
      kind: "checksheet",
      meta: { ...meta },
      items: items.map((it) => ({ ...it })),
      okCount: sum.okCount,
      warningCount: sum.warningCount,
      ngCount: sum.ngCount,
      pendingCount: sum.pendingCount,
      overallVerdict: sum.overallVerdict,
      fitSnapshot: {
        nominalMm: fitNominalVal,
        holeLetter,
        holeGrade,
        shaftLetter,
        shaftGrade,
        measuredHole: measuredHoleText.trim() ? Number(measuredHoleText) : null,
        measuredShaft: measuredShaftText.trim() ? Number(measuredShaftText) : null,
      },
    };
    const next = appendToleranceRecord(record);
    setHistory(next);
    onNotify("已归档到本地公差检核记录", "success");
  }, [
    resolvedRows,
    meta,
    items,
    fitNominalVal,
    holeLetter,
    holeGrade,
    shaftLetter,
    shaftGrade,
    measuredHoleText,
    measuredShaftText,
    onNotify,
  ]);

  const handleCopySummary = useCallback(async () => {
    let text = "";
    if (subTab === "iso2768") {
      const nom = Number(isoNominalText) || 25;
      const lin = lookupIso2768Linear(nom, isoLinearClass, "linear");
      const geom = lookupIso2768Geom(nom, isoGeomClass, isoLinearClass);
      const meas = isoMeasuredText.trim() ? Number(isoMeasuredText) : null;
      const evalRes =
        lin.lowerLimitMm !== null && lin.upperLimitMm !== null
          ? evaluateMeasurement({
              measured: Number.isFinite(meas) ? meas : null,
              nominal: nom,
              lowerLimit: lin.lowerLimitMm,
              upperLimit: lin.upperLimitMm,
              unit: "mm",
            })
          : null;
      text = buildIso2768SummaryText({
        linearClass: isoLinearClass,
        geomClass: isoGeomClass,
        linearEval: lin,
        geomEval: geom,
        measurement: evalRes,
      });
    } else if (subTab === "fits" || subTab === "matrix") {
      text = buildFitSummaryText({
        fit: activeFit,
        measuredHole: measuredHoleText.trim() ? Number(measuredHoleText) : null,
        measuredShaft: measuredShaftText.trim() ? Number(measuredShaftText) : null,
      });
    } else {
      text = buildChecksheetSummaryText(resolvedRows, meta);
    }

    try {
      await navigator.clipboard.writeText(text);
      setCopiedSummary(true);
      onNotify("已复制公差速查摘要到剪贴板", "success");
      window.setTimeout(() => setCopiedSummary(false), 1600);
    } catch {
      onNotify("复制失败，请检查系统剪贴板权限", "error");
    }
  }, [
    subTab,
    isoNominalText,
    isoLinearClass,
    isoGeomClass,
    isoMeasuredText,
    activeFit,
    measuredHoleText,
    measuredShaftText,
    resolvedRows,
    meta,
    onNotify,
  ]);

  const handleExportExcel = useCallback(async () => {
    if (exportingExcel) return;
    setExportingExcel(true);
    try {
      const blob = await buildChecksheetExcelBlob(resolvedRows, meta, activeFit);
      const dateTag = new Date().toISOString().slice(0, 10);
      const fileName = `公差检核报告_${meta.drawingNo.trim() || dateTag}.xlsx`;
      const res = await saveExportBlob(blob, fileName, "导出公差检核 Excel 报告");
      if (res.status === "saved") {
        onNotify("已导出格式化公差检核 Excel 报告", "success");
      }
    } catch (err) {
      onNotify(
        `Excel 导出失败：${err instanceof Error ? err.message : "未知错误"}`,
        "error"
      );
    } finally {
      setExportingExcel(false);
    }
  }, [exportingExcel, resolvedRows, meta, activeFit, onNotify]);

  const handleExportPng = useCallback(async () => {
    if (exportingPng) return;
    setExportingPng(true);
    try {
      const mode = subTab === "fits" || subTab === "matrix" ? "fit" : "checksheet";
      const blob = await renderToleranceCardPngBlob({
        mode,
        fit: activeFit,
        rows: resolvedRows,
        meta,
      });
      const dateTag = new Date().toISOString().slice(0, 10);
      const fileName =
        mode === "fit"
          ? `孔轴配合速查卡_D${activeFit.nominalMm}_${activeFit.hole.designation}-${activeFit.shaft.designation}.png`
          : `尺寸公差检核单_${meta.drawingNo.trim() || dateTag}.png`;
      const res = await saveExportBlob(blob, fileName, "导出高清公差速查卡片");
      if (res.status === "saved") {
        onNotify("已导出高清 PNG 速查判定卡片", "success");
      }
    } catch (err) {
      onNotify(
        `图片导出失败：${err instanceof Error ? err.message : "未知错误"}`,
        "error"
      );
    } finally {
      setExportingPng(false);
    }
  }, [exportingPng, subTab, activeFit, resolvedRows, meta, onNotify]);

  const handleBatchExportHistory = useCallback(async () => {
    if (history.length === 0) return;
    try {
      const blob = await buildToleranceHistoryExcelBlob(history);
      const dateTag = new Date().toISOString().slice(0, 10);
      const res = await saveExportBlob(
        blob,
        `公差检核归档台账_${dateTag}.xlsx`,
        "批量导出公差检核台账"
      );
      if (res.status === "saved") {
        onNotify(`已批量导出 ${history.length} 条归档记录`, "success");
      }
    } catch (err) {
      onNotify(
        `导出失败：${err instanceof Error ? err.message : "未知错误"}`,
        "error"
      );
    }
  }, [history, onNotify]);

  const handleLoadRecord = useCallback(
    (rec: SavedToleranceRecord) => {
      setMeta({ ...rec.meta });
      setItems(rec.items.map((it) => ({ ...it })));
      if (rec.fitSnapshot) {
        setFitNominalText(String(rec.fitSnapshot.nominalMm));
        setHoleLetter(rec.fitSnapshot.holeLetter);
        setHoleGrade(rec.fitSnapshot.holeGrade);
        setShaftLetter(rec.fitSnapshot.shaftLetter);
        setShaftGrade(rec.fitSnapshot.shaftGrade);
      }
      setSubTab("inspector");
      onNotify("已载入历史公差检核单", "success");
    },
    [onNotify]
  );

  const handleCopySavedRecord = useCallback(
    async (rec: SavedToleranceRecord) => {
      const recRows = rec.items.map((it) => resolveChecksheetItem(it));
      const text = buildChecksheetSummaryText(recRows, rec.meta);
      try {
        await navigator.clipboard.writeText(text);
        onNotify("已复制该归档记录摘要", "success");
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
  }> = [
    { id: "iso2768", label: "ISO 2768 未注公差", icon: Ruler },
    { id: "fits", label: "ISO 286 孔轴配合", icon: GitCompare },
    { id: "matrix", label: "IT 等级与优先配合", icon: Table2 },
    { id: "inspector", label: "批量检核单", icon: ClipboardList, badge: items.length },
    { id: "history", label: "检核归档", icon: History, badge: history.length },
  ];

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-white dark:bg-[#09090b] overflow-hidden">
      {/* Top Sub-navigation & Export Bar */}
      <div className="px-4 sm:px-5 py-2.5 border-b border-zinc-200/80 dark:border-white/[0.07] bg-[#fafaf9] dark:bg-white/[0.015] flex flex-wrap items-center justify-between gap-2.5 shrink-0">
        {/* Animated Sub-view Pill Tabs */}
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
                    layoutId="iso-tol-subtab-pill"
                    transition={SPRING_SNAPPY}
                    className="absolute inset-0 rounded-md bg-white dark:bg-white/[0.11] shadow-tactile"
                  />
                )}
                <Icon className="relative z-10 h-3.5 w-3.5 shrink-0" />
                <span className="relative z-10">{t.label}</span>
                {typeof t.badge === "number" && t.badge > 0 && (
                  <span className="relative z-10 px-1.5 py-0.2 rounded-full bg-amber-500/15 text-amber-700 dark:text-amber-300 font-mono text-[10px]">
                    {t.badge}
                  </span>
                )}
              </motion.button>
            );
          })}
        </div>

        {/* Right: Standard Nomenclature Switcher + Export Controls */}
        <div className="flex flex-wrap items-center gap-2">
          <div
            className="inline-flex items-center p-0.5 rounded-lg bg-zinc-200/65 dark:bg-white/[0.05] border border-zinc-200/80 dark:border-white/[0.06]"
            title="ISO 2768 / ISO 286 与国标 GB/T 1804 / GB/T 1184 / GB/T 1800 数值完全等同"
          >
            {(
              [
                ["iso", "ISO 标准"],
                ["gb", "GB/T 国标"],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setStandardSystem(id)}
                className={cn(
                  "px-2 py-1 rounded-md text-[11px] font-mono font-medium transition-colors",
                  standardSystem === id
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
            <ImageDown className="h-3.5 w-3.5 text-amber-500" />
            <span>导出卡片</span>
          </motion.button>

          <motion.button
            type="button"
            whileTap={TAP_SCALE}
            disabled={exportingExcel}
            onClick={handleExportExcel}
            className="btn-sheen inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 dark:bg-white dark:hover:bg-zinc-200 text-white dark:text-zinc-950 text-[11.5px] font-medium shadow-tactile-primary disabled:opacity-50"
          >
            <FileSpreadsheet className="h-3.5 w-3.5" />
            <span>导出 Excel</span>
          </motion.button>
        </div>
      </div>

      {/* Main Scrollable Body */}
      <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-5">
        <div className="max-w-7xl mx-auto">
          {subTab === "iso2768" && (
            <Iso2768Panel
              standardSystem={standardSystem}
              nominalText={isoNominalText}
              onChangeNominalText={setIsoNominalText}
              linearClass={isoLinearClass}
              onChangeLinearClass={setIsoLinearClass}
              geomClass={isoGeomClass}
              onChangeGeomClass={setIsoGeomClass}
              measuredText={isoMeasuredText}
              onChangeMeasuredText={setIsoMeasuredText}
              onAddToChecksheet={handleAddChecksheetItem}
            />
          )}

          {subTab === "fits" && (
            <FitCalculatorPanel
              nominalText={fitNominalText}
              onChangeNominalText={setFitNominalText}
              holeLetter={holeLetter}
              onChangeHoleLetter={setHoleLetter}
              holeGrade={holeGrade}
              onChangeHoleGrade={setHoleGrade}
              shaftLetter={shaftLetter}
              onChangeShaftLetter={setShaftLetter}
              shaftGrade={shaftGrade}
              onChangeShaftGrade={setShaftGrade}
              fit={activeFit}
              measuredHoleText={measuredHoleText}
              onChangeMeasuredHoleText={setMeasuredHoleText}
              measuredShaftText={measuredShaftText}
              onChangeMeasuredShaftText={setMeasuredShaftText}
              onAddToChecksheet={handleAddChecksheetItem}
              onNotify={onNotify}
            />
          )}

          {subTab === "matrix" && (
            <ItMatrixPanel
              nominalMm={fitNominalVal}
              activeHoleGrade={holeGrade}
              activeShaftGrade={shaftGrade}
              onJumpToFit={(params) => {
                setFitNominalText(String(params.nominalMm));
                setHoleLetter(params.holeLetter);
                setHoleGrade(params.holeGrade);
                setShaftLetter(params.shaftLetter);
                setShaftGrade(params.shaftGrade);
                setSubTab("fits");
                onNotify(
                  `已切换至 Ø${params.nominalMm} ${params.holeLetter}${params.holeGrade}/${params.shaftLetter}${params.shaftGrade}`,
                  "success"
                );
              }}
            />
          )}

          {subTab === "inspector" && (
            <BatchInspectorPanel
              rows={resolvedRows}
              meta={meta}
              onChangeMeta={(patch) => setMeta((prev) => ({ ...prev, ...patch }))}
              onAddItem={handleAddChecksheetItem}
              onUpdateItem={handleUpdateChecksheetItem}
              onDeleteItem={handleDeleteChecksheetItem}
              onClearItems={() => setItems([])}
              onApplyPreset={handleApplyPreset}
              onSaveArchive={handleSaveArchive}
            />
          )}

          {subTab === "history" && (
            <ToleranceHistoryPanel
              records={history}
              onLoadRecord={handleLoadRecord}
              onCopyRecord={handleCopySavedRecord}
              onDeleteRecord={(id) => {
                setHistory(deleteToleranceRecord(id));
                onNotify("已删除该归档记录", "success");
              }}
              onClearHistory={() => {
                setHistory(clearToleranceHistory());
                onNotify("已清空公差检核归档", "success");
              }}
              onBatchExportExcel={handleBatchExportHistory}
            />
          )}
        </div>
      </div>
    </div>
  );
};
