import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion } from "motion/react";
import {
  ArrowUpRight,
  CheckCircle2,
  Clock,
  FileText,
  HardDrive,
  Layers,
  Play,
  Search,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatFileSize } from "@/lib/status";
import { SPRING_SNAPPY, TAP_SCALE, TAP_SCALE_SUBTLE } from "@/lib/motion";
import { confirmDialog } from "@/components/ConfirmDialog";
import { InfoTip } from "@/components/InfoTip";
import { PrecisionSelect, SearchField } from "@/components/ui/FormControls";
import type { WorkbenchCacheStats } from "@/types";
import {
  WORKBENCH_CATEGORY_META,
  type WorkbenchToolCategory,
  type WorkbenchToolDefinition,
} from "./types";
import { WORKBENCH_TOOLS } from "./registry";
import {
  clearDrafts,
  getDraftCacheStats,
  pruneDraftCache,
} from "./tools/pdf-balloon/core/drafts";
import { loadInspectionHistory } from "./tools/aql-sampling/core/storage";
import { loadSpcHistory } from "./tools/spc-cpk/core/storage";
import { loadToleranceHistory } from "./tools/iso-tolerance/core/storage";

interface WorkbenchHubProps {
  runningToolIds: string[];
  cacheLimitMb: number;
  onCacheLimitChanged: (nextLimitMb: number) => void;
  onCacheCleared: () => void;
  onNotify: (message: string, type?: "success" | "error") => void;
  onLaunchTool: (toolId: string) => void;
  onCloseRunningTool: (toolId: string) => void;
}

const CATEGORIES: (WorkbenchToolCategory | "all")[] = [
  "all",
  "drawing",
  "sampling",
  "analysis",
  "tolerance",
];

export const WorkbenchHub: React.FC<WorkbenchHubProps> = ({
  runningToolIds,
  cacheLimitMb,
  onCacheLimitChanged,
  onCacheCleared,
  onNotify,
  onLaunchTool,
  onCloseRunningTool,
}) => {
  const [category, setCategory] = useState<WorkbenchToolCategory | "all">("all");
  const [query, setQuery] = useState("");
  const [cacheStats, setCacheStats] = useState<WorkbenchCacheStats | null>(null);
  const [clearingCache, setClearingCache] = useState(false);
  const [savingCacheLimit, setSavingCacheLimit] = useState(false);
  const [cacheHighlighted, setCacheHighlighted] = useState(false);
  const cacheSectionRef = useRef<HTMLElement | null>(null);
  const [aqlHistoryCount, setAqlHistoryCount] = useState<number>(0);
  const [spcHistoryCount, setSpcHistoryCount] = useState<number>(0);
  const [tolHistoryCount, setTolHistoryCount] = useState<number>(0);

  const refreshCacheStats = useCallback(async () => {
    try {
      const stats = await getDraftCacheStats();
      setCacheStats(stats);
    } catch {
      setCacheStats(null);
    }
  }, []);

  useEffect(() => {
    setAqlHistoryCount(loadInspectionHistory().length);
    setSpcHistoryCount(loadSpcHistory().length);
    setTolHistoryCount(loadToleranceHistory().length);
  }, [runningToolIds.length]);

  useEffect(() => {
    let cancelled = false;
    getDraftCacheStats()
      .then((stats) => {
        if (!cancelled) setCacheStats(stats);
      })
      .catch(() => {
        if (!cancelled) setCacheStats(null);
      });
    return () => {
      cancelled = true;
    };
  }, [runningToolIds.length, cacheLimitMb]);

  const effectiveLimitMb = cacheStats?.limitMb || cacheLimitMb || 1024;
  const effectiveLimitBytes =
    cacheStats?.limitBytes || effectiveLimitMb * 1024 * 1024;
  const cacheUsagePct = cacheStats
    ? Math.min(
        100,
        Math.round((cacheStats.totalBytes / Math.max(1, effectiveLimitBytes)) * 100)
      )
    : 0;

  const handleScrollToCache = () => {
    cacheSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    setCacheHighlighted(true);
    window.setTimeout(() => setCacheHighlighted(false), 1200);
  };

  const handleChangeCacheLimit = async (nextLimitMb: number) => {
    if (savingCacheLimit) return;
    setSavingCacheLimit(true);
    try {
      await pruneDraftCache(nextLimitMb);
      onCacheLimitChanged(nextLimitMb);
      await refreshCacheStats();
      const label =
        nextLimitMb >= 1024
          ? `${(nextLimitMb / 1024).toFixed(nextLimitMb % 1024 === 0 ? 0 : 1)} GB`
          : `${nextLimitMb} MB`;
      onNotify(
        `工具台缓存上限已更新为 ${label}（超出部分已自动按 LRU 清理）`,
        "success"
      );
    } catch (err) {
      onNotify(`更新缓存上限失败：${String(err)}`, "error");
    } finally {
      setSavingCacheLimit(false);
    }
  };

  const handleClearCache = async () => {
    if (clearingCache) return;
    const ok = await confirmDialog({
      title: "清空 QI / QC 工具台缓存",
      description:
        "确定清空本地保存的全部 PDF 图纸草稿与临时标注缓存？磁盘上的原始图纸不受影响，如需保留未导出的标注请先在工具台中保存 PDF。",
      confirmText: "确认清空",
      cancelText: "取消",
      destructive: true,
    });
    if (!ok) return;
    setClearingCache(true);
    try {
      const res = await clearDrafts();
      onCacheCleared();
      await refreshCacheStats();
      onNotify(
        res.evictedCount > 0
          ? `已清空 ${res.evictedCount} 份图纸草稿，释放 ${formatFileSize(res.freedBytes)}`
          : "工具台缓存已为空",
        "success"
      );
    } catch (err) {
      onNotify(`清空工具台缓存失败：${String(err)}`, "error");
    } finally {
      setClearingCache(false);
    }
  };

  const filteredTools = useMemo(() => {
    const q = query.trim().toLowerCase();
    return WORKBENCH_TOOLS.filter((tool) => {
      if (category !== "all" && tool.category !== category) return false;
      if (!q) return true;
      const hay = [
        tool.name,
        tool.shortName,
        tool.subtitle,
        tool.description,
        ...tool.tags,
      ]
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [category, query]);

  const readyTools = useMemo(
    () => filteredTools.filter((t) => t.status === "ready"),
    [filteredTools]
  );
  const plannedTools = useMemo(
    () => filteredTools.filter((t) => t.status === "planned"),
    [filteredTools]
  );

  const runningTools = useMemo(
    () =>
      runningToolIds
        .map((id) => WORKBENCH_TOOLS.find((t) => t.id === id))
        .filter((t): t is WorkbenchToolDefinition => Boolean(t)),
    [runningToolIds]
  );

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-white dark:bg-[#09090b] overflow-hidden">
      {/* Header */}
      <header className="h-14 px-6 border-b border-zinc-200/80 dark:border-white/[0.07] flex items-center justify-between gap-4 shrink-0 bg-white/90 dark:bg-[#09090b]">
        <div className="flex items-center gap-2.5 min-w-0">
          <h1 className="text-[15px] font-semibold tracking-tight text-zinc-950 dark:text-white truncate">
            QI / QC 质量工具台
          </h1>
          <span className="px-2 py-0.5 rounded-md bg-indigo-500/10 border border-indigo-500/20 text-[11px] font-mono font-medium text-indigo-600 dark:text-indigo-300 shrink-0">
            {WORKBENCH_TOOLS.filter((t) => t.status === "ready").length} 可用
          </span>
        </div>

        <div className="flex items-center gap-2.5 shrink-0">
          {cacheStats && (
            <button
              type="button"
              onClick={handleScrollToCache}
              title="查看并管理 QI / QC 工具台缓存与容量上限"
              className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-zinc-200/85 dark:border-white/[0.09] bg-zinc-50/75 dark:bg-white/[0.03] hover:bg-zinc-100 dark:hover:bg-white/[0.07] text-[11px] font-mono tabular-nums text-zinc-600 dark:text-zinc-300 transition-colors"
            >
              <HardDrive className="h-3 w-3 text-indigo-500" />
              <span>
                缓存 {formatFileSize(cacheStats.totalBytes)} / {formatFileSize(effectiveLimitBytes)}
              </span>
            </button>
          )}
          <span className="hidden md:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-zinc-200/80 dark:border-white/[0.08] bg-zinc-50/70 dark:bg-white/[0.03] text-[11px] text-zinc-500 dark:text-zinc-400">
            <HardDrive className="h-3 w-3 text-emerald-500" />
            <span>全工具本地离线运行 · 文件不上传</span>
          </span>
        </div>
      </header>

      {/* Filter & Search Bar */}
      <div className="px-6 py-3 border-b border-zinc-200/75 dark:border-white/[0.06] bg-[#fafaf9] dark:bg-white/[0.015] flex flex-wrap items-center justify-between gap-3 shrink-0">
        <div className="inline-flex items-center p-0.5 rounded-lg bg-zinc-200/65 dark:bg-white/[0.05] border border-zinc-200/80 dark:border-white/[0.06]">
          {CATEGORIES.map((cat) => {
            const active = category === cat;
            return (
              <motion.button
                key={cat}
                type="button"
                whileTap={TAP_SCALE_SUBTLE}
                onClick={() => setCategory(cat)}
                className={cn(
                  "relative px-2.5 py-1 rounded-md text-[11.5px] font-medium transition-colors",
                  active
                    ? "text-zinc-950 dark:text-white"
                    : "text-zinc-500 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200"
                )}
              >
                {active && (
                  <motion.span
                    layoutId="workbench-cat-pill"
                    transition={SPRING_SNAPPY}
                    className="absolute inset-0 rounded-md bg-white dark:bg-white/[0.11] shadow-tactile"
                  />
                )}
                <span className="relative z-10">
                  {WORKBENCH_CATEGORY_META[cat].label}
                </span>
              </motion.button>
            );
          })}
        </div>

        <SearchField
          value={query}
          onChange={setQuery}
          placeholder="搜索工具名称、标准或用途..."
          icon={<Search className="h-3.5 w-3.5" />}
          className="w-full sm:w-64"
        />
      </div>

      {/* Scrollable Hub Body */}
      <div className="flex-1 overflow-y-auto px-6 py-6">
        <div className="max-w-6xl mx-auto space-y-7">
          {/* Active / Background Running Tool Sessions */}
          {runningTools.length > 0 && (
            <section className="space-y-2.5">
              <div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                <span>运行中的工作会话（切换台账不丢失进度）</span>
              </div>
              <div className="flex flex-wrap gap-2.5">
                {runningTools.map((tool) => {
                  const Icon = tool.icon;
                  return (
                    <div
                      key={tool.id}
                      className="inline-flex items-center gap-2 pl-3 pr-1.5 py-1.5 rounded-xl bg-white dark:bg-[#131317] border border-zinc-200/95 dark:border-white/[0.1] shadow-tactile"
                    >
                      <button
                        type="button"
                        onClick={() => onLaunchTool(tool.id)}
                        className="inline-flex items-center gap-2 text-xs font-medium text-zinc-900 dark:text-zinc-100 hover:text-indigo-600 dark:hover:text-indigo-300 transition-colors"
                      >
                        <Icon
                          className="h-3.5 w-3.5 shrink-0"
                          style={{ color: tool.accent }}
                        />
                        <span>{tool.name}</span>
                        <span className="text-[10.5px] text-indigo-600 dark:text-indigo-400 font-medium inline-flex items-center gap-0.5">
                          继续
                          <ArrowUpRight className="h-3 w-3" />
                        </span>
                      </button>
                      <button
                        type="button"
                        onClick={() => onCloseRunningTool(tool.id)}
                        title="结束该工具会话并释放内存"
                        aria-label={`关闭 ${tool.name}`}
                        className="p-1 rounded-lg text-zinc-400 hover:text-rose-500 hover:bg-rose-500/10 transition-colors"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {/* Ready Tools Section */}
          {readyTools.length > 0 && (
            <section className="space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 flex items-center gap-1.5">
                  <Sparkles className="h-3.5 w-3.5 text-indigo-500" />
                  <span>可用质量工具</span>
                </h2>
                <span className="text-[11px] text-zinc-400 dark:text-zinc-500">
                  按需懒加载引擎，不影响台账启动速度
                </span>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {readyTools.map((tool) => {
                  const Icon = tool.icon;
                  const isRunning = runningToolIds.includes(tool.id);
                  return (
                    <motion.div
                      key={tool.id}
                      whileHover={{ y: -2 }}
                      transition={SPRING_SNAPPY}
                      onClick={() => onLaunchTool(tool.id)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          onLaunchTool(tool.id);
                        }
                      }}
                      className="group relative rounded-2xl border border-zinc-200/90 dark:border-white/[0.09] bg-white dark:bg-[#111115] hover:border-indigo-300/90 dark:hover:border-indigo-400/35 shadow-tactile hover:shadow-ceramic p-5 flex flex-col justify-between gap-4 cursor-pointer transition-all overflow-hidden text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/40"
                    >
                      {/* Subtle ambient accent glow */}
                      <div
                        aria-hidden="true"
                        className="pointer-events-none absolute -top-20 -right-20 h-44 w-44 rounded-full opacity-[0.07] dark:opacity-[0.12] blur-2xl transition-opacity group-hover:opacity-[0.14] dark:group-hover:opacity-[0.2]"
                        style={{ backgroundColor: tool.accent }}
                      />

                      <div className="relative z-10 space-y-3.5">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-center gap-3 min-w-0">
                            <div
                              className="h-11 w-11 rounded-xl flex items-center justify-center shrink-0 border shadow-hairline"
                              style={{
                                backgroundColor: `${tool.accent}14`,
                                borderColor: `${tool.accent}30`,
                                color: tool.accent,
                              }}
                            >
                              <Icon className="h-5 w-5" />
                            </div>
                            <div className="min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <h3 className="text-sm font-semibold text-zinc-950 dark:text-white tracking-tight">
                                  {tool.name}
                                </h3>
                                {tool.version && (
                                  <span className="px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-white/[0.07] font-mono text-[10px] text-zinc-500 dark:text-zinc-400">
                                    v{tool.version}
                                  </span>
                                )}
                                {isRunning && (
                                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-emerald-500/12 text-emerald-700 dark:text-emerald-300 text-[10px] font-medium">
                                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                                    运行中
                                  </span>
                                )}
                              </div>
                              <p className="text-[11.5px] text-zinc-500 dark:text-zinc-400 mt-0.5 truncate">
                                {tool.subtitle}
                              </p>
                            </div>
                          </div>
                        </div>

                        <p className="text-xs leading-relaxed text-zinc-600 dark:text-zinc-300">
                          {tool.description}
                        </p>

                        <ul className="space-y-1.5 pt-0.5">
                          {tool.highlights.map((item) => (
                            <li
                              key={item}
                              className="flex items-start gap-2 text-[11.5px] text-zinc-600 dark:text-zinc-400"
                            >
                              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0 mt-0.5" />
                              <span>{item}</span>
                            </li>
                          ))}
                        </ul>

                        <div className="flex flex-wrap items-center gap-1.5 pt-1">
                          {tool.tags.map((tag) => (
                            <span
                              key={tag}
                              className="px-2 py-0.5 rounded-md bg-zinc-100/90 dark:bg-white/[0.05] border border-zinc-200/70 dark:border-white/[0.07] text-[10.5px] text-zinc-600 dark:text-zinc-400"
                            >
                              {tag}
                            </span>
                          ))}
                        </div>
                      </div>

                      <div className="relative z-10 pt-3 border-t border-zinc-100 dark:border-white/[0.06] flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2 text-[11px] text-zinc-500 dark:text-zinc-400">
                          {tool.id === "pdf-balloon" && cacheStats !== null && (
                            <span className="inline-flex items-center gap-1 font-mono tabular-nums">
                              <FileText className="h-3 w-3 text-zinc-400" />
                              {cacheStats.draftCount > 0
                                ? `${cacheStats.draftCount} 份草稿 · ${formatFileSize(cacheStats.totalBytes)} / ${formatFileSize(cacheStats.limitBytes)}`
                                : `暂无本地草稿 · 上限 ${formatFileSize(cacheStats.limitBytes)}`}
                            </span>
                          )}
                          {tool.id === "aql-sampling" && (
                            <span className="inline-flex items-center gap-1 font-mono tabular-nums">
                              <FileText className="h-3 w-3 text-zinc-400" />
                              {aqlHistoryCount > 0
                                ? `${aqlHistoryCount} 条本地抽检记录 · GB/T 2828.1 & ANSI Z1.4`
                                : "GB/T 2828.1-2012 & ANSI/ASQ Z1.4 离线主表"}
                            </span>
                          )}
                          {tool.id === "spc-cpk" && (
                            <span className="inline-flex items-center gap-1 font-mono tabular-nums">
                              <FileText className="h-3 w-3 text-zinc-400" />
                              {spcHistoryCount > 0
                                ? `${spcHistoryCount} 条本地 CPK 分析记录 · AIAG SPC & GB/T 4091`
                                : "AIAG SPC / GB/T 4091 离线统计与控制图引擎"}
                            </span>
                          )}
                          {tool.id === "iso-tolerance" && (
                            <span className="inline-flex items-center gap-1 font-mono tabular-nums">
                              <FileText className="h-3 w-3 text-zinc-400" />
                              {tolHistoryCount > 0
                                ? `${tolHistoryCount} 条本地公差检核归档 · ISO 2768 & ISO 286`
                                : "ISO 2768-1/2 & ISO 286-1/2 (GB/T 1804/1800) 离线引擎"}
                            </span>
                          )}
                        </div>
                        <motion.span
                          whileTap={TAP_SCALE}
                          className="btn-sheen inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-zinc-900 group-hover:bg-zinc-800 dark:bg-white dark:group-hover:bg-zinc-200 text-white dark:text-zinc-950 text-xs font-medium shadow-tactile-primary transition-colors"
                        >
                          <Play className="h-3 w-3 fill-current" />
                          <span>{isRunning ? "回到工作台" : "启动工具"}</span>
                        </motion.span>
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            </section>
          )}

          {/* QI / QC Workbench Local Cache Governance Section */}
          <section ref={cacheSectionRef} className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 flex items-center gap-1.5">
                <HardDrive className="h-3.5 w-3.5 text-indigo-500" />
                <span>本地缓存与存储管理</span>
              </h2>
            </div>

            <div
              className={cn(
                "rounded-xl border bg-white dark:bg-[#111115] divide-y divide-zinc-200/75 dark:divide-white/[0.07] transition-all duration-300",
                cacheHighlighted
                  ? "border-indigo-400 dark:border-indigo-400/60 ring-2 ring-indigo-500/20"
                  : "border-zinc-200/85 dark:border-white/[0.08]"
              )}
            >
              <div className="px-4 py-3.5 space-y-2.5">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="h-8 w-8 rounded-lg bg-indigo-500/10 border border-indigo-500/20 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0">
                      <HardDrive className="h-4 w-4" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-semibold text-zinc-900 dark:text-white">
                          QI / QC 工具台缓存
                        </span>
                        <InfoTip content="PDF 图纸按 SHA-256 内容去重落盘保存于本地数据目录；超过上限自动按 LRU 淘汰最久未用草稿，永不淘汰当前打开的文档。" />
                      </div>
                      <div className="text-[11px] font-mono tabular-nums text-zinc-500 dark:text-zinc-400 mt-0.5">
                        {cacheStats
                          ? `已用 ${formatFileSize(cacheStats.totalBytes)} / ${formatFileSize(effectiveLimitBytes)} · ${cacheStats.draftCount} 份图纸草稿`
                          : "读取中..."}
                      </div>
                    </div>
                  </div>
                  <button
                    type="button"
                    disabled={
                      clearingCache ||
                      (cacheStats
                        ? cacheStats.draftCount === 0 && cacheStats.totalBytes === 0
                        : false)
                    }
                    onClick={handleClearCache}
                    className="btn-tactile inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-zinc-200/95 dark:border-white/[0.12] bg-white dark:bg-white/[0.04] hover:bg-rose-50 dark:hover:bg-rose-500/10 hover:text-rose-600 dark:hover:text-rose-400 hover:border-rose-200 dark:hover:border-rose-500/30 disabled:opacity-45 shadow-tactile text-zinc-700 dark:text-zinc-200 text-xs font-medium shrink-0 transition-colors"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    <span>{clearingCache ? "清空中..." : "清空缓存"}</span>
                  </button>
                </div>

                {cacheStats && (
                  <div className="h-1.5 w-full rounded-full bg-zinc-200/80 dark:bg-white/[0.07] overflow-hidden">
                    <div
                      className="h-full rounded-full bg-indigo-500 transition-all duration-300"
                      style={{ width: `${cacheUsagePct}%` }}
                    />
                  </div>
                )}
              </div>

              <div className="px-4 py-3 flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <div className="text-xs font-medium text-zinc-800 dark:text-zinc-200">
                    缓存容量上限
                  </div>
                  <div className="text-[11px] text-zinc-400 dark:text-zinc-500 mt-0.5">
                    默认 1 GB，调低后立即按 LRU 清理超出部分
                  </div>
                </div>
                <PrecisionSelect
                  value={String(effectiveLimitMb)}
                  disabled={savingCacheLimit}
                  align="right"
                  onChange={(val) => handleChangeCacheLimit(Number(val))}
                  options={[
                    { value: "256", label: "256 MB" },
                    { value: "512", label: "512 MB" },
                    { value: "1024", label: "1 GB（默认）" },
                    { value: "2048", label: "2 GB" },
                    { value: "4096", label: "4 GB" },
                  ]}
                  className="min-w-[130px]"
                />
              </div>
            </div>
          </section>

          {/* Extensible Roadmap / Planned QI/QC Modules */}
          {plannedTools.length > 0 && (
            <section className="space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500 flex items-center gap-1.5">
                  <Layers className="h-3.5 w-3.5" />
                  <span>可扩展 QI / QC 工具槽位（架构已就绪）</span>
                </h2>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
                {plannedTools.map((tool) => {
                  const Icon = tool.icon;
                  return (
                    <div
                      key={tool.id}
                      className="rounded-xl border border-dashed border-zinc-200/95 dark:border-white/[0.09] bg-zinc-50/55 dark:bg-white/[0.015] p-4 flex flex-col justify-between gap-3"
                    >
                      <div className="space-y-2.5">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-2.5 min-w-0">
                            <div
                              className="h-8 w-8 rounded-lg flex items-center justify-center shrink-0 border opacity-80"
                              style={{
                                backgroundColor: `${tool.accent}12`,
                                borderColor: `${tool.accent}28`,
                                color: tool.accent,
                              }}
                            >
                              <Icon className="h-4 w-4" />
                            </div>
                            <div className="min-w-0">
                              <h3 className="text-xs font-semibold text-zinc-800 dark:text-zinc-200 truncate">
                                {tool.name}
                              </h3>
                              <p className="text-[10.5px] text-zinc-400 dark:text-zinc-500 truncate">
                                {tool.subtitle}
                              </p>
                            </div>
                          </div>
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-zinc-200/70 dark:bg-white/[0.06] text-[10px] font-medium text-zinc-500 dark:text-zinc-400 shrink-0">
                            <Clock className="h-2.5 w-2.5" />
                            规划中
                          </span>
                        </div>
                        <p className="text-[11.5px] leading-relaxed text-zinc-500 dark:text-zinc-400">
                          {tool.description}
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {tool.tags.map((tag) => (
                          <span
                            key={tag}
                            className="px-1.5 py-0.5 rounded bg-white/80 dark:bg-white/[0.04] border border-zinc-200/70 dark:border-white/[0.06] text-[10px] text-zinc-500 dark:text-zinc-400"
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {filteredTools.length === 0 && (
            <div className="py-16 text-center space-y-2">
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                未找到匹配的 QI / QC 工具
              </p>
              <button
                type="button"
                onClick={() => {
                  setCategory("all");
                  setQuery("");
                }}
                className="btn-tactile px-3 py-1.5 rounded-lg border border-zinc-200 dark:border-white/[0.1] bg-white dark:bg-white/[0.03] text-xs font-medium text-zinc-700 dark:text-zinc-200"
              >
                查看全部工具
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
